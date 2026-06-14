import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/NewBookingView.tsx');
let s = fs.readFileSync(filePath, 'utf8');

// className={`foo 'bar'`} → className="foo bar"  OR  className={`foo ${x} bar`}
s = s.replace(/className=\{`([^`]+)`\}/g, (match, inner) => {
  const cleaned = inner
    .replace(/'([^']+)'/g, '$1')
    .replace(/\$\{\s*'([^']+)'\s*\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.includes('${')) {
    return `className={\`${cleaned}\`}`;
  }
  return `className="${cleaned}"`;
});

// className={'token'} → className="token"
s = s.replace(/className=\{'([^']+)'\}/g, 'className="$1"');

// Remove isDarkMode from interface
s = s.replace(/\s*isDarkMode: boolean;\n/, '\n');

// Remaining isDarkMode ternaries
s = s.replace(
  /: isDarkMode\s*\?\s*'bg-neutral-800 border border-neutral-700 text-gray-600 cursor-not-allowed'\s*:\s*'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'/g,
  ": 'bg-muted border border-border text-muted-foreground cursor-not-allowed'",
);
s = s.replace(
  /: isDarkMode\s*\?\s*'border-red-900\/30 bg-neutral-900\/40 opacity-70 hover:border-red-800\/40 cursor-pointer'\s*:\s*'border-red-200\/50 bg-red-50\/20 opacity-70 hover:border-red-300\/50 cursor-pointer'/g,
  ": 'border-[color:var(--status-critical)]/30 bg-muted/40 opacity-70 hover:border-[color:var(--status-critical)]/50 cursor-pointer'",
);

// Gradients → solid brand/status tokens
s = s.replace(
  /'bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white shadow-md hover:shadow-lg'/g,
  "'bg-[color:var(--status-ai)] text-primary-foreground hover:opacity-90 shadow-sm'",
);
s = s.replace(
  /bg-gradient-to-r from-violet-500 to-violet-400/g,
  'bg-[color:var(--status-ai)]',
);
s = s.replace(
  /bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700/g,
  'bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]',
);
s = s.replace(
  /'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg'/g,
  "'bg-[color:var(--status-positive)] hover:opacity-90 hover:shadow-lg'",
);

// Brand/success buttons use tokens
s = s.replace(/bg-blue-600 text-white/g, 'bg-[color:var(--brand)] text-primary-foreground');
s = s.replace(/hover:bg-blue-700/g, 'hover:bg-[color:var(--brand-hover)]');
s = s.replace(/bg-green-600 text-white/g, 'bg-[color:var(--status-positive)] text-primary-foreground');
s = s.replace(/hover:bg-green-700/g, 'hover:opacity-90');

// Add pattern imports
if (!s.includes("from '../../components/patterns'")) {
  s = s.replace(
    "import { RentalHealthBadge } from './rental-health/RentalHealthBadge';",
    `import { RentalHealthBadge } from './rental-health/RentalHealthBadge';
import {
  PageHeader,
  DataCard,
  SectionHeader,
  StatusChip,
  EmptyState,
  SkeletonCard,
} from '../../components/patterns';`,
  );
}

fs.writeFileSync(filePath, s);
console.log('isDarkMode:', (s.match(/isDarkMode/g) || []).length);
console.log('gray/neutral:', (s.match(/text-gray|bg-gray|border-gray|bg-neutral|border-neutral|slate-/g) || []).length);
console.log('gradient:', (s.match(/gradient/g) || []).length);
