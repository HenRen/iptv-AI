"""Kronos-small wrapper that returns every sampled future path, not just their mean.

KronosPredictor.predict() averages its samples. We want the full fan of
scenarios, so we feed the same history N times as a batch with sample_count=1:
each batch row becomes one independent scenario.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import Config
from .data import future_timestamps

FEATURES = ["open", "high", "low", "close", "volume", "amount"]


@dataclass
class Paths:
    """Sampled futures. Every array is shaped (n_paths, horizon)."""

    timestamps: pd.Series
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray

    @property
    def n(self) -> int:
        return self.close.shape[0]

    def quantiles(self, qs=(0.1, 0.5, 0.9)) -> dict[float, np.ndarray]:
        return {q: np.quantile(self.close, q, axis=0) for q in qs}

    def to_npz(self) -> dict:
        return {"ts": self.timestamps.astype("int64").to_numpy(), "open": self.open, "high": self.high,
                "low": self.low, "close": self.close, "volume": self.volume}

    @classmethod
    def from_npz(cls, d) -> "Paths":
        return cls(pd.Series(pd.to_datetime(d["ts"])), d["open"], d["high"], d["low"], d["close"], d["volume"])


class KronosForecaster:
    def __init__(self, cfg: Config, model=None, tokenizer=None):
        self.cfg = cfg
        if cfg.lookback > 512:
            raise ValueError(f"lookback {cfg.lookback} > 512: Kronos-small/base zijn getraind op max 512 kaarsen")

        if str(cfg.kronos_dir) not in sys.path:
            sys.path.insert(0, str(cfg.kronos_dir))
        try:
            from model import Kronos, KronosPredictor, KronosTokenizer  # vendor/Kronos/model
        except ImportError as e:
            raise RuntimeError(f"Kronos not found in {cfg.kronos_dir}. Run ./setup.sh first.") from e

        import torch

        self.torch = torch
        tokenizer = tokenizer or KronosTokenizer.from_pretrained(cfg.tokenizer_id)
        model = model or Kronos.from_pretrained(cfg.model_id)
        tokenizer.eval()
        model.eval()
        self.predictor = KronosPredictor(model, tokenizer, device=cfg.device, max_context=cfg.lookback)
        self.device = self.predictor.device

    def sample(self, history: pd.DataFrame, interval: str, horizon: int | None = None,
               sample_count: int | None = None) -> Paths:
        cfg = self.cfg
        horizon = horizon or cfg.horizon
        n = sample_count or cfg.sample_count
        hist = history.tail(cfg.lookback)
        if cfg.seed is not None:
            self.torch.manual_seed(cfg.seed)

        y_ts = future_timestamps(hist["timestamps"].iloc[-1], interval, horizon)
        x = hist[FEATURES].to_numpy(np.float32)
        x_mean, x_std = x.mean(axis=0), x.std(axis=0)
        x = np.clip((x - x_mean) / (x_std + 1e-5), -self.predictor.clip, self.predictor.clip)
        x_stamp = _time_features(hist["timestamps"])
        y_stamp = _time_features(y_ts)

        out = []
        for start in range(0, n, cfg.batch_size):
            b = min(cfg.batch_size, n - start)
            preds = self.predictor.generate(
                np.repeat(x[None], b, axis=0), np.repeat(x_stamp[None], b, axis=0),
                np.repeat(y_stamp[None], b, axis=0), horizon, cfg.temperature, 0, cfg.top_p,
                1, False,
            )
            out.append(preds)
        p = np.concatenate(out, axis=0) * (x_std + 1e-5) + x_mean  # (n, horizon, 6)
        return _paths_from_array(y_ts, p)


class RandomWalkForecaster:
    """No-AI baseline: bootstraps past candle returns into random futures.

    Run the backtest with --baseline. If Kronos can't beat this, it has no edge.
    Also used by the tests, since it needs no torch or model download.
    """

    device = "cpu"

    def __init__(self, cfg: Config):
        self.cfg = cfg

    def sample(self, history: pd.DataFrame, interval: str, horizon: int | None = None,
               sample_count: int | None = None) -> Paths:
        horizon = horizon or self.cfg.horizon
        n = sample_count or self.cfg.sample_count
        hist = history.tail(self.cfg.lookback)
        seed = int(pd.Timestamp(hist["timestamps"].iloc[-1]).value // 10**9) % 2**32
        rng = np.random.default_rng(seed if self.cfg.seed is None else seed ^ self.cfg.seed)
        last = float(hist["close"].iloc[-1])
        prev = hist["close"].shift(1).to_numpy()[1:]
        rets = np.log(hist["close"].to_numpy()[1:] / prev)
        up = (hist["high"] / hist[["open", "close"]].max(axis=1)).to_numpy()[1:]
        dn = (hist["low"] / hist[["open", "close"]].min(axis=1)).to_numpy()[1:]
        idx = rng.integers(0, len(rets), size=(n, horizon))
        close = last * np.exp(np.cumsum(rets[idx], axis=1))
        open_ = np.concatenate([np.full((n, 1), last), close[:, :-1]], axis=1)
        high = np.maximum(open_, close) * up[idx]
        low = np.minimum(open_, close) * dn[idx]
        vol = np.full((n, horizon), float(hist["volume"].mean()))
        y_ts = future_timestamps(hist["timestamps"].iloc[-1], interval, horizon)
        arr = np.stack([open_, high, low, close, vol, vol * close], axis=2)
        return _paths_from_array(y_ts, arr)


def _time_features(ts: pd.Series) -> np.ndarray:
    ts = pd.Series(pd.to_datetime(ts)).reset_index(drop=True)
    return np.stack([ts.dt.minute, ts.dt.hour, ts.dt.weekday, ts.dt.day, ts.dt.month], axis=1).astype(np.float32)


def _paths_from_array(y_ts: pd.Series, p: np.ndarray) -> Paths:
    o, h, l, c, v = (p[:, :, i].astype(np.float32) for i in range(5))
    # The model can emit slightly inconsistent bars; make each candle valid.
    h = np.maximum.reduce([h, o, c])
    l = np.minimum.reduce([l, o, c])
    return Paths(y_ts.reset_index(drop=True), o, h, l, c, np.maximum(v, 0))
