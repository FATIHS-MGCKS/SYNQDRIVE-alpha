#!/usr/bin/env node
/**
 * Mechanical surface migration: bg-card / sq-card → canonical surface-* tokens.
 * Run from frontend/: node scripts/surface-rollout-codemod.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIRS = ['src/rental', 'src/operator', 'src/master', 'src/components', 'src/pages'];
const SKIP_FILES = new Set([
  'src/components/ui/card.tsx',
  'src/components/ui/alert.tsx',
  'src/components/ui/switch.tsx',
  'src/rental/lib/rental-surface-ui.ts',
  'src/styles/theme.css',
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, files);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      files.push(p);
    }
  }
  return files;
}

function isInputContext(line) {
  return (
    /placeholder:/.test(line) ||
    /\bINPUT_CLASS\b/.test(line) ||
    /\baccountInputClass\b/.test(line) ||
    /\binputClass\b/.test(line) ||
    /\bselectClass\b/.test(line) ||
    (/outline-none/.test(line) && /(?:px-3|py-2|rounded-(?:lg|xl))/.test(line) && !/surface-/.test(line))
  );
}

function isPopoverContext(line) {
  return (
    /(?:absolute|fixed|z-\d+).*bg-card/.test(line) ||
    /shadow-xl py-1/.test(line) ||
    /min-w-\[/.test(line) && /bg-card/.test(line) ||
    /dropdown|popover|Popover|Menu/.test(line)
  );
}

function transformContent(content, relPath) {
  if (SKIP_FILES.has(relPath)) return { content, changed: false };
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')) {
    return { content, changed: false };
  }

  const lines = content.split('\n');
  let changed = false;
  const out = lines.map((line) => {
    let l = line;
    const orig = l;

    if (isInputContext(l)) {
      l = l.replace(/\bbg-card(?:\/\d+)?\b/g, 'bg-background');
    } else if (isPopoverContext(l)) {
      l = l.replace(/\bbg-card(?:\/\d+)?\b/g, 'bg-popover');
    }

    // Frosted chrome (blur contexts)
    if (/backdrop-blur/.test(l) && /\bbg-card/.test(l)) {
      l = l.replace(/\bbg-card\/\d+\s+backdrop-blur[-\w]*/g, 'surface-frosted');
      l = l.replace(/\bbackdrop-blur[-\w]*\s+bg-card\/\d+/g, 'surface-frosted');
      l = l.replace(/\bbg-card\/\d+\s+/g, 'surface-frosted ');
    }

    // Legacy sq-* card aliases
    l = l.replace(/\bsq-card-elevated\b/g, 'surface-elevated');
    l = l.replace(/\bsq-card-premium\b/g, 'surface-premium');
    l = l.replace(/\bsq-glass\b/g, 'surface-frosted');
    l = l.replace(/\bsq-card\b/g, 'surface-premium');

    // bg-card on interactive/hover rows inside cards
    l = l.replace(
      /\bborder-border border \$\{'bg-card hover:bg-muted/g,
      "border-border border ${'bg-background hover:bg-muted",
    );
    l = l.replace(
      /\bborder-border border \$\{[^}]*'bg-card hover:bg-muted/g,
      (m) => m.replace(/bg-card/g, 'bg-background'),
    );

    // Common card shell patterns
    l = l.replace(/\bbg-card\/95\b/g, 'surface-frosted');
    l = l.replace(/\bbg-card\/80\b/g, 'surface-premium');
    l = l.replace(/\bbg-card\/60\b/g, 'surface-premium');
    l = l.replace(/\bbg-card\/50\b/g, 'surface-premium');
    l = l.replace(/\bbg-card\/40\b/g, 'surface-premium');

    // Remaining bg-card → surface-premium (content cards)
    if (/\bbg-card\b/.test(l) && !isInputContext(l)) {
      l = l.replace(/\bbg-card\b/g, 'surface-premium');
    }

    if (l !== orig) changed = true;
    return l;
  });

  return { content: out.join('\n'), changed };
}

const allFiles = SCAN_DIRS.flatMap((d) => {
  const abs = join(ROOT, d);
  try {
    return walk(abs);
  } catch {
    return [];
  }
});

let touched = 0;
for (const file of allFiles) {
  const rel = relative(join(ROOT), file).replace(/\\/g, '/');
  const raw = readFileSync(file, 'utf8');
  const { content, changed } = transformContent(raw, rel);
  if (changed) {
    writeFileSync(file, content, 'utf8');
    touched++;
    console.log('updated:', rel);
  }
}

console.log(`\nDone. ${touched} files updated.`);
