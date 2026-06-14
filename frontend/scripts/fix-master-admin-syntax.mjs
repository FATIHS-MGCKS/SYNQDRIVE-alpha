/**
 * Fix syntax breakage from isDarkMode migration in master admin views.
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

function fix(src) {
  // Broken export signatures
  src = src.replace(/export function (\w+)\(: \w+\)/g, 'export function $1()');

  // Empty prop interfaces
  src = src.replace(/interface \w+Props \{\s*\}\n\n/g, '');

  // {CARD} literal in className
  src = src.replace(/`\{CARD\}/g, '`${CARD}');
  src = src.replace(/className="\{CARD\}/g, 'className={`${CARD}');

  // ${'token'} → token
  src = src.replace(/\$\{'([^']+)'\}/g, '$1');

  // Remove card/inputCls prop drilling - use constants directly
  src = src.replace(/\bcard=\{card\}\s*/g, '');
  src = src.replace(/\binputCls=\{inputCls\}\s*/g, '');
  src = src.replace(/\blabelCls=\{labelCls\}\s*/g, '');
  src = src.replace(/\bheadCls=\{headCls\}\s*/g, '');

  // Fix tab function signatures
  src = src.replace(/function (\w+)\(\{ card \}: \{ card: string \}\)/g, 'function $1()');
  src = src.replace(/function (\w+)\(\{ card, inputCls, labelCls, headCls \}: \{ card: string; inputCls: string; labelCls: string; headCls: string \}\)/g, 'function $1()');
  src = src.replace(/function (\w+)\(\{ card, inputCls, headCls \}: \{ card: string; inputCls: string; headCls: string \}\)/g, 'function $1()');
  src = src.replace(/function (\w+)\(\{ card, inputCls, labelCls, headCls \}: \{[^}]+\}\)/g, 'function $1()');
  src = src.replace(/function (\w+)\(\{ card, inputCls \}: \{[^}]+\}\)/g, 'function $1()');

  // Replace card variable usage with CARD
  src = src.replace(/\$\{card\}/g, '${CARD}');
  src = src.replace(/className=\{card\}/g, 'className={CARD}');
  src = src.replace(/\bcard\b/g, (m, offset, s) => {
    const before = s.slice(Math.max(0, offset - 20), offset);
    if (before.includes('DataTable') || before.includes('MetricCard') || before.includes('DataCard')) return m;
    if (before.includes('const CARD')) return m;
    return 'CARD';
  });

  // inputCls, labelCls, headCls → INPUT, LABEL, HEAD
  src = src.replace(/\binputCls\b/g, 'INPUT');
  src = src.replace(/\blabelCls\b/g, 'LABEL');
  src = src.replace(/\bheadCls\b/g, 'HEAD');

  // Fix LoadingSpinner/Spinner/Detail signatures
  src = src.replace(/function LoadingSpinner\(\)/g, 'function LoadingSpinner()');
  src = src.replace(/function Spinner\(\)/g, 'function Spinner()');
  src = src.replace(/function Detail\(\{ label, value \}: \{ label: string; value: string; \}\)/g, 'function Detail({ label, value }: { label: string; value: string })');

  // Move pattern import after lucide imports
  const patternImport = "import { PageHeader, DataTable, MetricCard, DataCard, EmptyState, StatusChip, SectionHeader } from '../../components/patterns';\n";
  src = src.replace(/\nimport \{ PageHeader[\s\S]*?from '\.\.\/\.\.\/components\/patterns';\n/g, '\n');
  const reactImportIdx = src.indexOf("from 'react'");
  if (reactImportIdx > -1) {
    const lineEnd = src.indexOf('\n', reactImportIdx);
    if (!src.includes("from '../../components/patterns'")) {
      src = src.slice(0, lineEnd + 1) + patternImport + src.slice(lineEnd + 1);
    }
  }

  // Fix merged lines like `useState(...);return (`
  src = src.replace(/\);return \(/g, ');\n\n  return (');

  // StatusDot broken type
  src = src.replace(
    /function StatusDot\(\{ status \}: \{ status: AdminFleetConnectivityVehicle\['connectionStatus'\]; boolean \}\)/,
    "function StatusDot({ status }: { status: AdminFleetConnectivityVehicle['connectionStatus'] })",
  );

  return src;
}

for (const f of FILES) {
  const p = path.join(root, f);
  let src = fs.readFileSync(p, 'utf8');
  src = fix(src);
  fs.writeFileSync(p, src);
  console.log(`fixed ${f}`);
}
