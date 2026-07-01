/**
 * Agents emit CommonMark-style markdown (`**bold**`, `*italic*`, `` `code` ``).
 * Telegram legacy Markdown uses `*bold*`, `_italic_`, and the same code/link syntax.
 * MarkdownV2 requires escaping most punctuation and breaks on typical agent prose.
 */
export const TELEGRAM_PARSE_MODE = 'Markdown' as const;

const SEGMENT = '\uE000';
const BOLD = '\uE001';

export function protectCode(text: string): { text: string; segments: string[] } {
  const segments: string[] = [];
  const protectedText = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match) => {
    const index = segments.length;
    segments.push(match);
    return `${SEGMENT}${index}${SEGMENT}`;
  });
  return { text: protectedText, segments };
}

export function restoreCode(text: string, segments: string[]): string {
  return text.replace(new RegExp(`${SEGMENT}(\\d+)${SEGMENT}`, 'g'), (_, index) => {
    return segments[Number(index)] ?? '';
  });
}

export function toTelegramMarkdown(text: string): string {
  const { text: protectedText, segments } = protectCode(text);
  const bolds: string[] = [];

  let result = protectedText
    .replace(/\*\*(.+?)\*\*/gs, (_, content: string) => {
      const index = bolds.length;
      bolds.push(content);
      return `${BOLD}${index}${BOLD}`;
    })
    .replace(/__(.+?)__/gs, (_, content: string) => {
      const index = bolds.length;
      bolds.push(content);
      return `${BOLD}${index}${BOLD}`;
    })
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '_$1_');

  result = result.replace(new RegExp(`${BOLD}(\\d+)${BOLD}`, 'g'), (_, index) => {
    return `*${bolds[Number(index)] ?? ''}*`;
  });

  return restoreCode(result, segments);
}
