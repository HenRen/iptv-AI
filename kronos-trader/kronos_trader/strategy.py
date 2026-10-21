"""Turn a forecast + regime into concrete entry, stop and exit rules.

Rules (long; short is the mirror image):
  ENTRY  regime is TRENDING_UP, and
         target/stop reward:risk >= min_reward_risk, and
         >= min_win_prob of the Kronos paths hit the target before the stop.
         Enter at the next candle's open.
  STOP   below the stop_quantile of the paths' lowest lows,
         clamped to [min_stop_atr, max_stop_atr] x ATR from entry.
  TARGET the median path's close at the end of the horizon.
  EXIT   whichever comes first: stop hit, target hit, `horizon` candles
         elapsed (time stop), or a new forecast flips the regime against us.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .config import Config
from .forecaster import Paths
from .regime import Regime


@dataclass
class Signal:
    side: int  # 1 long, -1 short, 0 none
    entry: float
    stop: float
    target: float
    win_prob: float  # share of paths hitting target before stop
    expected_r: float  # mean outcome across paths, in R (multiples of risk)
    reward_risk: float
    high_probability: bool
    reason: str

    def as_dict(self) -> dict:
        return {k: round(v, 4) if isinstance(v, float) else v for k, v in asdict(self).items()}


def evaluate_levels(paths: Paths, side: int, entry: float, stop: float, target: float) -> tuple[float, float]:
    """Replay the bracket on every sampled path. Returns (win share, mean R)."""
    risk = abs(entry - stop)
    if side == 1:
        hit_stop, hit_target = paths.low <= stop, paths.high >= target
    else:
        hit_stop, hit_target = paths.high >= stop, paths.low <= target
    h = paths.close.shape[1]
    first_stop = np.where(hit_stop.any(1), hit_stop.argmax(1), h)
    first_target = np.where(hit_target.any(1), hit_target.argmax(1), h)
    wins = first_target < first_stop  # same candle counts as a loss (conservative)
    losses = (first_stop <= first_target) & (first_stop < h)
    timed = ~wins & ~losses
    r = np.zeros(paths.n)
    r[wins] = abs(target - entry) / risk
    r[losses] = -1.0
    r[timed] = side * (paths.close[timed, -1] - entry) / risk
    return float(wins.mean()), float(r.mean())


def build_signal(paths: Paths, regime: Regime, last_close: float, atr: float, cfg: Config) -> Signal:
    side = regime.direction
    none = Signal(0, last_close, float("nan"), float("nan"), 0.0, 0.0, 0.0, False, "")
    if side == 0:
        none.reason = f"{regime.label}: geen trend ({regime.agreement:.0%} paden eens)"
        return none
    if side == -1 and not cfg.shorts_enabled:
        none.reason = "TRENDING_DOWN maar short staat uit (spot)"
        return none

    entry = last_close
    if side == 1:
        extreme = float(np.quantile(paths.low.min(axis=1), cfg.stop_quantile))
        stop_dist = entry - extreme
    else:
        extreme = float(np.quantile(paths.high.max(axis=1), 1 - cfg.stop_quantile))
        stop_dist = extreme - entry
    stop_dist = float(np.clip(stop_dist, cfg.min_stop_atr * atr, cfg.max_stop_atr * atr))
    stop = entry - side * stop_dist
    target = float(np.median(paths.close[:, -1]))
    reward = side * (target - entry)
    rr = reward / stop_dist if stop_dist > 0 else 0.0

    if reward <= 0 or rr < cfg.min_reward_risk:
        none.reason = f"{regime.label}: reward:risk {rr:.2f} < {cfg.min_reward_risk}"
        return none

    win_prob, exp_r = evaluate_levels(paths, side, entry, stop, target)
    if win_prob < cfg.min_win_prob or exp_r <= 0:
        none.reason = f"{regime.label}: winkans {win_prob:.0%} / E[R] {exp_r:.2f} te laag"
        return none

    high_prob = win_prob >= cfg.alert_win_prob and regime.agreement >= cfg.alert_agreement
    return Signal(side, entry, stop, target, win_prob, exp_r, rr, high_prob,
                  f"{regime.label}: {regime.agreement:.0%} paden eens, winkans {win_prob:.0%}, R:R {rr:.2f}")
