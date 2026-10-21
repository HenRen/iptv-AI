"""Standalone HTML charts with TradingView's free Lightweight Charts library.

Open the file in a browser. The live chart overlays every logged forecast on
the real candles that followed, so you can watch for a few days how good
Kronos actually is before trusting it.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .forecaster import Paths

LWC = "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"


def _t(ts) -> int:
    return int(pd.Timestamp(ts).value // 10**9)


def _candles(df: pd.DataFrame) -> list[dict]:
    return [{"time": _t(r.timestamps), "open": r.open, "high": r.high, "low": r.low, "close": r.close}
            for r in df.itertuples()]


def _line(ts, values, anchor=None) -> list[dict]:
    pts = [{"time": _t(t), "value": float(v)} for t, v in zip(ts, values)]
    return ([{"time": _t(anchor[0]), "value": float(anchor[1])}] if anchor else []) + pts


def score_log(log: list[dict], df: pd.DataFrame) -> dict | None:
    """Accuracy of past forecasts whose horizon has fully played out."""
    closes = df.set_index("timestamps")["close"]
    hits, inside, errors = [], [], []
    for f in log:
        ts = pd.to_datetime(f["ts"])
        if ts[-1] not in closes.index:
            continue
        real = closes.reindex(ts).to_numpy()
        if np.isnan(real).any():
            continue
        p50, p10, p90 = map(np.asarray, (f["p50"], f["p10"], f["p90"]))
        hits.append(np.sign(real[-1] - f["last_close"]) == np.sign(p50[-1] - f["last_close"]))
        inside.append(((real >= p10) & (real <= p90)).mean())
        errors.append(abs(p50[-1] / real[-1] - 1))
    if not hits:
        return None
    return {"n": len(hits), "direction_hit_rate": float(np.mean(hits)),
            "band_coverage": float(np.mean(inside)), "median_abs_error": float(np.median(errors))}


def log_entry(paths: Paths, last_ts, last_close: float, regime_label: str) -> dict:
    q = paths.quantiles((0.1, 0.5, 0.9))
    return {"made_at": str(last_ts), "last_close": last_close, "regime": regime_label,
            "ts": [str(t) for t in paths.timestamps], "p10": q[0.1].round(4).tolist(),
            "p50": q[0.5].round(4).tolist(), "p90": q[0.9].round(4).tolist()}


def render_live(df: pd.DataFrame, paths: Paths, info: dict, log: list[dict], out: Path,
                n_paths: int = 20, refresh_s: int | None = None) -> Path:
    last_ts, last_close = df["timestamps"].iloc[-1], float(df["close"].iloc[-1])
    anchor = (last_ts, last_close)
    q = paths.quantiles((0.1, 0.5, 0.9))
    lines = [{"data": _line(paths.timestamps, paths.close[k], anchor), "color": "rgba(41,98,255,0.18)", "width": 1}
             for k in range(min(n_paths, paths.n))]
    for f in log[-60:-1]:  # earlier forecasts vs reality
        lines.append({"data": _line(pd.to_datetime(f["ts"]), f["p50"], (pd.Timestamp(f["made_at"]), f["last_close"])),
                      "color": "rgba(255,152,0,0.45)", "width": 1})
    lines += [
        {"data": _line(paths.timestamps, q[0.9], anchor), "color": "#26a69a", "width": 1, "dashed": True},
        {"data": _line(paths.timestamps, q[0.1], anchor), "color": "#ef5350", "width": 1, "dashed": True},
        {"data": _line(paths.timestamps, q[0.5], anchor), "color": "#2962ff", "width": 3},
    ]
    sig = info.get("signal", {})
    price_lines = []
    if sig.get("side"):
        price_lines = [{"price": sig["stop"], "color": "#ef5350", "title": "stop"},
                       {"price": sig["target"], "color": "#26a69a", "title": "target"}]
    score = score_log(log, df)
    stats = dict(info)
    if score:
        stats["track_record"] = score
    return _write(out, f"Kronos {info.get('symbol', '')}", _candles(df.tail(400)), lines, price_lines,
                  [], None, stats, refresh_s,
                  "Blauw = mediaan, groen/rood = 90%/10% band, lichtblauw = losse scenario's, "
                  "oranje = eerdere voorspellingen naast wat er echt gebeurde.")


def render_backtest(df: pd.DataFrame, result: dict, out: Path) -> Path:
    trades = result["trades"]
    markers = []
    for t in trades.itertuples():
        long = t.side == 1
        markers.append({"time": _t(t.opened_at), "position": "belowBar" if long else "aboveBar",
                        "color": "#26a69a" if long else "#ef5350", "shape": "arrowUp" if long else "arrowDown",
                        "text": "L" if long else "S"})
        markers.append({"time": _t(t.closed_at), "position": "aboveBar" if long else "belowBar",
                        "color": "#787b86", "shape": "circle", "text": f"{t.r_multiple:+.1f}R"})
    markers.sort(key=lambda m: m["time"])
    eq = result["equity"]
    equity = [{"time": _t(r.timestamps), "value": float(r.equity)} for r in eq.itertuples()]
    shown = df[df["timestamps"] >= eq["timestamps"].iloc[0]]
    return _write(out, f"Kronos backtest {result['summary'].get('symbol', '')}", _candles(shown), [], [],
                  markers, equity, result["summary"], None,
                  "Pijlen = entries, cirkels = exits met resultaat in R. Onder: equity curve na fees en slippage.")


def _write(out: Path, title: str, candles, lines, price_lines, markers, equity, stats, refresh_s, legend) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"candles": candles, "lines": lines, "priceLines": price_lines,
                          "markers": markers, "equity": equity}, default=float)
    refresh = f'<meta http-equiv="refresh" content="{refresh_s}">' if refresh_s else ""
    stats_html = html.escape(json.dumps(stats, indent=2, default=str))
    out.write_text(TEMPLATE.format(title=html.escape(title), lwc=LWC, payload=payload, refresh=refresh,
                                   stats=stats_html, legend=html.escape(legend)))
    return out


TEMPLATE = """<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
{refresh}<title>{title}</title>
<script src="{lwc}"></script>
<style>
:root {{ --bg:#ffffff; --fg:#131722; --muted:#787b86; --grid:#f0f3fa; --panel:#f8f9fd; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#131722; --fg:#d1d4dc; --muted:#787b86; --grid:#1e222d; --panel:#1e222d; }} }}
body {{ margin:0; padding:16px; background:var(--bg); color:var(--fg); font:14px/1.4 system-ui,sans-serif; }}
h1 {{ font-size:18px; margin:0 0 8px; }}
p {{ color:var(--muted); margin:0 0 12px; }}
#chart {{ height:60vh; min-height:360px; }} #equity {{ height:22vh; min-height:160px; margin-top:8px; }}
pre {{ background:var(--panel); padding:12px; border-radius:6px; overflow:auto; font-size:12px; }}
</style></head><body>
<h1>{title}</h1><p>{legend}</p>
<div id="chart"></div><div id="equity"></div>
<pre>{stats}</pre>
<script>
const D = {payload};
const css = getComputedStyle(document.documentElement);
const opts = el => ({{ width: el.clientWidth, height: el.clientHeight,
  layout: {{ background: {{ color: css.getPropertyValue('--bg').trim() }}, textColor: css.getPropertyValue('--fg').trim() }},
  grid: {{ vertLines: {{ color: css.getPropertyValue('--grid').trim() }}, horzLines: {{ color: css.getPropertyValue('--grid').trim() }} }},
  localization: {{ locale: 'nl-NL' }}, timeScale: {{ timeVisible: true, secondsVisible: false }}, rightPriceScale: {{ borderVisible: false }} }});
const el = document.getElementById('chart');
const chart = LightweightCharts.createChart(el, opts(el));
const candles = chart.addCandlestickSeries({{ upColor:'#26a69a', downColor:'#ef5350', borderVisible:false,
  wickUpColor:'#26a69a', wickDownColor:'#ef5350' }});
candles.setData(D.candles);
if (D.markers.length) candles.setMarkers(D.markers);
for (const p of D.priceLines) candles.createPriceLine({{ price:p.price, color:p.color, lineWidth:1, lineStyle:2, axisLabelVisible:true, title:p.title }});
for (const l of D.lines) {{
  const s = chart.addLineSeries({{ color:l.color, lineWidth:l.width, lineStyle:l.dashed ? 2 : 0,
    priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false }});
  s.setData(l.data);
}}
chart.timeScale().fitContent();
const charts = [[chart, el]];
const eqEl = document.getElementById('equity');
if (D.equity) {{
  const ec = LightweightCharts.createChart(eqEl, opts(eqEl));
  ec.addAreaSeries({{ lineColor:'#2962ff', topColor:'rgba(41,98,255,0.3)', bottomColor:'rgba(41,98,255,0)' }}).setData(D.equity);
  ec.timeScale().fitContent();
  charts.push([ec, eqEl]);
}} else eqEl.remove();
addEventListener('resize', () => charts.forEach(([c, e]) => c.applyOptions({{ width: e.clientWidth }})));
</script></body></html>
"""
