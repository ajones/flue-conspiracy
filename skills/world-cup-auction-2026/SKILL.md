---
name: world-cup-auction-2026
description: Track the 2026 World Cup Auction Challenge pool — compute each owner's guaranteed winnings based on how far their drafted team(s) have advanced, and produce a stack-ranked leaderboard. Use when asked who's winning the World Cup pool, how much someone has won, or for a leaderboard/standings of the auction.
metadata:
  openclaw:
    emoji: "🏆"
    requires:
      bins: ["curl", "jq"]
---

# World Cup Auction 2026 Skill

## Overview

This skill tracks a private auction pool where 27 owners drafted the 48 teams in the 2026 FIFA World Cup. Each team's owner(s) win a payout based on how far that team advances in the tournament. The goal is to produce a **stack rank of owners by total guaranteed winnings**, with a breakdown of which teams are driving each owner's total.

**Roster data**: [references/roster.json](references/roster.json) — contains, for each team: the auction `price`, its `api_name` (the name used by the football-data.org API, where it differs from the roster name), and its `owners` array (`name` + `share`, since some teams are split among multiple owners — e.g. Spain is Adam 50% / Brad 25% / Bryan 25%).

**Prize tiers** (`prize_tiers` in roster.json) — these are the **final, stacked** totals a team's owner(s) split based on the team's ultimate tournament finish:

| Team finishes... | Payout |
|---|---|
| Group stage (doesn't reach Round of 32) | $0 |
| Round of 32 (eliminated) | $16 |
| Round of 16 (eliminated) | $57 |
| Quarter-Finals (eliminated) | $156 |
| 3rd place (won 3rd-place match) | $550 |
| 2nd place (lost the Final) | $748 |
| 1st place (won the Final) | $1,142 |

A team that loses the 3rd-place match (finishes 4th) gets the Quarter-Finals tier ($156) — there's no separate 4th-place prize.

## Determining each team's current status

Use the **fifa-world-cup** skill to get current standings and match data from the football-data.org API (`/v4/competitions/WC/matches`, requires `FOOTBALL_DATA_TOKEN`). Each match has a `stage` field — inspect the actual values returned (e.g. `GROUP_STAGE`, and knockout stages like `LAST_32`/`ROUND_OF_16`/`LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `THIRD_PLACE`, `FINAL` — exact naming may vary, check live data) and `status` (`FINISHED`, `SCHEDULED`/`TIMED`, `LIVE`/`IN_PLAY`).

For each team in roster.json (matching on `api_name`), determine its **current guaranteed payout**:

1. **Group stage not yet complete** (any `GROUP_STAGE` match for any team is not `FINISHED`): every team's guaranteed payout is **$0**. Don't try to project who will advance — only count completed results.

2. **Group stage complete, knockout bracket not yet set**: a team that finished outside the top 2 of its group AND not among the 8 best third-place teams is eliminated at the group stage → **$0**. Teams that advanced to the Round of 32 are guaranteed at least **$16** (the round_of_32 tier), even before playing their Round of 32 match.

3. **Knockout rounds**: for a team that has played and lost a knockout match, its guaranteed payout is the tier corresponding to the **stage of the match it lost**:
   - Lost in Round of 32 → $16
   - Lost in Round of 16 → $57
   - Lost in Quarter-Finals → $156
   - Lost the 3rd-place match → $156 (QF tier, since 4th place = QF tier)
   - Lost the Final → $748 (2nd place)
   - Won the 3rd-place match → $550
   - Won the Final → $1,142 (1st place)

   A team still alive in the knockout bracket (won its most recent match, or hasn't played its next match yet) is guaranteed **at least** the tier of the round it has already secured — i.e. the tier for the round *before* the one it's currently in (since reaching a round guarantees the prior round's payout). Report this as its current guaranteed minimum; you can optionally note upside potential separately.

If you're unsure how to map the live `stage`/`status` values to these tiers, say so explicitly rather than guessing — show the raw match data for the team in question.

## Computing the leaderboard

1. For each team, compute `current_payout` per the rules above.
2. For each owner of that team, add `current_payout * share` to their running total.
3. Stack-rank owners by total descending.
4. For each owner, list their team(s) with: team name, current status (e.g. "Group stage — alive", "Eliminated, Round of 16", "Won Final — Champion!"), share %, and dollar amount earned from that team.

## Output format

```
🏆 World Cup Auction 2026 — Standings (as of <date>)

1. Abbas — $XXX
   - Brazil (100%): <status> → $XXX
   - Ghana (100%): <status> → $XXX

2. ...
```

- If group stage is still in progress and everyone is at $0, say so plainly: "Group stage still underway — no payouts guaranteed yet. Here's where things stand:" and instead rank by something useful like each team's current group position (e.g. note which of an owner's teams are currently in a qualifying spot).
- Don't fabricate elimination/advancement before it's confirmed by finished match data.

## Guardrails

- Read-only. This skill never modifies roster.json or places any bets/payments.
- All money figures are guaranteed/locked-in totals based on completed matches — never report a projected or "if they win it all" figure as if it were guaranteed.
- If `FOOTBALL_DATA_TOKEN` is missing, tell the user (don't proceed without it) — see the fifa-world-cup skill.
