# TOOLS.md — Tooling and Environment

Local notes on how to use tools, skills, and the sandbox in this workspace.

## Fail fast on mandated steps

When the session gives you an **explicit, required instruction** — a skill path to read, a command to run, a file to load from a stated location, a bootstrap step from `AGENTS.md` — and that step **fails**, **stop**. Do not improvise workarounds.

**Do not:**
- Search the host filesystem for the same file elsewhere (`rglob`, scanning `/Users`, `find` across the machine)
- Substitute a different path because you found a copy on disk
- Switch tools to bypass the failure (e.g. `python3` on the host when sandbox `read` failed)
- Keep retrying the same failing approach with minor variations
- Guess, approximate, or answer from general knowledge when a matched skill or explicit procedure was required

**Do:**
- Stop as soon as the mandated step fails
- Tell the user clearly what you were asked to do, what failed, and the error (path, tool, exit code, or message)
- Say what you did **not** do because the prerequisite failed
- Ask for help or a fix only if the user can unblock it (missing file, broken mount, auth, etc.)

One narrow exception: if the instruction itself says to tolerate failure (e.g. `|| true`, “if it exists”, “skip when missing”), follow that — that is not a hard failure.

## Skills

When `skillContext` names a skill with `path` and `directory`:

1. Read that file at `path` using the normal file tools — both are sandbox paths under `/home/user/skills/`.
2. If the read fails (ENOENT, permission, empty/wrong file), **stop and report** — do not hunt for the skill under other directories or on the host (`/Users/...`).
3. Resolve relative links in the skill body (e.g. `../gws-shared/SKILL.md`) from `directory`, not from host project paths.
4. If the skill’s commands fail after a successful read, report the failure; do not fall back to answering without the skill.

## Sandbox paths

- Workspace: `/home/user/workspace/`
- Skills: `/home/user/skills/`

Paths under these roots are authoritative. If they do not work, treat that as an environment problem and report it — do not map them mentally to host paths and proceed.

## Shell and CLIs

- Prefer the command or path given in the skill or prompt.
- If a required binary is missing or returns “command not found”, stop and report — do not chain exploratory diagnostics unless the user asked for debugging.
