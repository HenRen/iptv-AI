"""Sweep the rule settings instead of guessing them.

Forecasts are cached, so every extra combination only replays the rules: one
Kronos run, dozens of backtests. To avoid fooling yourself:
  * the best combination is picked on the IN-SAMPLE window only,
  * it is then judged on the HELD-OUT window it was never chosen on,
  * and a real edge should survive nearby settings (a plateau), not live on
    one lucky number.
"""

from __future__ import annotations

import itertools

import pandas as pd

from .backtest import CachedForecaster, run_backtest
from .config import Config

GRID = {
    "trend_agreement": [0.6, 0.7, 0.8],
    "min_win_prob": [0.5, 0.55, 0.6, 0.65],
    "min_reward_risk": [1.0, 1.2, 1.5],
}
SCORE = {"DATA VALIDATED": 2, "TRADE-OFF": 1, "NO EDGE": 0}


def run_sweep(cfg: Config, df: pd.DataFrame, forecaster, tag: str, grid: dict = GRID) -> dict:
    fc = CachedForecaster(forecaster, cfg, tag)
    keys = list(grid)
    rows = []
    for n, values in enumerate(itertools.product(*grid.values())):
        combo = dict(zip(keys, values))
        # The first run computes (or loads) every forecast; the rest only replay rules.
        s = run_backtest(cfg.with_overrides(**combo), df, fc, tag, progress=n == 0)["summary"]
        rows.append({**combo, "trades": s["trades"],
                     "in_sample_sharpe": s["in_sample"]["sharpe"], "in_sample_cagr": s["in_sample"]["cagr"],
                     "held_out_sharpe": s["held_out"]["sharpe"], "held_out_cagr": s["held_out"]["cagr"],
                     "held_out_bh_sharpe": s["held_out"]["buy_and_hold_sharpe"],
                     "verdict": s["verdict"]})
        print(f"\r{n + 1} combinaties getest", end="", flush=True)
    print()
    table = pd.DataFrame(rows)

    traded = table[table["trades"] > 0]
    if traded.empty:
        return {"table": table, "best": None, "plateau": None}
    best = traded.sort_values("in_sample_sharpe", ascending=False).iloc[0]

    neighbours = []
    for k in keys:
        i = grid[k].index(best[k])
        for j in (i - 1, i + 1):
            if 0 <= j < len(grid[k]):
                match = table
                for k2 in keys:
                    match = match[match[k2] == (grid[k][j] if k2 == k else best[k2])]
                neighbours.append(match.iloc[0])
    share = sum(SCORE[r["verdict"]] >= 1 for r in neighbours) / len(neighbours) if neighbours else 0.0
    plateau = {"neighbours": len(neighbours), "share_with_edge": round(share, 2),
               "label": "NO EDGE" if SCORE[best["verdict"]] == 0
               else "PLATEAU" if share >= 2 / 3 else "LUCKY NUMBER"}
    return {"table": table, "best": best.to_dict(), "plateau": plateau}
