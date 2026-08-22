import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const sidebarSource = readFileSync(resolve(testDir, '../Sidebar.tsx'), 'utf8');

describe('communication center sidebar navigation contract', () => {
  it('registers communication-center once in expanded and collapsed nav', () => {
    const matches = sidebarSource.match(/handleViewChange\('communication-center'\)/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('gates nav behind canCommunication permission', () => {
    expect(sidebarSource).toContain('canCommunication &&');
    expect(sidebarSource).toContain("handleViewChange('communication-center')");
  });

  it('shares mobile and desktop navigation content', () => {
    expect(sidebarSource).toContain('renderNavigationContent(true)');
    expect(sidebarSource).toContain('renderNavigationContent()');
  });
});
