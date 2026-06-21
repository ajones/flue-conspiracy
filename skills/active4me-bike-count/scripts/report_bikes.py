#!/usr/bin/env python3
"""
Query and report on bike count data.
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime
from collections import defaultdict

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "bike_counts.jsonl")

def load_records():
    """Load all records from the data file."""
    if not os.path.exists(DATA_FILE):
        return []

    records = []
    with open(DATA_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return records

def filter_records(records, location=None, start=None, end=None):
    """Filter records by criteria."""
    filtered = records

    if location:
        filtered = [r for r in filtered if r.get("location") == location]

    if start:
        filtered = [r for r in filtered if r.get("timestamp", "") >= start]

    if end:
        # Extend end to include the full day
        end_extended = end + "T23:59:59"
        filtered = [r for r in filtered if r.get("timestamp", "") <= end_extended]

    return filtered

def format_table(records):
    """Format records as a human-readable table."""
    if not records:
        print("No records found.")
        return

    # Sort by timestamp
    records = sorted(records, key=lambda r: r.get("timestamp", ""))

    # Find column widths
    max_loc = max(len(r.get("location", "")) for r in records)
    max_loc = max(max_loc, len("Location"))

    print(f"{'Timestamp':<20} | {'Location':<{max_loc}} | {'Count':>5} | Notes")
    print("-" * (30 + max_loc + 10))

    for r in records:
        ts = r.get("timestamp", "")[:19].replace("T", " ")
        loc = r.get("location", "")[:max_loc]
        count = r.get("count", 0)
        notes = r.get("notes", "")[:30]
        print(f"{ts:<20} | {loc:<{max_loc}} | {count:>5} | {notes}")

def format_csv(records):
    """Format records as CSV."""
    if not records:
        return

    writer = csv.DictWriter(sys.stdout, fieldnames=["timestamp", "location", "count", "notes"])
    writer.writeheader()
    for r in records:
        writer.writerow(r)

def format_json(records):
    """Format records as JSON."""
    print(json.dumps(records, indent=2))

def format_summary(records):
    """Show summary statistics grouped by location."""
    if not records:
        print("No records found.")
        return

    by_location = defaultdict(lambda: {"total": 0, "count": 0, "max": 0, "min": float('inf')})

    for r in records:
        loc = r.get("location", "Unknown")
        cnt = r.get("count", 0)
        by_location[loc]["total"] += cnt
        by_location[loc]["count"] += 1
        by_location[loc]["max"] = max(by_location[loc]["max"], cnt)
        by_location[loc]["min"] = min(by_location[loc]["min"], cnt)

    print(f"{'Location':<20} | {'Entries':>7} | {'Total':>8} | {'Avg':>6} | {'Min':>4} | {'Max':>4}")
    print("-" * 70)

    for loc, stats in sorted(by_location.items()):
        avg = stats["total"] / stats["count"] if stats["count"] > 0 else 0
        min_val = stats["min"] if stats["min"] != float('inf') else 0
        print(f"{loc:<20} | {stats['count']:>7} | {stats['total']:>8} | {avg:>6.1f} | {min_val:>4} | {stats['max']:>4}")

def main():
    parser = argparse.ArgumentParser(description="Report on bike count data")
    parser.add_argument("--location", help="Filter by location")
    parser.add_argument("--start", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", help="End date (YYYY-MM-DD)")
    parser.add_argument("--format", choices=["table", "csv", "json"], default="table",
                       help="Output format (default: table)")
    parser.add_argument("--summary", action="store_true", help="Show summary statistics")
    parser.add_argument("--limit", type=int, help="Limit number of records")

    args = parser.parse_args()

    records = load_records()
    records = filter_records(records, args.location, args.start, args.end)

    if args.limit:
        records = records[:args.limit]

    if args.summary:
        format_summary(records)
    elif args.format == "csv":
        format_csv(records)
    elif args.format == "json":
        format_json(records)
    else:
        format_table(records)

if __name__ == "__main__":
    main()
