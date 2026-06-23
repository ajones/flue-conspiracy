import { defineTool } from '@flue/runtime';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { createLogger } from '../log.ts';

const log = createLogger('apple-notes');

const SCRIPTS_DIR = join(process.cwd(), 'skills', 'raven-apple-notes', 'scripts');

function runScript(script: string, args: string[]): Promise<string> {
  const scriptPath = join(SCRIPTS_DIR, script);
  return new Promise((resolve, reject) => {
    execFile('osascript', [scriptPath, ...args], { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        log.error('AppleScript failed', { script, error: err.message, stderr });
        return reject(new Error(`AppleScript error (${script}): ${err.message}`));
      }
      resolve(stdout.trim());
    });
  });
}

const listNotes = defineTool({
  name: 'apple_notes_list',
  description: 'List all Apple Notes with metadata (name, ID, folder, line count, last modified).',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    log.info('apple_notes_list');
    const result = await runScript('list-apple-notes.scpt', []);
    log.info('apple_notes_list done', { length: result.length });
    return result;
  },
});

const getNoteContent = defineTool({
  name: 'apple_notes_get',
  description: 'Get the content of an Apple Note by ID or name. Optionally specify a line number or range (e.g. "5" or "3-7").',
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Note ID or exact name',
      },
      lines: {
        type: 'string',
        description: 'Optional line number or range (e.g. "5" or "3-7")',
      },
    },
    required: ['note'],
    additionalProperties: false,
  },
  async execute(input: Record<string, any>) {
    const { note, lines } = input as { note: string; lines?: string };
    log.info('apple_notes_get', { note, lines });
    const args = [note];
    if (lines) args.push(lines);
    const result = await runScript('get-note-content.scpt', args);
    log.info('apple_notes_get done', { note, length: result.length });
    return result;
  },
});

const appendToNote = defineTool({
  name: 'apple_notes_append',
  description: 'Append text to an existing Apple Note by ID or name.',
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Note ID or exact name',
      },
      text: {
        type: 'string',
        description: 'Text or HTML to append',
      },
    },
    required: ['note', 'text'],
    additionalProperties: false,
  },
  async execute(input: Record<string, any>) {
    const { note, text } = input as { note: string; text: string };
    log.info('apple_notes_append', { note, textLength: text.length });
    const result = await runScript('append-to-note.scpt', [note, text]);
    log.info('apple_notes_append done', { note });
    return result;
  },
});

const replaceInNote = defineTool({
  name: 'apple_notes_replace',
  description: 'Replace a line, range of lines, or matching string in an Apple Note. Specify a line number (e.g. "3"), range (e.g. "3-7"), or search string to match.',
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Note ID or exact name',
      },
      target: {
        type: 'string',
        description: 'Line number, range (e.g. "3-7"), or search string to match',
      },
      replacement: {
        type: 'string',
        description: 'Replacement text',
      },
    },
    required: ['note', 'target', 'replacement'],
    additionalProperties: false,
  },
  async execute(input: Record<string, any>) {
    const { note, target, replacement } = input as { note: string; target: string; replacement: string };
    log.info('apple_notes_replace', { note, target });
    const result = await runScript('replace-line-in-note.scpt', [note, target, replacement]);
    log.info('apple_notes_replace done', { note });
    return result;
  },
});

const createNote = defineTool({
  name: 'apple_notes_create',
  description: 'Create a new note in the "Shared With Raven" folder. The title becomes the note heading.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Note title (becomes H1 heading)',
      },
      body: {
        type: 'string',
        description: 'Note body text or HTML',
      },
    },
    required: ['title', 'body'],
    additionalProperties: false,
  },
  async execute(input: Record<string, any>) {
    const { title, body } = input as { title: string; body: string };
    log.info('apple_notes_create', { title });
    const result = await runScript('create-note-in-shared-with-raven.scpt', [title, body]);
    log.info('apple_notes_create done', { title });
    return result;
  },
});

const setNoteBody = defineTool({
  name: 'apple_notes_set_body',
  description: 'Replace the entire body of an Apple Note by ID or name with new HTML content.',
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Note ID or exact name',
      },
      body: {
        type: 'string',
        description: 'New HTML body content',
      },
    },
    required: ['note', 'body'],
    additionalProperties: false,
  },
  async execute(input: Record<string, any>) {
    const { note, body } = input as { note: string; body: string };
    log.info('apple_notes_set_body', { note, bodyLength: body.length });
    const result = await runScript('set-note-body.scpt', [note, body]);
    log.info('apple_notes_set_body done', { note });
    return result;
  },
});

export const appleNotesTools = [
  listNotes,
  getNoteContent,
  appendToNote,
  replaceInNote,
  createNote,
  setNoteBody,
];
