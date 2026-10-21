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
python -m kronos_trader sweep                   # tientallen regelinstellingen + out-of-sample oordeel
python -m kronos_trader journal                 # al je studies en hun oordeel

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

## Eerlijk oordeel, sweep en journal

Elke backtest eindigt met één van drie vaste oordelen tegenover buy & hold. De testperiode
wordt in de tijd gesplitst: de laatste 30% (`--holdout 0.3`) is een **held-out** periode
waarop je nooit regels afstemt.

| Oordeel | Betekenis |
|---|---|
| **DATA VALIDATED** | verslaat buy & hold op **zowel** CAGR **als** Sharpe, in-sample **én** held-out |
| **TRADE-OFF** | verslaat het op één van de twee, in beide periodes. Jij beslist of dat het waard is |
| **NO EDGE** | al het andere. Geloof het. |

Anders dan veel betaalde tools rekenen wij **met** fees en slippage.

```bash
# 36 regelcombinaties (trend_agreement × min_win_prob × min_reward_risk) op één set forecasts
python -m kronos_trader sweep
```

De sweep kiest de beste combinatie **alleen op de in-sample periode** en beoordeelt die op de
held-out periode. Daarna kijkt hij naar de buren in het grid: een echte edge is een
**PLATEAU** (de buren werken ook), een toevalstreffer is een **LUCKY NUMBER** (één stap
ernaast is het weg). Kronos draait één keer per kaars, niet per combinatie, dus na de eerste
backtest is een sweep een kwestie van seconden.

Elke backtest komt in `output/journal.jsonl`:

```bash
python -m kronos_trader journal             # overzicht van alle studies met hun oordeel
python -m kronos_trader journal --recheck   # draai elke studie opnieuw op de nieuwste data
```

Volgorde zoals een fund het doet: **vraag → backtest → oordeel → sweep → paper → pas dan echt geld.**

## Wat je moet weten voordat je live gaat

- **Er gaan nooit echte orders uit.** Deze code heeft geen koppeling met een broker of
  Binance-account. "Live" betekent hier: live paper trading op echte koersen.
- **Kosten zitten in elk signaal.** Een setup moet ook na fees en slippage nog
  reward:risk ≥ 1,2 en een positieve verwachting hebben. Een stop-out kost 1% van je
  equity **inclusief** kosten.
- **Backtest en paper trader beslissen op dezelfde kaarsen.** Met `--every 6` op 1h is dat om
  00, 06, 12 en 18 uur UTC. Stops, targets en tijdstops worden wél elke kaars gecontroleerd.
  Wil je elk uur beslissen, backtest dan ook met `--every 1` (veel trager).
- **Veiligheid in de paper trader:** exits worden direct opgeslagen, dus een crash telt een
  trade nooit dubbel. Er kan maar één trader per symbool draaien, en bij oude of ontbrekende
  Binance-data wordt er niet gehandeld. Na een fout probeert hij het na 60 s opnieuw.
- **Weekend:** PAXG handelt 24/7, terwijl de echte goudmarkt in het weekend dicht is.
  Weekendkaarsen zijn dun, en maandag kan er een gat ontstaan.
- **Futures/short:** funding fees worden niet gemodelleerd.
- **Tijden** in charts en logs zijn UTC.

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
