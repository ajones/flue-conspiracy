import { getGatewayUrl } from '../config.ts';
import { computeNextRun } from '../scheduler/cron.ts';
import type { JobRow } from '../scheduler/types.ts';

const TZ = 'America/Los_Angeles';
const SLOTS = 96; // 24h * 4 quarters
const RED_SLOT_7AM = 7 * 4;   // 28
const RED_SLOT_9PM = 21 * 4;  // 84

// ANSI
const R = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const REV = '\x1b[7m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BG_RED = '\x1b[41m';
const BG_YELLOW = '\x1b[43m';
const BG_DARK = '\x1b[48;5;235m';
const BLACK = '\x1b[30m';
const WHITE = '\x1b[97m';
const CLR = '\x1b[K';

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSchedule(job: any): string {
  const s = job.scheduleData;
  switch (s.kind) {
    case 'cron': return `cron: ${s.expr}`;
    case 'every': {
      const mins = s.everyMs / 60_000;
      if (mins < 60) return `every ${mins}m`;
      const hrs = mins / 60;
      if (hrs < 24) return `every ${hrs}h`;
      return `every ${hrs / 24}d`;
    }
    case 'at': return `at: ${formatDate(new Date(s.at).getTime())}`;
    case 'weekday': {
      if (s.days) return `weekday: ${s.days.join(',')} @ ${s.timeOfDay}`;
      return `every ${s.everyNDays ?? 1} biz day(s) @ ${s.timeOfDay}`;
    }
    default: return s.kind;
  }
}

function getSecondOfDayLA(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return get('hour') * 3600 + get('minute') * 60 + get('second');
}

function getStartOfDayLA(date: Date = new Date()): Date {
  const sec = getSecondOfDayLA(date);
  return new Date(date.getTime() - sec * 1000 - date.getMilliseconds());
}

function getFireDataForDay(job: JobRow, startOfDay: Date): { slots: Set<number>; fireCount: number } {
  const schedule = job.scheduleData;
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const slots = new Set<number>();
  let fireCount = 0;

  let cursor = new Date(startOfDay.getTime() - 1);

  for (let i = 0; i < 10000; i++) {
    const next = computeNextRun(schedule, cursor);
    if (next === null || next >= endOfDay.getTime()) break;
    if (next >= startOfDay.getTime()) {
      fireCount++;
      const secondsIntoDay = (next - startOfDay.getTime()) / 1000;
      const slot = Math.floor(secondsIntoDay / 900); // 900s = 15 min
      slots.add(Math.min(slot, SLOTS - 1));
    }
    cursor = new Date(next + 1);
  }

  return { slots, fireCount };
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface JobEntry {
  job: JobRow;
  slots: Set<number>;
  fireCount: number;
  firstSlot: number; // Infinity if no fires today
}

class ScheduleTui {
  private jobs: JobEntry[] = [];
  private selected = 0;
  private scrollOffset = 0;
  private infoMode = false;
  private statusMsg: { text: string; error: boolean } | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private nameScroll = 0;
  private nameScrollTimer: ReturnType<typeof setInterval> | null = null;
  private renderQueued = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private startOfDay: Date = getStartOfDayLA();

  private get rows() { return process.stdout.rows || 24; }
  private get cols() { return process.stdout.columns || 120; }

  async load() {
    const base = getGatewayUrl();
    let rawJobs: JobRow[];
    try {
      const res = await fetch(`${base}/api/jobs`);
      rawJobs = await res.json();
    } catch {
      console.error('Gateway is not running. Start it with: raven start');
      process.exit(1);
    }

    this.startOfDay = getStartOfDayLA();

    this.jobs = rawJobs
      .map(job => {
        const { slots, fireCount } = getFireDataForDay(job, this.startOfDay);
        const firstSlot = slots.size > 0 ? Math.min(...slots) : Infinity;
        return { job, slots, fireCount, firstSlot };
      })
      .sort((a, b) => a.firstSlot - b.firstSlot);
  }

  start() {
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[?25l'); // alt screen, clear, hide cursor
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', d => this.onKey(d));
    process.stdout.on('resize', () => this.queueRender());

    // Refresh once per minute to update current-time marker
    this.refreshTimer = setInterval(() => this.queueRender(), 15_000);

    this.updateNameScroll();
    this.render();
  }

  private exit(selectedJob?: JobEntry) {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.nameScrollTimer) clearInterval(this.nameScrollTimer);
    if (this.statusTimer) clearTimeout(this.statusTimer);
    process.stdout.write('\x1b[?25h\x1b[?1049l'); // show cursor, exit alt screen
    process.stdin.setRawMode(false);
    if (selectedJob) {
      console.log(selectedJob.job.name);
    }
    process.exit(0);
  }

  private updateNameScroll() {
    const nameW = this.nameColumnWidth();
    const name = this.jobs[this.selected]?.job.name ?? '';
    if (this.nameScrollTimer) { clearInterval(this.nameScrollTimer); this.nameScrollTimer = null; }
    this.nameScroll = 0;
    if (name.length > nameW) {
      this.nameScrollTimer = setInterval(() => {
        const maxScroll = name.length - nameW;
        this.nameScroll = (this.nameScroll + 1) % (maxScroll + 16); // +16 ≈ 3s pause at end before reset
        this.queueRender();
      }, 180);
    }
  }

  private nameColumnWidth(): number {
    const maxNameLen = this.jobs.length > 0 ? Math.max(...this.jobs.map(e => e.job.name.length)) : 12;
    return Math.min(24, Math.max(12, maxNameLen));
  }

  private setStatus(text: string, error = false) {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusMsg = { text, error };
    this.statusTimer = setTimeout(() => {
      this.statusMsg = null;
      this.statusTimer = null;
      this.queueRender();
    }, 3000);
    this.queueRender();
  }

  private async triggerJob(entry: JobEntry) {
    const base = getGatewayUrl();
    try {
      const res = await fetch(`${base}/api/jobs/${entry.job.name}/trigger`, { method: 'POST' });
      if (res.ok) {
        this.setStatus(`triggered ${entry.job.name}`);
      } else {
        const body = await res.json() as any;
        this.setStatus(body.error ?? `error ${res.status}`, true);
      }
    } catch {
      this.setStatus('gateway not reachable', true);
    }
  }

  private queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setTimeout(() => { this.renderQueued = false; this.render(); }, 16);
  }

  private onKey(data: Buffer) {
    const s = data.toString();

    if (this.infoMode) {
      if (s === 'q' || s === '\x1b' || s === '\x03' || s === 'i') {
        this.infoMode = false;
        this.queueRender();
      } else if (s === 't') {
        const entry = this.jobs[this.selected];
        if (entry) { this.infoMode = false; this.triggerJob(entry); }
      }
      return;
    }

    if (s === 'q' || s === '\x1b' || s === '\x03') {
      this.exit();
    }

    if (s === '\x1b[A' || s === 'k') { // up
      if (this.selected > 0) { this.selected--; this.updateNameScroll(); }
      this.clampScroll();
      this.queueRender();
    }

    if (s === '\x1b[B' || s === 'j') { // down
      if (this.selected < this.jobs.length - 1) { this.selected++; this.updateNameScroll(); }
      this.clampScroll();
      this.queueRender();
    }

    if (s === 'i') {
      if (this.jobs[this.selected]) {
        this.infoMode = true;
        this.queueRender();
      }
    }

    if (s === 't') {
      const entry = this.jobs[this.selected];
      if (entry) this.triggerJob(entry);
    }

    if (s === '\r' || s === '\n') { // enter
      const entry = this.jobs[this.selected];
      if (!entry) return;
      if (entry.fireCount > 1) {
        this.queueRender();
        return;
      }
      this.exit(entry);
    }
  }

  private clampScroll() {
    const visibleRows = this.rows - 4; // header + footer
    if (this.selected < this.scrollOffset) this.scrollOffset = this.selected;
    if (this.selected >= this.scrollOffset + visibleRows) {
      this.scrollOffset = this.selected - visibleRows + 1;
    }
  }

  private renderInfo() {
    const { rows, cols } = this;
    const entry = this.jobs[this.selected];
    if (!entry) return;
    const { job } = entry;

    const boxW = Math.min(72, cols - 4);
    const padX = Math.floor((cols - boxW) / 2);
    const pad = ' '.repeat(padX);

    const lines: string[] = [];
    const add = (label: string, value: string) =>
      lines.push(`  ${DIM}${label.padEnd(16)}${R}${value}`);

    add('agent', job.agent);
    add('target', job.target);
    add('enabled', job.enabled ? `${GREEN}yes${R}` : `${RED}no${R}`);
    add('schedule', formatSchedule(job));
    add('next run', formatDate(job.nextRunAt));
    add('last run', formatDate(job.lastRunAt));
    add('last status', job.lastStatus ?? '—');
    add('errors', String(job.consecutiveErrors));
    if (job.description) add('description', job.description);
    if (job.tags?.length) add('tags', job.tags.join(', '));
    if (job.promptFile) add('prompt file', job.promptFile);
    lines.push('');
    const promptLines = job.prompt.split('\n').slice(0, 6);
    lines.push(`  ${DIM}prompt${R}`);
    for (const l of promptLines) lines.push(`    ${DIM}${l}${R}`);
    if (job.prompt.split('\n').length > 6) lines.push(`    ${DIM}…${R}`);

    const boxH = Math.min(lines.length + 4, rows - 4);
    const startRow = Math.floor((rows - boxH) / 2);

    let out = '';
    const border = `${DIM}${'─'.repeat(boxW - 2)}${R}`;
    const title = ` ${BOLD}${job.name}${R} `;
    const topBar = `${DIM}┌${R}${title}${DIM}${'─'.repeat(boxW - 2 - title.replace(/\x1b\[[^m]*m/g, '').length)}┐${R}`;

    out += `\x1b[${startRow};${padX + 1}H${BG_DARK}${topBar}`;
    for (let i = 0; i < boxH - 2; i++) {
      const content = lines[i] ?? '';
      const visible = content.replace(/\x1b\[[^m]*m/g, '');
      const fill = ' '.repeat(Math.max(0, boxW - 2 - visible.length));
      out += `\x1b[${startRow + 1 + i};${padX + 1}H${BG_DARK}${DIM}│${R}${BG_DARK}${content}${fill}${DIM}│${R}`;
    }
    out += `\x1b[${startRow + boxH - 1};${padX + 1}H${BG_DARK}${DIM}└${border}┘${R}`;
    out += `\x1b[${startRow + boxH};${padX + 1}H${DIM}  i/esc=close  t=trigger${R}\x1b[K`;

    process.stdout.write(out);
  }

  private render() {
    const { rows, cols } = this;
    const now = new Date();
    const currentSlot = Math.floor(getSecondOfDayLA(now) / 900);

    const nameW = this.nameColumnWidth();

    // How many slots fit given terminal width
    const availableSlotCols = cols - nameW - 2;
    // We always show all 96 slots; if terminal is narrow, they'll wrap (acceptable)
    const slotsToShow = Math.min(SLOTS, Math.max(20, availableSlotCols));

    const selectedEntry = this.jobs[this.selected];
    const selectedMultiFire = selectedEntry && selectedEntry.fireCount > 1;

    let out = '\x1b[H'; // move to home

    // ── Title bar ──
    const title = `${BOLD}raven jobs schedule${R}  ${DIM}${getTodayLabel()}${R}`;
    const hint = `${DIM}↑↓ navigate  i=info  t=trigger  enter=edit  q=quit${R}`;
    const titleLine = `  ${title}   ${hint}`;
    out += titleLine + CLR + '\n';

    // ── Hour header ──
    out += ' '.repeat(nameW + 2);
    for (let slot = 0; slot < slotsToShow; slot++) {
      const hour = Math.floor(slot / 4);
      const quarter = slot % 4;
      const isRed = slot === RED_SLOT_7AM || slot === RED_SLOT_9PM;
      const isCurrent = slot === currentSlot;

      if (isCurrent) {
        out += `${BG_YELLOW}${BLACK}`;
      } else if (isRed) {
        out += `${BG_RED}${WHITE}`;
      } else {
        out += DIM;
      }

      // Show hour digit at quarter 0 and 2, space otherwise
      if (quarter === 0) {
        out += String(hour).padStart(2, '0')[0];
      } else if (quarter === 1) {
        out += String(hour).padStart(2, '0')[1];
      } else {
        out += ' ';
      }

      out += R;
    }
    out += CLR + '\n';

    // ── Separator ──
    out += ' '.repeat(nameW + 2) + DIM + '─'.repeat(Math.min(slotsToShow, cols - nameW - 2)) + R + CLR + '\n';

    // ── Job rows ──
    const visibleRows = rows - 4;
    const visibleJobs = this.jobs.slice(this.scrollOffset, this.scrollOffset + visibleRows);

    for (let i = 0; i < visibleRows; i++) {
      const entry = visibleJobs[i];
      if (!entry) {
        out += CLR + '\n';
        continue;
      }

      const isSelected = (this.scrollOffset + i) === this.selected;
      const { job, slots } = entry;

      // Name column — scroll laterally when selected and name is too long
      let nameStr: string;
      if (isSelected && job.name.length > nameW) {
        const maxScroll = job.name.length - nameW;
        const offset = Math.min(this.nameScroll, maxScroll);
        nameStr = job.name.slice(offset, offset + nameW);
      } else {
        nameStr = job.name.slice(0, nameW).padEnd(nameW);
      }
      if (isSelected) {
        out += `${REV}${BOLD} ${nameStr} ${R}`;
      } else if (!job.enabled) {
        out += ` ${DIM}${nameStr}${R} `;
      } else {
        out += ` ${nameStr} `;
      }

      // Slot columns
      for (let slot = 0; slot < slotsToShow; slot++) {
        const fires = slots.has(slot);
        const isRed = slot === RED_SLOT_7AM || slot === RED_SLOT_9PM;
        const isCurrent = slot === currentSlot;

        if (isCurrent && fires) {
          out += `${BG_YELLOW}${BLACK}█${R}`;
        } else if (isCurrent) {
          out += `${BG_YELLOW}${BLACK}▏${R}`;
        } else if (isRed && fires) {
          out += `${BG_RED}${WHITE}█${R}`;
        } else if (isRed) {
          out += `${BG_RED} ${R}`;
        } else if (fires) {
          out += job.enabled ? `${GREEN}█${R}` : `${DIM}▒${R}`;
        } else {
          out += `${DIM}·${R}`;
        }
      }

      out += CLR + '\n';
    }

    // ── Status bar ──
    let status = '';
    if (this.statusMsg) {
      status = this.statusMsg.error
        ? `${RED}${this.statusMsg.text}${R}`
        : `${GREEN}${this.statusMsg.text}${R}`;
    } else if (selectedEntry) {
      if (selectedMultiFire) {
        status = `${RED}${selectedEntry.job.name}${R} fires ${selectedEntry.fireCount}× today — editing not available from this view`;
      } else if (selectedEntry.fireCount === 0) {
        status = `${DIM}${selectedEntry.job.name} — no fires today${R}`;
      } else {
        status = `${CYAN}${selectedEntry.job.name}${R} — enter=edit schedule  t=trigger`;
      }
    }
    out += ` ${status}` + CLR;

    process.stdout.write(out);

    // Clear any remaining lines
    for (let r = visibleRows + 4 + 1; r <= rows; r++) {
      process.stdout.write(`\x1b[${r};1H` + CLR);
    }

    if (this.infoMode) this.renderInfo();
  }
}

export async function jobsScheduleTui() {
  const tui = new ScheduleTui();
  await tui.load();
  tui.start();
}
