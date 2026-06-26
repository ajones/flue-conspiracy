---
name: active4me-bike-count
description: Record, query, and report parked bicycle counts for Active4Me programs. Use when the user needs to log bike counts at specific locations, view historical data, generate reports by location or date range, or export count data for analysis.
---

# Bike Count Recording for Active4Me

This skill provides tools for tracking bicycle parking counts across multiple locations using the Active4Me system. It supports logging new counts, querying historical data, and generating summary reports.

## Program Context

This skill supports the **Parked Walk and Roll** program led by Aaron Jones at **Parkmead Elementary**. The program encourages students to get to school by biking, walking, or carpooling instead of being driven in single-occupancy vehicles.

**Daily Task:** Every school day, record the number of bikes on campus using Active4Me. This data helps:
- Track participation in sustainable transportation
- Identify trends and patterns in student commuting
- Report program effectiveness to schools and districts
- Encourage healthy, active transportation choices

**School Info:**
- **Name:** Parkmead Elementary
- **Typical Enrollment:** ~450 students

## Active4Me Web Interface

The Active4Me platform provides a web-based admin interface for bike count management.

**Authentication:**
- **Login Page:** https://www.active4.me/Login

**Data Management:**
- **View Historical Data:** https://www.active4.me/admin/BikeCounts
- **Enter New Count:** https://www.active4.me/admin/BikeCountEdit?id=new

Use these URLs when you need to access the web interface directly for data entry or review.

## Recording a Bike Count via Web Interface

**School:** Parkmead Elementary

When Aaron asks you to record or mark a bike count, follow this workflow:

### Workflow Steps

1. **Navigate to the login page**
   - Open: https://www.active4.me/Login

2. **Authenticate**
   - Login credentials are obtained from secure storage or provided by Aaron
   - **Note:** First login may trigger a reCAPTCHA challenge. If encountered, notify Aaron that human verification is needed, or use an already-authenticated browser session.

3. **Navigate to the new count form**
   - Open: https://www.active4.me/admin/BikeCountEdit?id=new
   - The page will show the "Bike Count Edit" form for Parkmead Elementary

4. **Locate and enter the bike count**
   - Run `browser snapshot` to identify the current field refs
   - The "Bikes" field is a spinbutton (typically defaults to 0)
   - Enter the number Aaron provided in the Bikes field

5. **DO NOT modify other fields**
   - Leave the date field as-is (defaults to today)
   - Leave the enrollment field unchanged (typically 450 for Parkmead)
   - Only change these if Aaron explicitly asks you to

6. **Save the entry**
   - Click the Save button
   - Wait for the success confirmation

7. **Confirm success**
   - Look for the confirmation message: **"Bike Count Created!"**
   - Verify the bike count matches what was entered
   - Report back to Aaron with confirmation including the count number and date

### Important Notes

- **Authentication:** The first login attempt may trigger a reCAPTCHA. Solutions: (1) Have Aaron complete login first, then use the authenticated session, or (2) Notify Aaron if captcha appears and wait for human verification.
- **Browser automation:** When using browser actions, always run `snapshot` first to identify current element refs, as they change between sessions.
- **Minimal edits:** Only update the bike count field unless explicitly instructed otherwise
- **Date handling:** The system auto-populates today's date; trust it unless Aaron says otherwise
- **Enrollment:** Never adjust enrollment numbers without explicit confirmation
- **Confirmation:** Look for "Bike Count Created!" message to confirm successful save
- **Report back:** Always confirm the exact count and date saved

### Credentials

Login credentials are stored locally in:
- **File:** `.active4me.credentials` in your workspace

This file contains:
- `ACTIVE4ME_EMAIL` - Login email address
- `ACTIVE4ME_PASSWORD` - Login password

Read this file to obtain credentials when authenticating to the Active4Me system.

## Critical Safety Rules

### NEVER Delete or Edit Existing Counts

**The agent is STRICTLY PROHIBITED from:**
- Deleting any bike count record
- Editing any existing bike count value
- Modifying historical data in any way

**If a mistake is detected:**
1. **STOP immediately** - do not attempt to fix it yourself
2. **Notify Aaron via Telegram immediately**
3. **Include the details:** what went wrong, the incorrect value, and what it should be
4. **Wait for Aaron's instruction** on how to proceed

**Aaron's contact for bike count issues:**
- Telegram: chat ID 7698193342

**Rationale:** Bike count data feeds into program reporting and may have been already used for district reports. Only Aaron has the authority and context to determine if/how a correction should be made.

**Message template for errors:**
> "Aaron, I detected a possible error with a bike count. [Details of what went wrong]. I have NOT made any changes to the existing data. Please advise on how to proceed."

## Data Schema

Bike count records are stored in a structured format with these fields:
- **timestamp** - ISO 8601 timestamp of when the count was recorded
- **location** - Name or identifier of the counting site
- **count** - Number of bicycles observed (integer)
- **notes** - Optional freeform notes (weather, conditions, etc.)

## Quick Start

### Recording a Count via Browser (Active4Me)

When Aaron asks you to record a bike count:

**Pre-requisites:**
- Ensure you're logged in to Active4Me (browser session should show "Aaron Jones" in the nav bar)
- If not logged in, navigate to login page and authenticate (human-in-the-loop may be needed for captcha)

**Steps:**
1. Navigate to https://www.active4.me/admin/BikeCountEdit?id=new
2. Run `browser snapshot` to identify current field refs
3. Enter the bike count in the "Bikes" field (Aaron provides this number)
4. **Do not** change date or enrollment unless explicitly asked
5. Click Save
6. Confirm "Bike Count Created!" message appears
7. Report success to Aaron with count and date

Example request:
> "Record 15 bikes for today"

Expected response:
> "✅ Saved! Recorded 15 bikes for Parkmead Elementary on 2026-02-12"

### Recording a Count via Local Log

Log a new bike count at a location:

```bash
python3 scripts/log_bikes.py --location "Park Entrance" --count 12
```

With optional notes:

```bash
python3 scripts/log_bikes.py --location "Main Street" --count 8 --notes "Light rain, weekday afternoon"
```

### Querying Data

View counts for a specific location:

```bash
python3 scripts/report_bikes.py --location "Park Entrance"
```

View counts for a date range:

```bash
python3 scripts/report_bikes.py --start 2026-02-01 --end 2026-02-10
```

Export to CSV:

```bash
python3 scripts/report_bikes.py --start 2026-01-01 --format csv > bikes_q1.csv
```

## Scripts Reference

### log_bikes.py

Add a new bike count entry.

**Required arguments:**
- `--location NAME` - Location identifier
- `--count N` - Number of bikes (positive integer)

**Optional arguments:**
- `--notes TEXT` - Additional context
- `--timestamp ISO8601` -Override timestamp (defaults to now)

**Example:**
```
python3 scripts/log_bikes.py --location "Library Lot" --count 15 --notes "Busiest time of day"
```

### report_bikes.py

Query and report on bike count data.

**Filter options:**
- `--location NAME` - Filter to specific location
- `--start DATE` - Start date (YYYY-MM-DD)
- `--end DATE` - End date (YYYY-MM-DD)
- `--limit N` - Maximum records to return

**Output formats:**
- `--format table` - Human-readable table (default)
- `--format csv` - CSV for spreadsheet import
- `--format json` - JSON for programmatic use

**Aggregation:**
- `--summary` - Show totals and averages instead of individual records

**Example:**
```
python3 scripts/report_bikes.py --location "Park Entrance" --summary
```

## Data Storage

Bike count data is stored in `data/bike_counts.jsonl` - one JSON object per line, ensuring:
- Append-only writes (safe for concurrent access)
- Easy to parse and process
- Resilient to corruption

The data directory is created automatically on first use.

## Workflow Examples

### Monthly Reporting

Generate a monthly summary for all locations:

```bash
python3 scripts/report_bikes.py --start 2026-01-01 --end 2026-01-31 --summary
```

### Site Comparison

Compare two locations side by side:

```bash
echo "=== Park Entrance ==="
python3 scripts/report_bikes.py --location "Park Entrance" --summary
echo "=== Main Street ==="
python3 scripts/report_bikes.py --location "Main Street" --summary
```

## Notes

- Location names are case-sensitive and stored as-provided
- Use consistent location naming for accurate reporting
- The system handles timezones based on system settings
