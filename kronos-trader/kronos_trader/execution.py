"""Position sizing, fills with fees + slippage, and stop/target/time exits.

Shared by the backtest and the paper trader so both follow identical rules.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import pandas as pd

from .config import Config
from .strategy import Signal


@dataclass
class Position:
    side: int
    qty: float
    entry: float  # fill price incl. slippage
    stop: float
    target: float
    opened_at: str
    entry_fee: float
    risk: float  # cash lost at the stop, before costs
    bars_held: int = 0

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class Trade:
    side: int
    opened_at: str
    closed_at: str
    entry: float
    exit: float
    qty: float
    pnl: float  # after fees and slippage
    fees: float
    r_multiple: float
    reason: str
    bars_held: int


def open_position(signal: Signal, ref_price: float, equity: float, when, cfg: Config) -> Position | None:
    """Market order at ref_price (next candle's open). None if the bracket is already broken."""
    side = signal.side
    fill = ref_price * (1 + side * cfg.slippage)
    stop_dist = side * (fill - signal.stop)
    if stop_dist <= 0 or side * (signal.target - fill) <= 0:
        return None  # price gapped through the stop or the target
    qty = equity * cfg.risk_per_trade / stop_dist
    qty = min(qty, equity * cfg.max_leverage / fill)
    if qty <= 0:
        return None
    return Position(side, qty, fill, signal.stop, signal.target, str(when), qty * fill * cfg.fee, qty * stop_dist)


def check_exit(pos: Position, bar: pd.Series) -> tuple[float, str] | None:
    """Stop/target hit inside this candle? If both, assume the stop (conservative)."""
    o, h, l = bar["open"], bar["high"], bar["low"]
    if pos.side == 1:
        if o <= pos.stop:
            return o, "stop (gap)"
        if o >= pos.target:
            return o, "target (gap)"
        if l <= pos.stop:
            return pos.stop, "stop"
        if h >= pos.target:
            return pos.target, "target"
    else:
        if o >= pos.stop:
            return o, "stop (gap)"
        if o <= pos.target:
            return o, "target (gap)"
        if h >= pos.stop:
            return pos.stop, "stop"
        if l <= pos.target:
            return pos.target, "target"
    return None


def close_position(pos: Position, price: float, when, reason: str, cfg: Config) -> Trade:
    fill = price * (1 - pos.side * cfg.slippage)
    exit_fee = pos.qty * fill * cfg.fee
    gross = pos.side * (fill - pos.entry) * pos.qty
    fees = pos.entry_fee + exit_fee
    pnl = gross - fees
    return Trade(pos.side, pos.opened_at, str(when), pos.entry, fill, pos.qty, pnl, fees,
                 pnl / pos.risk if pos.risk else 0.0, reason, pos.bars_held)


def unrealized(pos: Position | None, price: float) -> float:
    return 0.0 if pos is None else pos.side * (price - pos.entry) * pos.qty - pos.entry_fee
