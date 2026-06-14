/**
 * InsurancesView: dk/isDarkMode → design tokens + patterns prep.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../src/rental/components/InsurancesView.tsx');
let src = fs.readFileSync(filePath, 'utf8');
const before = (src.match(/\bdk\b|isDarkMode/g) || []).length;

src = src.replace(/\s*isDarkMode: boolean;\n/, '\n');
src = src.replace(
  /export function InsurancesView\(\{ isDarkMode: dk, onNavigateToVehicleDocuments \}/,
  'export function InsurancesView({ onNavigateToVehicleDocuments }',
);

// Remove statusColors — replaced by insuranceStatusTone
src = src.replace(
  /function statusColors\(s: string, dk: boolean\): \{ bg: string; text: string; border: string \} \{[\s\S]*?\n\}\n\n/,
  `function insuranceStatusTone(s: string): import('../../components/patterns').StatusTone {
  switch (s) {
    case 'ACTIVE': return 'success';
    case 'EXPIRING_SOON': return 'warning';
    case 'EXPIRED': return 'critical';
    case 'PENDING_INQUIRY': return 'info';
    default: return 'noData';
  }
}

`,
);

// Remove style tokens + local MetricCard + StatusBadge blocks
src = src.replace(
  /  \/\/ ── Reusable style tokens[\s\S]*?  \/\/ ── Status badge subcomponent[\s\S]*?  \};\n\n/,
  '',
);

// Normalize dk → isDarkMode for bulk replace
src = src.replace(/\bdk\b/g, 'isDarkMode');

const pairs = [
  [/isDarkMode \? 'bg-\[#0f0f1a\]' : 'bg-gray-50'/g, "'bg-background'"],
  [/isDarkMode \? 'bg-\[#1a1a2e\]' : 'bg-white'/g, "'bg-card'"],
  [/isDarkMode \? 'border-white\/10' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'text-white' : 'text-gray-900'/g, "'text-foreground'"],
  [/isDarkMode \? 'text-neutral-400' : 'text-gray-500'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-neutral-500' : 'text-gray-400'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'bg-white\/5' : 'bg-white'/g, "'bg-card'"],
  [/isDarkMode \? 'border-white\/10' : 'border-gray-300'/g, "'border-border/70'"],
  [/isDarkMode \? 'hover:bg-white\/5' : 'hover:bg-gray-50'/g, "'hover:bg-muted/50'"],
  [/isDarkMode \? 'bg-white\/10 hover:bg-white\/15 text-white border border-white\/10' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm'/g, "'sq-btn-secondary'"],
  [/isDarkMode \? 'text-indigo-400' : 'text-indigo-600'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'text-indigo-300' : 'text-indigo-500'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'bg-white\/5' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-white\/\[0\.02\] hover:bg-white\/5' : 'bg-white hover:bg-gray-50'/g, "'bg-card hover:bg-muted/40'"],
  [/isDarkMode \? 'bg-white\/\[0\.03\]' : 'bg-gray-50'/g, "'bg-muted/40'"],
  [/isDarkMode \? 'bg-white\/\[0\.02\]' : 'bg-white'/g, "'bg-card'"],
  [/isDarkMode \? 'bg-white\/10 text-white' : 'bg-white text-gray-900 shadow-sm'/g, "'bg-card text-foreground shadow-[var(--shadow-1)]'"],
  [/isDarkMode \? 'hover:text-white' : 'text-gray-700'/g, "'hover:text-foreground'"],
  [/isDarkMode \? 'bg-white\/5' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-white\/10' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-white\/10 text-neutral-300' : 'bg-gray-100 text-gray-700'/g, "'sq-tone-neutral'"],
  [/isDarkMode \? 'bg-neutral-500\/15 text-neutral-400' : 'bg-gray-100 text-gray-600'/g, "'sq-tone-neutral'"],
  [/isDarkMode \? 'bg-indigo-500\/10' : 'bg-indigo-50'/g, "'bg-[color:var(--brand-soft)]'"],
  [/isDarkMode \? 'bg-indigo-500\/20' : 'bg-indigo-100'/g, "'bg-[color:var(--brand-soft)]'"],
  [/isDarkMode \? 'bg-indigo-500\/15 text-indigo-300' : 'bg-indigo-50 text-indigo-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'ring-indigo-500\/30' : 'ring-indigo-200'/g, "'ring-[color:var(--brand-soft)]'"],
  [/isDarkMode \? 'bg-white\/10 text-neutral-500' : 'bg-gray-200 text-gray-500'/g, "'bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'bg-white\/10' : 'bg-gray-200'/g, "'bg-muted'"],
  [/isDarkMode \? 'border-white\/20' : 'border-gray-300'/g, "'border-border'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400 border border-red-500\/20' : 'bg-red-50 text-red-600 border border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-400 hover:bg-amber-500\/25 border border-amber-500\/20' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'/g, "'sq-tone-watch border border-border hover:opacity-90'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400 border border-amber-500\/20' : 'bg-amber-50 text-amber-700 border border-amber-200'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-emerald-500\/15' : 'bg-emerald-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/15' : 'bg-amber-50'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/15' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-blue-500\/15' : 'bg-blue-50'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-neutral-500\/15' : 'bg-gray-100'/g, "'sq-tone-neutral'"],
  [/isDarkMode \? 'bg-indigo-500\/15' : 'bg-indigo-50'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-purple-500\/15 text-purple-400' : 'bg-purple-50 text-purple-600'/g, "'sq-tone-ai'"],
  [/isDarkMode \? 'bg-cyan-500\/15 text-cyan-400' : 'bg-cyan-50 text-cyan-600'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-600'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-red-500\/15 text-red-400' : 'bg-red-50 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-blue-500\/15 text-blue-400' : 'bg-blue-50 text-blue-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-neutral-500\/15 text-neutral-400' : 'bg-gray-100 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-emerald-500\/10 border-emerald-500\/20' : 'bg-emerald-50 border-emerald-200'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-red-500\/10 border-red-500\/20' : 'bg-red-50 border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400 border border-amber-500\/20' : 'bg-amber-50 text-amber-700 border border-amber-200'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-white\/\[0\.02\] border-white\/10' : 'bg-gray-50 border-gray-200'/g, "'bg-muted/40 border border-border'"],
  [/isDarkMode \? 'bg-indigo-500\/15' : 'bg-indigo-50'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-red-500\/15' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-amber-500\/15' : 'bg-amber-50'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-emerald-500\/15' : 'bg-emerald-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-\[#1a1a2e\]' : 'bg-white'/g, "'bg-card'"],
  [/isDarkMode \? 'border-white\/10' : 'border-gray-200'/g, "'border-border'"],
  [/style=\{\{ borderColor: isDarkMode \? 'rgba\(255,255,255,0\.06\)' : undefined \}\}/g, ''],
  [/\$\{pageBg\}/g, 'bg-background'],
  [/\$\{cardBg\}/g, 'bg-card'],
  [/\$\{cardBorder\}/g, 'border-border'],
  [/\$\{textPrimary\}/g, 'text-foreground'],
  [/\$\{textSecondary\}/g, 'text-muted-foreground'],
  [/\$\{textMuted\}/g, 'text-muted-foreground'],
  [/\$\{inputBg\}/g, 'bg-card'],
  [/\$\{inputBorder\}/g, 'border-border/70'],
  [/\$\{hoverRow\}/g, 'hover:bg-muted/50'],
  [/\$\{btnPrimary\}/g, 'sq-btn-primary'],
  [/\$\{btnSecondary\}/g, 'sq-btn-secondary'],
  [/statusColors\(([^,)]+), isDarkMode\)/g, '/*removed*/'],
  [/\s*const sc = \/\*removed\*\/;\n/g, ''],
];

for (const [re, rep] of pairs) src = src.replace(re, rep);

// Add imports
if (!src.includes("from '../../components/patterns'")) {
  src = src.replace(
    "import { Icon } from './ui/Icon';",
    `import { Icon } from './ui/Icon';
import {
  PageHeader,
  DataCard,
  MetricCard,
  DetailDrawer,
  DataTable,
  EmptyState,
  StatusChip,
  SectionHeader,
  SkeletonMetricGrid,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';`,
  );
  src = src.replace(
    "function insuranceStatusTone(s: string): import('../../components/patterns').StatusTone {",
    'function insuranceStatusTone(s: string): StatusTone {',
  );
}

fs.writeFileSync(filePath, src);
const after = (src.match(/\bdk\b|isDarkMode/g) || []).length;
console.log(`InsurancesView dark refs: ${before} → ${after}`);
if (after > 0) {
  src.split('\n').forEach((line, i) => {
    if (/\bdk\b|isDarkMode/.test(line)) console.log(`${i + 1}: ${line.trim()}`);
  });
}
