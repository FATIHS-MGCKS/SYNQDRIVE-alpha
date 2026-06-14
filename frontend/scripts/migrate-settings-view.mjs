/**
 * SettingsView: isDarkMode → design tokens (prep for patterns).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../src/rental/components/SettingsView.tsx');
let src = fs.readFileSync(filePath, 'utf8');
const before = (src.match(/isDarkMode/g) || []).length;

// Props
src = src.replace(/\s*isDarkMode: boolean;\n/, '\n');
src = src.replace(
  /export function SettingsView\(\{ isDarkMode, activeTab: controlledTab = 'company', onTabChange \}/,
  'export function SettingsView({ activeTab: controlledTab = \'company\', onTabChange }',
);
src = src.replace(/export function StationsTab\(\{ isDarkMode \}/, 'export function StationsTab(');
src = src.replace(/function AccountInformationTab\(\{ isDarkMode \}/, 'function AccountInformationTab(');
src = src.replace(/function CompanyProfileTab\(\{ isDarkMode, orgId \}/, 'function CompanyProfileTab({ orgId }');
src = src.replace(/function FleetConnectionTab\(\{ isDarkMode \}/, 'function FleetConnectionTab(');
src = src.replace(/function BillingTab\(\{ isDarkMode \}/, 'function BillingTab(');
src = src.replace(/function StatusDot\(\{ status, isDarkMode \}/, 'function StatusDot({ status }');

// Bridge dark for unmigrated child tabs
if (!src.includes('useDocumentDark')) {
  src = src.replace(
    "import { useState, useMemo, useEffect, useRef, useCallback } from 'react';",
    "import { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';",
  );
  src = src.replace(
    'function getInitials(name: string | null, email: string): string {',
    `function useDocumentDark(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

function getInitials(name: string | null, email: string): string {`,
  );
  src = src.replace(
    '  const canWriteDataAuth = hasPermission(\'data-authorization\', \'write\');',
    `  const canWriteDataAuth = hasPermission('data-authorization', 'write');
  const bridgeDark = useDocumentDark();`,
  );
  src = src.replace(/isDarkMode=\{isDarkMode\}/g, 'isDarkMode={bridgeDark}');
}

// inputClass blocks
src = src.replace(
  /const inputClass = `w-full px-3 py-2\.5 rounded-xl border text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 \$\{\s*isDarkMode\s*\? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500\/50 focus:ring-1 focus:ring-blue-500\/20'\s*: 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400\/20'\s*\} outline-none`;/g,
  "const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';",
);

src = src.replace(
  /const spinnerClass = isDarkMode \? 'border-blue-400' : 'border-blue-500';/,
  "const spinnerClass = 'border-[color:var(--brand)]';",
);

const pairs = [
  [/isDarkMode \? 'border-neutral-700\/40' : 'border-gray-200\/60'/g, "'border-border/60'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700\/30' : 'bg-muted\/40 border-border'/g, "'bg-muted/40 border-border'"],
  [/isDarkMode \? 'text-blue-400 hover:bg-blue-600\/10' : 'text-\[var\(--brand\)\] hover:bg-\[var\(--brand-soft\)\]'/g, "'text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]'"],
  [/isDarkMode \? 'bg-neutral-700' : 'bg-gray-300'/g, "'bg-muted'"],
  [/isDarkMode \? 'hover:bg-red-500\/10' : ''/g, "'hover:bg-[color:var(--status-critical-soft)]'"],
  [/isDarkMode \? 'text-gray-500 hover:bg-neutral-700' : 'text-gray-400 hover:bg-gray-100'/g, "'text-muted-foreground hover:bg-muted'"],
  [/isDarkMode \? 'border-neutral-700\/50 bg-neutral-800\/30' : 'border-border bg-muted\/40'/g, "'border-border bg-muted/40'"],
  [/isDarkMode \? 'border-neutral-700\/50 text-gray-500 bg-neutral-800\/20' : 'border-border text-muted-foreground bg-muted\/40'/g, "'border-border text-muted-foreground bg-muted/40'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-neutral-700\/30' : 'bg-gray-50\/80 border-gray-100'/g, "'bg-muted/50 border-border'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-500'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'bg-emerald-500\/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-red-500\/15 text-red-400' : 'bg-red-50 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-gray-500\/15 text-gray-400' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'border-blue-400' : 'border-blue-500'/g, "'border-[color:var(--brand)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-500'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? '!border-neutral-600\/60' : '!border-border\/80'/g, "'!border-border/80'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'border-neutral-700\/50' : 'border-gray-200\/50'/g, "'border-border/50'"],
  [/isDarkMode \? 'bg-emerald-500\/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-300' : 'bg-amber-50 text-amber-700'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-300' : 'bg-red-50 text-red-700'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'bg-gray-500\/10 text-gray-400' : 'bg-gray-50 text-gray-600'/g, "'sq-tone-neutral'"],
  [/isDarkMode \? 'border-neutral-700\/50 bg-neutral-800\/40' : 'border-gray-200\/60 bg-gray-50\/80'/g, "'border-border/60 bg-muted/50'"],
  [/isDarkMode \? 'border-amber-500\/40' : 'border-amber-200'/g, "'border-[color:var(--status-watch-soft)]'"],
  [/isDarkMode \? 'text-red-300' : 'text-red-700'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-red-300\/80' : 'text-red-600\/90'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'text-emerald-300' : 'text-emerald-700'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-emerald-200\/85' : 'text-emerald-700\/90'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'/g, "'bg-card border border-border'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'/g, "'bg-card border-border'"],
  [/isDarkMode \? 'hover:bg-neutral-800' : 'hover:bg-gray-100'/g, "'hover:bg-muted'"],
  [/isDarkMode \? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'/g, "'bg-card border-border'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-300' : 'bg-white text-gray-600'/g, "'bg-muted text-muted-foreground'"],
  [/isDarkMode \? 'text-gray-200' : 'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode \? 'bg-blue-500\/15 text-blue-300' : 'bg-blue-100 text-blue-600'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-blue-500\/30 text-blue-200' : 'bg-blue-100 text-blue-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-400 hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'/g, "'bg-muted text-muted-foreground hover:bg-muted/80'"],
  [/isDarkMode \? 'text-amber-300' : 'text-amber-700'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-red-500\/15' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'border-neutral-700' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'bg-neutral-700\/60' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-blue-500\/20 text-blue-300' : 'bg-blue-100 text-blue-700'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'bg-amber-500\/20 text-amber-300' : 'bg-amber-100 text-amber-700'/g, "'sq-tone-watch'"],
  [/isDarkMode\s*\n\s*\? 'bg-neutral-800\/60 border border-neutral-700\/50 text-gray-300 hover:bg-neutral-700\/60'\s*\n\s*: 'bg-white\/80 border border-gray-200 text-gray-700 hover:bg-white hover:shadow-md'/g, "'sq-btn-secondary'"],
  [/isDarkMode\s*\n\s*\? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500\/50 focus:ring-1 focus:ring-blue-500\/20'\s*\n\s*: 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400\/20'/g, "'border-border/70 bg-card text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]'"],
];

for (const [re, rep] of pairs) src = src.replace(re, rep);

// Remove isDarkMode from internal tab calls
src = src.replace(/\{activeTab === 'account' && <AccountInformationTab isDarkMode=\{bridgeDark\} \/>}/, "{activeTab === 'account' && <AccountInformationTab />}");
src = src.replace(/\{activeTab === 'company' && <CompanyProfileTab isDarkMode=\{bridgeDark\} orgId=\{orgId\} \/>}/, "{activeTab === 'company' && <CompanyProfileTab orgId={orgId} />}");
src = src.replace(/\{activeTab === 'fleet-connection' && <FleetConnectionTab isDarkMode=\{bridgeDark\} \/>}/, "{activeTab === 'fleet-connection' && <FleetConnectionTab />}");
src = src.replace(/\{activeTab === 'billing' && <BillingTab isDarkMode=\{bridgeDark\} \/>}/, "{activeTab === 'billing' && <BillingTab />}");

// Add pattern imports
if (!src.includes("from '../../components/patterns'")) {
  src = src.replace(
    "import { LegalDocumentsTab } from './LegalDocumentsTab';",
    `import { LegalDocumentsTab } from './LegalDocumentsTab';
import {
  PageHeader,
  DataCard,
  MetricCard,
  EmptyState,
  StatusChip,
  SectionHeader,
} from '../../components/patterns';`,
  );
}

fs.writeFileSync(filePath, src);
const after = (src.match(/isDarkMode/g) || []).length;
console.log(`SettingsView isDarkMode: ${before} → ${after}`);
if (after > 0) {
  src.split('\n').forEach((line, i) => {
    if (line.includes('isDarkMode')) console.log(`${i + 1}: ${line.trim()}`);
  });
}
