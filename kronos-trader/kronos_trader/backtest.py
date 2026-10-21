"""Walk-forward backtest: at each decision candle Kronos only sees the past.

Decisions are taken on a candle's close and executed at the next candle's open.
Forecasts are cached on disk, so a run can be interrupted and resumed, and
re-running with different rule settings costs nothing.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from .config import Config
from .data import atr as compute_atr
from .data import interval_ms
from .execution import check_exit, close_position, open_position, unrealized
from .forecaster import Paths
from .regime import classify
from .strategy import build_signal


class CachedForecaster:
    def __init__(self, inner, cfg: Config, tag: str):
        self.inner, self.cfg = inner, cfg
        self.dir = cfg.data_dir / "forecast_cache" / (
            f"{tag}_{cfg.market}_{cfg.symbol}_{cfg.interval}_L{cfg.lookback}_H{cfg.horizon}"
            f"_N{cfg.sample_count}_T{cfg.temperature}_p{cfg.top_p}_s{cfg.seed}")
        self.dir.mkdir(parents=True, exist_ok=True)
        self.hits = self.misses = 0

    def sample(self, history: pd.DataFrame, interval: str) -> Paths:
        key = pd.Timestamp(history["timestamps"].iloc[-1]).strftime("%Y%m%dT%H%M")
        f = self.dir / f"{key}.npz"
        if f.exists():
            self.hits += 1
            with np.load(f) as d:
                return Paths.from_npz(d)
        self.misses += 1
        paths = self.inner.sample(history, interval)
        np.savez_compressed(f, **paths.to_npz())
        return paths


def run_backtest(cfg: Config, df: pd.DataFrame, forecaster, tag: str = "kronos",
                 progress: bool = True) -> dict:
    fc = CachedForecaster(forecaster, cfg, tag)
    df = df.reset_index(drop=True)
    atr = compute_atr(df, cfg.atr_period).to_numpy()
    start = cfg.lookback - 1
    if len(df) <= start + cfg.horizon:
        raise ValueError(f"Need more than {start + cfg.horizon} candles, got {len(df)}")

    equity = cfg.initial_equity
    pos = None
    pending_entry = None
    pending_exit = False
    trades, curve, forecasts = [], [], []
    decisions = list(range(start, len(df) - 1, cfg.forecast_every))
    decision_set = set(decisions)
    t0 = time.time()

    for i in range(start, len(df)):
        bar = df.iloc[i]
        ts = bar["timestamps"]

        if pending_exit and pos is not None:
            trades.append(close_position(pos, bar["open"], ts, "regime flip", cfg))
            equity += trades[-1].pnl
            pos = None
        pending_exit = False

        if pending_entry is not None and pos is None:
            pos = open_position(pending_entry, bar["open"], equity, ts, cfg)
        pending_entry = None

        if pos is not None:
            pos.bars_held += 1
            hit = check_exit(pos, bar)
            if hit is None and pos.bars_held >= cfg.horizon:
                hit = (bar["close"], "time")
            if hit is not None:
                trades.append(close_position(pos, hit[0], ts, hit[1], cfg))
                equity += trades[-1].pnl
                pos = None

        if i in decision_set:
            paths = fc.sample(df.iloc[i - cfg.lookback + 1: i + 1], cfg.interval)
            last = float(bar["close"])
            regime = classify(paths, last, float(atr[i]), cfg)
            signal = build_signal(paths, regime, last, float(atr[i]), cfg)
            forecasts.append({"timestamps": ts, "close": last, "regime": regime.label,
                              "agreement": regime.agreement, "median_return": regime.median_return,
                              "dispersion_atr": regime.dispersion_atr, "signal": signal.side,
                              "win_prob": signal.win_prob})
            if pos is not None and regime.direction == -pos.side:
                pending_exit = True
            elif pos is None and signal.side != 0:
                pending_entry = signal
            if progress:
                done = decisions.index(i) + 1
                eta = (time.time() - t0) / max(fc.misses, 1) * (len(decisions) - done) if fc.misses else 0
                print(f"\r[{done}/{len(decisions)}] {ts} {regime.label:<13} "
                      f"trades={len(trades)} equity={equity + unrealized(pos, last):,.0f} "
                      f"ETA {eta / 60:.0f} min   ", end="", flush=True)

        curve.append({"timestamps": ts, "equity": equity + unrealized(pos, float(bar["close"])),
                      "close": float(bar["close"])})

    if pos is not None:
        last = df.iloc[-1]
        trades.append(close_position(pos, last["close"], last["timestamps"], "end of test", cfg))
        equity += trades[-1].pnl
        curve[-1]["equity"] = equity
    if progress:
        print()

    trades_df = pd.DataFrame([asdict(t) for t in trades])
    curve_df = pd.DataFrame(curve)
    fc_df = pd.DataFrame(forecasts)
    return {"trades": trades_df, "equity": curve_df, "forecasts": fc_df,
            "summary": summarize(cfg, trades_df, curve_df, fc_df, df)}


def summarize(cfg: Config, trades: pd.DataFrame, curve: pd.DataFrame, fc: pd.DataFrame,
              df: pd.DataFrame) -> dict:
    eq = curve["equity"].to_numpy()
    rets = np.diff(eq) / eq[:-1]
    bars_per_year = 365 * 86_400_000 / interval_ms(cfg.interval)
    years = len(eq) / bars_per_year
    peak = np.maximum.accumulate(eq)
    total = eq[-1] / eq[0] - 1
    bh = curve["close"].iloc[-1] / curve["close"].iloc[0] - 1

    s = {
        "symbol": cfg.symbol, "interval": cfg.interval, "market": cfg.market,
        "from": str(curve["timestamps"].iloc[0]), "to": str(curve["timestamps"].iloc[-1]),
        "fee_per_side": cfg.fee, "slippage_bps": cfg.slippage_bps,
        "total_return": total, "buy_and_hold_return": bh,
        "cagr": (1 + total) ** (1 / years) - 1 if years > 0 and total > -1 else None,
        "max_drawdown": float((eq / peak - 1).min()),
        "sharpe": float(rets.mean() / rets.std() * np.sqrt(bars_per_year)) if rets.std() > 0 else 0.0,
        "trades": int(len(trades)),
    }
    if len(trades):
        wins = trades[trades["pnl"] > 0]
        losses = trades[trades["pnl"] <= 0]
        s.update({
            "win_rate": len(wins) / len(trades),
            "profit_factor": float(wins["pnl"].sum() / -losses["pnl"].sum()) if len(losses) and losses["pnl"].sum() < 0 else None,
            "avg_r": float(trades["r_multiple"].mean()),
            "fees_paid": float(trades["fees"].sum()),
            "exit_reasons": trades["reason"].value_counts().to_dict(),
        })

    if len(fc):
        # Was the forecast direction right, H candles later? Split by regime.
        close_by_ts = df.set_index("timestamps")["close"]
        idx = close_by_ts.index
        future = []
        for ts, last in zip(fc["timestamps"], fc["close"]):
            j = idx.get_loc(ts) + cfg.horizon
            future.append(close_by_ts.iloc[j] / last - 1 if j < len(idx) else np.nan)
        fc = fc.assign(realized=future).dropna(subset=["realized"])
        hit = np.sign(fc["realized"]) == np.sign(fc["median_return"])
        s["forecast_direction_hit_rate"] = {
            label: {"n": int(len(g)), "hit_rate": float(hit[g.index].mean())}
            for label, g in fc.groupby("regime")
        }
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in s.items()}


def save_results(result: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    result["trades"].to_csv(out_dir / "trades.csv", index=False)
    result["equity"].to_csv(out_dir / "equity.csv", index=False)
    result["forecasts"].to_csv(out_dir / "forecasts.csv", index=False)
    (out_dir / "summary.json").write_text(json.dumps(result["summary"], indent=2, default=str))
