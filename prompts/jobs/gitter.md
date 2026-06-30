## Task

You are running in the `flue-conspiracy` repository. Check if there are uncommitted changes, and if so, stage, commit, and push them.

## Steps

1. Run `git status --short` to see what's changed.
2. If there are no changes (clean working tree), output `NO_REPLY` and stop.
3. If there are changes, review each file carefully:
   - **Skip any file** that contains credentials, secrets, API keys, tokens, passwords, or private keys. Never stage those. If you find any, report them in your output instead.
   - Skip `.env` files, `*.pem`, `*.key`, `*.p12`, `*.pfx`, and any file whose name or path suggests secret material.
4. Run `git diff --stat HEAD` and `git diff HEAD -- <safe files>` to understand what changed.
5. Stage only the safe files: `git add <file1> <file2> ...` (do not use `git add -A` blindly).
6. Write a commit message following **Conventional Commits** style:
   - Format: `<type>(<optional scope>): <short description>`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`
   - Keep the subject line under 72 characters
   - If there are multiple logical groups of changes, use a multi-line body
   - Example: `chore: update job prompts and cron schedule`
7. Commit: `git commit -m "<message>"`
8. Push: `git push`
9. Report what you committed and pushed in a short summary (2-4 bullet points).

## Rules

- Never commit files containing credentials, secrets, API keys, or tokens.
- Never use `--no-verify` or bypass hooks.
- Always use conventional commits format.
- If you are uncertain whether a file is safe to commit, **ask** rather than guess — include the question in your output and it will be routed to Aaron.
- If you encounter an error (merge conflict, push rejection, auth failure), report it clearly rather than force-pushing or taking destructive actions.
