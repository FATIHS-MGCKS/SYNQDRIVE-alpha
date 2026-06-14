/**
 * Master admin views: isDarkMode → CSS tokens.
 * Run: node scripts/migrate-master-admin-views.mjs
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

const TOKEN_HELPERS = `
/* ── Design-system token helpers ── */
const CARD = 'sq-card overflow-hidden';
const INPUT =
  'w-full px-4 py-2.5 rounded-xl border border-border bg-muted/50 text-sm text-foreground transition-colors outline-none focus:border-[color:var(--brand)] placeholder:text-muted-foreground';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
const HEAD = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit';
const TAB_ACTIVE = 'sq-tab-active flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
const TAB_IDLE = 'sq-tab flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-muted-foreground hover:text-foreground';
`;

const pairs = [
  [/isDarkMode \? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'/g, "'sq-card'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'/g, "'sq-card'"],
  [/isDarkMode \? 'border-neutral-800' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-800' : 'border-gray-100'/g, "'border-border'"],
  [/isDarkMode \? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'/g, "'border-border hover:bg-muted/50'"],
  [/isDarkMode \? 'border-neutral-800 hover:bg-neutral-800' : 'border-gray-50 hover:bg-gray-50'/g, "'border-border hover:bg-muted/50'"],
  [/isDarkMode \? 'text-white' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-100\/80'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-900' : 'bg-gray-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-900' : 'bg-indigo-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-950' : 'bg-gray-50\/30'/g, "'bg-muted/30'"],
  [/isDarkMode \? 'bg-neutral-950' : 'bg-gray-50'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'hover:bg-neutral-800' : 'hover:bg-gray-100'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'hover:bg-neutral-800' : 'hover:bg-gray-50'/g, "'hover:bg-muted/50'"],
  [/isDarkMode \? 'hover:bg-neutral-900' : 'hover:bg-gray-50'/g, "'hover:bg-muted/50'"],
  [/isDarkMode \? 'hover:bg-neutral-700' : 'hover:bg-gray-100'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-indigo-500\/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-red-500\/15 text-red-400' : 'bg-red-50 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-gray-500\/15 text-gray-400' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400' : 'bg-red-50 text-red-600'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-emerald-500\/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'border-neutral-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'/g, "'border-border text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'border-neutral-700 text-gray-300 hover:bg-white\/\[0\.04\]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'/g, "'border-border text-muted-foreground hover:bg-muted/50'"],
  [/isDarkMode \? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'/g, "'text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'/g, "'text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-indigo-400' : 'text-indigo-500'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'text-indigo-400' : 'text-indigo-600'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'bg-black\/70' : 'bg-black\/40'/g, "'bg-black/50'"],
  [/isDarkMode \? 'bg-\[#0d0d1a\]' : 'bg-gray-50'/g, "'bg-muted/30'"],
  [/isDarkMode \? 'bg-neutral-800\/60 border-neutral-700\/50 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'/g, "'bg-muted/50 border-border text-foreground placeholder:text-muted-foreground'"],
  [/isDarkMode \? 'border-indigo-500\/30 text-indigo-400 hover:bg-indigo-500\/10' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'/g, "'border-border text-[color:var(--brand)] hover:bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'/g, "'bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'/g, "'border-border text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'/g, "'bg-card text-foreground shadow-sm ring-1 ring-border'"],
  [/isDarkMode \? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'/g, "'text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700\/50 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-white'/g, "'bg-card border-border text-muted-foreground hover:bg-muted/50'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700\/50' : 'bg-gray-50\/80 border-gray-200'/g, "'bg-muted/50 border-border'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'/g, "'border-border text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-800 hover:bg-neutral-700 text-gray-300' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'/g, "'bg-muted hover:bg-muted/80 text-muted-foreground'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400' : 'bg-red-50 text-red-600'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-emerald-500\/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400' : 'bg-red-50 text-red-700'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400' : 'bg-red-50 text-red-600'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-red-500\/20 text-red-400' : 'bg-red-100 text-red-600'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-indigo-500\/20 text-indigo-300' : 'bg-indigo-50 text-indigo-600'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'/g, "'text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-700'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-800'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-900'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-700'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-800'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-900'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-700'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-800'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-900'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-700' : 'text-gray-300'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-700' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-800' : 'text-gray-200'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-800' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-600'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-700'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-400' : 'text-gray-800'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-700'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-800'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-500' : 'text-gray-900'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-300'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-700'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-800'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-600' : 'text-gray-900'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-700' : 'text-gray-300'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-700' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-800' : 'text-gray-200'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-800' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-600'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-700'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-800'/g, "'text-foreground'"],
];

function migrateFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP ${fileName} (not found)`);
    return;
  }
  let src = fs.readFileSync(filePath, 'utf8');
  const before = (src.match(/isDarkMode/g) || []).length;

  // Remove prop from interfaces
  src = src.replace(/\n\s*isDarkMode: boolean;\n/g, '\n');
  src = src.replace(/,\s*isDarkMode\s*:\s*boolean/g, '');
  src = src.replace(/isDarkMode:\s*boolean,\s*/g, '');

  // Remove from destructuring
  src = src.replace(/\{\s*isDarkMode,\s*/g, '{ ');
  src = src.replace(/,\s*isDarkMode\s*\}/g, ' }');
  src = src.replace(/\(\{\s*isDarkMode\s*\}\)/g, '()');
  src = src.replace(/export function (\w+)\(\{ isDarkMode \}/g, 'export function $1(');

  // Remove prop passing
  src = src.replace(/\s*isDarkMode=\{isDarkMode\}/g, '');
  src = src.replace(/,\s*isDarkMode:\s*boolean/g, '');
  src = src.replace(/\{\s*isDarkMode,\s*/g, '{ ');
  src = src.replace(/,\s*isDarkMode\s*\}/g, ' }');
  src = src.replace(/isDarkMode,\s*/g, '');
  src = src.replace(/,\s*isDarkMode/g, '');

  // Remove card/inputCls factory blocks in main components
  src = src.replace(
    /\s*const card = `rounded-2xl shadow-sm border \$\{[\s\S]*?\}`;\s*/g,
    '',
  );
  src = src.replace(
    /\s*const cardClass = `rounded-2xl shadow-sm border \$\{[\s\S]*?\}`;\s*/g,
    '',
  );
  src = src.replace(
    /\s*const inputCls = `w-full[\s\S]*?`;\s*/g,
    '',
  );
  src = src.replace(
    /\s*const labelCls = `block[\s\S]*?`;\s*/g,
    '',
  );
  src = src.replace(
    /\s*const headCls = `text-xs[\s\S]*?`;\s*/g,
    '',
  );

  // Remove isDarkMode from function type signatures
  src = src.replace(/isDarkMode:\s*boolean;\s*/g, '');
  src = src.replace(/,\s*card:\s*string/g, '');
  src = src.replace(/card:\s*string,\s*/g, '');
  src = src.replace(/,\s*inputCls:\s*string/g, '');
  src = src.replace(/inputCls:\s*string,\s*/g, '');
  src = src.replace(/,\s*labelCls:\s*string/g, '');
  src = src.replace(/labelCls:\s*string,\s*/g, '');
  src = src.replace(/,\s*headCls:\s*string/g, '');
  src = src.replace(/headCls:\s*string,\s*/g, '');

  // Replace ${card} with CARD
  src = src.replace(/\$\{card\}/g, '{CARD}');
  src = src.replace(/\$\{cardClass\}/g, '{CARD}');
  src = src.replace(/className=\{inputCls\}/g, 'className={INPUT}');
  src = src.replace(/className=\{labelCls\}/g, 'className={LABEL}');
  src = src.replace(/className=\{headCls\}/g, 'className={HEAD}');
  src = src.replace(/className=\{`\$\{inputCls\}/g, 'className={`${INPUT}');
  src = src.replace(/className=\{`\$\{INPUT\} pl-/g, 'className={`${INPUT} pl-');
  src = src.replace(/className=\{`\$\{INPUT\} min-/g, 'className={`${INPUT} min-');

  // rowBg helpers
  src = src.replace(
    /const rowBg = \(i: number\) =>[\s\S]*?;\n\n/g,
    '',
  );
  src = src.replace(/\$\{rowBg\(i\)\}/g, "''");
  src = src.replace(/\$\{rowBg\(i\) \?\? ''\}/g, "''");

  // StatusDot in FleetConnection - remove isDarkMode from cfg
  src = src.replace(
    /online:\s*\{ color: 'bg-emerald-500', pulse: true,\s*label: 'Online',\s*badge: isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700' \}/g,
    "online: { color: 'sq-dot-success', pulse: true, label: 'Online', badge: 'sq-chip-success' }",
  );
  src = src.replace(
    /standby:\s*\{ color: 'bg-amber-500',\s*pulse: false, label: 'Standby',\s*badge: isDarkMode \? 'bg-amber-500\/15 text-amber-400'\s*: 'bg-amber-50 text-amber-700' \}/g,
    "standby: { color: 'sq-dot-watch', pulse: false, label: 'Standby', badge: 'sq-chip-watch' }",
  );
  src = src.replace(
    /offline:\s*\{ color: 'bg-red-500',\s*pulse: false, label: 'Offline',\s*badge: isDarkMode \? 'bg-red-500\/15 text-red-400'\s*: 'bg-red-50 text-red-700' \}/g,
    "offline: { color: 'sq-dot-critical', pulse: false, label: 'Offline', badge: 'sq-chip-critical' }",
  );
  src = src.replace(
    /not_connected: \{ color: 'bg-gray-400',\s*pulse: false, label: 'Not Connected', badge: isDarkMode \? 'bg-gray-500\/15 text-gray-400'\s*: 'bg-gray-100 text-gray-500' \}/g,
    "not_connected: { color: 'sq-dot-nodata', pulse: false, label: 'Not Connected', badge: 'sq-chip-neutral' }",
  );

  // Bulk ternaries
  for (const [re, rep] of pairs) {
    src = src.replace(re, rep);
  }

  // Nested ternary tab active states
  src = src.replace(
    /activeTab === t\.id\s*\?\s*isDarkMode\s*\?\s*'[^']+'\s*:\s*'[^']+'\s*:\s*isDarkMode\s*\?\s*'[^']+'\s*:\s*'[^']+'/g,
    "activeTab === t.id ? TAB_ACTIVE : TAB_IDLE",
  );
  src = src.replace(
    /activeTab === id\s*\?\s*\(isDarkMode \? '[^']+' : '[^']+'\)\s*:\s*\(isDarkMode \? '[^']+' : '[^']+'\)/g,
    'activeTab === id ? TAB_ACTIVE : TAB_IDLE',
  );

  // statusBadge map fallbacks
  src = src.replace(
    /return map\[status\] \?\? \(isDarkMode \? '[^']+' : '[^']+'\);/g,
    "return map[status] ?? 'sq-chip-neutral';",
  );
  src = src.replace(
    /return isDarkMode \? 'text-gray-400' : 'text-gray-500';/g,
    "return 'text-muted-foreground';",
  );
  src = src.replace(
    /return isDarkMode \? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500';/g,
    "return 'sq-chip-neutral';",
  );

  // Toggle multi buttons
  src = src.replace(
    /: isDarkMode \? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'/g,
    ": 'border-border text-muted-foreground'",
  );

  // Inject token helpers after first import block if not present
  if (!src.includes('const CARD =')) {
    const importEnd = src.lastIndexOf("from '");
    const lineEnd = src.indexOf('\n', importEnd);
    src = src.slice(0, lineEnd + 1) + TOKEN_HELPERS + src.slice(lineEnd + 1);
  }

  // Add pattern imports
  if (!src.includes("from '../../components/patterns'")) {
    const insertAt = src.indexOf(TOKEN_HELPERS) + TOKEN_HELPERS.length;
    src =
      src.slice(0, insertAt) +
      "\nimport { PageHeader, DataTable, MetricCard, DataCard, EmptyState, StatusChip, SectionHeader } from '../../components/patterns';\n" +
      src.slice(insertAt);
  }

  fs.writeFileSync(filePath, src);
  const after = (src.match(/isDarkMode/g) || []).length;
  console.log(`${fileName}: isDarkMode ${before} → ${after}`);
  if (after > 0) {
    src.split('\n').forEach((line, i) => {
      if (line.includes('isDarkMode')) console.log(`  L${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
}

for (const f of FILES) migrateFile(f);
console.log('Done.');
