#!/usr/bin/env python3
"""Read and summarize ~/.kindle-activity.json.

Read-only helper: never modifies the source file.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PATH = Path.home() / ".kindle-activity.json"


def load_data(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object at {path}")
    return data


def fmt_authors(authors: Any) -> str:
    if isinstance(authors, list) and authors:
        return ", ".join(str(a) for a in authors)
    return "Unknown author"


def fmt_pct(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.1f}%"
    return "n/a"


def parse_iso8601(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def format_duration(seconds: float) -> str:
    total = max(0, int(seconds))
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    if secs or not parts:
        parts.append(f"{secs}s")
    return " ".join(parts)


def iter_books(data: dict[str, Any], search: str | None):
    books = data.get("books") or []
    if not isinstance(books, list):
        return []
    if not search:
        return books
    needle = search.casefold()
    filtered = []
    for book in books:
        if not isinstance(book, dict):
            continue
        hay = " ".join([
            str(book.get("title", "")),
            " ".join(str(a) for a in (book.get("authors") or [])),
            str(book.get("asin", "")),
        ]).casefold()
        if needle in hay:
            filtered.append(book)
    return filtered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default=str(DEFAULT_PATH), help="Path to .kindle-activity.json")
    parser.add_argument("--search", help="Filter books by title/author/ASIN substring")
    parser.add_argument("--limit", type=int, default=10, help="Max books to print")
    parser.add_argument("--last-read", action="store_true", help="Print the last-read record and age helper")
    args = parser.parse_args()

    path = Path(args.path).expanduser()
    data = load_data(path)
    now = datetime.now(timezone.utc)

    last_read_at = parse_iso8601(data.get("lastReadAt"))
    last_read = data.get("lastRead") if isinstance(data.get("lastRead"), dict) else None
    duration_since_last_read_seconds = None
    if last_read_at is not None:
        duration_since_last_read_seconds = (now - last_read_at).total_seconds()

    if args.last_read:
        payload: dict[str, Any] = {
            "syncedAt": data.get("syncedAt", "n/a"),
            "lastReadAt": data.get("lastReadAt", "n/a"),
            "durationSinceLastReadSeconds": duration_since_last_read_seconds,
        }
        if duration_since_last_read_seconds is not None:
            payload["durationSinceLastRead"] = format_duration(duration_since_last_read_seconds)
        if isinstance(last_read, dict):
            payload["lastRead"] = {
                "title": last_read.get("title", "n/a"),
                "authors": last_read.get("authors") or [],
                "percentageRead": last_read.get("percentageRead"),
                "date": last_read.get("date", last_read.get("lastSyncDate", "n/a")),
            }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print(f"File: {path}")
    print(f"Synced: {data.get('syncedAt', 'n/a')}")
    print(f"Last read: {data.get('lastReadAt', 'n/a')}")
    if duration_since_last_read_seconds is not None:
        print(f"Last read age: {format_duration(duration_since_last_read_seconds)}")

    if isinstance(last_read, dict):
        print(
            "Last read item: "
            f"{last_read.get('title', 'n/a')} — {fmt_authors(last_read.get('authors'))} "
            f"({fmt_pct(last_read.get('percentageRead'))})"
        )

    books = iter_books(data, args.search)
    print(f"Books shown: {min(len(books), max(args.limit, 0))}/{len(books)}")
    for book in books[: max(args.limit, 0)]:
        if not isinstance(book, dict):
            continue
        print(
            f"- {book.get('title', 'n/a')} — {fmt_authors(book.get('authors'))} "
            f"[{fmt_pct(book.get('percentageRead'))}]"
            f" (lastSync {book.get('lastSyncDate', 'n/a')})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
