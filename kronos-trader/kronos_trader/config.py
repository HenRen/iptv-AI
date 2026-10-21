"""All tunable settings in one place. CLI flags override these defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field, fields, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Config:
    # --- market -----------------------------------------------------------
    # Binance has no spot XAUUSD. PAXGUSDT (1 PAXG = 1 troy ounce of gold)
    # tracks XAU/USD closely and has history back to 2019. With
    # market="futures" you can use the USD-M gold perpetual (XAUUSDT).
    symbol: str = "PAXGUSDT"
    market: str = "spot"  # "spot" | "futures"
    interval: str = "1h"

    # --- Kronos -----------------------------------------------------------
    model_id: str = "NeoQuasar/Kronos-small"
    tokenizer_id: str = "NeoQuasar/Kronos-Tokenizer-base"
    kronos_dir: Path = ROOT / "vendor" / "Kronos"
    device: str | None = None  # None = auto (cuda > mps > cpu)
    lookback: int = 512  # candles fed to the model (Kronos-small max context)
    horizon: int = 24  # candles predicted
    sample_count: int = 100  # number of future scenarios
    temperature: float = 1.0
    top_p: float = 0.9
    batch_size: int = 100  # scenarios per forward pass; lower it if memory is tight
    seed: int | None = 42

    # --- regime -----------------------------------------------------------
    trend_agreement: float = 0.70  # >= this share of paths end on the same side
    min_move_atr: float = 1.0  # median move over the horizon must be >= this many ATRs
    min_efficiency: float = 0.25  # median path |net move| / total distance travelled
    atr_period: int = 14

    # --- rules ------------------------------------------------------------
    stop_quantile: float = 0.20  # stop below the 20% quantile of path lows
    min_stop_atr: float = 1.0
    max_stop_atr: float = 3.0
    min_reward_risk: float = 1.2
    min_win_prob: float = 0.55  # share of paths that hit target before stop
    alert_win_prob: float = 0.65  # "high-probability" setup for Telegram
    alert_agreement: float = 0.80
    allow_short: bool | None = None  # None = only on futures

    # --- execution / costs --------------------------------------------------
    fee_rate: float | None = None  # per side; None = 0.10% spot, 0.05% futures taker
    slippage_bps: float = 3.0  # adverse slippage per fill, in basis points
    risk_per_trade: float = 0.01  # fraction of equity lost if the stop is hit
    max_leverage: float = 1.0
    initial_equity: float = 10_000.0

    # --- backtest -----------------------------------------------------------
    backtest_days: int = 365
    forecast_every: int = 6  # re-forecast every N candles (cost/accuracy tradeoff)

    # --- io -----------------------------------------------------------------
    data_dir: Path = ROOT / "data"
    output_dir: Path = ROOT / "output"
    state_dir: Path = ROOT / "state"

    telegram_token: str | None = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN"))
    telegram_chat_id: str | None = field(default_factory=lambda: os.environ.get("TELEGRAM_CHAT_ID"))

    @property
    def shorts_enabled(self) -> bool:
        return self.market == "futures" if self.allow_short is None else self.allow_short

    @property
    def fee(self) -> float:
        if self.fee_rate is not None:
            return self.fee_rate
        return 0.0005 if self.market == "futures" else 0.001

    @property
    def slippage(self) -> float:
        return self.slippage_bps / 10_000

    def with_overrides(self, **kwargs) -> "Config":
        known = {f.name for f in fields(self)}
        return replace(self, **{k: v for k, v in kwargs.items() if k in known and v is not None})


def load_dotenv(path: Path = ROOT / ".env") -> None:
    """Minimal .env loader so TELEGRAM_* can live in a file."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
