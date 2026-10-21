"""Telegram alerts via the Bot API (free).

1. Talk to @BotFather in Telegram, send /newbot, copy the token.
2. Send your new bot any message, then run:  python -m kronos_trader telegram-chat-id
3. Put TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request


def _call(token: str, method: str, params: dict | None = None) -> dict:
    data = urllib.parse.urlencode(params or {}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=data)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def send(token: str | None, chat_id: str | None, text: str) -> bool:
    if not token or not chat_id:
        return False
    try:
        return bool(_call(token, "sendMessage", {"chat_id": chat_id, "text": text,
                                                 "parse_mode": "HTML", "disable_web_page_preview": "true"}).get("ok"))
    except Exception as e:  # never let an alert failure kill the trader
        print(f"Telegram error: {e}")
        return False


def chat_ids(token: str) -> list[tuple[str, str]]:
    updates = _call(token, "getUpdates").get("result", [])
    seen = {}
    for u in updates:
        chat = (u.get("message") or u.get("channel_post") or {}).get("chat")
        if chat:
            seen[str(chat["id"])] = chat.get("username") or chat.get("title") or chat.get("first_name", "")
    return list(seen.items())
