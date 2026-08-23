import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTENTION_SCOPED_LIST_SCROLL_MAX_HEIGHT_CLASS,
  ATTENTION_SCOPED_LIST_VISIBLE_ENTRIES,
} from './attentionScopedListLayout';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('attentionScopedListLayout', () => {
  it('caps visible notification rows at five before scroll blur', () => {
    expect(ATTENTION_SCOPED_LIST_VISIBLE_ENTRIES).toBe(5);
    expect(ATTENTION_SCOPED_LIST_SCROLL_MAX_HEIGHT_CLASS).toContain('4.25rem*5');
  });

  it('wires scroll max height into AttentionScopedList blur wrapper', () => {
    const src = readFileSync(resolve(testDir, './AttentionScopedList.tsx'), 'utf8');
    expect(src).toMatch(/ATTENTION_SCOPED_LIST_SCROLL_MAX_HEIGHT_CLASS/);
    expect(src).toMatch(/scrollClassName=/);
  });
});
