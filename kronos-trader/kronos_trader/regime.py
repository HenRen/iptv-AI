"""Read the market regime from the spread of Kronos scenarios.

Most paths ending on the same side, with a meaningful median move, and paths
that travel in a fairly straight line  -> TRENDING (UP/DOWN).
Paths scattered in every direction      -> CHOPPY.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .config import Config
from .forecaster import Paths

TRENDING_UP = "TRENDING_UP"
TRENDING_DOWN = "TRENDING_DOWN"
CHOPPY = "CHOPPY"


@dataclass
class Regime:
    label: str
    up_share: float  # share of paths that end above the last close
    agreement: float  # max(up_share, 1 - up_share)
    median_return: float  # median final return over the horizon
    median_move_atr: float  # |median final move| in ATRs
    dispersion_atr: float  # 10-90% spread of final closes in ATRs (risk)
    efficiency: float  # median |net move| / path length; 1 = straight line

    @property
    def direction(self) -> int:
        return {TRENDING_UP: 1, TRENDING_DOWN: -1}.get(self.label, 0)

    def as_dict(self) -> dict:
        return {k: round(v, 4) if isinstance(v, float) else v for k, v in asdict(self).items()}


def classify(paths: Paths, last_close: float, atr: float, cfg: Config) -> Regime:
    final = paths.close[:, -1]
    returns = final / last_close - 1
    up_share = float((returns > 0).mean())
    agreement = max(up_share, 1 - up_share)
    median_move = float(np.median(final) - last_close)

    full = np.concatenate([np.full((paths.n, 1), last_close), paths.close], axis=1)
    travelled = np.abs(np.diff(full, axis=1)).sum(axis=1)
    efficiency = float(np.median(np.abs(full[:, -1] - full[:, 0]) / np.maximum(travelled, 1e-12)))

    atr = max(atr, 1e-12)
    move_atr = abs(median_move) / atr
    dispersion = float((np.quantile(final, 0.9) - np.quantile(final, 0.1)) / atr)

    label = CHOPPY
    if agreement >= cfg.trend_agreement and move_atr >= cfg.min_move_atr and efficiency >= cfg.min_efficiency:
        label = TRENDING_UP if median_move > 0 else TRENDING_DOWN

    return Regime(label, up_share, agreement, float(np.median(returns)), move_atr, dispersion, efficiency)
