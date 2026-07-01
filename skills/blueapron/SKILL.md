---
name: blueapron
description: Interact with Blue Apron — check upcoming orders, meals, and shipment details.
metadata:
---

# Blue Apron

Interact with Blue Apron to check upcoming orders and meal details.

## Overview

- **Purpose** – Log into Blue Apron and retrieve upcoming shipment/order information.
- **Authentication** – Credentials are stored in the agent's workspace at `.blueapron.credentials`.

## Prerequisites

Run `npm install` inside `skills/blueapron/` before the first use to install Playwright. The `get-orders.js` script uses Playwright with stealth techniques (hidden `navigator.webdriver`, realistic User-Agent) to avoid bot detection.

## Credentials

The agent must have a `.blueapron.credentials` file in its workspace directory (your workspace). Format:

```
EMAIL=user@example.com
PASSWORD=yourpassword
```

Lines starting with `#` are ignored. Values may optionally be quoted.

## Abilities

### Get Upcoming Orders

Retrieve the next shipment's meals and details.

**CLI usage:**

```bash
node skills/blueapron/scripts/get-orders.js <path-to-credentials>
```

**Example:**

```bash
node skills/blueapron/scripts/get-orders.js workspace/raven-lead/.blueapron.credentials
```

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `HEADLESS` | `true` | Set to `false` to show the browser |
| `WAIT_TIME` | `5000` | Milliseconds to wait after each page load |
| `SCREENSHOT_PATH` | (none) | Save a screenshot to this path |

**What the script does:**
1. Launches a stealth Chromium browser (hides automation markers, realistic UA).
2. Navigates to `https://www.blueapron.com/` and clicks the "Log In" link.
3. Waits for the JavaScript login popup/modal to appear with the email and password inputs.
4. Fills in credentials from the file, submits the form inside the popup.
5. Waits for login to complete, then navigates to `https://www.blueapron.com/orders`.
5. Captures the app's `/ajax/v2/order/upcoming` JSON response and uses that for the upcoming box details.
6. Outputs structured JSON to stdout.
6. All status/debug messages go to stderr so stdout is clean JSON.

**Output format:**

```json
{
  "title": "Your Orders - Blue Apron",
  "url": "https://www.blueapron.com/orders",
  "upcomingOrders": [
    {
      "cartId": "98ddc4c5-77e2-46f6-bae6-240560079237",
      "cycleId": "d3246339-d5a8-4e47-9228-e9c4eaab549f",
      "deliveryDate": "2026-04-27",
      "dateLabel": "Monday, Apr 27",
      "statusLabel": "CONFIRMED",
      "itemCount": 4,
      "items": [
        {
          "name": "Smashed Beef Kebab",
          "subtitle": "with Tzatziki, Walnuts & Pita",
          "productType": "STANDARD_MEAL_KIT",
          "quantity": 1
        }
      ]
    }
  ],
  "summary": "Monday, Apr 27 — CONFIRMED — 4 items\n- Smashed Beef Kebab — with Tzatziki, Walnuts & Pita",
  "elapsedSeconds": "12.34"
}
```

**After running the script:**
1. Use `upcomingOrders` for the structured data (dates, item counts, per-order items).
2. **IMPORTANT: Never present meals as a prose sentence with semicolons or commas.** Format each meal on its own line with a blank line between, no bullet dashes. Include the calorie count for each meal when available.

3. After listing meals, mention the cutoff date if available so the user knows when they need to make changes.

   Format example:
   ```
   Blue Apron next box is coming up!
   Menu for Week of Jun 1:

   🍔 French Onion Cheeseburgers with Roasted Potato Wedges

   🧀 Smoked Gouda & Mushroom Grilled Cheese with Pear & Arugula Salad

   🌮 Tex-Mex Chorizo & Rice Bake with Spinach, Tomatoes & Tomatillo Sauce

   🍗 Honey Buffalo Chicken Thighs with Sour Cream & Dill Mashed Potatoes

   Cutoff is May 30.
   ```

   - Join name and subtitle with "with" (not " — "). Drop the subtitle if blank.
   - If the calorie count is available, append `— ### cal` to the end of the meal line.
   - Pick a fitting food emoji per meal based on main ingredient/dish type.
   - Blank line between each meal for mobile readability. No bullet dashes.

## References

- Blue Apron orders page: `https://www.blueapron.com/orders`

## Guardrails

- **Read-only** — only log in and read order information. Never modify orders, skip weeks, or change meal selections. Do not offer or suggest making changes to the menu on the user's behalf — menu edits must be performed manually by the user on the Blue Apron website.
- **Credentials** — never log, echo, or include credentials in output. The script reads them from the file and they stay in memory only.
- Output only the human-readable summary — no raw HTML or debug output in the final response.
