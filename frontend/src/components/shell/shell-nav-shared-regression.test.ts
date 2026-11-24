// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { subNavItemClass } from './nav-utils';

const rentalSidebarPath = resolve(__dirname, '../../rental/components/Sidebar.tsx');

describe('shared shell nav — Rental regression (PR #2517)', () => {
  it('subNavItemClass enforces 36px primary-row rhythm used by Rental nested items', () => {
    const cls = subNavItemClass(false);
    expect(cls).toContain('min-h-[36px]');
    expect(cls).toContain('py-[8px]');
  });

  it('Rental sidebar still consumes shared nav-utils + CollapsedNavTooltip', () => {
    const source = readFileSync(rentalSidebarPath, 'utf8');
    expect(source).toContain('subNavItemClass');
    expect(source).toContain('CollapsedNavTooltip');
    expect(source).not.toContain('from \'../master');
  });

  it('CollapsedNavTooltip exposes keyboard focus visibility class contract', () => {
    const source = readFileSync(resolve(__dirname, 'nav-primitives.tsx'), 'utf8');
    expect(source).toContain('group-focus-within:opacity-100');
    expect(source).toContain('group-hover:opacity-100');
  });
});