import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const ATTACH_RE = /\[\[attach:([^\]]+)\]\]/gi;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function parseReplyAttachments(text: string): { text: string; imagePaths: string[] } {
  const imagePaths: string[] = [];
  const cleaned = text
    .replace(ATTACH_RE, (_, raw: string) => {
      imagePaths.push(raw.trim());
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: cleaned, imagePaths };
}

export function validateImagePaths(paths: string[]): string[] {
  const resolved: string[] = [];
  for (const raw of paths) {
    const path = resolve(raw.trim());
    if (!existsSync(path)) {
      throw new Error(`Telegram image attachment not found: ${path}`);
    }
    const st = statSync(path);
    if (!st.isFile()) {
      throw new Error(`Telegram image attachment is not a file: ${path}`);
    }
    const ext = extname(path).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      throw new Error(`Telegram image attachment has unsupported extension: ${path}`);
    }
    resolved.push(path);
  }
  return resolved;
}

export const TELEGRAM_ATTACH_INSTRUCTIONS =
  'To attach images to a Telegram reply, add `[[attach:/absolute/path/to/image.jpg]]` on its own line. '
  + 'Use readable host paths (e.g. snapshot paths from tools). Supported formats: jpg, png, gif, webp. '
  + 'Markers are stripped from the visible message; the first image carries your text as a caption.';
