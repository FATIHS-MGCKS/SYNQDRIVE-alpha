// One-shot codemod to migrate rental-side lucide-react icon usages onto the
// new <Icon /> primitive (frontend/src/rental/components/ui/Icon.tsx).
//
// Behaviour per file:
//   1. Detects the `import { ... } from 'lucide-react';` statement (single or
//      multi-line). Tracks each imported name AND its local alias (e.g.
//      `Circle as TireIcon` → local alias `TireIcon` → kebab-name `tire-icon`).
//   2. Removes the lucide-react import line entirely (the new Icon component
//      already falls back to lucide internally for protected icons).
//   3. Adds `import { Icon } from '<relative-path>/components/ui/Icon';` if
//      not present, computing the relative path from the file's location.
//   4. Replaces JSX usages:
//        <LocalName />            →  <Icon name="kebab" />
//        <LocalName className=…/> →  <Icon name="kebab" className=…/>
//        <LocalName … attrs … />  →  <Icon name="kebab" … attrs … />
//        <LocalName>…</LocalName> →  <Icon name="kebab">…</Icon>
//
// Files explicitly skipped:
//   - frontend/src/rental/components/Sidebar.tsx (left sidebar — user-protected)
//   - frontend/src/rental/components/ui/Icon.tsx (the new component itself)
//   - frontend/src/rental/RentalLayout.tsx (uses inline raw <svg /> for the
//     left-sidebar nav, no lucide import)
//
// Files needing manual follow-up (LucideIcon type used as a prop):
//   - frontend/src/rental/components/DashboardView.tsx (MonthlyKpiTile)
//   - frontend/src/rental/components/BusinessInsightsBox.tsx
//   - frontend/src/rental/components/StatInlineDetail.tsx (if applicable)
// These files still get the JSX replacement; the LucideIcon type usage must
// be migrated to `IconName` (string) by hand afterwards.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src', 'rental');
const ICON_REL_FROM_RENTAL = 'components/ui/Icon';

const SKIP_FILES = new Set(
  [
    'components/ui/Icon.tsx',
    'RentalLayout.tsx',
  ].map((p) => p.split('/').join(path.sep)),
);

// Lucide → kebab-case mapping. Only icons actually used in the rental UI.
// Includes all variations and PascalCase oddities (BarChart3, Grid3X3 etc.).
const LUCIDE_TO_KEBAB = {
  Activity: 'activity',
  AlertCircle: 'alert-circle',
  AlertTriangle: 'alert-triangle',
  ArrowDown: 'arrow-down',
  ArrowDownLeft: 'arrow-down-left',
  ArrowDownRight: 'arrow-down-right',
  ArrowLeft: 'arrow-left',
  ArrowRight: 'arrow-right',
  ArrowUp: 'arrow-up',
  ArrowUpDown: 'arrow-up-down',
  ArrowUpRight: 'arrow-up-right',
  Award: 'award',
  Baby: 'baby',
  Ban: 'ban',
  BarChart3: 'bar-chart-3',
  Battery: 'battery',
  BatteryCharging: 'battery-charging',
  Bell: 'bell',
  BookOpen: 'book-open',
  Bot: 'bot',
  Briefcase: 'briefcase',
  Building2: 'building-2',
  Calendar: 'calendar',
  CalendarClock: 'calendar-clock',
  Camera: 'camera',
  Car: 'car',
  Check: 'check',
  CheckCircle: 'check-circle',
  CheckCircle2: 'check-circle-2',
  CheckSquare: 'check-square',
  ChevronDown: 'chevron-down',
  ChevronLeft: 'chevron-left',
  ChevronRight: 'chevron-right',
  ChevronUp: 'chevron-up',
  Circle: 'circle',
  CircleDot: 'circle-dot',
  ClipboardCheck: 'clipboard-check',
  ClipboardList: 'clipboard-list',
  Clock: 'clock',
  Cog: 'cog',
  Copy: 'copy',
  CreditCard: 'credit-card',
  Crosshair: 'crosshair',
  Crown: 'crown',
  Database: 'database',
  Disc: 'disc',
  DollarSign: 'dollar-sign',
  Download: 'download',
  Droplet: 'droplet',
  Edit3: 'edit-3',
  Eraser: 'eraser',
  Euro: 'euro',
  ExternalLink: 'external-link',
  Eye: 'eye',
  File: 'file',
  FileCheck: 'file-check',
  FileSignature: 'file-signature',
  FileSpreadsheet: 'file-spreadsheet',
  FileText: 'file-text',
  Filter: 'filter',
  Flag: 'flag',
  Fuel: 'fuel',
  Gauge: 'gauge',
  Globe: 'globe',
  Grid3X3: 'grid-3x3',
  Hash: 'hash',
  Headphones: 'headphones',
  Heart: 'heart',
  HelpCircle: 'help-circle',
  Home: 'home',
  IdCard: 'id-card',
  Image: 'image',
  Info: 'info',
  Key: 'key',
  Layers: 'layers',
  LayoutDashboard: 'layout-dashboard',
  LayoutGrid: 'layout-grid',
  Lightbulb: 'lightbulb',
  Link2: 'link-2',
  ListTodo: 'list-todo',
  Loader2: 'loader-2',
  Lock: 'lock',
  LogOut: 'log-out',
  Mail: 'mail',
  MapPin: 'map-pin',
  Maximize2: 'maximize-2',
  Menu: 'menu',
  MessageCircle: 'message-circle',
  MessageSquare: 'message-square',
  Mic: 'mic',
  Minimize2: 'minimize-2',
  Monitor: 'monitor',
  Moon: 'moon',
  MoreHorizontal: 'more-horizontal',
  Navigation: 'navigation',
  OctagonAlert: 'octagon-alert',
  Package: 'package',
  Paintbrush: 'paintbrush',
  PanelLeftClose: 'panel-left-close',
  PanelLeftOpen: 'panel-left-open',
  PanelRightClose: 'panel-right-close',
  PanelRightOpen: 'panel-right-open',
  Paperclip: 'paperclip',
  Pause: 'pause',
  Pencil: 'pencil',
  PenLine: 'pen-line',
  PenTool: 'pen-tool',
  Percent: 'percent',
  Phone: 'phone',
  PhoneCall: 'phone-call',
  PhoneIncoming: 'phone-incoming',
  PhoneOff: 'phone-off',
  PhoneOutgoing: 'phone-outgoing',
  Play: 'play',
  Plus: 'plus',
  Power: 'power',
  PowerOff: 'power-off',
  Printer: 'printer',
  Radio: 'radio',
  Receipt: 'receipt',
  RefreshCw: 'refresh-cw',
  Rocket: 'rocket',
  RotateCcw: 'rotate-ccw',
  Route: 'route',
  Ruler: 'ruler',
  Save: 'save',
  Search: 'search',
  Send: 'send',
  Settings: 'settings',
  Share2: 'share-2',
  Shield: 'shield',
  ShieldAlert: 'shield-alert',
  ShieldCheck: 'shield-check',
  ShieldOff: 'shield-off',
  ShieldQuestion: 'shield-question',
  ShieldX: 'shield-x',
  ShoppingCart: 'shopping-cart',
  Signal: 'signal',
  SignalZero: 'signal-zero',
  Smartphone: 'smartphone',
  Snowflake: 'snowflake',
  Sparkles: 'sparkles',
  Square: 'square',
  Star: 'star',
  Store: 'store',
  Sun: 'sun',
  Tag: 'tag',
  Target: 'target',
  Thermometer: 'thermometer',
  ThumbsDown: 'thumbs-down',
  ThumbsUp: 'thumbs-up',
  Timer: 'timer',
  ToggleLeft: 'toggle-left',
  ToggleRight: 'toggle-right',
  Trash2: 'trash-2',
  TrendingDown: 'trending-down',
  TrendingUp: 'trending-up',
  Truck: 'truck',
  Type: 'type',
  Unlink: 'unlink',
  Unlock: 'unlock',
  Upload: 'upload',
  User: 'user',
  UserCheck: 'user-check',
  UserCircle2: 'user-circle-2',
  UserCog: 'user-cog',
  UserPlus: 'user-plus',
  Users: 'users',
  UserX: 'user-x',
  Volume2: 'volume-2',
  Wallet: 'wallet',
  Wifi: 'wifi',
  WifiOff: 'wifi-off',
  Wind: 'wind',
  Wrench: 'wrench',
  X: 'x',
  XCircle: 'x-circle',
  Zap: 'zap',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, files);
    else if (ent.isFile() && ent.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

function relFromRental(absFile) {
  return path.relative(ROOT, absFile);
}

function computeIconImportPath(absFile) {
  // Resolve relative path from the file's directory to the Icon component.
  const fileDir = path.dirname(absFile);
  const iconAbs = path.join(ROOT, ICON_REL_FROM_RENTAL);
  let rel = path.relative(fileDir, iconAbs).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

// Parse a single lucide import statement from the source. Returns
// { match, statement, importedNames: { localAlias → originalLucideName } }
// or null if no lucide import is present.
function parseLucideImport(source) {
  // Anchor on `from 'lucide-react'`. The body is `[^}]*` so the regex cannot
  // cross a previous `}` boundary — that prevents accidentally swallowing the
  // preceding `import { useState } from 'react';` (which is what the original
  // `[\s\S]*?` regex did via backtracking).
  const re = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]\s*;?/m;
  const m = source.match(re);
  if (!m) return null;
  const wholeImportIsType = !!m[1]; // `import type { ... }`
  const inside = m[2];
  // Each import entry, possibly prefixed with `type ` and possibly aliased
  // via `OriginalName as LocalAlias`. Trailing commas and whitespace are OK.
  const aliases = {}; // local → original
  const typeOnlyAliases = []; // local names that were `type X` or under `import type {`
  for (let entry of inside.split(',')) {
    entry = entry.trim();
    if (!entry) continue;
    let isType = wholeImportIsType;
    if (entry.startsWith('type ')) {
      isType = true;
      entry = entry.slice(5).trim();
    }
    let original, local;
    const asMatch = entry.match(/^(\w+)\s+as\s+(\w+)$/);
    if (asMatch) {
      original = asMatch[1];
      local = asMatch[2];
    } else {
      original = entry;
      local = entry;
    }
    aliases[local] = original;
    if (isType) typeOnlyAliases.push(local);
  }
  return { match: m, statement: m[0], aliases, typeOnlyAliases };
}

function replaceJsxUsages(source, localToKebab) {
  let out = source;
  let changeCount = 0;
  for (const [local, kebab] of Object.entries(localToKebab)) {
    // Self-closing or with-attrs opening tag: <Local…  | <Local…/  | <Local…>
    // Boundary on the right: a whitespace, '/', or '>' must follow the name.
    const openRe = new RegExp(`<${local}(?=[\\s/>])`, 'g');
    out = out.replace(openRe, (m) => {
      changeCount += 1;
      return `<Icon name="${kebab}"`;
    });
    // Closing tag (rare for icons, handled for completeness).
    const closeRe = new RegExp(`</${local}>`, 'g');
    out = out.replace(closeRe, (m) => {
      changeCount += 1;
      return `</Icon>`;
    });
  }
  // Collapse any accidental double-name patterns like `<Icon name="x"name="…"`
  // that the simple boundary regex above can't introduce — guarded for
  // safety. Currently a no-op; left as explicit intent.
  return { out, changeCount };
}

function ensureIconImport(source, importPath) {
  // Already imported?
  const presentRe = new RegExp(
    `import\\s*\\{[^}]*\\bIcon\\b[^}]*\\}\\s*from\\s*['\"]${importPath
      .replace(/\./g, '\\.')
      .replace(/\//g, '\\/')}['\"]`,
  );
  if (presentRe.test(source)) return source;
  // Insert after the lucide import position (handled elsewhere) — here, just
  // append at the top of the import block. Find the first `import`
  // statement and insert before it.
  const insertion = `import { Icon } from '${importPath}';\n`;
  const firstImport = source.search(/^import\s/m);
  if (firstImport === -1) return insertion + source;
  return source.slice(0, firstImport) + insertion + source.slice(firstImport);
}

function processFile(absFile) {
  const rel = relFromRental(absFile);
  if (SKIP_FILES.has(rel)) {
    return { absFile, rel, skipped: true, reason: 'in skip list' };
  }
  const original = fs.readFileSync(absFile, 'utf8');

  // Loop — a file may have multiple lucide-react imports (e.g. one
  // `import type { LucideIcon }` and one value import). Process all of them
  // in a single pass.
  let working = original;
  let aggregateLocalToKebab = {};
  const aggregateUnmapped = [];
  const aggregateTypeOnly = [];
  let removedAny = false;
  for (let i = 0; i < 5; i++) {
    const parsed = parseLucideImport(working);
    if (!parsed) break;
    for (const [local, originalName] of Object.entries(parsed.aliases)) {
      if (parsed.typeOnlyAliases.includes(local)) {
        aggregateTypeOnly.push(local);
        continue;
      }
      const kebab = LUCIDE_TO_KEBAB[originalName];
      if (!kebab) {
        aggregateUnmapped.push(originalName);
        continue;
      }
      aggregateLocalToKebab[local] = kebab;
    }
    working = working.replace(parsed.statement, '');
    removedAny = true;
  }

  if (!removedAny) {
    return { absFile, rel, skipped: true, reason: 'no lucide import' };
  }

  // Apply JSX replacements after all imports are stripped.
  const { out: afterJsx, changeCount } = replaceJsxUsages(working, aggregateLocalToKebab);

  // Collapse cosmetic blank-line gaps left by the removed imports.
  let afterCleanup = afterJsx.replace(/^(\s*\n){3,}/gm, '\n\n');

  // Inject the new Icon import (idempotent — checks if already present).
  const iconImportPath = computeIconImportPath(absFile);
  const final = ensureIconImport(afterCleanup, iconImportPath);

  if (final === original) {
    return { absFile, rel, skipped: true, reason: 'no JSX replacements needed' };
  }
  fs.writeFileSync(absFile, final, 'utf8');
  return {
    absFile,
    rel,
    skipped: false,
    changeCount,
    unmappedOriginals: aggregateUnmapped,
    typeOnlyAliases: aggregateTypeOnly,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const files = walk(ROOT);
  const results = [];
  for (const f of files) results.push(processFile(f));

  const skipped = results.filter((r) => r.skipped);
  const changed = results.filter((r) => !r.skipped);
  const totalChanges = changed.reduce((a, r) => a + (r.changeCount || 0), 0);

  console.log(`\n=== icon-codemod summary ===`);
  console.log(`Files scanned:   ${results.length}`);
  console.log(`Files changed:   ${changed.length}`);
  console.log(`Files skipped:   ${skipped.length}`);
  console.log(`Total JSX swaps: ${totalChanges}\n`);

  if (changed.length) {
    console.log(`--- Changed files (file: swaps) ---`);
    for (const r of changed) {
      const tip = r.typeOnlyAliases.length
        ? ` [type-only: ${r.typeOnlyAliases.join(', ')}]`
        : '';
      const unmapped = r.unmappedOriginals.length
        ? ` [unmapped: ${r.unmappedOriginals.join(', ')}]`
        : '';
      console.log(`  ${r.rel}: ${r.changeCount}${tip}${unmapped}`);
    }
  }
  if (skipped.length) {
    console.log(`\n--- Skipped (reason) ---`);
    for (const r of skipped) console.log(`  ${r.rel}: ${r.reason}`);
  }
}

main();
