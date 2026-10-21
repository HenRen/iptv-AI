import json

import numpy as np
import pandas as pd
import pytest

from kronos_trader.backtest import run_backtest
from kronos_trader.chart import log_entry, render_backtest, render_live, score_log
from kronos_trader.config import Config
from kronos_trader.execution import check_exit, close_position, open_position
from kronos_trader.forecaster import Paths, RandomWalkForecaster
from kronos_trader.regime import CHOPPY, TRENDING_DOWN, TRENDING_UP, classify
from kronos_trader.strategy import Signal, build_signal, evaluate_levels


def candles(n=900, drift=0.0, seed=0, start="2025-01-01"):
    rng = np.random.default_rng(seed)
    close = 2000 * np.exp(np.cumsum(rng.normal(drift, 0.003, n)))
    open_ = np.concatenate([[2000], close[:-1]])
    high = np.maximum(open_, close) * (1 + rng.uniform(0, 0.002, n))
    low = np.minimum(open_, close) * (1 - rng.uniform(0, 0.002, n))
    vol = rng.uniform(100, 200, n)
    return pd.DataFrame({"timestamps": pd.date_range(start, periods=n, freq="h"), "open": open_, "high": high,
                         "low": low, "close": close, "volume": vol, "amount": vol * close})


def fan(last, slope, noise, n=100, h=24, seed=1):
    rng = np.random.default_rng(seed)
    close = last + slope * np.arange(1, h + 1) + rng.normal(0, noise, (n, h)).cumsum(axis=1)
    open_ = np.concatenate([np.full((n, 1), last), close[:, :-1]], axis=1)
    return Paths(pd.Series(pd.date_range("2025-02-01", periods=h, freq="h")), open_,
                 np.maximum(open_, close) + 0.5, np.minimum(open_, close) - 0.5, close, np.ones((n, h)))


CFG = Config(lookback=128, horizon=12, sample_count=40, forecast_every=4)


def test_regime_trend_and_chop():
    up = classify(fan(2000, 2.0, 0.5), 2000, 5.0, CFG)
    down = classify(fan(2000, -2.0, 0.5), 2000, 5.0, CFG)
    chop = classify(fan(2000, 0.0, 4.0), 2000, 5.0, CFG)
    assert up.label == TRENDING_UP and up.agreement > 0.95
    assert down.label == TRENDING_DOWN
    assert chop.label == CHOPPY


def test_signal_levels_are_consistent():
    paths = fan(2000, 2.0, 0.5, h=CFG.horizon)
    regime = classify(paths, 2000, 5.0, CFG)
    sig = build_signal(paths, regime, 2000, 5.0, CFG)
    assert sig.side == 1 and sig.stop < sig.entry < sig.target
    assert CFG.min_stop_atr * 5 <= sig.entry - sig.stop <= CFG.max_stop_atr * 5 + 1e-9
    assert sig.win_prob >= CFG.min_win_prob
    # shorts are off on spot
    down = fan(2000, -2.0, 0.5, h=CFG.horizon)
    assert build_signal(down, classify(down, 2000, 5.0, CFG), 2000, 5.0, CFG).side == 0
    fut = CFG.with_overrides(market="futures")
    assert build_signal(down, classify(down, 2000, 5.0, fut), 2000, 5.0, fut).side == -1


def test_evaluate_levels_counts_same_bar_as_loss():
    p = fan(100, 0, 0, n=1, h=3)
    p.high[:] = 110
    p.low[:] = 90
    win, r = evaluate_levels(p, 1, 100, 95, 105)
    assert win == 0 and r == -1


def test_execution_costs_and_gaps():
    cfg = Config(fee_rate=0.001, slippage_bps=10, risk_per_trade=0.01)
    sig = Signal(1, 100, 95, 110, 0.7, 0.5, 2, False, "")
    pos = open_position(sig, 100, 10_000, "t0", cfg)
    assert pos.entry == pytest.approx(100.1)
    assert pos.risk == pytest.approx(100)  # 1% of equity
    bar = pd.Series({"open": 94.0, "high": 96.0, "low": 93.0, "close": 95.0})
    price, reason = check_exit(pos, bar)
    assert (price, reason) == (94.0, "stop (gap)")
    trade = close_position(pos, price, "t1", reason, cfg)
    assert trade.r_multiple < -1  # gap + fees + slippage cost more than 1R
    assert open_position(sig, 96, 10_000, "t0", cfg) is not None
    assert open_position(sig, 94, 10_000, "t0", cfg) is None  # opened below the stop


def test_backtest_end_to_end(tmp_path):
    cfg = CFG.with_overrides(data_dir=tmp_path, output_dir=tmp_path)
    df = candles(600, drift=0.0004)
    res = run_backtest(cfg, df, RandomWalkForecaster(cfg), tag="t", progress=False)
    s = res["summary"]
    assert len(res["equity"]) == len(df) - cfg.lookback + 1
    assert s["trades"] == len(res["trades"])
    if s["trades"]:
        assert (res["trades"]["fees"] > 0).all()
    # cached second run gives identical results
    res2 = run_backtest(cfg, df, RandomWalkForecaster(cfg), tag="t", progress=False)
    assert res2["summary"] == s
    out = render_backtest(df, res, tmp_path / "bt.html")
    assert "lightweight-charts@4.2.0" in out.read_text()


def test_forecast_log_scoring_and_live_chart(tmp_path):
    df = candles(300)
    cfg = CFG
    hist = df.iloc[:200]
    paths = RandomWalkForecaster(cfg).sample(hist, "1h")
    entry = log_entry(paths, hist["timestamps"].iloc[-1], float(hist["close"].iloc[-1]), "CHOPPY")
    json.dumps(entry)
    score = score_log([entry], df)
    assert score["n"] == 1 and 0 <= score["band_coverage"] <= 1
    render_live(hist, paths, {"symbol": "X"}, [entry], tmp_path / "live.html")


def test_kronos_wrapper_returns_all_paths():
    torch = pytest.importorskip("torch")
    cfg = Config(lookback=64, horizon=4, sample_count=6, batch_size=4, device="cpu")
    try:
        import sys

        sys.path.insert(0, str(cfg.kronos_dir))
        from model import Kronos, KronosTokenizer
    except ImportError:
        pytest.skip("vendor/Kronos not installed")
    from kronos_trader.forecaster import KronosForecaster

    torch.manual_seed(0)
    tok = KronosTokenizer(d_in=6, d_model=16, n_heads=2, ff_dim=32, n_enc_layers=2, n_dec_layers=2,
                          ffn_dropout_p=0, attn_dropout_p=0, resid_dropout_p=0, s1_bits=4, s2_bits=4,
                          beta=0.05, gamma0=1.0, gamma=1.1, zeta=0.05, group_size=4)
    model = Kronos(s1_bits=4, s2_bits=4, n_layers=2, d_model=16, n_heads=2, ff_dim=32, ffn_dropout_p=0,
                   attn_dropout_p=0, resid_dropout_p=0, token_dropout_p=0, learn_te=True)
    fc = KronosForecaster(cfg, model=model, tokenizer=tok)
    paths = fc.sample(candles(100), "1h")
    assert paths.close.shape == (6, 4)
    assert np.isfinite(paths.close).all()
    assert (paths.high >= paths.close).all() and (paths.low <= paths.close).all()
    assert paths.close.std(axis=0).max() > 0  # independent samples, not one averaged path


def test_verdict_labels():
    from kronos_trader.backtest import verdict

    ts = pd.date_range("2025-01-01", periods=200, freq="h")
    close = np.linspace(100, 110, 200) + np.sin(np.arange(200)) * 0.5
    better = pd.DataFrame({"timestamps": ts, "close": close,
                           "equity": 10_000 * np.exp(np.linspace(0, 0.3, 200))})
    flat = better.assign(equity=10_000.0 + np.sin(np.arange(200)))
    assert verdict(better, 0.3, 8760)["verdict"] == "DATA VALIDATED"
    assert verdict(flat, 0.3, 8760)["verdict"] == "NO EDGE"


def test_sweep_replays_cached_forecasts(tmp_path):
    from kronos_trader.sweep import run_sweep

    cfg = CFG.with_overrides(data_dir=tmp_path)
    df = candles(500, drift=0.0004)
    calls = []

    class Counting(RandomWalkForecaster):
        def sample(self, *a, **k):
            calls.append(1)
            return super().sample(*a, **k)

    grid = {"trend_agreement": [0.6, 0.7], "min_win_prob": [0.5, 0.6], "min_reward_risk": [1.0]}
    res = run_sweep(cfg, df, Counting(cfg), "t", grid)
    assert len(res["table"]) == 4
    decisions = len(range(cfg.lookback - 1, len(df) - 1, cfg.forecast_every))
    assert len(calls) == decisions  # Kronos runs once per candle, not once per combination
    if res["best"] is not None:
        assert res["plateau"]["label"] in ("PLATEAU", "LUCKY NUMBER", "NO EDGE")


def test_journal_roundtrip(tmp_path):
    from kronos_trader import journal

    s = {"from": "2025-01-01 00:00:00", "to": "2025-02-01 00:00:00", "trades": 3, "sharpe": 1.0,
         "buy_and_hold_sharpe": 0.5, "verdict": "TRADE-OFF"}
    f = tmp_path / "j.jsonl"
    assert journal.append(f, {"symbol": "PAXGUSDT"}, s) == 1
    assert journal.append(f, {"symbol": "PAXGUSDT"}, s, recheck_of=1) == 2
    assert "recheck van #1" in journal.table(journal.load(f))
