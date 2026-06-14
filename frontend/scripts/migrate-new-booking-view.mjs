/**
 * One-shot migration: NewBookingView isDarkMode → design tokens.
 * Run: node scripts/migrate-new-booking-view.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/NewBookingView.tsx');
let src = fs.readFileSync(filePath, 'utf8');
const beforeCount = (src.match(/isDarkMode/g) || []).length;

// ── Props interface & destructuring ───────────────────────────────────
src = src.replace(/\s*isDarkMode: boolean;\n/, '\n');
src = src.replace(
  /export function NewBookingView\(\{ isDarkMode, onBack/,
  'export function NewBookingView({ onBack',
);
src = src.replace(/\s*isDarkMode=\{isDarkMode\}/g, '');

// ── Remove card() helper isDarkMode ternary ───────────────────────────
src = src.replace(
  /const card = \(children: React\.ReactNode, className\?: string\) => \(\s*<div className=\{`rounded-lg border shadow-sm \$\{isDarkMode \? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'\} \$\{className \|\| ''\}`\}>\s*\{children\}\s*<\/div>\s*\);/,
  `const card = (children: React.ReactNode, className?: string) => (
    <DataCard className={className} bodyClassName="p-0" flush>
      {children}
    </DataCard>
  );`,
);

// ── Bulk ternary → token replacements ─────────────────────────────────
const pairs = [
  // hex colors in inline styles
  [/isDarkMode \? '#34d399' : '#16a34a'/g, "'var(--status-positive)'"],
  [/isDarkMode \? '#60a5fa' : '#2563eb'/g, "'var(--status-info)'"],
  [/isDarkMode \? '#9ca3af' : '#6b7280'/g, "'var(--muted-foreground)'"],
  [/isDarkMode \? '#d1d5db' : '#374151'/g, "'var(--muted-foreground)'"],
  [/isDarkMode \? 'rgba\(38,38,38,0\.8\)' : 'rgba\(249,250,251,0\.9\)'/g, "'var(--card)'"],
  [/isDarkMode \? 'rgba\(82,82,82,0\.5\)' : 'rgba\(209,213,219,0\.6\)'/g, "'var(--border)'"],

  // nested step indicator states (multi-line)
  [
    /\? isDarkMode\s*\?\s*'bg-blue-600\/20 border-blue-500\/40 text-blue-400 shadow-\[0_0_20px_rgba\(59,130,246,0\.15\)\]'\s*:\s*'bg-blue-50 border-blue-200 text-blue-700 shadow-\[0_0_20px_rgba\(59,130,246,0\.1\)\]'/g,
    "? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-green-600\/15 border-green-500\/30 text-green-400 cursor-pointer hover:bg-green-600\/25'\s*:\s*'bg-green-50 border-green-200 text-green-700 cursor-pointer hover:bg-green-100'/g,
    "? 'sq-tone-success border border-border cursor-pointer hover:opacity-90'",
  ],
  [
    /: isDarkMode\s*\?\s*'bg-neutral-800\/40 border-neutral-700\/30 text-gray-500'\s*:\s*'bg-gray-50\/60 border-gray-200\/40 text-gray-400'/g,
    ": 'bg-muted/40 border border-border text-muted-foreground'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-blue-600\/15 border-blue-500\/40 ring-1 ring-blue-500\/20'\s*:\s*'bg-blue-50 border-blue-200 ring-1 ring-blue-200'/g,
    "? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]'",
  ],
  [
    /: isDarkMode\s*\?\s*'bg-neutral-800\/40 border-neutral-700\/30 hover:bg-neutral-800\/70 hover:border-neutral-600\/50'\s*:\s*'bg-gray-50\/40 border-gray-200\/30 hover:bg-white hover:border-gray-300\/50'/g,
    ": 'bg-muted/40 border border-border hover:bg-card hover:border-border'",
  ],
  [
    /\? isDarkMode \? 'bg-blue-600\/30 text-blue-400' : 'bg-blue-200 text-blue-800'/g,
    "? 'sq-tone-brand'",
  ],
  [
    /: isDarkMode \? 'bg-neutral-700 text-gray-300' : 'bg-gray-200 text-gray-600'/g,
    ": 'sq-chip-neutral'",
  ],
  [
    /isCompleted \? isDarkMode \? 'bg-green-500\/40' : 'bg-green-300' : isDarkMode \? 'bg-neutral-700' : 'bg-gray-200'/g,
    "isCompleted ? 'bg-[color:var(--status-positive)]/40' : 'bg-border'",
  ],

  // backgrounds & surfaces
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'/g, "'sq-card border border-border'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-white'/g, "'bg-card border border-border text-muted-foreground hover:bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'/g, "'bg-card border border-border'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'/g, "'bg-card border border-border text-foreground hover:bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'/g, "'bg-card border border-border text-foreground hover:bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-gray-400 hover:border-gray-600' : 'bg-white\/70 border-gray-200 text-gray-500 hover:border-gray-300'/g, "'bg-card border border-border text-muted-foreground hover:border-border'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-gray-400 hover:text-red-400 hover:border-red-500\/30' : 'bg-white border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200'/g, "'bg-card border border-border text-muted-foreground hover:text-[color:var(--status-critical)] hover:border-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500\/50' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-300'/g, "'bg-card border border-border text-foreground focus:border-[color:var(--brand)]'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-white focus:border-green-500\/50' : 'bg-white border-gray-200 text-gray-900 focus:border-green-300'/g, "'bg-card border border-border text-foreground focus:border-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-white hover:border-neutral-600' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'/g, "'bg-card border border-border text-foreground hover:border-border'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'/g, "'bg-card border border-border text-foreground'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-400 border border-neutral-700\/40' : 'bg-white text-gray-500 border border-gray-200\/40'/g, "'bg-card text-muted-foreground border border-border'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-200'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-800\/30' : 'bg-gray-50\/60'/g, "'bg-muted/40'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700 divide-neutral-800' : 'bg-gray-50\/50 border-gray-200\/60 divide-gray-100'/g, "'bg-muted/40 border border-border divide-border'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700 text-white' : 'bg-gray-100\/60 border-gray-200 text-gray-900'/g, "'bg-muted/40 border border-border text-foreground'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700' : 'bg-gray-50\/50 border-gray-200\/60'/g, "'bg-muted/40 border border-border'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700\/30' : 'bg-gray-50\/60 border-gray-200\/30'/g, "'bg-muted/40 border border-border'"],
  [/isDarkMode \? 'bg-neutral-800\/40 text-gray-400 border border-neutral-700\/30 hover:border-neutral-600\/50' : 'bg-gray-50\/40 text-gray-500 border border-gray-200\/30 hover:border-gray-300\/50'/g, "'bg-muted/40 text-muted-foreground border border-border hover:border-border'"],
  [/isDarkMode \? 'bg-neutral-800\/40 text-gray-400' : 'bg-gray-50 text-gray-500'/g, "'bg-muted/40 text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'/g, "'bg-card border border-border'"],
  [/isDarkMode \? 'bg-neutral-900\/90 border-neutral-700\/60' : 'bg-white\/90 border-gray-200\/60'/g, "'bg-card/90 border border-border'"],
  [/isDarkMode \? 'bg-neutral-900\/95 border-neutral-700\/60 text-white' : 'bg-white\/95 border-gray-200\/60 text-gray-900'/g, "'bg-card/95 border border-border text-foreground'"],
  [/isDarkMode \? 'bg-neutral-900\/95 border-neutral-700\/60' : 'bg-white\/95 border-gray-200\/60'/g, "'bg-card/95 border border-border'"],
  [/isDarkMode \? 'border-neutral-700 bg-neutral-900' : 'border-gray-200 bg-white'/g, "'border-border bg-card'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'/g, "'bg-muted text-muted-foreground cursor-not-allowed'"],

  // semantic tones
  [/isDarkMode \? 'bg-blue-600\/30 text-blue-400' : 'bg-blue-100 text-blue-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-blue-600\/20 border-blue-500\/40 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600'/g, "'sq-tone-brand border border-border'"],
  [/isDarkMode \? 'bg-blue-600\/20 text-blue-400 border border-blue-500\/40' : 'bg-blue-50 text-blue-600 border border-blue-200'/g, "'sq-tone-brand border border-border'"],
  [/isDarkMode \? 'bg-blue-600\/20 text-blue-400 hover:bg-blue-600\/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'/g, "'sq-tone-brand hover:opacity-90'"],
  [/isDarkMode \? 'bg-blue-600\/20' : 'bg-blue-100'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-blue-600\/30 text-blue-300' : 'bg-blue-100 text-blue-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-blue-600\/15 text-blue-400' : 'bg-blue-50 text-blue-600'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-50 text-blue-600'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-blue-500\/15' : 'bg-blue-50'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-blue-900\/10 border border-blue-900\/20' : 'bg-blue-50\/60 border border-blue-100'/g, "'sq-tone-info border border-border'"],
  [/isDarkMode \? 'bg-blue-900\/30 text-blue-400' : 'bg-blue-50 text-blue-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-green-600\/20' : 'bg-green-100'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-green-600\/20 text-green-400 border border-green-500\/40' : 'bg-green-50 text-green-600 border border-green-200'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-green-600\/20 border-green-500\/40 text-green-400' : 'bg-green-50 border-green-200 text-green-600'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-green-900\/30 text-green-400' : 'bg-green-50 text-green-600'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-emerald-500\/15' : 'bg-emerald-100'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-emerald-500\/15' : 'bg-emerald-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-emerald-500\/5 border-emerald-500\/30' : 'bg-emerald-50\/50 border-emerald-200\/60'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-emerald-500\/5' : 'bg-emerald-50\/60'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-emerald-900\/30 text-emerald-400 border border-emerald-500\/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-emerald-900\/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-amber-500\/10 border border-amber-500\/20' : 'bg-amber-50 border border-amber-200\/60'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-amber-900\/20 text-amber-500\/60' : 'bg-amber-50 text-amber-400'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-amber-900\/40' : 'bg-amber-50'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-900\/20 text-red-300 border border-red-500\/30' : 'bg-red-50 text-red-600 border border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-red-900\/20 text-red-400\/60' : 'bg-red-50 text-red-400'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-red-900\/30 text-red-400 border border-red-500\/30' : 'bg-red-50 text-red-700 border border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-red-900\/15 border border-red-900\/30' : 'bg-red-50\/60 border border-red-100'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-red-900\/40' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-red-500\/15' : 'bg-red-100'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-red-500\/5 border-red-500\/30' : 'bg-red-50\/50 border-red-200\/60'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-red-700\/60' : 'bg-red-300\/80'/g, "'bg-[color:var(--status-critical)]/60'"],
  [/isDarkMode \? 'bg-purple-500\/15' : 'bg-purple-50'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-purple-600\/20 text-purple-400' : 'bg-purple-100 text-purple-700'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-purple-600\/20 text-purple-400' : 'bg-purple-100 text-purple-700'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-purple-900\/30 text-purple-400' : 'bg-purple-50 text-purple-700'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-violet-500\/10' : 'bg-violet-50'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-violet-500\/15' : 'bg-violet-50'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-neutral-500\/70' : 'bg-gray-300\/90'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-300' : 'bg-gray-200 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-500' : 'bg-gray-200 text-gray-400'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-700' : 'bg-gray-200'/g, "'bg-muted'"],

  // borders
  [/isDarkMode \? 'border-neutral-700' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-800' : 'border-gray-100'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-600 text-gray-500' : 'border-gray-300 text-gray-400'/g, "'border-border text-muted-foreground'"],
  [/isDarkMode \? 'border-neutral-600' : 'border-gray-300'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-700 text-gray-300' : 'border-gray-200 text-gray-700'/g, "'border-border text-foreground'"],
  [/isDarkMode \? 'border-l border-neutral-700' : 'border-l border-gray-200'/g, "'border-l border-border'"],
  [/isDarkMode \? 'border-red-800\/50' : 'border-red-300\/50'/g, "'border-[color:var(--status-critical)]/50'"],

  // text colors
  [/isDarkMode \? 'text-white' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-100'/g, "'text-foreground hover:bg-muted'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200 placeholder-gray-600' : 'text-gray-700 placeholder-gray-400'/g, "'text-foreground placeholder:text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500 line-through' : 'text-gray-400 line-through'/g, "'text-muted-foreground line-through'"],
  [/isDarkMode \? 'text-green-400' : 'text-green-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-green-400' : 'text-green-700'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-500'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-600'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-700'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-300\/80' : 'text-blue-600'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-500'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-700'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-emerald-500' : 'text-emerald-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-500'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-300\/80' : 'text-amber-700'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-400\/70' : 'text-amber-600\/70'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-500'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-300\/80' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-400\/80' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-purple-400' : 'text-purple-500'/g, "'text-[color:var(--status-ai)]'"],
  [/isDarkMode \? 'text-purple-400' : 'text-purple-600'/g, "'text-[color:var(--status-ai)]'"],
  [/isDarkMode \? 'text-purple-400' : 'text-purple-700'/g, "'text-[color:var(--status-ai)]'"],

  // hover states
  [/isDarkMode \? 'hover:bg-neutral-700 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'/g, "'hover:bg-muted text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'hover:bg-neutral-700' : 'hover:bg-gray-200'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'hover:bg-neutral-700\/60 text-blue-400 hover:text-blue-300' : 'hover:bg-gray-200\/60 text-blue-500 hover:text-blue-600'/g, "'hover:bg-muted text-[color:var(--status-info)] hover:opacity-80'"],
  [/isDarkMode \? 'hover:bg-neutral-700\/60 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-200\/60 text-gray-500 hover:text-gray-700'/g, "'hover:bg-muted text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'/g, "'hover:bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'/g, "'hover:bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'/g, "'text-muted-foreground hover:text-foreground hover:bg-muted'"],
  [/isDarkMode \? 'text-emerald-400 cursor-pointer hover:bg-emerald-500\/10' : 'text-emerald-600 cursor-pointer hover:bg-emerald-50'/g, "'text-[color:var(--status-positive)] cursor-pointer hover:bg-[color:var(--status-positive-soft)]'"],
  [/isDarkMode \? 'border-neutral-700 text-gray-400 hover:border-blue-500\/40 hover:text-blue-400' : 'border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600'/g, "'border-border text-muted-foreground hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]'"],

  // nested modal step wizard
  [
    /\? isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-50 text-blue-600'/g,
    "? 'sq-tone-brand'",
  ],
  [
    /\? isDarkMode \? 'text-emerald-400 cursor-pointer hover:bg-emerald-500\/10' : 'text-emerald-600 cursor-pointer hover:bg-emerald-50'/g,
    "? 'text-[color:var(--status-positive)] cursor-pointer hover:bg-[color:var(--status-positive-soft)]'",
  ],
  [
    /: isDarkMode \? 'text-gray-600' : 'text-gray-300'/g,
    ": 'text-muted-foreground'",
  ],
  [
    /isDone \? 'bg-emerald-400\/40' : isDarkMode \? 'bg-neutral-800' : 'bg-gray-200'/g,
    "isDone ? 'bg-[color:var(--status-positive)]/40' : 'bg-border'",
  ],
  [
    /\? isDarkMode \? 'bg-emerald-500\/5 border-emerald-500\/30' : 'bg-emerald-50\/50 border-emerald-200\/60'/g,
    "? 'sq-tone-success border border-border'",
  ],
  [
    /\? isDarkMode \? 'bg-red-500\/5 border-red-500\/30' : 'bg-red-50\/50 border-red-200\/60'/g,
    "? 'sq-tone-critical border border-border'",
  ],
  [
    /: isDarkMode \? 'bg-neutral-800\/40 border-neutral-700' : 'bg-gray-50\/50 border-gray-200\/60'/g,
    ": 'bg-muted/40 border border-border'",
  ],
  [
    /\? isDarkMode \? 'bg-emerald-500\/15' : 'bg-emerald-100'/g,
    "? 'sq-tone-success'",
  ],
  [
    /\? isDarkMode \? 'bg-red-500\/15' : 'bg-red-100'/g,
    "? 'sq-tone-critical'",
  ],
  [
    /: isDarkMode \? 'bg-violet-500\/15' : 'bg-violet-50'/g,
    ": 'sq-tone-ai'",
  ],

  // multiline input class in add customer modal
  [
    /isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-200 placeholder-gray-500 focus:border-blue-500\/50 focus:ring-1 focus:ring-blue-500\/20'\s*:\s*'bg-white\/70 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400\/20'/g,
    "'bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-glow)]'",
  ],
  [
    /isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500\/50'\s*:\s*'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-300'/g,
    "'bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]'",
  ],
  [
    /isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700'\s*:\s*'bg-white border-gray-200 text-gray-700 hover:bg-white'/g,
    "'bg-card border border-border text-foreground hover:bg-muted'",
  ],
];

for (const [re, rep] of pairs) {
  src = src.replace(re, rep);
}

fs.writeFileSync(filePath, src);
const afterCount = (src.match(/isDarkMode/g) || []).length;
console.log(`isDarkMode: ${beforeCount} → ${afterCount}`);
