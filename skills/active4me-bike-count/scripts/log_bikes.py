#!/usr/bin/env python3
"""
Log a new bike count entry to the data store.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "bike_counts.jsonl")

def main():
    parser = argparse.ArgumentParser(description="Log a bike count entry")
    parser.add_argument("--location", required=True, help="Location name")
    parser.add_argument("--count", type=int, required=True, help="Number of bikes")
    parser.add_argument("--notes", default="", help="Optional notes")
    parser.add_argument("--timestamp", help="ISO 8601 timestamp (default: now)")

    args = parser.parse_args()

    if args.count < 0:
        print("Error: count must be non-negative", file=sys.stderr)
        sys.exit(1)

    # Use provided timestamp or generate current UTC timestamp
    if args.timestamp:
        timestamp = args.timestamp
    else:
        timestamp = datetime.now(timezone.utc).isoformat()

    record = {
        "timestamp": timestamp,
        "location": args.location,
        "count": args.count,
        "notes": args.notes
    }

    # Ensure data directory exists
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)

    # Append record to JSON Lines file
    with open(DATA_FILE, "a") as f:
        f.write(json.dumps(record, separators=(',', ':')) + "\n")

    print(f"Logged: {args.count} bikes at '{args.location}' ({timestamp})")

if __name__ == "__main__":
    main()
