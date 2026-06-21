#!/usr/bin/env npx tsx
/**
 * validate-job.ts — OpenClaw cron job parameter validator
 *
 * Usage:
 *   npx tsx validate-job.ts <job.json>        # validate a single job file
 *   npx tsx validate-job.ts --jobs-file       # validate ~/.openclaw/cron/jobs.json
 *   npx tsx validate-job.ts --stdin           # read job JSON from stdin
 *   echo '{ ... }' | npx tsx validate-job.ts --stdin
 *
 * Exit codes:
 *   0 = all validations passed
 *   1 = one or more errors found
 *   2 = input/parse error
 *
 * Output: JSON array of diagnostic objects to stdout.
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Schedule {
  kind?: string;
  expr?: string;
  tz?: string;
  at?: string;
  everyMs?: number;
  anchorMs?: number;
}

interface Payload {
  kind?: string;
  message?: string;
  text?: string;
  model?: string;
}

interface Delivery {
  mode?: string;
  channel?: string;
  to?: string;
}

interface Job {
  id?: string;
  name?: string;
  agentId?: string;
  enabled?: boolean;
  schedule?: Schedule;
  sessionTarget?: string;
  payload?: Payload;
  delivery?: Delivery;
  wakeMode?: string;
  deleteAfterRun?: boolean;
  sessionKey?: string;
  [key: string]: unknown;
}

interface Diagnostic {
  jobName: string;
  jobId: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  suggestion?: string;
}

// ─── Channel mapping parser ──────────────────────────────────────────────────

interface ChannelInfo {
  key: string;       // e.g. "telegram", "imessage"
  target: string;    // e.g. "7698193342", "chat_id:3"
  label: string;     // e.g. "Aaron / Telegram DM"
  raw: string;       // full line
}

function parseChannelMapping(content: string): ChannelInfo[] {
  const channels: ChannelInfo[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^-\s+(\S+?):\s*(.+)$/);
    if (!m) continue;
    const rawKey = m[1];
    const rest = m[2].trim();
    const parenIdx = rest.indexOf("(");
    const target = parenIdx >= 0 ? rest.slice(0, parenIdx).trim() : rest.trim();
    const labelMatch = rest.match(/\(([^)]+)\)/);
    const label = labelMatch ? labelMatch[1] : "";

    // Base channel key: "telegram", "imessage" (strip compound suffixes like :chat_id:xxx)
    const baseKey = rawKey.split(":")[0];

    channels.push({ key: baseKey, target: `${rawKey}:${target}`.replace(/:$/, ""), label, raw: line });
  }
  return channels;
}

function loadChannelMapping(): { channels: ChannelInfo[]; baseKeys: Set<string> } {
  const mappingPath = join(homedir(), ".openclaw", "CHANNEL_MAPPING.md");
  try {
    const content = readFileSync(mappingPath, "utf-8");
    const channels = parseChannelMapping(content);
    const baseKeys = new Set(channels.map((c) => c.key));
    return { channels, baseKeys };
  } catch {
    return { channels: [], baseKeys: new Set() };
  }
}

// ─── iMessage chat lookup ────────────────────────────────────────────────────

interface ImsgChat {
  id: number;
  identifier: string;
  name: string;
  service: string;
}

let _imsgChatsCache: ImsgChat[] | null = null;

function loadImsgChats(): ImsgChat[] {
  if (_imsgChatsCache !== null) return _imsgChatsCache;

  try {
    const raw = execSync("imsg chats --limit 50 --json", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    _imsgChatsCache = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ImsgChat);
  } catch {
    _imsgChatsCache = [];
  }
  return _imsgChatsCache;
}

/**
 * Check if a delivery.to value resolves to a known imsg chat.
 * Valid formats: "chat_id:N", "+1XXXXXXXXXX", "email@example.com"
 * Returns { valid, suggestion? }
 */
function validateImsgTo(to: string): { valid: boolean; suggestion?: string } {
  const chats = loadImsgChats();
  if (chats.length === 0) {
    // imsg unavailable — can't validate, don't block
    return { valid: true };
  }

  // chat_id:N format — match against numeric id
  const chatIdMatch = to.match(/^chat_id:(\d+)$/);
  if (chatIdMatch) {
    const numId = parseInt(chatIdMatch[1], 10);
    const found = chats.find((c) => c.id === numId);
    if (found) return { valid: true };

    const available = chats.map((c) => `chat_id:${c.id} (${c.name || c.identifier})`).join(", ");
    return {
      valid: false,
      suggestion: `chat_id:${numId} not found. Known chats: ${available}`,
    };
  }

  // Phone number or email — match against identifier
  const found = chats.find((c) => c.identifier === to);
  if (found) return { valid: true };

  // Not a recognized format or not found
  const available = chats.map((c) => `chat_id:${c.id} (${c.name || c.identifier})`).join(", ");
  return {
    valid: false,
    suggestion: `"${to}" not found in imsg chats. Known chats: ${available}`,
  };
}

// ─── Validators ──────────────────────────────────────────────────────────────

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CRON_FIELD_COUNT = 5;
const VALID_SCHEDULE_KINDS = new Set(["cron", "every", "at"]);
const VALID_PAYLOAD_KINDS = new Set(["agentTurn", "systemEvent"]);
const VALID_SESSION_TARGETS = new Set(["isolated"]);
const VALID_DELIVERY_MODES = new Set(["announce", "none"]);

function promptLooksLikeNeedsUserReply(prompt: string): boolean {
  const s = prompt.toLowerCase();
  const patterns: RegExp[] = [
    /\bask\s+aaron\b/,
    /\bask\s+the\s+user\b/,
    /\bquestion\b/,
    /\bafter\s+(aaron|the\s+user)\s+(repl(?:y|ies)|respond(?:s|ed))\b/,
    /\bwhen\s+(aaron|the\s+user)\s+(repl(?:y|ies)|respond(?:s|ed))\b/,
    /\bafter\s+you\s+ask\b/,
  ];
  return patterns.some((p) => p.test(s));
}

function promptMentionsPendingAgentRequests(prompt: string): boolean {
  const s = prompt.toLowerCase();
  return s.includes("pending_agent_requests.md")
    || s.includes("pending agent requests")
    || s.includes("<pending-agent-requests>");
}

function validateJob(job: Job, channelBaseKeys: Set<string>): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const jobName = job.name ?? "(unnamed)";
  const jobId = job.id ?? "(no-id)";

  function add(severity: Diagnostic["severity"], code: string, message: string, suggestion?: string) {
    diags.push({ jobName, jobId, severity, code, message, suggestion });
  }

  // ── name ───────────────────────────────────────────────────────────────
  if (!job.name) {
    add("error", "NAME_MISSING", "Job has no name.", "Add a lowercase kebab-case name.");
  } else if (!KEBAB_CASE_RE.test(job.name)) {
    add("error", "NAME_NOT_KEBAB", `Job name "${job.name}" is not lowercase kebab-case.`,
      `Rename to "${job.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}".`);
  }

  // ── agentId ────────────────────────────────────────────────────────────
  if (!job.agentId) {
    add("warning", "AGENT_MISSING", "No agentId specified.", "Set agentId to 'main' or another valid agent.");
  }

  // ── schedule ───────────────────────────────────────────────────────────
  if (!job.schedule) {
    add("error", "SCHEDULE_MISSING", "Job has no schedule.");
  } else {
    const s = job.schedule;
    if (!s.kind || !VALID_SCHEDULE_KINDS.has(s.kind)) {
      add("error", "SCHEDULE_KIND_INVALID", `schedule.kind "${s.kind ?? ""}" must be one of: cron, every, at.`);
    }

    if (s.kind === "cron") {
      if (!s.expr) {
        add("error", "CRON_EXPR_MISSING", "schedule.kind is 'cron' but schedule.expr is missing.");
      } else {
        const fields = s.expr.trim().split(/\s+/);
        if (fields.length !== CRON_FIELD_COUNT) {
          add("error", "CRON_EXPR_FIELDS", `Cron expression "${s.expr}" has ${fields.length} fields; expected ${CRON_FIELD_COUNT}.`);
        }
      }
      if (!s.tz) {
        add("warning", "CRON_TZ_MISSING", "No timezone set for cron schedule.", "Add schedule.tz (e.g. 'America/Los_Angeles').");
      }
    }

    if (s.kind === "every") {
      if (!s.everyMs || s.everyMs <= 0) {
        add("error", "EVERY_MS_INVALID", `schedule.everyMs must be a positive number, got ${s.everyMs}.`);
      } else if (s.everyMs >= 86_400_000) {
        const days = Math.round(s.everyMs / 86_400_000);
        add(
          "warning",
          "EVERY_MULTI_DAY",
          `schedule.everyMs is ${days} day(s). The 'every' kind has no time-of-day control — it fires at an arbitrary hour relative to the anchor.`,
          `If a specific run time is required, use schedule.kind 'cron' with expr '0 <HH> */${days} * *' and a timezone instead.`,
        );
      }
    }

    if (s.kind === "at") {
      if (!s.at) {
        add("error", "AT_MISSING", "schedule.kind is 'at' but schedule.at is missing.");
      } else {
        const d = new Date(s.at);
        if (isNaN(d.getTime())) {
          add("error", "AT_INVALID_DATE", `schedule.at "${s.at}" is not a valid ISO-8601 date.`);
        } else if (d.getTime() < Date.now()) {
          add("info", "AT_IN_PAST", `schedule.at "${s.at}" is in the past.`);
        }
      }
    }
  }

  // ── payload ────────────────────────────────────────────────────────────
  if (!job.payload) {
    add("error", "PAYLOAD_MISSING", "Job has no payload.");
  } else {
    const p = job.payload;
    if (!p.kind || !VALID_PAYLOAD_KINDS.has(p.kind)) {
      add("error", "PAYLOAD_KIND_INVALID", `payload.kind "${p.kind ?? ""}" must be one of: agentTurn, systemEvent.`);
    }

    if (p.kind === "systemEvent") {
      add("error", "PAYLOAD_SYSTEM_EVENT", "payload.kind 'systemEvent' does not work reliably.",
        "Migrate to payload.kind 'agentTurn' with sessionTarget 'isolated'.");
    }

    if (p.kind === "agentTurn" && !p.message) {
      add("error", "PAYLOAD_MESSAGE_MISSING", "payload.kind is 'agentTurn' but payload.message is missing.");
    }

    if (p.model) {
      add("warning", "PAYLOAD_HAS_MODEL", "payload.model is set; agents should use their own configured default.",
        "Remove the model field from payload.");
    }

	    // Check if agentTurn message references a prompt file that exists
	    if (p.kind === "agentTurn" && p.message) {
	      const promptMatch = p.message.match(/cron-prompts\/([^\s`"]+)/);
	      if (promptMatch) {
	        const promptPath = join(homedir(), ".openclaw", "cron", "cron-prompts", promptMatch[1]);
	        if (!existsSync(promptPath)) {
	          add("error", "PROMPT_FILE_MISSING", `Cron prompt file not found: ${promptPath}`,
	            "Create the prompt file or update payload.message to point to the correct path.");
	        } else {
	          // Prompt file must be processed via markupdown so ![[imports]] resolve correctly.
	          if (!p.message.includes("markupdown")) {
	            add("warning", "PAYLOAD_NOT_USING_MARKUPDOWN",
	              "payload.message references a cron prompt file but does not use `markupdown` to process it.",
	              `Update payload.message to: "Run \`markupdown ~/.openclaw/cron/cron-prompts/${promptMatch[1]}\` and follow the instructions in the output step by step. Do not rely on prior context; treat that output as the source of truth for this run."`);
	          }

	          // Heuristic: if the prompt asks the user a question / requires a reply,
	          // enforce that it includes a Pending Agent Requests write step so the
	          // follow-up work isn't dropped.
	          try {
	            const promptText = readFileSync(promptPath, "utf-8");
	            if (promptLooksLikeNeedsUserReply(promptText) && !promptMentionsPendingAgentRequests(promptText)) {
	              add(
	                "warning",
	                "PROMPT_MISSING_PENDING_REQUESTS",
	                "Cron prompt appears to require a user reply but does not mention PENDING_AGENT_REQUESTS.md.",
	                "Update the cron prompt to append a pending request entry to PENDING_AGENT_REQUESTS.md (preserve existing contents; remove the entry after completion).",
	              );
	            }
	          } catch {
	            // If prompt can't be read, don't block validation.
	          }
	        }
	      }
	    }

    // Check for delivery target leaking into message text
    if (p.message || p.text) {
      const msg = (p.message ?? p.text ?? "").toLowerCase();
      const leakPatterns = [
        /send\s+(a\s+)?.*\s+to\s+the\s+\S+\s+(imessage|telegram|group|chat)/i,
        /into\s+the\s+\S+\s+(thread|group|chat)/i,
        /to\s+the\s+\S+\s+imessage\s+group/i,
      ];
      for (const pat of leakPatterns) {
        if (pat.test(msg)) {
          add("warning", "PAYLOAD_LEAKS_TARGET",
            "Message text appears to mention a delivery target (group/channel name).",
            "Remove target references from the message. Append: 'Do not mention any group name, channel name, or delivery target in the message text.'");
          break;
        }
      }
    }
  }

  // ── sessionTarget ──────────────────────────────────────────────────────
  if (!job.sessionTarget) {
    add("error", "SESSION_TARGET_MISSING", "No sessionTarget specified.", "Set sessionTarget to 'isolated'.");
  } else if (job.sessionTarget !== "isolated") {
    add("error", "SESSION_TARGET_MUST_BE_ISOLATED",
      `sessionTarget "${job.sessionTarget}" is not allowed. All jobs must use 'isolated'.`,
      "Change sessionTarget to 'isolated'.");
  }

  // ── delivery ───────────────────────────────────────────────────────────
  // delivery.mode "announce" causes dual delivery: the cron system pushes the
  // agent's raw output to a session AND session-agent-turn.sh delivers to the
  // intended target. mode "none" is a no-op and harmless (legacy cruft).
  if (job.delivery && job.delivery.mode === "announce") {
    add("error", "DELIVERY_BLOCK_PRESENT",
      "Job has delivery.mode 'announce'. This causes dual delivery — the cron system will push the agent's raw output to a default session in addition to session-agent-turn.sh delivery.",
      "Remove the delivery block or set mode to 'none'. Delivery is handled by session-agent-turn.sh in the cron prompt.");
  }

  // ── enabled / state hints ──────────────────────────────────────────────
  if (job.enabled === false) {
    add("info", "JOB_DISABLED", "Job is disabled.");
  }

  // Check for consecutive errors
  const state = (job as any).state;
  if (state?.consecutiveErrors > 0) {
    add("warning", "HAS_ERRORS", `Job has ${state.consecutiveErrors} consecutive error(s). Last: ${state.lastError ?? "unknown"}.`);
  }

  return diags;
}

// ─── Input handling ──────────────────────────────────────────────────────────

function loadJobs(): Job[] {
  const args = process.argv.slice(2);

  if (args.includes("--stdin")) {
    const input = readFileSync(0, "utf-8");
    const parsed = JSON.parse(input);
    // Accept either a single job object or { jobs: [...] } or an array
    if (Array.isArray(parsed)) return parsed;
    if (parsed.jobs && Array.isArray(parsed.jobs)) return parsed.jobs;
    return [parsed];
  }

  if (args.includes("--jobs-file")) {
    const jobsPath = join(homedir(), ".openclaw", "cron", "jobs.json");
    const content = readFileSync(jobsPath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed.jobs ?? [];
  }

  // Positional arg: path to a job JSON file
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: validate-job.ts <job.json> | --jobs-file | --stdin");
    process.exit(2);
  }
  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed;
  if (parsed.jobs && Array.isArray(parsed.jobs)) return parsed.jobs;
  return [parsed];
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  let jobs: Job[];
  try {
    jobs = loadJobs();
  } catch (err: any) {
    console.error(`Failed to load job(s): ${err.message}`);
    process.exit(2);
  }

  const { baseKeys } = loadChannelMapping();
  const allDiags: Diagnostic[] = [];

  for (const job of jobs) {
    allDiags.push(...validateJob(job, baseKeys));
  }

  // Output
  console.log(JSON.stringify(allDiags, null, 2));

  // Summary to stderr
  const errors = allDiags.filter((d) => d.severity === "error").length;
  const warnings = allDiags.filter((d) => d.severity === "warning").length;
  const infos = allDiags.filter((d) => d.severity === "info").length;
  console.error(`\nValidated ${jobs.length} job(s): ${errors} error(s), ${warnings} warning(s), ${infos} info(s)`);

  process.exit(errors > 0 ? 1 : 0);
}

main();
