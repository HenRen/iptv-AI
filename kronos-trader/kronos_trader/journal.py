"""Every finished backtest lands here, so it can be re-checked as new data arrives."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def append(path: Path, overrides: dict, summary: dict, recheck_of: int | None = None) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    entries = load(path)
    entry = {"id": len(entries) + 1, "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "overrides": overrides, "recheck_of": recheck_of, "summary": summary}
    with path.open("a") as f:
        f.write(json.dumps(entry, default=str) + "\n")
    return entry["id"]


def load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def table(entries: list[dict]) -> str:
    lines = [f"{'id':>3}  {'opgeslagen':<20} {'periode':<23} {'trades':>6} {'sharpe':>7} {'B&H':>7}  oordeel"]
    for e in entries:
        s = e["summary"]
        period = f"{s['from'][:10]} → {s['to'][:10]}"
        tag = f"  (recheck van #{e['recheck_of']})" if e.get("recheck_of") else ""
        lines.append(f"{e['id']:>3}  {e['saved_at'][:19]:<20} {period:<23} {s['trades']:>6} "
                     f"{s['sharpe']:>7.2f} {s['buy_and_hold_sharpe']:>7.2f}  {s['verdict']}{tag}")
    return "\n".join(lines)
