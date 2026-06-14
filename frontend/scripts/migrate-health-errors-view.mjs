/**
 * One-shot migration: HealthErrorsView isDarkMode → design tokens + patterns.
 * Run: node scripts/migrate-health-errors-view.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../src/rental/components/HealthErrorsView.tsx');
let src = fs.readFileSync(filePath, 'utf8');
const beforeCount = (src.match(/isDarkMode/g) || []).length;

// ── tireStatusStyle / brakeConditionStyle ─────────────────────────────
src = src.replace(
  /function tireStatusStyle\(\s*status: string \| null \| undefined,\s*isDarkMode: boolean,\s*\): \{ dot: string; pill: string; label: string \} \{[\s\S]*?\n\}/,
  `function tireStatusStyle(
  status: string | null | undefined,
): { dot: string; pill: string; label: string } {
  switch (status) {
    case 'GOOD':
      return { dot: 'sq-dot-success', pill: 'sq-chip-success', label: 'Good' };
    case 'WATCH':
      return { dot: 'sq-dot-watch', pill: 'sq-chip-watch', label: 'Watch' };
    case 'WARNING':
      return { dot: 'sq-dot-warning', pill: 'sq-chip-warning', label: 'Warning' };
    case 'CRITICAL':
      return { dot: 'sq-dot-critical', pill: 'sq-chip-critical', label: 'Critical' };
    default:
      return { dot: 'sq-dot-nodata', pill: 'sq-chip-nodata', label: 'Unknown' };
  }
}`,
);

// ── Props interface & destructuring ───────────────────────────────────
src = src.replace(/\s*isDarkMode: boolean;\n/, '\n');
src = src.replace(
  /export function HealthErrorsView\(\{ isDarkMode, vehicleId, fuelType \}/,
  'export function HealthErrorsView({ vehicleId, fuelType }',
);

// ── Function call sites: remove isDarkMode arg ────────────────────────
src = src.replace(/tireStatusStyle\(([^,)]+),\s*isDarkMode\)/g, 'tireStatusStyle($1)');
src = src.replace(/brakeConditionStyle\(([^,)]+),\s*isDarkMode\)/g, 'brakeConditionStyle($1)');
src = src.replace(/brakeConditionStyle\(([^,)]+),\s*d\)/g, 'brakeConditionStyle($1)');
src = src.replace(/quickCardAccentFromRentalState\(\s*([^,]+),\s*isDarkMode,\s*\)/g, 'quickCardAccentFromRentalState($1)');
src = src.replace(/rentalStatePillClasses\(([^,)]+),\s*isDarkMode\)/g, 'rentalStatePillClasses($1)');
src = src.replace(/dtcFaultCardTone\(([^,)]+),\s*isDarkMode\)/g, 'dtcFaultCardTone($1)');
src = src.replace(/\s*isDarkMode=\{isDarkMode\}\n/g, '\n');
src = src.replace(/ isDarkMode=\{isDarkMode\}/g, '');

// ── Remove modal alias ───────────────────────────────────────────────
src = src.replace(/\s*const d = isDarkMode;\n/g, '\n');

// ── Bulk ternary → token replacements (pick light-branch or unified token) ──
const pairs = [
  // urgency / recommendation chips in DTC knowledge
  [/isDarkMode \? 'bg-red-500\/20 text-red-300' : 'bg-red-100 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-orange-500\/20 text-orange-300' : 'bg-orange-100 text-orange-700'/g, "'sq-chip-warning'"],
  [/isDarkMode \? 'bg-yellow-500\/15 text-yellow-400' : 'bg-yellow-100 text-yellow-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-100 text-blue-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-green-500\/15 text-green-400' : 'bg-green-100 text-green-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-300' : 'bg-gray-100 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'border-indigo-500\/20' : 'border-indigo-200\/60'/g, "'border-border'"],
  [/isDarkMode \? 'text-indigo-300\/80' : 'text-indigo-700\/80'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-500'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-indigo-400' : 'text-indigo-600'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'/g, "'text-[color:var(--brand)] hover:opacity-80'"],
  [/isDarkMode \? 'bg-indigo-500\/15 text-indigo-300' : 'bg-indigo-100 text-indigo-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-300' : 'bg-amber-100 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'/g, "'bg-muted text-foreground hover:bg-muted/80'"],
  [/isDarkMode \? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'/g, "'hover:bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'/g, "'text-muted-foreground hover:text-foreground hover:bg-muted'"],
  // VHC status config backgrounds
  [/isDarkMode \? 'bg-neutral-800\/60 border-neutral-700\/50' : 'bg-gray-50 border-gray-200'/g, "'sq-tone-nodata border border-border'"],
  [/isDarkMode \? 'bg-gradient-to-b from-green-500\/5 to-green-500\/5 border-green-500\/10' : 'bg-gradient-to-b from-green-500\/5 to-green-500\/5 border-green-500\/20'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-gradient-to-b from-amber-500\/10 to-amber-500\/5 border-amber-500\/20' : 'bg-gradient-to-b from-amber-500\/10 to-amber-500\/5 border-amber-500\/20'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-gradient-to-b from-red-500\/10 to-red-500\/5 border-red-500\/20' : 'bg-gradient-to-b from-red-500\/10 to-red-500\/5 border-red-500\/20'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-gradient-to-b from-neutral-800\/60 to-neutral-800\/40 border-neutral-700\/50' : 'bg-gradient-to-b from-neutral-500\/10 to-neutral-500\/5 border-neutral-500\/20'/g, "'sq-tone-nodata border border-border'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400\/80' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-green-300' : 'text-green-800'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-green-200\/80' : 'text-green-700'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-amber-300' : 'text-amber-800'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-200\/80' : 'text-amber-800\/80'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-red-300' : 'text-red-800'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-200\/80' : 'text-red-800\/80'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'bg-red-500\/20 text-red-300' : 'bg-red-500\/10 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-amber-500\/20 text-amber-300' : 'bg-amber-500\/10 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'text-red-400 bg-red-500\/15 ring-1 ring-red-500\/20' : 'text-red-600 bg-red-100 ring-1 ring-red-200'/g, "'sq-tone-critical ring-1 ring-border'"],
  [/isDarkMode \? 'text-amber-400 bg-amber-500\/15 ring-1 ring-amber-500\/20' : 'text-amber-600 bg-amber-100 ring-1 ring-amber-200'/g, "'sq-tone-watch ring-1 ring-border'"],
  [/isDarkMode \? 'text-red-200\/80' : 'text-red-700\/80'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-amber-200\/80' : 'text-amber-700\/80'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-red-500\/20 text-red-400 border-red-500\/30' : 'bg-red-100 text-red-700 border-red-200'/g, "'sq-chip-critical border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/20 text-amber-400 border-amber-500\/30' : 'bg-amber-100 text-amber-700 border-amber-200'/g, "'sq-chip-watch border border-border'"],
  [/isDarkMode \? 'bg-gradient-to-b from-purple-500\/10 to-purple-500\/5 border-purple-500\/20' : 'bg-gradient-to-b from-purple-500\/10 to-purple-500\/5 border-purple-500\/20'/g, "'sq-tone-ai border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/20 text-amber-400' : 'bg-amber-100 text-amber-600'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-purple-500\/20 text-purple-400' : 'bg-purple-100 text-purple-600'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'text-purple-300' : 'text-purple-800'/g, "'text-[color:var(--status-ai)]'"],
  [/isDarkMode \? 'bg-red-500\/10 border-red-500\/20 text-red-300' : 'bg-red-50 border-red-200 text-red-800'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-blue-500\/10 border-blue-500\/20 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'/g, "'sq-tone-info border border-border'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-500'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'bg-amber-500\/20 ring-1 ring-amber-500\/30' : 'bg-amber-100 ring-1 ring-amber-200'/g, "'sq-tone-watch ring-1 ring-border'"],
  [/isDarkMode \? 'bg-emerald-500\/10 ring-1 ring-emerald-500\/20' : 'bg-emerald-50 ring-1 ring-emerald-100'/g, "'sq-tone-success ring-1 ring-border'"],
  [/isDarkMode \? 'bg-white\/\[0\.03\] ring-1 ring-white\/5' : 'bg-black\/\[0\.03\] ring-1 ring-black\/5'/g, "'bg-muted/40 ring-1 ring-border'"],
  [/isDarkMode \? 'bg-amber-500\/20 border-amber-500\/30' : 'bg-amber-100 border-amber-200'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-white\/\[0\.03\] border-white\/5' : 'bg-black\/\[0\.03\] border-black\/5'/g, "'bg-muted/40 border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/15 ring-1 ring-amber-500\/20' : 'bg-amber-50 ring-1 ring-amber-100'/g, "'sq-tone-watch ring-1 ring-border'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-foreground' : 'text-foreground'/g, "'text-foreground'"],
  [/isDarkMode \? 'bg-emerald-500\/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'text-amber-500' : 'text-amber-400'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-600'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-blue-400' : 'bg-blue-500'/g, "'bg-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-blue-500\/10 text-blue-400 border border-blue-500\/30' : 'bg-blue-50 text-blue-600 border border-blue-200'/g, "'sq-chip-info border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400 border-amber-500\/30' : 'bg-amber-50 text-amber-700 border-amber-200'/g, "'sq-chip-watch border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 border-amber-500\/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-red-500\/10 border-red-500\/30 text-red-300' : 'bg-red-50 border-red-200 text-red-700'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400 border-red-500\/30' : 'bg-red-50 text-red-700 border-red-200'/g, "'sq-chip-critical border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400 border-amber-500\/30' : 'bg-amber-50 text-amber-700 border-amber-200'/g, "'sq-chip-watch border border-border'"],
  [/isDarkMode \? 'bg-blue-500\/10 text-blue-400 border-blue-500\/30' : 'bg-blue-50 text-blue-700 border-blue-200'/g, "'sq-chip-info border border-border'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-blue-500\/10 text-blue-400' : 'bg-blue-50 text-blue-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-violet-500\/10 text-violet-400' : 'bg-violet-50 text-violet-700'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-orange-500\/10 text-orange-400' : 'bg-orange-50 text-orange-700'/g, "'sq-chip-warning'"],
  [/isDarkMode \? 'text-blue-400\/80' : 'text-blue-600\/80'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'/g, "'bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'bg-muted\/40 border-border' : 'bg-muted\/30 border-border'/g, "'bg-muted/40 border-border'"],
  [/isDarkMode \? 'text-green-400' : 'text-green-500'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-green-400' : 'text-green-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-red-500\/15 text-red-400' : 'bg-red-100 text-red-600'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-yellow-500\/15 text-yellow-400' : 'bg-yellow-100 text-yellow-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-100 text-blue-600'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-400' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-amber-500\/5 border-amber-500\/20' : 'bg-amber-50 border-amber-200\/60'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-500'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-300' : 'text-amber-700'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-400\/70' : 'text-amber-600\/70'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-green-500\/5 border-green-500\/15' : 'bg-green-50 border-green-200\/60'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'text-green-300' : 'text-green-800'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-green-400\/60' : 'text-green-700\/60'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700\/50' : 'bg-gray-50 border-gray-200'/g, "'bg-muted/50 border border-border'"],
  [/isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-50 text-blue-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-violet-500\/15 text-violet-400' : 'bg-violet-50 text-violet-700'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-neutral-700\/60 text-gray-300' : 'bg-gray-100 text-gray-700'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-blue-400' : 'bg-blue-500'/g, "'bg-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-cyan-500\/10 text-cyan-400' : 'bg-cyan-50 text-cyan-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-green-500\/10 text-green-400' : 'bg-green-50 text-green-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-purple-500\/10 text-purple-400' : 'bg-purple-50 text-purple-700'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-emerald-500\/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-500'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-600'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-blue-500\/10 text-blue-400 border border-blue-500\/30' : 'bg-blue-50 text-blue-700 border border-blue-200'/g, "'sq-chip-info border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400 border border-amber-500\/30' : 'bg-amber-50 text-amber-700 border border-amber-200'/g, "'sq-chip-watch border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/60' : 'bg-amber-400'/g, "'bg-[color:var(--status-watch)]'"],
  // d ? patterns (modal alias)
  [/\(d \? 'text-green-400' : 'text-green-600'\)/g, "'text-[color:var(--status-positive)]'"],
  [/\(d \? 'text-amber-400' : 'text-amber-600'\)/g, "'text-[color:var(--status-watch)]'"],
  [/\(d \? 'text-red-400' : 'text-red-600'\)/g, "'text-[color:var(--status-critical)]'"],
  [/\(d \? 'bg-green-500\/10 text-green-400' : 'bg-green-50 text-green-600'\)/g, "'sq-chip-success'"],
  [/\(d \? 'bg-amber-500\/10 text-amber-400' : 'bg-amber-50 text-amber-600'\)/g, "'sq-chip-watch'"],
  [/\(d \? 'bg-gray-500\/10 text-gray-400' : 'bg-gray-100 text-gray-500'\)/g, "'sq-chip-nodata'"],
  [/\(d \? 'bg-red-500\/10' : 'bg-red-50'\)/g, "'sq-tone-critical'"],
  [/\(d \? 'bg-amber-500\/10' : 'bg-amber-50'\)/g, "'sq-tone-watch'"],
  [/\(d \? 'bg-blue-500\/10' : 'bg-blue-50'\)/g, "'sq-tone-info'"],
  [/\(d \? 'bg-red-500\/10 border border-red-500\/20' : 'bg-red-50 border border-red-200'\)/g, "'sq-tone-critical border border-border'"],
  [/\(d \? 'bg-amber-500\/10 border border-amber-500\/20' : 'bg-amber-50 border border-amber-200'\)/g, "'sq-tone-watch border border-border'"],
  [/\(d \? 'bg-blue-500\/10 border border-blue-500\/20' : 'bg-blue-50 border border-blue-200'\)/g, "'sq-tone-info border border-border'"],
  [/\(d \? 'text-neutral-300' : 'text-gray-700'\)/g, "'text-foreground'"],
  [/\(d \? 'bg-neutral-700' : 'bg-gray-100'\)/g, "'bg-muted'"],
  [/\(d \? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'\)/g, "'sq-chip-neutral'"],
  [/\(d \? 'text-gray-500' : 'text-gray-400'\)/g, "'text-muted-foreground'"],
  [/\(d \? 'text-green-400' : 'text-green-600'\)/g, "'text-[color:var(--status-positive)]'"],
  [/\(d \? 'bg-amber-500\/5 border-amber-500\/20' : 'bg-amber-50\/50 border-amber-200\/60'\)/g, "'sq-tone-watch border border-border'"],
  [/\(d \? 'text-amber-300' : 'text-amber-800'\)/g, "'text-[color:var(--status-watch)]'"],
  [/\(d \? 'text-amber-400\/80' : 'text-amber-700'\)/g, "'text-[color:var(--status-watch)]'"],
  [/\(d \? 'bg-violet-500\/15 text-violet-400 hover:bg-violet-500\/25' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'\)/g, "'sq-tone-ai hover:opacity-90'"],
  [/\(d \? 'bg-blue-500\/15 text-blue-400 hover:bg-blue-500\/25' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'\)/g, "'sq-tone-info hover:opacity-90'"],
  [/\(d \? 'text-amber-300' : 'text-amber-800'\)/g, "'text-[color:var(--status-watch)]'"],
  [/\(d \? 'bg-green-500\/10 border-green-800\/30' : 'bg-green-50 border-green-200'\)/g, "'sq-tone-success border border-border'"],
  [/\(d \? 'bg-amber-500\/10 border-amber-800\/30' : 'bg-amber-50 border-amber-200'\)/g, "'sq-tone-watch border border-border'"],
  [/\(d \? 'bg-red-500\/10 border-red-800\/30' : 'bg-red-50 border-red-200'\)/g, "'sq-tone-critical border border-border'"],
  [/\(d \? 'text-green-400' : 'text-green-700'\)/g, "'text-[color:var(--status-positive)]'"],
  [/\(d \? 'text-amber-400' : 'text-amber-700'\)/g, "'text-[color:var(--status-watch)]'"],
  [/\(d \? 'text-red-400' : 'text-red-700'\)/g, "'text-[color:var(--status-critical)]'"],
  // nested ternary with isDarkMode still inside - battery warning light
  [/isDarkMode\s*\n\s*\? 'bg-amber-500\/15 text-amber-300 border-amber-500\/30'\s*\n\s*: 'bg-amber-50 text-amber-700 border-amber-200'/g, "'sq-chip-watch border border-border'"],
];

for (const [re, rep] of pairs) {
  src = src.replace(re, rep);
}

// d ? status badge patterns in brakes modal
src = src.replace(
  /stateClass === 'MEASURED'\s*\n\s*\? d\s*\n\s*\? 'bg-green-500\/10 text-green-400'\s*\n\s*: 'bg-green-100 text-green-700'/g,
  "stateClass === 'MEASURED'\n                  ? 'sq-chip-success'",
);
src = src.replace(
  /stateClass === 'ESTIMATED'\s*\n\s*\? d\s*\n\s*\? 'bg-blue-500\/10 text-blue-400'\s*\n\s*: 'bg-blue-100 text-blue-700'/g,
  "stateClass === 'ESTIMATED'\n                    ? 'sq-chip-info'",
);
src = src.replace(
  /stateClass === 'WARNING_ONLY'\s*\n\s*\? d\s*\n\s*\? 'bg-amber-500\/10 text-amber-400'\s*\n\s*: 'bg-amber-100 text-amber-700'/g,
  "stateClass === 'WARNING_ONLY'\n                      ? 'sq-chip-watch'",
);
src = src.replace(
  /: d\s*\n\s*\? 'bg-gray-500\/10 text-gray-400'\s*\n\s*: 'bg-gray-100 text-gray-600'/g,
  ": 'sq-chip-nodata'",
);

// Add pattern imports if missing
if (!src.includes("from '../../components/patterns'")) {
  src = src.replace(
    "import { BatteryConditionBars, RestingVoltageBadge } from './BatteryConditionBars';",
    `import { BatteryConditionBars, RestingVoltageBadge } from './BatteryConditionBars';
import {
  PageHeader,
  SectionHeader,
  DataCard,
  MetricCard,
  EmptyState,
  SkeletonCard,
  HealthStatusChip,
  StatusChip,
  PriorityBadge,
  StatusDot,
} from '../../components/patterns';`,
  );
}

// Wrap main view with PageHeader (insert after return opening relative div)
if (!src.includes('<PageHeader')) {
  src = src.replace(
    `  return (
    <div className="relative">`,
    `  return (
    <div className="relative">
      <PageHeader
        title="Vehicle Health"
        eyebrow="Health Center"
        description="AI-assisted diagnostics, live tell-tales, and module health for this vehicle."
        icon={<Icon name="activity" className="w-4 h-4" />}
        actions={
          <button
            type="button"
            onClick={refreshHealth}
            className="p-1.5 rounded-full transition-colors hover:bg-muted text-muted-foreground"
            title="Refresh health data"
          >
            {healthLoading ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="refresh-cw" className="w-4 h-4" />}
          </button>
        }
      />`,
  );
  // Remove duplicate refresh button in VHC card header
  src = src.replace(
    /<button onClick=\{refreshHealth\} className=\{`p-1\.5 rounded-full transition-colors hover:bg-muted text-muted-foreground`\}>\s*\{healthLoading \? <Icon name="loader-2"[^}]+\} : <Icon name="refresh-cw"[^}]+\} \/>\}\s*<\/button>\s*/,
    '',
  );
}

// Wrap VHC left column in DataCard
src = src.replace(
  `        <div className="bg-card border border-border/60 rounded-xl shadow-sm p-5 flex flex-col relative overflow-hidden">`,
  `        <DataCard className="flex flex-col relative overflow-hidden p-0" bodyClassName="p-5 flex flex-col flex-1">`,
);
// Close DataCard - find the matching closing for left column (before Right Column comment)
src = src.replace(
  `          </div>
        </div>

        {/* ─── Right Column: Quick Cards ─── */}`,
  `          </div>
        </DataCard>

        {/* ─── Right Column: Quick Cards ─── */}`,
);

// Replace ML gradient badge with sq-tone-ai
src = src.replace(
  `bg-gradient-to-r from-violet-500 to-purple-600 text-white`,
  `sq-tone-ai`,
);

fs.writeFileSync(filePath, src);
const afterCount = (src.match(/isDarkMode/g) || []).length;
console.log(`isDarkMode: ${beforeCount} → ${afterCount}`);
if (afterCount > 0) {
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('isDarkMode')) console.log(`${i + 1}: ${line.trim()}`);
  });
}
