/**
 * Pass 2: remaining isDarkMode cleanup in master admin views.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../src/master/components');

const FILES = [
  'PartsAccessoriesAdminView.tsx',
  'InsurancesAdminView.tsx',
  'ProspectsView.tsx',
  'SystemMonitoringView.tsx',
  'HighMobilityDataView.tsx',
  'FleetConnectionView.tsx',
  'OrganizationDetailView.tsx',
];

const pairs = [
  [/CARD_CLASS\(isDarkMode\)/g, 'CARD'],
  [/const CARD_CLASS = \([^)]*\) =>[\s\S]*?;\n/g, ''],
  [/const mutedFg = isDarkMode \? '[^']+' : '[^']+';/g, "const mutedFg = 'text-muted-foreground';"],
  [/const tabBg = isDarkMode \? '[^']+' : '[^']+';/g, "const tabBg = 'sq-tab-bar';"],
  [/const tabActive = isDarkMode \? '[^']+' : '[^']+';/g, "const tabActive = TAB_ACTIVE;"],
  [/const tabInactive = isDarkMode \? '[^']+' : '[^']+';/g, "const tabInactive = TAB_IDLE;"],
  [/const bg = isDarkMode \? '[^']+' : '[^']+';/g, "const bg = 'bg-muted/30';"],
  [/const cardBg = isDarkMode \? '[^']+' : '[^']+';/g, "const cardBg = 'sq-card';"],
  [/const textP = isDarkMode \? '[^']+' : '[^']+';/g, "const textP = 'text-foreground';"],
  [/const textM = isDarkMode \? '[^']+' : '[^']+';/g, "const textM = 'text-muted-foreground';"],
  [/isDarkMode \? 'text-gray-100' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-100' : 'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-100' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-neutral-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-neutral-400 hover:text-neutral-200' : 'text-gray-500 hover:text-gray-700'/g, "'text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'text-neutral-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-neutral-500' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-neutral-400' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-600'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'/g, "'text-[color:var(--status-info)] hover:opacity-80'"],
  [/isDarkMode \? 'bg-blue-500\/10' : 'bg-blue-50'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-blue-500\/15' : 'bg-blue-50'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-purple-500\/10 text-purple-400' : 'bg-purple-50 text-purple-600'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-blue-500\/10 text-blue-400' : 'bg-blue-50 text-blue-600'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700\/60' : 'bg[^']+'/g, "'sq-card'"],
  [/isDarkMode \? 'bg-neutral-800\/30 border-neutral-700' : 'bg-gray-50 border-gray-200'/g, "'bg-muted/50 border-border'"],
  [/isDarkMode \? 'bg-neutral-800\/30' : 'bg-gray-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'/g, "'bg-muted/50 border-border'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'/g, "'bg-muted/50 border-border'"],
  [/isDarkMode \? 'bg-neutral-800 hover:bg-neutral-700 text-gray-200' : 'bg-white hover:bg-gray-50 border[^']+'/g, "'bg-muted hover:bg-muted/80 text-foreground border-border'"],
  [/isDarkMode \? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-200[^']+'/g, "'hover:bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100[^']+'/g, "'hover:bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'hover:bg-neutral-800\/50' : 'hover:bg-gray-50'/g, "'hover:bg-muted/50'"],
  [/isDarkMode \? 'border-neutral-800\/50 hover:bg-neutral-800\/20' : 'border-gray-100[^']+'/g, "'border-border hover:bg-muted/50'"],
  [/isDarkMode \? 'border-neutral-800 hover:bg-neutral-800\/30' : 'border-gray-100[^']+'/g, "'border-border hover:bg-muted/50'"],
  [/isDarkMode \? 'border-neutral-700\/60' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-700' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-700\/50' : 'border-gray-200\/50'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-800' : 'border-gray-100'/g, "'border-border'"],
  [/isDarkMode \? 'bg-neutral-800\/30' : 'bg-gray-50\/50'/g, "'bg-muted/30'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-400' : 'bg-gray-200 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-blue-50'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-neutral-950 border border-neutral-800' : 'bg-gray-50 border border-gray-200'/g, "'bg-muted/50 border border-border'"],
  [/isDarkMode \? 'bg-neutral-950' : 'bg-gray-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-red-500\/5 border border-red-500\/20' : 'bg-red-50[^']+'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'text-red-400\/80' : 'text-red-600\/80'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-500'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-500'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-700'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-500'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-300' : 'text-amber-700'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-emerald-500\/10 text-emerald-300' : 'bg-emerald-50[^']+'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-300' : 'bg-amber-50[^']+'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-300' : 'bg-red-50[^']+'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-gray-500\/10 text-gray-400' : 'bg-gray-50 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-gray-500\/15 text-gray-400' : 'bg-gray-100 text-gray-400'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-gray-500\/10 text-gray-400' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400' : 'bg-amber-50 text-amber-600'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400' : 'bg-red-50 text-red-600'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-red-500\/15 text-red-400' : 'bg-red-50 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-purple-500\/15 text-purple-400' : 'bg-purple-50 text-purple-600'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-purple-500\/10' : 'bg-purple-50'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-emerald-500\/10' : 'bg-emerald-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/10' : 'bg-amber-50'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/10' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-neutral-800\/80 text-gray-300 border border-neutral-700' : 'bg-gray-50 text-gray-600 border border-gray-200'/g, "'bg-muted text-muted-foreground border border-border'"],
  [/isDarkMode \? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-700'/g, "'bg-muted text-foreground'"],
  [/isDarkMode \? 'bg-neutral-800 text-neutral-400' : 'bg-gray-100 text-gray-600'/g, "'bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'/g, "'sq-card border-border'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'/g, "'sq-card border-border'"],
  [/isDarkMode \? 'border-neutral-700 text-neutral-400 hover:border-neutral-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'/g, "'border-border text-muted-foreground hover:border-[color:var(--brand)]'"],
  [/isDarkMode \? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'/g, "'hover:bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'bg-violet-900\/20 border border-violet-800\/40' : 'bg-violet-50[^']+'/g, "'sq-tone-ai border border-border'"],
  [/isDarkMode \? 'bg-red-900\/20 border border-red-800\/40' : 'bg-red-50[^']+'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-yellow-900\/20 border border-yellow-800\/40' : 'bg-yellow-50[^']+'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-indigo-900\/20 border border-indigo-800\/40' : 'bg-indigo-50[^']+'/g, "'sq-tone-info border border-border'"],
  [/isDarkMode \? 'bg-blue-900\/20 border border-blue-800\/30' : 'bg-blue-50[^']+'/g, "'sq-tone-info border border-border'"],
  [/isDarkMode \? 'bg-purple-900\/10 border-purple-800\/30' : 'bg-purple-50[^']+'/g, "'sq-tone-ai border border-border'"],
  [/isDarkMode \? 'bg-amber-900\/15 border-amber-800\/30' : 'bg-amber-50[^']+'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'/g, "'bg-muted/50 border-border'"],
  [/isDarkMode \? 'border-neutral-700' : 'border-gray-100'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-800' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'bg-gray-600' : 'bg-gray-300'/g, "'bg-muted-foreground/40'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-500'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-amber-500' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'hover:bg-neutral-800' : 'hover:bg-gray-100'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'hover:bg-neutral-700' : 'hover:bg-gray-200'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'hover:bg-neutral-800' : 'hover:bg-neutral-700'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'bg-indigo-500\/10' : 'bg-indigo-50'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-purple-500\/10' : 'bg-purple-50'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-emerald-500\/10' : 'bg-emerald-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/10' : 'bg-amber-50'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/10' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-neutral-800\/60 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'/g, "'bg-muted text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? '!border-neutral-600\/60' : '!border-gray-300'/g, "'!border-border'"],
  [/isDarkMode \? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'/g, "'border-border hover:bg-muted/50'"],
  [/isDarkMode \? 'border-neutral-800 hov[^']+' : 'border-gray-100[^']+'/g, "'border-border hover:bg-muted/50'"],
  [/isDarkMode \? 'text-teal-400' : 'text-teal-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-teal-900\/40 text-teal-300' : 'bg-teal-50 text-teal-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-indigo-900\/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-300' : 'text-red-700'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-emerald-300' : 'text-emerald-700'/g, "'text-[color:var(--status-positive)]'"],
];

function migrateFile(fileName) {
  const filePath = path.join(root, fileName);
  let src = fs.readFileSync(filePath, 'utf8');
  const before = (src.match(/isDarkMode/g) || []).length;

  for (const [re, rep] of pairs) {
    src = src.replace(re, rep);
  }

  // Remove isDarkMode from function signatures
  src = src.replace(/function (\w+)\(\{ ([^}]*), isDarkMode \}/g, 'function $1({ $2 }');
  src = src.replace(/function (\w+)\(\{ isDarkMode \}/g, 'function $1()');
  src = src.replace(/function (\w+)\(\{ isDarkMode, ([^}]+) \}/g, 'function $1({ $2 }');
  src = src.replace(/: \{ isDarkMode: boolean \}/g, '');
  src = src.replace(/, isDarkMode: boolean/g, '');
  src = src.replace(/isDarkMode: boolean, /g, '');
  src = src.replace(/isDarkMode: boolean;/g, '');
  src = src.replace(/\s*isDarkMode=\{isDarkMode\}/g, '');
  src = src.replace(/isDarkMode,\s*/g, '');
  src = src.replace(/,\s*isDarkMode/g, '');

  // Nested ternary cleanup
  src = src.replace(
    /ph\.successRate >= 95 \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*ph\.successRate >= 80 \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*\(isDarkMode \? '[^']+' : '[^']+'\)/g,
    "ph.successRate >= 95 ? 'text-[color:var(--status-positive)]' : ph.successRate >= 80 ? 'text-[color:var(--status-watch)]' : 'text-[color:var(--status-critical)]'",
  );
  src = src.replace(
    /v\.connectionStatus === 'online' \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*v\.connectionStatus === 'standby' \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*v\.connectionStatus === 'offline' \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*\(isDarkMode \? '[^']+' : '[^']+'\)/g,
    "v.connectionStatus === 'online' ? 'sq-chip-success' : v.connectionStatus === 'standby' ? 'sq-chip-watch' : v.connectionStatus === 'offline' ? 'sq-chip-critical' : 'sq-chip-neutral'",
  );
  src = src.replace(
    /v\.signalCoverage >= 70 \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*v\.signalCoverage >= 40 \? \(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*\(isDarkMode \? '[^']+' : '[^']+'\)/g,
    "v.signalCoverage >= 70 ? 'text-[color:var(--status-positive)]' : v.signalCoverage >= 40 ? 'text-[color:var(--status-watch)]' : 'text-[color:var(--status-critical)]'",
  );
  src = src.replace(
    /d\.pollFailure24h > 0 \? \(isDarkMode \? '[^']+' : '[^']+'\) : '[^']+'/g,
    "d.pollFailure24h > 0 ? 'text-[color:var(--status-critical)]' : 'text-muted-foreground'",
  );

  // inputCls local definitions
  src = src.replace(
    /const inputCls = `px-3 py-2 rounded-lg border text-sm \$\{isDarkMode \? '[^']+' : '[^']+'\}`;/g,
    'const inputCls = INPUT;',
  );
  src = src.replace(
    /const selectCls = `px-2 py-1\.5 rounded-lg border text-xs \$\{isDarkMode \? '[^']+' : '[^']+'\}`;/g,
    'const selectCls = INPUT;',
  );

  // stat bg in org detail
  src = src.replace(/bg: isDarkMode \? 'bg-indigo-500\/10' : 'bg-indigo-50'/g, "bg: 'sq-tone-brand'");
  src = src.replace(/bg: isDarkMode \? 'bg-purple-500\/10' : 'bg-purple-50'/g, "bg: 'sq-tone-ai'");
  src = src.replace(/bg: isDarkMode \? 'bg-emerald-500\/10' : 'bg-emerald-50'/g, "bg: 'sq-tone-success'");
  src = src.replace(/bg: isDarkMode \? 'bg-blue-500\/10' : 'bg-blue-50'/g, "bg: 'sq-tone-info'");

  // KPI cls patterns in FleetConnection
  src = src.replace(/cls: isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-50 text-blue-700'/g, "cls: 'sq-tone-info'");
  src = src.replace(/cls: isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "cls: 'sq-tone-success'");
  src = src.replace(/cls: isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-700'/g, "cls: 'sq-chip-watch'");
  src = src.replace(/cls: isDarkMode \? 'bg-red-500\/15 text-red-400' : 'bg-red-50 text-red-700'/g, "cls: 'sq-chip-critical'");
  src = src.replace(/cls: isDarkMode \? 'bg-purple-500\/15 text-purple-400' : 'bg-purple-50 text-purple-700'/g, "cls: 'sq-tone-ai'");
  src = src.replace(/cls: isDarkMode \? 'bg-cyan-500\/15 text-cyan-400' : 'bg-cyan-50 text-cyan-700'/g, "cls: 'sq-tone-info'");

  // Multiline isDarkMode ternaries - generic fallback
  src = src.replace(/\?\s*\(isDarkMode\s*\?[^)]+\)\s*:\s*\(isDarkMode\s*\?[^)]+\)/g, (m) => {
    if (m.includes('emerald')) return "? 'sq-chip-success' : 'sq-chip-neutral'";
    if (m.includes('amber')) return "? 'sq-chip-watch' : 'sq-chip-neutral'";
    if (m.includes('red')) return "? 'sq-chip-critical' : 'sq-chip-neutral'";
    return "? 'text-foreground' : 'text-muted-foreground'";
  });

  // Standalone isDarkMode lines (broken multiline)
  src = src.replace(/\n\s*isDarkMode\s*\n\s*\?/g, '\n                  ?');
  src = src.replace(/\n\s*: isDarkMode\s*\n\s*\?/g, '\n                  :');

  fs.writeFileSync(filePath, src);
  const after = (src.match(/isDarkMode/g) || []).length;
  console.log(`${fileName}: ${before} → ${after}`);
  if (after > 0) {
    src.split('\n').forEach((line, i) => {
      if (line.includes('isDarkMode')) console.log(`  L${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}

for (const f of FILES) migrateFile(f);
