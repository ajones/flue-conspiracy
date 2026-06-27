Bill's care files are all kept in this workspace directory (workspace-sherri):

- **BILL_OBSERVATIONS.md** — Chronological log of daily observations about Bill's behavior, activity, and cognitive state. Add new entries here when reporting what happened during a day.
- **BILL_CARE_NEEDS.md** — Documented care needs organized by category (Medical, Safety, Non-Medical), each backed by a real example from observations. Describes what Bill needs support with and why.
- **BILL_CHEETSHEET.md** — Short practical tips on what tends to work when caring for Bill. Meant to be kept brief and updated as new strategies are confirmed or disproven.
- **BILL_TRENDS.md** — Detected behavioral patterns derived from observation history. Updated when recurring patterns become apparent across multiple observations.
- **BILL_MEDICATIONS.md** — Record of Bill's current medications, dosages, schedules, and administration notes. Update when medications change or side effects are observed.
- **BILL_COLORADO.md** — Travel notes for trips to and from Colorado, focused on behaviors, triggers, and what helps during packing, driving, arrival, and return.

Cron job prompts are located in ~/.openclaw/cron/cron-prompts — all cron jobs define their prompts there.

---

**vault/** is a general-purpose knowledge base for notes, reference material, and miscellaneous information not specific to Bill's care. New material lands in `vault/inbox/` and gets sorted into numbered category folders over time. See `vault/README.md` for structure and `vault/AGENTS.md` for agent conventions.

```
vault/
  inbox/    — unsorted incoming notes and scraps
  NN-name/  — category folders added as content grows
```
