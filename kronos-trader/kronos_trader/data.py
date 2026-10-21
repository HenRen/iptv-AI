"""Candles from Binance's free public REST API (no account, no key)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

SPOT_HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"]
FUTURES_HOSTS = ["https://fapi.binance.com"]

INTERVAL_MS = {
    "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "6h": 21_600_000,
    "8h": 28_800_000, "12h": 43_200_000, "1d": 86_400_000,
}

COLUMNS = ["timestamps", "open", "high", "low", "close", "volume", "amount"]


def interval_ms(interval: str) -> int:
    try:
        return INTERVAL_MS[interval]
    except KeyError:
        raise ValueError(f"Unsupported interval {interval!r}; use one of {list(INTERVAL_MS)}") from None


def _get(hosts: list[str], path: str, params: dict) -> list:
    query = urllib.parse.urlencode(params)
    last_error: Exception | None = None
    for host in hosts:
        for attempt in range(4):
            try:
                req = urllib.request.Request(f"{host}{path}?{query}", headers={"User-Agent": "kronos-trader"})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    return json.loads(resp.read())
            except urllib.error.HTTPError as e:
                last_error = e
                if e.code in (418, 429):  # rate limited
                    time.sleep(2 ** attempt * 5)
                    continue
                break  # 451 (geo-block) or 4xx: try the next host
            except (urllib.error.URLError, TimeoutError) as e:
                last_error = e
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Binance request failed for {path} {params}: {last_error}")


def fetch_klines(symbol: str, interval: str, start_ms: int, end_ms: int | None = None,
                 market: str = "spot") -> pd.DataFrame:
    """Fetch all closed candles in [start_ms, end_ms), paginating as needed."""
    hosts, path, limit = (
        (FUTURES_HOSTS, "/fapi/v1/klines", 1500) if market == "futures"
        else (SPOT_HOSTS, "/api/v3/klines", 1000)
    )
    now_ms = int(time.time() * 1000)
    end_ms = min(end_ms or now_ms, now_ms)
    rows: list = []
    cursor = start_ms
    while cursor < end_ms:
        batch = _get(hosts, path, {"symbol": symbol, "interval": interval, "startTime": cursor,
                                   "endTime": end_ms - 1, "limit": limit})
        if not batch:
            break
        rows.extend(batch)
        cursor = batch[-1][0] + interval_ms(interval)
        if len(batch) < limit:
            break
        time.sleep(0.2)
    return _to_frame(rows, now_ms)


def _to_frame(rows: list, now_ms: int) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=COLUMNS)
    df = pd.DataFrame(rows).iloc[:, :8]
    df.columns = ["open_time", "open", "high", "low", "close", "volume", "close_time", "amount"]
    df = df[df["close_time"] < now_ms]  # drop the candle that is still forming
    out = pd.DataFrame({
        "timestamps": pd.to_datetime(df["open_time"], unit="ms", utc=True).dt.tz_localize(None),
        **{c: df[c].astype(float) for c in ["open", "high", "low", "close", "volume", "amount"]},
    })
    return out.drop_duplicates("timestamps").sort_values("timestamps").reset_index(drop=True)


def load_candles(symbol: str, interval: str, bars: int, market: str = "spot",
                 cache_dir: Path | None = None) -> pd.DataFrame:
    """Return the most recent `bars` closed candles, using an incremental CSV cache."""
    step = interval_ms(interval)
    now_ms = int(time.time() * 1000)
    want_start = now_ms - (bars + 2) * step

    cached = pd.DataFrame(columns=COLUMNS)
    cache_file = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / f"{market}_{symbol}_{interval}.csv"
        if cache_file.exists():
            cached = pd.read_csv(cache_file, parse_dates=["timestamps"])

    frames = [cached]
    if cached.empty or _ms(cached["timestamps"].iloc[0]) > want_start:
        end = _ms(cached["timestamps"].iloc[0]) if not cached.empty else None
        frames.insert(0, fetch_klines(symbol, interval, want_start, end, market))
    start = _ms(cached["timestamps"].iloc[-1]) + step if not cached.empty else want_start
    if cached.empty or start < now_ms - step:
        frames.append(fetch_klines(symbol, interval, start, None, market))

    df = pd.concat([f for f in frames if not f.empty], ignore_index=True)
    df = df.drop_duplicates("timestamps").sort_values("timestamps").reset_index(drop=True)
    if cache_file is not None:
        df.to_csv(cache_file, index=False)
    if df.empty:
        raise RuntimeError(f"No candles returned for {symbol} ({market}, {interval}).")
    return df.tail(bars).reset_index(drop=True)


def _ms(ts) -> int:
    return int(pd.Timestamp(ts).value // 1_000_000)


def future_timestamps(last: pd.Timestamp, interval: str, n: int) -> pd.Series:
    step = pd.Timedelta(milliseconds=interval_ms(interval))
    return pd.Series([last + step * (i + 1) for i in range(n)])


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - prev_close).abs(),
                    (df["low"] - prev_close).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()
