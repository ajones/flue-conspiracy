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
const BRIGHT_YELLOW = '\x1b[93m';
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
  private allJobs: JobEntry[] = [];
  private jobs: JobEntry[] = [];
  private selected = 0;
  private scrollOffset = 0;
  private infoMode = false;
  private searchMode = false;
  private searchQuery = '';
  private editMode: 'anchor' | 'interval' | null = null;
  private editEntry: JobEntry | null = null;
  private editAnchorMs = 0;
  private editEveryMs = 0;
  private editCronOrigExpr = '';
  private editCronFirstFireMs = 0;
  private editCronSpacingMs = 0;
  private editCronFireCount = 0;
  private draftSlots: Set<number> = new Set();
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

    this.allJobs = rawJobs
      .map(job => {
        const { slots, fireCount } = getFireDataForDay(job, this.startOfDay);
        const firstSlot = slots.size > 0 ? Math.min(...slots) : Infinity;
        return { job, slots, fireCount, firstSlot };
      })
      .sort((a, b) => a.firstSlot - b.firstSlot);
    this.jobs = [...this.allJobs];
  }

  private lastKeyAt = 0;

  start() {
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[?25l'); // alt screen, clear, hide cursor
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', d => this.onKey(d));
    process.stdout.on('resize', () => this.queueRender());

    this.refreshTimer = setInterval(() => {
      if (Date.now() - this.lastKeyAt < 60_000) this.queueRender();
    }, 15_000);

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
        if (Date.now() - this.lastKeyAt > 3_000) return;
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

  private anchorToTimeOfDay(ms: number): string {
    const minuteOfDay = Math.round((ms - this.startOfDay.getTime()) % (24 * 60 * 60 * 1000) / 60_000 + 24 * 60) % (24 * 60);
    const h = Math.floor(minuteOfDay / 60).toString().padStart(2, '0');
    const m = (minuteOfDay % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // Shift a cron expression by the delta between editAnchorMs and editCronFirstFireMs.
  // Handles comma-separated hour lists like "10,15" by shifting all hours by the same delta.
  private shiftedCronExpr(targetMs: number): string {
    const parts = this.editCronOrigExpr.split(' ');
    const origMinute = parseInt(parts[0], 10);
    const origFirstHour = parseInt(parts[1].split(',')[0], 10);

    const deltaMinutes = Math.round((targetMs - this.editCronFirstFireMs) / 60_000);
    const origFirstTotal = origFirstHour * 60 + origMinute;
    const newFirstTotal = origFirstTotal + deltaMinutes;
    const newMinute = ((newFirstTotal % 60) + 60) % 60;
    const newFirstHour = ((Math.floor(newFirstTotal / 60)) % 24 + 24) % 24;

    const spacingHours = Math.round(this.editCronSpacingMs / 3_600_000);
    const newHours = Array.from({ length: this.editCronFireCount }, (_, i) =>
      (newFirstHour + spacingHours * i) % 24,
    );

    parts[0] = String(newMinute);
    parts[1] = newHours.join(',');
    return parts.join(' ');
  }

  private recomputeDraft() {
    const s = this.editEntry!.job.scheduleData;
    let draftSchedule: typeof s;
    if (s.kind === 'weekday') {
      draftSchedule = { ...s, timeOfDay: this.anchorToTimeOfDay(this.editAnchorMs) };
    } else if (s.kind === 'cron') {
      draftSchedule = { ...s, expr: this.shiftedCronExpr(this.editAnchorMs) };
    } else {
      draftSchedule = { kind: 'every' as const, everyMs: this.editEveryMs, anchorMs: this.editAnchorMs };
    }
    const fakeJob = { ...this.editEntry!.job, scheduleData: draftSchedule };
    this.draftSlots = getFireDataForDay(fakeJob as any, this.startOfDay).slots;
  }

  private enterAnchorMode(entry: JobEntry) {
    const s = entry.job.scheduleData;
    if (s.kind !== 'every' && s.kind !== 'weekday' && s.kind !== 'cron') {
      this.setStatus('editing only supported for every, weekday, and cron schedules', true);
      return;
    }
    this.editEntry = entry;
    if (s.kind === 'weekday') {
      const [h, m] = s.timeOfDay.split(':').map(Number);
      this.editAnchorMs = this.startOfDay.getTime() + (h * 60 + m) * 60_000;
      this.editEveryMs = 0;
    } else if (s.kind === 'cron') {
      // Use computeNextRun for the initial anchor so timezone is handled correctly.
      const firstFire = computeNextRun(s, new Date(this.startOfDay.getTime() - 1));
      this.editCronOrigExpr = s.expr;
      this.editCronFirstFireMs = firstFire ?? this.startOfDay.getTime();
      this.editAnchorMs = this.editCronFirstFireMs;
      this.editEveryMs = 0;
      const cronHours = s.expr.split(' ')[1].split(',').map(h => parseInt(h, 10));
      this.editCronFireCount = cronHours.length;
      this.editCronSpacingMs = cronHours.length > 1 ? (cronHours[1] - cronHours[0]) * 3_600_000 : 0;
    } else {
      this.editEveryMs = s.everyMs;
      // Use the first visible fire today so the cursor starts where the user sees it.
      this.editAnchorMs = entry.slots.size > 0
        ? (Math.min(...entry.slots) * 900_000 + this.startOfDay.getTime())
        : this.startOfDay.getTime();
    }
    this.editMode = 'anchor';
    this.recomputeDraft();
    this.queueRender();
  }

  private cancelEdit() {
    this.editMode = null;
    this.editEntry = null;
    this.draftSlots = new Set();
    this.queueRender();
  }

  private async saveEdit() {
    const entry = this.editEntry!;
    const s = entry.job.scheduleData;
    const newSchedule = s.kind === 'weekday'
      ? { ...s, timeOfDay: this.anchorToTimeOfDay(this.editAnchorMs) }
      : s.kind === 'cron'
        ? { ...s, expr: this.shiftedCronExpr(this.editAnchorMs) }
        : { kind: 'every' as const, everyMs: this.editEveryMs, anchorMs: this.editAnchorMs };
    const base = getGatewayUrl();
    try {
      const res = await fetch(`${base}/api/jobs/${entry.job.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: newSchedule }),
      });
      if (res.ok) {
        this.cancelEdit();
        await this.load();
        this.setStatus(`saved ${entry.job.name}`);
      } else {
        const body = await res.json() as any;
        this.setStatus(body.error ?? `error ${res.status}`, true);
      }
    } catch {
      this.setStatus('gateway not reachable', true);
    }
  }

  private formatMs(ms: number): string {
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins}m`;
    const hrs = mins / 60;
    if (Number.isInteger(hrs)) return `${hrs}h`;
    return `${Math.floor(hrs)}h${mins % 60}m`;
  }

  private formatAnchor(ms: number): string {
    return this.anchorToTimeOfDay(ms);
  }

  private queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setTimeout(() => { this.renderQueued = false; this.render(); }, 16);
  }

  private fuzzyMatch(name: string, query: string): boolean {
    if (!query) return true;
    const n = name.toLowerCase();
    const q = query.toLowerCase();
    let qi = 0;
    for (let i = 0; i < n.length && qi < q.length; i++) {
      if (n[i] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  private updateSearch() {
    const q = this.searchQuery;
    this.jobs = q ? this.allJobs.filter(e => this.fuzzyMatch(e.job.name, q)) : [...this.allJobs];
    this.selected = 0;
    this.scrollOffset = 0;
    this.updateNameScroll();
    this.queueRender();
  }

  private exitSearch(confirm: boolean) {
    const selectedName = this.jobs[this.selected]?.job.name;
    this.searchMode = false;
    this.searchQuery = '';
    this.jobs = [...this.allJobs];
    if (confirm && selectedName) {
      const idx = this.jobs.findIndex(e => e.job.name === selectedName);
      if (idx >= 0) this.selected = idx;
    } else {
      this.selected = 0;
    }
    this.scrollOffset = 0;
    this.clampScroll();
    this.updateNameScroll();
    this.queueRender();
  }

  private onKey(data: Buffer) {
    const s = data.toString();
    this.lastKeyAt = Date.now();

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

    if (this.editMode) {
      if (s === '\x1b' || s === '\x03') { this.cancelEdit(); return; }

      if (s === '\x1b[D') { // left
        if (this.editMode === 'anchor') { this.editAnchorMs -= 900_000; this.recomputeDraft(); }
        else if (this.editEntry!.job.scheduleData.kind === 'cron') {
          this.editCronSpacingMs = Math.max(3_600_000, this.editCronSpacingMs - 3_600_000);
          this.recomputeDraft();
        } else { this.editEveryMs = Math.max(900_000, this.editEveryMs - 900_000); this.recomputeDraft(); }
        this.queueRender();
        return;
      }
      if (s === '\x1b[C') { // right
        if (this.editMode === 'anchor') { this.editAnchorMs += 900_000; this.recomputeDraft(); }
        else if (this.editEntry!.job.scheduleData.kind === 'cron') {
          this.editCronSpacingMs += 3_600_000;
          this.recomputeDraft();
        } else { this.editEveryMs += 900_000; this.recomputeDraft(); }
        this.queueRender();
        return;
      }
      if (s === '\r' || s === '\n') {
        const editKind = this.editEntry!.job.scheduleData.kind;
        const cronHasSpacing = editKind === 'cron' && this.editCronFireCount > 1;
        if (this.editMode === 'anchor' && (editKind === 'every' || cronHasSpacing)) {
          this.editMode = 'interval';
          this.queueRender();
        } else {
          this.saveEdit();
        }
        return;
      }
      return;
    }

    if (this.searchMode) {
      if (s === '\x1b' || s === '\x03') { this.exitSearch(false); return; }
      if (s === '\r' || s === '\n') { this.exitSearch(true); return; }
      if (s === '\x7f' || s === '\x08') { // backspace
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.updateSearch();
        return;
      }
      if (s === '\x1b[A' || s === 'k') { // up
        if (this.selected > 0) { this.selected--; this.updateNameScroll(); }
        this.clampScroll();
        this.queueRender();
        return;
      }
      if (s === '\x1b[B' || s === 'j') { // down
        if (this.selected < this.jobs.length - 1) { this.selected++; this.updateNameScroll(); }
        this.clampScroll();
        this.queueRender();
        return;
      }
      if (s.length === 1 && s >= ' ') {
        this.searchQuery += s;
        this.updateSearch();
        return;
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

    if (s === '/') {
      this.searchMode = true;
      this.searchQuery = '';
      this.jobs = [...this.allJobs];
      this.selected = 0;
      this.scrollOffset = 0;
      this.updateNameScroll();
      this.queueRender();
      return;
    }

    if (s === 'i') {
      if (this.jobs[this.selected]) { this.infoMode = true; this.queueRender(); }
    }

    if (s === 't') {
      const entry = this.jobs[this.selected];
      if (entry) this.triggerJob(entry);
    }

    if (s === '\r' || s === '\n') {
      const entry = this.jobs[this.selected];
      if (entry) this.enterAnchorMode(entry);
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
    const labelW = 18; // "  " + 16-char label
    const valueW = boxW - 3 - labelW;
    const indent = ' '.repeat(labelW);

    function wrapWords(text: string, maxW: number): string[] {
      if (text.length <= maxW) return [text];
      const result: string[] = [];
      let line = '';
      for (const word of text.split(' ')) {
        if (!line) {
          line = word.slice(0, maxW);
          let rest = word.slice(maxW);
          while (rest) { result.push(line); line = rest.slice(0, maxW); rest = rest.slice(maxW); }
        } else if (line.length + 1 + word.length <= maxW) {
          line += ' ' + word;
        } else {
          result.push(line);
          line = word.slice(0, maxW);
          let rest = word.slice(maxW);
          while (rest) { result.push(line); line = rest.slice(0, maxW); rest = rest.slice(maxW); }
        }
      }
      if (line) result.push(line);
      return result;
    }

    const add = (label: string, value: string) => {
      const plain = value.replace(/\x1b\[[^m]*m/g, '');
      if (plain.length <= valueW) {
        lines.push(`  ${DIM}${label.padEnd(16)}${R}${value}`);
        return;
      }
      const wrapped = wrapWords(plain, valueW);
      lines.push(`  ${DIM}${label.padEnd(16)}${R}${wrapped[0]}`);
      for (const l of wrapped.slice(1)) lines.push(`${indent}${l}`);
    };

    add('agent', job.agent);
    add('target', job.target);
    if (job.resultPreference) add('delivery', job.resultPreference);
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
    const promptLineW = boxW - 7; // "    " indent + 2 borders + 1 right pad
    const rawPromptLines = job.prompt.split('\n');
    lines.push(`  ${DIM}prompt${R}`);
    let promptLinesOut = 0;
    for (const l of rawPromptLines) {
      if (promptLinesOut >= 8) break;
      const wrapped = wrapWords(l || ' ', promptLineW);
      for (const wl of wrapped) {
        if (promptLinesOut >= 8) break;
        lines.push(`    ${DIM}${wl}${R}`);
        promptLinesOut++;
      }
    }
    if (promptLinesOut >= 8 && (rawPromptLines.length > 8 || rawPromptLines.some(l => l.length > promptLineW))) {
      lines.push(`    ${DIM}…${R}`);
    }

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
      const fill = ' '.repeat(Math.max(0, boxW - 3 - visible.length));
      out += `\x1b[${startRow + 1 + i};${padX + 1}H${BG_DARK}${DIM}│${R}${BG_DARK}${content}${fill} ${DIM}│${R}`;
    }
    out += `\x1b[${startRow + boxH - 1};${padX + 1}H${BG_DARK}${DIM}└${border}┘${R}`;
    out += `\x1b[${startRow + boxH};${padX + 1}H${DIM}  i/esc=close  t=trigger${R}\x1b[K`;
    out += `\x1b[1;1H\x1b[?25l`;

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
    const editKind = this.editEntry?.job.scheduleData.kind;
    const cronHasSpacing = editKind === 'cron' && this.editCronFireCount > 1;
    const isWeekdayEdit = this.editMode === 'anchor' && (editKind === 'weekday' || (editKind === 'cron' && !cronHasSpacing));
    const intervalStep = editKind === 'cron' ? '1h' : '15m';
    const editHint = this.editMode === 'anchor'
      ? isWeekdayEdit
        ? `${CYAN}time${R} ${DIM}← → shift  enter=save  esc=cancel${R}`
        : `${CYAN}anchor${R} ${DIM}← → shift  enter=next  esc=cancel${R}`
      : this.editMode === 'interval'
        ? `${BRIGHT_YELLOW}spacing${R} ${DIM}← → ${intervalStep} steps  enter=save  esc=cancel${R}`
        : this.searchMode
          ? `${CYAN}/${this.searchQuery}▌${R}  ${DIM}${this.jobs.length} match${this.jobs.length !== 1 ? 'es' : ''}  ↑↓ navigate  enter=confirm  esc=cancel${R}`
          : `${DIM}↑↓ navigate  /=search  i=info  t=trigger  enter=edit  q=quit${R}`;
    const hint = editHint;
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

      // Show hour digit at quarter 0 and 1, space otherwise (12h format)
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const h12str = String(h12).padStart(2, '0');
      if (quarter === 0) {
        out += h12str[0];
      } else if (quarter === 1) {
        out += h12str[1];
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
      const inEdit = isSelected && this.editMode !== null;
      const activeSlots = inEdit ? this.draftSlots : slots;
      const editColor = this.editMode === 'anchor' ? CYAN : BRIGHT_YELLOW;

      for (let slot = 0; slot < slotsToShow; slot++) {
        const fires = activeSlots.has(slot);
        const ghost = inEdit && slots.has(slot) && !fires; // original position, now moved
        const isRed = slot === RED_SLOT_7AM || slot === RED_SLOT_9PM;
        const isCurrent = slot === currentSlot;

        if (isCurrent && fires) {
          out += `${BG_YELLOW}${BLACK}█${R}`;
        } else if (isCurrent) {
          out += `${BG_YELLOW}${BLACK}▏${R}`;
        } else if (isRed && fires) {
          out += `${BG_RED}${WHITE}█${R}`;
        } else if (isRed) {
          out += `${BG_RED}${ghost ? `${DIM}·` : ' '}${R}`;
        } else if (fires) {
          out += inEdit ? `${editColor}█${R}` : (job.enabled ? `${GREEN}█${R}` : `${DIM}▒${R}`);
        } else if (ghost) {
          out += `${DIM}·${R}`;
        } else {
          out += `${DIM}·${R}`;
        }
      }

      out += CLR + '\n';
    }

    // ── Status bar ──
    let status = '';
    if (this.searchMode) {
      status = `${CYAN}/${this.searchQuery}▌${R}  ${DIM}${this.jobs.length} match${this.jobs.length !== 1 ? 'es' : ''}${R}`;
    } else if (this.statusMsg) {
      status = this.statusMsg.error
        ? `${RED}${this.statusMsg.text}${R}`
        : `${GREEN}${this.statusMsg.text}${R}`;
    } else if (this.editMode === 'anchor') {
      const itvDisplay = this.editEntry!.job.scheduleData.kind === 'cron'
        ? this.formatMs(this.editCronSpacingMs)
        : this.formatMs(this.editEveryMs);
      status = `${CYAN}anchor${R} ${this.formatAnchor(this.editAnchorMs)}  ${DIM}spacing${R} ${itvDisplay}`;
    } else if (this.editMode === 'interval') {
      const itvDisplay = this.editEntry!.job.scheduleData.kind === 'cron'
        ? this.formatMs(this.editCronSpacingMs)
        : this.formatMs(this.editEveryMs);
      status = `${DIM}anchor${R} ${this.formatAnchor(this.editAnchorMs)}  ${BRIGHT_YELLOW}spacing${R} ${itvDisplay}`;
    } else if (selectedEntry) {
      if (selectedMultiFire) {
        status = `${CYAN}${selectedEntry.job.name}${R} fires ${selectedEntry.fireCount}× today  ${DIM}enter=edit anchor  t=trigger${R}`;
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

    // Park cursor and re-hide after all writes are done
    process.stdout.write(`\x1b[1;1H\x1b[?25l`);
  }
}

export async function jobsScheduleTui() {
  const tui = new ScheduleTui();
  await tui.load();
  tui.start();
}
