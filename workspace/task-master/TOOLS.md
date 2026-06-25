# TOOLS.md — Task Master Tooling

## Task storage

Tasks live in `{workspacePath}/tasks.json` — a JSON file in the workspace directory passed to the agent.

Pass `workspacePath` from your input to every `tasks_*` tool call.

### File format

```json
{
  "version": 1,
  "lists": [{ "id": "default", "title": "Tasks" }],
  "tasks": [
    {
      "id": "...",
      "listId": "default",
      "title": "...",
      "status": "open",
      "due": "2026-06-25",
      "position": 0,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

The file is created automatically on first write if missing.

### Due dates

Use `YYYY-MM-DD`. Compare against America/Los_Angeles unless the user specifies otherwise.
