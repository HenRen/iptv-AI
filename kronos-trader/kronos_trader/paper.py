"""Paper trader: runs on every closed candle, trades a virtual account, alerts Telegram.

No real orders are ever sent. State lives in state/paper_<symbol>.json, so the
process can be stopped and restarted (or run from cron with --once).
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict

import pandas as pd

from . import telegram
from .chart import log_entry, render_live
from .config import Config
from .data import atr as compute_atr
from .data import interval_ms, load_candles
from .execution import Position, check_exit, close_position, open_position, unrealized
from .regime import classify
from .strategy import build_signal


class PaperTrader:
    def __init__(self, cfg: Config, forecaster):
        self.cfg, self.fc = cfg, forecaster
        cfg.state_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = cfg.state_dir / f"paper_{cfg.market}_{cfg.symbol}_{cfg.interval}.json"
        self.log_file = cfg.state_dir / f"forecasts_{cfg.market}_{cfg.symbol}_{cfg.interval}.jsonl"
        self.state = self._load()

    def _load(self) -> dict:
        if self.state_file.exists():
            return json.loads(self.state_file.read_text())
        return {"equity": self.cfg.initial_equity, "position": None, "last_bar": None, "trades": []}

    def _save(self) -> None:
        self.state_file.write_text(json.dumps(self.state, indent=2, default=str))

    def _notify(self, text: str) -> None:
        print(text.replace("<b>", "").replace("</b>", ""))
        telegram.send(self.cfg.telegram_token, self.cfg.telegram_chat_id, text)

    def forecast_log(self) -> list[dict]:
        if not self.log_file.exists():
            return []
        return [json.loads(line) for line in self.log_file.read_text().splitlines() if line.strip()]

    def step(self) -> dict | None:
        """Process the newest closed candle. Returns None if it was already processed."""
        cfg = self.cfg
        df = load_candles(cfg.symbol, cfg.interval, cfg.lookback + 400, cfg.market, cfg.data_dir)
        last = df.iloc[-1]
        if self.state["last_bar"] == str(last["timestamps"]):
            return None

        pos = Position(**self.state["position"]) if self.state["position"] else None
        if pos is not None:
            # Candles since the last run (normally just one).
            new = df[df["timestamps"] > pd.Timestamp(self.state["last_bar"])] if self.state["last_bar"] else df.tail(1)
            for _, bar in new.iterrows():
                pos.bars_held += 1
                hit = check_exit(pos, bar)
                if hit is None and pos.bars_held >= cfg.horizon:
                    hit = (bar["close"], "time")
                if hit:
                    pos = self._close(pos, hit[0], bar["timestamps"], hit[1])
                    break

        paths = self.fc.sample(df.tail(cfg.lookback), cfg.interval)
        close, a = float(last["close"]), float(compute_atr(df, cfg.atr_period).iloc[-1])
        regime = classify(paths, close, a, cfg)
        signal = build_signal(paths, regime, close, a, cfg)

        if pos is not None and regime.direction == -pos.side:
            pos = self._close(pos, close, last["timestamps"], "regime flip")
        # Alert only when a high-probability setup appears, not on every candle it persists.
        fresh_setup = signal.high_probability and not self.state.get("high_prob")
        if pos is None and signal.side != 0:
            # Live we can't wait for the next open: fill at the current price.
            pos = open_position(signal, close, self.state["equity"], last["timestamps"], cfg)
            if pos is not None:
                side = "LONG" if pos.side == 1 else "SHORT"
                star = "🔥 HIGH-PROBABILITY TREND SETUP\n" if fresh_setup else ""
                self._notify(f"{star}📄 <b>Paper {side} {cfg.symbol}</b> @ {pos.entry:.2f}\n"
                             f"Stop {pos.stop:.2f} · Target {pos.target:.2f} · R:R {signal.reward_risk:.2f}\n"
                             f"{signal.reason}")
                fresh_setup = False
        if fresh_setup:
            self._notify(f"🔥 <b>High-probability {regime.label} {cfg.symbol}</b> @ {close:.2f}\n{signal.reason}")

        self.state.update(high_prob=signal.high_probability,position=pos.as_dict() if pos else None, last_bar=str(last["timestamps"]))
        self._save()

        entry = log_entry(paths, last["timestamps"], close, regime.label)
        with self.log_file.open("a") as f:
            f.write(json.dumps(entry) + "\n")
        info = {"symbol": cfg.symbol, "candle": str(last["timestamps"]), "price": close, "atr": round(a, 4),
                "regime": regime.as_dict(), "signal": signal.as_dict(),
                "paper_equity": round(self.state["equity"] + unrealized(pos, close), 2),
                "position": pos.as_dict() if pos else None, "trades": len(self.state["trades"])}
        render_live(df, paths, info, self.forecast_log(), cfg.output_dir / f"live_{cfg.symbol}.html",
                    refresh_s=max(60, interval_ms(cfg.interval) // 4000))
        return info

    def _close(self, pos: Position, price: float, when, reason: str) -> None:
        trade = close_position(pos, price, when, reason, self.cfg)
        self.state["equity"] += trade.pnl
        self.state["trades"].append(asdict(trade))
        emoji = "✅" if trade.pnl > 0 else "❌"
        self._notify(f"{emoji} <b>Paper exit {self.cfg.symbol}</b> ({reason}) @ {trade.exit:.2f}\n"
                     f"PnL {trade.pnl:+.2f} ({trade.r_multiple:+.2f}R) · equity {self.state['equity']:,.2f}")
        return None

    def run_forever(self) -> None:
        step_s = interval_ms(self.cfg.interval) / 1000
        while True:
            try:
                info = self.step()
                if info:
                    print(f"[{info['candle']}] {info['regime']['label']} equity={info['paper_equity']}")
            except Exception as e:
                print(f"error: {e}")
            # wake up a few seconds after the next candle closes
            time.sleep(step_s - (time.time() % step_s) + 5)
