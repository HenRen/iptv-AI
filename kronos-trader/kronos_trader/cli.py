"""Command line: python -m kronos_trader <command> [options]"""

from __future__ import annotations

import argparse
import json
import sys

from .config import Config, load_dotenv


def _common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--symbol", help="Binance symbol (default PAXGUSDT = goud)")
    p.add_argument("--market", choices=["spot", "futures"])
    p.add_argument("--interval", help="1m 5m 15m 1h 4h 1d ...")
    p.add_argument("--samples", dest="sample_count", type=int, help="aantal scenario's (default 100)")
    p.add_argument("--horizon", type=int, help="te voorspellen kaarsen (default 24)")
    p.add_argument("--lookback", type=int, help="kaarsen als context (max 512)")
    p.add_argument("--device", help="cpu | mps | cuda:0 (default auto)")
    p.add_argument("--model", dest="model_id", help="HF model id (default NeoQuasar/Kronos-small)")
    p.add_argument("--baseline", action="store_true", help="random-walk baseline i.p.v. Kronos")


def _forecaster(cfg: Config, baseline: bool):
    from .forecaster import KronosForecaster, RandomWalkForecaster

    if baseline:
        return RandomWalkForecaster(cfg)
    fc = KronosForecaster(cfg)
    print(f"Kronos geladen op {fc.device}")
    return fc


def cmd_check(cfg: Config, args) -> None:
    import torch

    print(f"torch {torch.__version__}  mps={torch.backends.mps.is_available()}  cuda={torch.cuda.is_available()}")
    from .data import load_candles

    df = load_candles(cfg.symbol, cfg.interval, 10, cfg.market, cfg.data_dir)
    print(f"Binance OK: {cfg.symbol} laatste close {df['close'].iloc[-1]} @ {df['timestamps'].iloc[-1]} UTC")
    fc = _forecaster(cfg, False)
    import time

    df = load_candles(cfg.symbol, cfg.interval, cfg.lookback, cfg.market, cfg.data_dir)
    t = time.time()
    fc.sample(df, cfg.interval, sample_count=10)
    print(f"Kronos OK: 10 scenario's in {time.time() - t:.1f}s "
          f"(100 scenario's ≈ {(time.time() - t) * 10:.0f}s)")


def cmd_fetch(cfg: Config, args) -> None:
    from .data import load_candles

    df = load_candles(cfg.symbol, cfg.interval, args.bars, cfg.market, cfg.data_dir)
    print(df.tail(5).to_string(index=False))
    print(f"{len(df)} kaarsen opgeslagen in {cfg.data_dir}")


def cmd_forecast(cfg: Config, args) -> None:
    from .chart import log_entry, render_live
    from .data import atr, load_candles
    from .regime import classify
    from .strategy import build_signal

    df = load_candles(cfg.symbol, cfg.interval, cfg.lookback + 400, cfg.market, cfg.data_dir)
    paths = _forecaster(cfg, args.baseline).sample(df.tail(cfg.lookback), cfg.interval)
    close, a = float(df["close"].iloc[-1]), float(atr(df, cfg.atr_period).iloc[-1])
    regime = classify(paths, close, a, cfg)
    signal = build_signal(paths, regime, close, a, cfg)
    info = {"symbol": cfg.symbol, "candle": str(df["timestamps"].iloc[-1]), "price": close,
            "atr": round(a, 4), "regime": regime.as_dict(), "signal": signal.as_dict()}
    print(json.dumps(info, indent=2))
    out = render_live(df, paths, info, [log_entry(paths, df["timestamps"].iloc[-1], close, regime.label)],
                      cfg.output_dir / f"forecast_{cfg.symbol}.html")
    print(f"Chart: {out}")


def cmd_backtest(cfg: Config, args) -> None:
    from .backtest import run_backtest, save_results
    from .chart import render_backtest
    from .data import interval_ms, load_candles

    bars = int(cfg.backtest_days * 86_400_000 / interval_ms(cfg.interval)) + cfg.lookback
    df = load_candles(cfg.symbol, cfg.interval, bars, cfg.market, cfg.data_dir)
    tag = "baseline" if args.baseline else cfg.model_id.split("/")[-1]
    result = run_backtest(cfg, df, _forecaster(cfg, args.baseline), tag=tag)
    out_dir = cfg.output_dir / f"backtest_{tag}_{cfg.symbol}_{cfg.interval}"
    save_results(result, out_dir)
    render_backtest(df, result, out_dir / "chart.html")
    print(json.dumps(result["summary"], indent=2, default=str))
    print(f"Resultaten: {out_dir}")


def cmd_paper(cfg: Config, args) -> None:
    from .paper import PaperTrader

    trader = PaperTrader(cfg, _forecaster(cfg, args.baseline))
    if args.once:
        info = trader.step()
        print(json.dumps(info, indent=2, default=str) if info else "Deze kaars is al verwerkt.")
    else:
        trader.run_forever()


def cmd_telegram_test(cfg: Config, args) -> None:
    from . import telegram

    if not cfg.telegram_token:
        sys.exit("Zet TELEGRAM_BOT_TOKEN in .env")
    if not cfg.telegram_chat_id:
        ids = telegram.chat_ids(cfg.telegram_token)
        if not ids:
            sys.exit("Geen chats gevonden. Stuur je bot eerst een bericht in Telegram en probeer opnieuw.")
        for chat_id, name in ids:
            print(f"TELEGRAM_CHAT_ID={chat_id}   # {name}")
        print("Zet deze regel in .env en draai dit commando nog eens.")
        return
    ok = telegram.send(cfg.telegram_token, cfg.telegram_chat_id, "✅ Kronos-trader is verbonden.")
    print("Verstuurd!" if ok else "Mislukt, controleer token en chat id.")


def main(argv=None) -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(prog="kronos_trader", description="Kronos goud (XAU/USD) forecaster & paper trader")
    sub = parser.add_subparsers(dest="cmd", required=True)
    commands = {
        "check": (cmd_check, "controleer torch, Binance en Kronos"),
        "fetch": (cmd_fetch, "haal kaarsen op van Binance"),
        "forecast": (cmd_forecast, "voorspel de volgende kaarsen + regime + signaal"),
        "backtest": (cmd_backtest, "walk-forward backtest met fees en slippage"),
        "paper": (cmd_paper, "paper trading + Telegram alerts"),
        "telegram-test": (cmd_telegram_test, "test Telegram (en vind je chat id)"),
    }
    for name, (_, help_) in commands.items():
        p = sub.add_parser(name, help=help_)
        _common(p)
        if name == "fetch":
            p.add_argument("--bars", type=int, default=1000)
        if name == "backtest":
            p.add_argument("--days", dest="backtest_days", type=int, help="default 365")
            p.add_argument("--every", dest="forecast_every", type=int, help="voorspel elke N kaarsen (default 6)")
            p.add_argument("--fee", dest="fee_rate", type=float, help="fee per kant, bv. 0.001")
            p.add_argument("--slippage-bps", dest="slippage_bps", type=float)
        if name == "paper":
            p.add_argument("--once", action="store_true", help="verwerk één kaars en stop (voor cron)")

    args = parser.parse_args(argv)
    cfg = Config().with_overrides(**vars(args))
    commands[args.cmd][0](cfg, args)
