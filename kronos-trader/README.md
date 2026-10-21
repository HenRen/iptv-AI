# Kronos-trader voor goud (XAU/USD)

Een gratis forecasting-, backtest- en paper-tradingsysteem voor goud, gebouwd op
[Kronos](https://github.com/shiyu-coder/Kronos), een open-source foundation model
voor candlestick-data. Draait lokaal op een normale laptop (Apple Silicon via MPS).

> ⚠️ Dit is onderzoeks-/educatiesoftware, geen financieel advies. Er gaan **nooit**
> echte orders uit: het systeem doet alleen paper trading.

## Hoe het werkt

1. **Data**: candles van Binance's gratis publieke API, zonder account of key.
   Binance heeft geen spot-XAUUSD, dus standaard gebruiken we **PAXGUSDT**
   (1 PAXG = 1 troy ounce goud, volgt XAU/USD op een paar dollar na, data vanaf 2019).
   Wil je de gold-perpetual: `--market futures --symbol XAUUSDT`.
   Let op: PAXG handelt 24/7 en ook in het weekend, terwijl de spotgoudmarkt dan dicht is.
2. **Forecast**: Kronos-small krijgt de laatste **512** kaarsen en voorspelt de volgende **24**.
3. **100 scenario's**: met `sample_count=100` tekent Kronos 100 mogelijke toekomsten
   in plaats van één gok. `KronosPredictor.predict()` middelt die normaal weg; deze wrapper
   bewaart elk pad apart (`kronos_trader/forecaster.py`).
4. **Regime** (`regime.py`):
   - **TRENDING_UP / TRENDING_DOWN**: ≥ 70% van de paden eindigt aan dezelfde kant, de
     mediaanbeweging is ≥ 1 ATR en de paden lopen redelijk recht (efficiency ≥ 0,25).
   - **CHOPPY**: alle andere gevallen, dus paden die alle kanten op vliegen.
   - De spreiding (10-90% band, in ATR) laat zien hoe riskant de volgende beweging is.
5. **Regels** (`strategy.py`):
   - **Entry**: trendregime, reward:risk ≥ 1,2, en ≥ 55% van de paden raakt het target
     vóór de stop. Instappen op de open van de volgende kaars.
   - **Stop**: onder het 20%-kwantiel van de laagste lows van de paden, begrensd op 1-3 ATR.
   - **Target**: de mediaan slotkoers van de paden aan het eind van de horizon.
   - **Exit**: stop, target, tijdstop na 24 kaarsen, of een nieuwe forecast die het regime
     tegen je in laat draaien.
   - **Short** alleen op futures (op spot kun je niet zomaar shorten).
6. **Backtest** (`backtest.py`): walk-forward over een jaar, Kronos ziet alleen het
   verleden. Met fees (0,10% per kant op spot, 0,05% op futures) en 3 bps slippage per fill.
   Raken stop en target in dezelfde kaars, dan telt het als stop (conservatief). 1% risico per trade.
7. **Chart** (`chart.py`): TradingView's gratis Lightweight Charts toont echte kaarsen,
   de mediaanvoorspelling, de 10-90% band, losse scenario's en alle **eerdere** voorspellingen
   naast wat er echt gebeurde, plus een track record (richting-hitrate, bandcoverage).
8. **Paper trading + Telegram** (`paper.py`, `telegram.py`): draait op elke gesloten kaars
   en piept als er een setup met hoge kans op een trend ontstaat.

## Installatie (Mac, eenmalig)

```bash
cd kronos-trader
./setup.sh                                  # kloont Kronos (vaste commit), maakt .venv, installeert alles
source .venv/bin/activate
python -m kronos_trader check               # test torch/MPS, Binance en Kronos-small (download ~100 MB)
```

## Gebruik

```bash
# Eén voorspelling: regime + signaal + chart in output/forecast_PAXGUSDT.html
python -m kronos_trader forecast

# Backtest over 1 jaar (Kronos elke 6 uur). Resumable: voorspellingen worden gecachet.
python -m kronos_trader backtest
python -m kronos_trader backtest --baseline     # hetzelfde met een random-walk "model" zonder AI

# Paper trading, draait door; chart ververst in output/live_PAXGUSDT.html
python -m kronos_trader paper
```

Handige opties: `--interval 15m|1h|4h`, `--samples 100`, `--horizon 24`, `--days 365`,
`--every 6`, `--fee 0.001`, `--slippage-bps 3`, `--device mps|cpu`, `--model NeoQuasar/Kronos-base`.
Alle drempels staan in `kronos_trader/config.py`.

**Rekentijd**: één forecast met 100 scenario's is 24 stappen autoregressief over een
context van 512, dus zo'n 5-15 s op een M-serie Mac. Een jaarbacktest op 1h met `--every 6`
is ±1.460 forecasts, reken op een paar uur. Draai hem 's nachts, of begin snel met
`--every 24 --samples 30`. Door de cache kost het opnieuw draaien met andere regels niets.

## Telegram-alerts

1. Open @BotFather in Telegram, stuur `/newbot` en kopieer de token.
2. `cp .env.example .env` en vul `TELEGRAM_BOT_TOKEN` in.
3. Stuur je bot een bericht, draai `python -m kronos_trader telegram-test` en zet de
   getoonde `TELEGRAM_CHAT_ID` in `.env`. Draai het commando daarna nog een keer om te testen.

Je krijgt een bericht bij elke paper-entry en -exit, en een 🔥-alert als een setup
**zowel** ≥ 65% winkans **als** ≥ 80% padovereenstemming heeft.

## Eerlijk testen, voordat je het vertrouwt

- **Vergelijk met de baseline.** Verslaat Kronos `--baseline` en buy & hold niet na
  kosten, dan is er geen edge.
- **Check de forecast-hitrate per regime** in `summary.json`. Als TRENDING-forecasts
  niet duidelijk vaker de goede richting op wijzen dan CHOPPY, doet het regimefilter niets.
- **Pas op voor look-ahead in het model.** Kronos is voorgetraind op marktdata tot ongeveer
  2024/2025, dus een backtest over die periode kan te mooi uitvallen. De live track record
  in de chart is de eerlijke test.
- **Kijk een paar dagen mee** met de live chart (oranje lijnen = oude voorspellingen tegen de
  echte kaarsen) voordat je iets met echt geld doet.

## Tests

```bash
python -m pytest -q
```

De tests draaien zonder modeldownload: de baseline-forecaster en een klein Kronos-model
met willekeurige gewichten controleren de hele pijplijn.
