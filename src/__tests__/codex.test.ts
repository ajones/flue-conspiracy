import { describe, test, expect } from 'bun:test';
import { buildInputContent } from '../codex.ts';

describe('buildInputContent', () => {
  test('returns plain string when no images', () => {
    expect(buildInputContent('hello')).toBe('hello');
  });

  test('returns plain string when images array is empty', () => {
    expect(buildInputContent('hello', [])).toBe('hello');
  });

  test('returns content array when one image provided', () => {
    const result = buildInputContent('describe this', [
      { data: 'abc123', mimeType: 'image/jpeg' },
    ]);
    expect(result).toEqual([
      { type: 'input_text', text: 'describe this' },
      { type: 'input_image', image_url: 'data:image/jpeg;base64,abc123' },
    ]);
  });

  test('returns content array with multiple images', () => {
    const result = buildInputContent('compare', [
      { data: 'aaa', mimeType: 'image/png' },
      { data: 'bbb', mimeType: 'image/webp' },
    ]);
    expect(Array.isArray(result)).toBe(true);
    const parts = result as any[];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ type: 'input_text', text: 'compare' });
    expect(parts[1].image_url).toBe('data:image/png;base64,aaa');
    expect(parts[2].image_url).toBe('data:image/webp;base64,bbb');
  });

  test('data URL format is correct', () => {
    const result = buildInputContent('x', [{ data: 'DEADBEEF', mimeType: 'image/gif' }]) as any[];
    expect(result[1].image_url).toBe('data:image/gif;base64,DEADBEEF');
  });
});
