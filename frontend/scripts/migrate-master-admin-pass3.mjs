/**
 * Pass 3: generic isDarkMode ternary → token mapper
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

function mapTernary(dark, light) {
  const d = dark.toLowerCase();
  const l = light.toLowerCase();
  const combo = `${d}|${l}`;
  if (combo.includes('emerald') || combo.includes('green')) {
    if (d.includes('/10') || d.includes('/15') || l.includes('50')) return 'sq-tone-success';
    return 'text-[color:var(--status-positive)]';
  }
  if (combo.includes('red')) {
    if (d.includes('/10') || d.includes('/15') || l.includes('50')) return 'sq-tone-critical';
    return 'text-[color:var(--status-critical)]';
  }
  if (combo.includes('amber') || combo.includes('yellow')) {
    if (d.includes('/10') || d.includes('/15') || l.includes('50')) return 'sq-tone-watch';
    return 'text-[color:var(--status-watch)]';
  }
  if (combo.includes('blue') || combo.includes('indigo') || combo.includes('cyan')) {
    if (d.includes('/10') || d.includes('/15') || l.includes('50')) return 'sq-tone-info';
    return 'text-[color:var(--status-info)]';
  }
  if (combo.includes('purple') || combo.includes('violet')) return 'sq-tone-ai';
  if (combo.includes('teal')) return 'sq-chip-success';
  if (combo.includes('neutral-9') || combo.includes('neutral-8') || combo.includes('gray-50') || combo.includes('gray-100')) {
    if (d.includes('border') || l.includes('border')) return 'border-border';
    if (d.includes('hover')) return 'hover:bg-muted';
    return 'bg-muted/50';
  }
  if (d.includes('white') || l.includes('gray-900') || l.includes('gray-800')) return 'text-foreground';
  if (d.includes('gray-4') || d.includes('gray-5') || l.includes('gray-4') || l.includes('gray-5') || l.includes('gray-6')) return 'text-muted-foreground';
  if (d.includes('border-neutral') || l.includes('border-gray')) return 'border-border';
  if (l.includes('border-gray')) return 'border-border';
  return light || dark;
}

function migrate(src) {
  // ${isDarkMode ? 'a' : 'b'}
  src = src.replace(/\$\{isDarkMode\s*\?\s*'((?:\\'|[^'])*)'\s*:\s*'((?:\\'|[^'])*)'\}/g, (_, a, b) => mapTernary(a, b));
  // isDarkMode ? 'a' : 'b' (no braces)
  src = src.replace(/isDarkMode\s*\?\s*'((?:\\'|[^'])*)'\s*:\s*'((?:\\'|[^'])*)'/g, (_, a, b) => `'${mapTernary(a, b)}'`);
  // (isDarkMode ? 'a' : 'b')
  src = src.replace(/\(isDarkMode\s*\?\s*'((?:\\'|[^'])*)'\s*:\s*'((?:\\'|[^'])*)'\)/g, (_, a, b) => `'${mapTernary(a, b)}'`);

  src = src.replace(/, isDarkMode: boolean/g, '');
  src = src.replace(/isDarkMode: boolean, /g, '');
  src = src.replace(/isDarkMode: boolean/g, '');
  src = src.replace(/\s*isDarkMode=\{isDarkMode\}/g, '');
  src = src.replace(/isDarkMode,\s*/g, '');
  src = src.replace(/,\s*isDarkMode/g, '');

  return src;
}

for (const f of FILES) {
  const p = path.join(root, f);
  let src = fs.readFileSync(p, 'utf8');
  const before = (src.match(/isDarkMode/g) || []).length;
  src = migrate(src);
  fs.writeFileSync(p, src);
  const after = (src.match(/isDarkMode/g) || []).length;
  console.log(`${f}: ${before} → ${after}`);
}
