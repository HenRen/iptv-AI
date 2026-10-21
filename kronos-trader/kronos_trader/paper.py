"""Paper trader: runs on every closed candle, trades a virtual account, alerts Telegram.

No real orders are ever sent. State lives in state/paper_<symbol>.json, so the
process can be stopped and restarted (or run from cron with --once).

Each candle: check the open position's stop/target/time exit (saved at once, so
a crash later in the step can never count an exit twice). On decision candles
(same clock-aligned cadence as the backtest) also forecast and maybe enter.
"""

from __future__ import annotations

import fcntl
import html
import json
import time
from dataclasses import asdict

import pandas as pd

from . import telegram
from .chart import log_entry, render_live
from .config import Config
from .data import atr as compute_atr
from .data import interval_ms, is_decision_bar, load_candles, missing_candles
from .execution import Position, check_exit, close_position, open_position, unrealized
from .regime import classify
from .strategy import build_signal


class StaleData(RuntimeError):
    pass


class PaperTrader:
    def __init__(self, cfg: Config, forecaster):
        self.cfg, self.fc = cfg, forecaster
        cfg.state_dir.mkdir(parents=True, exist_ok=True)
        name = f"{cfg.market}_{cfg.symbol}_{cfg.interval}"
        self.state_file = cfg.state_dir / f"paper_{name}.json"
        self.log_file = cfg.state_dir / f"forecasts_{name}.jsonl"
        # Two traders on one state file would double every trade.
        self._lock = open(cfg.state_dir / f"paper_{name}.lock", "w")
        try:
            fcntl.flock(self._lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(f"Er draait al een paper trader voor {name}.") from None
        self.state = self._load()

    def _load(self) -> dict:
        if self.state_file.exists():
            state = json.loads(self.state_file.read_text())
            state.setdefault("exits_checked", state.get("last_bar"))
            return state
        return {"equity": self.cfg.initial_equity, "position": None, "last_bar": None,
                "exits_checked": None, "trades": []}

    def _save(self) -> None:
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, indent=2, default=str))
        tmp.replace(self.state_file)  # atomic: a crash never leaves half a file

    def _notify(self, text: str) -> None:
        print(text.replace("<b>", "").replace("</b>", ""))
        telegram.send(self.cfg.telegram_token, self.cfg.telegram_chat_id, text)

    def forecast_log(self) -> list[dict]:
        if not self.log_file.exists():
            return []
        return [json.loads(line) for line in self.log_file.read_text().splitlines() if line.strip()]

    def step(self, now_ms: int | None = None) -> dict | None:
        """Process the newest closed candle. Returns None if it was already processed."""
        cfg = self.cfg
        df = load_candles(cfg.symbol, cfg.interval, cfg.lookback + 400, cfg.market, cfg.data_dir)
        last = df.iloc[-1]
        if self.state["last_bar"] == str(last["timestamps"]):
            return None
        step_ms = interval_ms(cfg.interval)
        now_ms = now_ms or int(time.time() * 1000)
        closed_ms = int(pd.Timestamp(last["timestamps"]).value // 1_000_000) + step_ms
        if now_ms - closed_ms > 2 * step_ms:
            raise StaleData(f"Laatste kaars {last['timestamps']} is te oud; Binance-data loopt achter.")

        # 1) Exits on every candle since the last check. Saved immediately.
        pos = Position(**self.state["position"]) if self.state["position"] else None
        checked = self.state["exits_checked"]
        new = df[df["timestamps"] > pd.Timestamp(checked)] if checked else df.tail(1)
        if pos is not None:
            for _, bar in new.iterrows():
                pos.bars_held += 1
                hit = check_exit(pos, bar)
                if hit is None and pos.bars_held >= cfg.horizon:
                    hit = (bar["close"], "time")
                if hit:
                    pos = self._close(pos, hit[0], bar["timestamps"], hit[1])
                    break
        self.state.update(position=pos.as_dict() if pos else None, exits_checked=str(last["timestamps"]))
        self._save()

        close, a = float(last["close"]), float(compute_atr(df, cfg.atr_period).iloc[-1])
        info = {"symbol": cfg.symbol, "candle": str(last["timestamps"]), "price": close, "atr": round(a, 4),
                "missing_candles": missing_candles(df.tail(cfg.lookback), cfg.interval)}
        if not is_decision_bar(last["timestamps"], cfg.interval, cfg.forecast_every):
            self.state["last_bar"] = str(last["timestamps"])
            self._save()
            return {**info, "regime": None, "paper_equity": round(self.state["equity"] + unrealized(pos, close), 2),
                    "position": pos.as_dict() if pos else None, "trades": len(self.state["trades"])}

        # 2) Decision candle: forecast, regime, signal.
        if info["missing_candles"]:
            print(f"Let op: {info['missing_candles']} ontbrekende kaarsen in de laatste {cfg.lookback}.")
        paths = self.fc.sample(df.tail(cfg.lookback), cfg.interval)
        regime = classify(paths, close, a, cfg)
        signal = build_signal(paths, regime, close, a, cfg)

        if pos is not None and regime.direction == -pos.side:
            pos = self._close(pos, close, last["timestamps"], "regime flip")
        # Alert only when a high-probability setup appears, not on every candle it persists.
        fresh_setup = signal.high_probability and not self.state.get("high_prob")
        reason = html.escape(signal.reason)
        if pos is None and signal.side != 0:
            # Live we can't wait for the next open: fill at the current price.
            pos = open_position(signal, close, self.state["equity"], last["timestamps"], cfg)
            if pos is not None:
                side = "LONG" if pos.side == 1 else "SHORT"
                star = "🔥 HIGH-PROBABILITY TREND SETUP\n" if fresh_setup else ""
                self._notify(f"{star}📄 <b>Paper {side} {cfg.symbol}</b> @ {pos.entry:.2f}\n"
                             f"Stop {pos.stop:.2f} · Target {pos.target:.2f} · R:R {signal.reward_risk:.2f}\n"
                             f"{reason}")
                fresh_setup = False
        if fresh_setup:
            self._notify(f"🔥 <b>High-probability {regime.label} {cfg.symbol}</b> @ {close:.2f}\n{reason}")

        self.state.update(high_prob=signal.high_probability, position=pos.as_dict() if pos else None,
                          last_bar=str(last["timestamps"]))
        self._save()

        entry = log_entry(paths, last["timestamps"], close, regime.label)
        with self.log_file.open("a") as f:
            f.write(json.dumps(entry) + "\n")
        info.update(regime=regime.as_dict(), signal=signal.as_dict(),
                    paper_equity=round(self.state["equity"] + unrealized(pos, close), 2),
                    position=pos.as_dict() if pos else None, trades=len(self.state["trades"]))
        render_live(df, paths, info, self.forecast_log(), cfg.output_dir / f"live_{cfg.symbol}.html",
                    refresh_s=max(60, step_ms // 4000))
        return info

    def _close(self, pos: Position, price: float, when, reason: str) -> None:
        trade = close_position(pos, price, when, reason, self.cfg)
        self.state["equity"] += trade.pnl
        self.state["trades"].append(asdict(trade))
        self.state["position"] = None
        self._save()
        emoji = "✅" if trade.pnl > 0 else "❌"
        self._notify(f"{emoji} <b>Paper exit {self.cfg.symbol}</b> ({html.escape(reason)}) @ {trade.exit:.2f}\n"
                     f"PnL {trade.pnl:+.2f} ({trade.r_multiple:+.2f}R) · equity {self.state['equity']:,.2f}")
        return None

    def run_forever(self) -> None:
        step_s = interval_ms(self.cfg.interval) / 1000
        while True:
            try:
                info = self.step()
                if info:
                    label = info["regime"]["label"] if info["regime"] else "geen forecast (geen beslismoment)"
                    print(f"[{info['candle']}] {label} equity={info['paper_equity']}")
            except Exception as e:
                # Network hiccup or stale data: retry in a minute instead of skipping a candle.
                print(f"fout: {e} (opnieuw over 60 s)")
                time.sleep(60)
                continue
            # wake up a few seconds after the next candle closes
            time.sleep(step_s - (time.time() % step_s) + 5)
