---
name: obsidian
description: Read, write, and organize notes in an Obsidian vault. Use when the user asks you to add a note, file a document, find something in their vault, update their knowledge base, or reorganize notes. Works with any vault — discovers structure from the vault's own docs.
---

# Obsidian Vault Skill

This skill governs how to use an Obsidian vault as a long-term, queryable knowledge graph. Use it whenever you "vault" something, create a new note, or refactor existing notes.

> **Important:** This skill is **vault-agnostic**. It never hard-codes a specific vault name or path. Always discover the active vault and its conventions from the current environment (workspace config, memory files, or explicit user instructions).

## Step 1: Find the Vault

Before reading or writing notes, determine which vault and path to use:

1. **Check workspace config / memory** — look for a note or file that declares the vault path (e.g. `TOOLS.md`, `VAULT.md`, or the agent's `USER.md`).
2. **Accept explicit user overrides** — if the user specifies a path or vault name, use that.
3. **If still unknown, ask** — never guess a vault path.

Once the vault root is known, treat all note operations as reads/writes relative to that path.

## Step 2: Orient Yourself in the Vault

Every vault has its own structure. Read its documentation before touching anything:

1. **`CLAUDE.md`** — highest-level summary of vault purpose and structure
2. **`STRUCTURE.md`** — folder layout and filing rules
3. **`Obsidian/CONVENTIONS*.md`** — note templates and linking rules per folder
4. **Top-level folder names** — infer the scheme from what already exists

If none of these files exist, run `qmd ls` to browse the vault and infer structure from folder names.

## Step 3: Decide Where a New Note Goes

Use the vault's `STRUCTURE.md` first. If it doesn't answer the question, use this decision tree:

| The note is... | Put it in... |
|---|---|
| Something being actively built or completed | `10 - Projects/` (or equivalent) |
| An ongoing responsibility with no end date | `20 - Areas/` → right subfolder (work, family, personal, finance) |
| Evergreen reference you'll look up but not work on | `30 - Resources/` → right subfolder (tech, AI, tools, prompts…) |
| Completed, inactive, or historical | `40 - Archive/` (or equivalent) |
| Not sure yet | `00 - Inbox/` — process later |

**When in doubt, use the Inbox.** Tell the user where you put it and why you weren't sure.

## Step 4: Name the File

Follow the vault's existing naming convention. Common patterns:
- **Title Case** for concept/reference notes: `My New Note.md`
- **Date-stamped** for session/log notes: `YYYY-MM-DD-short-label.md`
- **MOC hub notes**: `Topic MOC.md`

Never use underscores if the vault uses spaces or hyphens.

---

## Searching the Vault with `qmd`

**Always use `qmd` for vault search.** Do not use file-based search (grep, glob, find, or directory listing) to locate or discover notes. `qmd` provides hybrid semantic + keyword search with reranking and is the authoritative way to query the vault.

### Before any search

Always run this first to ensure the index is current:

```bash
qmd update && qmd embed
```

This re-indexes any new or changed notes and refreshes vector embeddings. Skip only if the user has explicitly confirmed the index is already up to date in the current session.

### Key commands

| Goal | Command |
|------|---------|
| Find notes by concept or question | `qmd query "<query>"` (recommended — hybrid + rerank) |
| Find notes by exact keywords | `qmd search "<keywords>"` |
| Find notes by semantic similarity | `qmd vsearch "<query>"` |
| Read a specific note | `qmd get <file>` or `qmd get <file>:<line> -l <N>` |
| Read multiple notes at once | `qmd multi-get "<glob>"` |
| List all indexed files | `qmd ls` or `qmd ls <collection>` |
| Check what collections are indexed | `qmd collection list` |

### When to use each

- **`qmd query`** — default for any "find notes about X" task. Uses LLM query expansion and reranking for best results.
- **`qmd search`** — when you need exact keyword or phrase matches (BM25, no LLM).
- **`qmd vsearch`** — when you want pure semantic/vector similarity.
- **`qmd get`** — once you know the file path, use this to read it instead of shell `cat`.
- **`qmd ls`** — to browse what's indexed; use instead of `ls` on the vault folder.

### Query syntax tips

```bash
# Simple expand query (recommended starting point)
qmd query "personal automation systems"

# Phrase + negation in keyword search
qmd query $'lex: "exact phrase" -excluded-term'

# Mixed lex + vec in one query document
qmd query $'lex: CAP theorem\nvec: distributed consistency tradeoffs'

# HyDE: provide a hypothetical answer as the query
qmd query $'hyde: A note explaining how I structure my daily review process'

# Limit results
qmd query "auth middleware" -n 10

# Filter to a specific collection
qmd query "meal planning" -c personal
```

### Output formats

Add `--json`, `--md`, `--csv`, or `--xml` to any search command for structured output. Use `--full` to get the complete document instead of a snippet. Use `--files` to get just file paths.

---

## Step 5: Write the Note

Use the template from `Obsidian/CONVENTIONS*.md` if one exists for the target folder. Otherwise use this minimal structure:

```markdown
# Note Title

## Summary
- What this is and why it exists.

## Details
- Main content.

## Links
- [[Related Note]] – reason for the link
- [[Area or Project MOC]] – parent hub this note belongs to
```

Every note needs at least **2 outbound `[[WikiLinks]]`**. Always annotate links with a reason after a dash.

## Step 6: Update the MOC

MOC notes (`* MOC.md`) are hub nodes that index all notes in an area. After adding a note, find the relevant MOC and add a line:

```markdown
- [[Your New Note]] – one-line description
```

If no MOC exists for the area, you can create one or skip and tell the user.

## Step 7: Check for Broken Links After Moves

If you moved or renamed files, check for stale path-based WikiLinks:

```bash
grep -r "\[\[[^]]*\/[^]]*\]\]" /path/to/vault --include="*.md" \
  --exclude-dir=".obsidian" --exclude-dir="Readwise" -l
```

Fix broken links by replacing old path prefixes with just the note name — Obsidian resolves `[[Note Name]]` by unique title across the vault, so the path is usually unnecessary.

---

## Core Principles

1. **Graph-first, not folder-first**
   - Folders are coarse grouping; links and tags define the real graph.
   - Prefer linking over duplicating content.
   - Any concept that might be reused should become its own note and be linked.

2. **One main idea per note**
   - Each note should answer: "What is the main concept here?" and be named accordingly.
   - If a note drifts into multiple main ideas, split it and link between the parts.

3. **Stable, human-readable titles**
   - For concept notes, use human-readable titles like `Personal Automation OS`, `Relentless ASAP Override`.
   - For dated logs or journal-style notes, use patterns like `YYYY-MM-DD-description`, e.g. `2026-03-03-local-llm-latency-session`.

4. **Backlinks for context**
   - When a concept is used in another note, link to it; if the concept note doesn’t exist yet, create a stub and link to it.
   - Favor bidirectional structure via links rather than deeply nested bullet lists.

5. **Low-friction capture, later refinement**
   - For quick capture: create a rough note with minimal structure.
   - Later passes: add links, tags, and headers to fit the patterns below.

> These are recommended defaults; if a particular vault defines its own conventions, follow those instead.

---

## File & Folder Conventions

Because different vaults use different top-level folders, treat existing structure as the source of truth:

- Use `qmd ls` to see current indexed files and infer the top-level folder structure; do not `ls` the vault directory directly.
- Prefer adding new notes into an existing, closest-fit folder (e.g., `Projects/`, `Tech/`, `Personal/`) instead of inventing new ones.
- Only create a new folder when **all** are true:
  - The topic will accumulate multiple notes over time.
  - It doesn’t cleanly fit an existing folder.
  - You can name it in a way future-you will understand in <2 seconds.

If the vault owner has documented their own folder taxonomy, follow that over any generic suggestions here.

---

## Note Structure Pattern

Use this as the default note template (adapt as needed or as overridden by vault-specific templates):

```markdown
# Title of Note

## Summary
- 2–5 bullet summary of what this note captures and why it exists.

## Context
- Where this fits (project, life domain, system).

## Details
- Core content.

## Links
- [[Related Concept 1]] – short reason why linked
- [[Related Concept 2]] – short reason why linked

## TODO
- [ ] Next small action (if any)
```

For very small, atomic concept notes, `# Title` + 2–3 bullets + links is enough.

---

## Links, Aliases, Embeds, and Tags (for Graph Power)

### Wiki Links (Core Graph Edges)

```markdown
[[Note Title]]                 # Link to a note whose title matches "Note Title"
[[Folder/Note Title]]          # Link using a relative path inside the vault
[[Note Title|Display Text]]    # Show custom text but link to "Note Title"
```

Key behaviors:
- Obsidian resolves links by **note title first**, then by path; it is generally case-insensitive and space-tolerant.
- An **unresolved link** (red in the app) still acts as a graph hint; creating a note with that title later will automatically connect it.
- Prefer `[[Note Title]]` without paths when possible so refactors are easier; use folder-qualified links only when there are name collisions.

Recommended practice:
- When you introduce a concept you may reuse, create a link immediately: `[[Concept Name]]`. If the note doesn’t exist yet, let it be unresolved and create it later.
- Use `[[Note Title|Display Text]]` when the sentence reads better with different wording but you still want a clean graph edge.

### Headings and Block Links

```markdown
[[Note Title#Section]]         # Link to a specific heading in a note
[[Note Title#^block-id]]       # Link to a specific block with an explicit ID
```

Use cases:
- Link to **stable sections** (e.g., project statuses, canonical definitions) rather than whole notes when granularity matters.
- For fine-grained references that should remain stable even if headings move, give important blocks explicit IDs (`^id`) and link to them.

### Aliases (Multiple Names, One Node)

Obsidian lets a note have multiple names via frontmatter. Example:

```markdown
---
aliases: [QDAR, QuickDraw AR, QuickDraw AR Tracing]
---
# QuickDraw AR Tracing
```

Effects:
- Any link to `[[QDAR]]`, `[[QuickDraw AR]]`, or `[[QuickDraw AR Tracing]]` points to the **same note**.
- Search and graph treat all aliases as the same underlying node.

Recommended practice:
- Give notes aliases for:
  - Common abbreviations (`QBO` for QuickBooks Online).
  - Alternate phrasings or spellings (`Email rewrite`, `Email re-write`).
  - People’s full names vs. short names.
- When adding a link, prefer the **most canonical name**; rely on aliases so you can still find it via other terms.

### Embeds (Inline Reuse of Content)

```markdown
![[Note Title]]               # Embed full note
![[Note Title#Section]]       # Embed a specific section
![[image.png]]                # Embed an image or other media
```

Why embeds matter for graph/search:
- Embeds create additional backlinks and surface important content in context without duplication.
- They keep a **single source of truth** (the original note) while reusing it in dashboards, project hubs, or summary notes.

Recommended use:
- Create **hub/overview notes** that embed:
  - Core definitions or specs.
  - Status sections from project notes.
  - Reference diagrams or images.
- Prefer embedding sections (`![[Note#Section]]`) rather than entire long notes to keep hubs readable.

### Tags

Use tags sparingly; a few high-signal tags are better than many low-signal ones.

```markdown
# Personal Automation OS

Tags: #system #ai #automation
```

Conventions (suggested, unless the vault defines its own):
- Domain tags: `#work`, `#personal`, `#family`, `#kids`, `#llm`, `#infra`, `#product`.
- Status tags: `#idea`, `#draft`, `#active`, `#archive`.

Guideline:
- Use **links** for concrete relationships between specific notes.
- Use **tags** for broad facets or filters across many unrelated notes.
- If you find yourself adding many similar tags, consider whether those should instead be separate concept notes you link to.

---

## Keeping the Knowledge Graph Connected

When adding or editing notes, follow this checklist:

1. **Identify the main concept**
   - Ask: "If this note shows up in search alone, will the title and summary make sense?"
   - If not, rename or tweak the summary.

2. **Create outbound links**
   - For each significant concept mentioned, do one of:
     - Link to an existing note: `[[Existing Concept]]`.
     - Or create a stub: `[[New Concept]]` with a 1–2 line note.

3. **Ensure inbound discoverability**
   - From parent/system notes, add links down to this note.

4. **Connect to at least one system or project**
   - Every note should connect to **at least one** of:
     - A system (e.g. a core concept or framework note).
     - A project (e.g. a concrete initiative or outcome).

5. **Avoid isolated notes**
   - If a note has zero links in or out, fix that before moving on.

---

## Patterns for Common Note Types

### Concept Notes

```markdown
# Concept Name

## Summary
- One or two bullets capturing the core idea.

## Definition
- Core definition in 2–4 sentences.

## Principles
- Bullet list of rules.

## Related Systems
- [[Related Concept 1]]
- [[Related Concept 2]]

## Implementations
- [[Implementation 1]] – short description
- [[Implementation 2]] – short description
```

### Project Notes

```markdown
# Project Name

## Summary
- What this project is and why it exists.

## Goals
- Bullet list of measurable goals.

## Context
- Where this fits (team, area of life, system).

## Plan
- High-level phases or steps.

## Links
- [[Related system or concept]]
- [[Supporting note]]
```

### Log / Session Notes

```markdown
# YYYY-MM-DD-topic-session

## Summary
- What you tried, what you learned, and current state.

## Context
- Environment, tools, or people involved.

## Steps
- Bullet list of experiments or actions.

## Findings
- Key takeaways.

## Next
- [ ] Next action.
```

---

## Obsidian CLI & URI Usage (High-Level)

When interacting with the Obsidian desktop app from the command line or other tools, **always consult the official docs** for the current CLI and URI options:
- Official help: https://help.obsidian.md/cli (or the latest equivalent)

Guidelines for this skill:

- Do **not** invent CLI flags or arguments. If you need exact syntax, either:
  - Ask the user to run `obsidian --help` or equivalent and paste the output, or
  - Ask the user to confirm CLI usage they are comfortable with.
- Prefer file and folder **reads/writes on the vault directly** over trying to drive the GUI via CLI when not necessary.
- Use URI schemes like `obsidian://` only when the user explicitly wants deep-links to open specific notes or vaults in the app, and rely on the official docs for exact parameter formats.

In other words: the skill focuses on structuring and managing the markdown knowledge graph; when CLI integration is needed, keep it conservative and grounded in up-to-date documentation or user-provided commands.

---

## When This Skill Should Be Used

Use this skill (and these conventions) when:
- The user says "vault this", "keep this", or asks to store/organize information long term.
- Creating, splitting, or renaming notes in an Obsidian vault.
- Turning ad-hoc ideas or chats into durable, linkable notes.
- Refactoring messy notes into concept / project / log patterns.

Default behavior when asked to "vault" something:
1. Determine the active vault path from config/memory or explicit user instruction.
2. Read `CLAUDE.md`, `STRUCTURE.md`, and relevant `Obsidian/CONVENTIONS*.md`.
3. Run `qmd query "<topic>"` to check for existing notes before creating a duplicate.
4. Choose the right folder using `STRUCTURE.md` or the decision tree above.
5. Create a new markdown file with a clear title and the appropriate template.
6. Add at least 2–3 outbound links — use `qmd query` to find related notes to link to.
7. Update the area's MOC note with a link to the new note.
8. Tell the user what was created, where it lives, and what it links to.

## What NOT to Do

- Don't create new top-level folders without reading `STRUCTURE.md` first
- Don't rename files that are referenced by WikiLinks without fixing the links afterward
- Don't touch `Readwise/` — it's plugin-managed
- Don't create deeply nested folder hierarchies — the graph makes depth unnecessary
- Don't leave notes with zero outbound links
- Don't hardcode vault paths in responses — always derive them from config or user input
