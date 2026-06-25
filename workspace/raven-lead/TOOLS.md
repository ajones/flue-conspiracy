# TOOLS.md — Tooling and Environment

Local notes on how to use tools, skills, and the host shell in this workspace.

## Fail fast on mandated steps

When the session gives you an **explicit, required instruction** — a skill path to read, a command to run, a file to load from a stated location, a bootstrap step from `AGENTS.md` — and that step **fails**, **stop**. Do not improvise workarounds.

**Do not:**
- Search elsewhere on disk for the same file when a specific path was given (`rglob`, scanning unrelated directories)
- Substitute a different path because you found a copy somewhere else
- Keep retrying the same failing approach with minor variations
- Guess, approximate, or answer from general knowledge when a matched skill or explicit procedure was required

**Do:**
- Stop as soon as the mandated step fails
- Tell the user clearly what you were asked to do, what failed, and the error (path, tool, exit code, or message)
- Say what you did **not** do because the prerequisite failed
- Ask for help or a fix only if the user can unblock it (missing file, auth, etc.)

One narrow exception: if the instruction itself says to tolerate failure (e.g. `|| true`, “if it exists”, “skip when missing”), follow that — that is not a hard failure.

## Skills

When `skillContext` names a skill with `path` and `directory`:

1. Read that file at `path` using the normal file tools — both are host filesystem paths.
2. If the read fails (ENOENT, permission, empty/wrong file), **stop and report** — do not hunt for the skill under other directories.
3. Resolve relative links in the skill body (e.g. `../gws-shared/SKILL.md`) from `directory`.
4. If the skill's commands fail after a successful read, report the failure; do not fall back to answering without the skill.

## Host shell

You run with direct host filesystem and shell access. Commands use the host `PATH` and run in the agent workspace directory unless a skill specifies otherwise.

- If a required binary is missing or returns “command not found”, stop and report — do not chain exploratory diagnostics unless the user asked for debugging.

## Home Assistant

**Mandatory:** delegate every Home Assistant interaction to the `home-assistant` subagent.

- Reads, writes, snapshots, templates, audits — all via subagent `ha_*` tools
- Never shell `curl` / Python against HA; never use `$HOMEASSISTANT_URL` or `$HOMEASSISTANT_TOKEN`
- The `homeassistant` skill is disabled — do not load or execute it
- You do not have `ha_*` tools yourself
