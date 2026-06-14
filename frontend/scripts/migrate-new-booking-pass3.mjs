import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/NewBookingView.tsx');
let s = fs.readFileSync(filePath, 'utf8');

// Remove isDarkMode from props
s = s.replace(/\s*isDarkMode: boolean;\n/, '\n');

// Fix className={'token'} → className="token"
s = s.replace(/className=\{'([^']+)'\}/g, 'className="$1"');

// Fix className={`static 'token'`} → className="static token"
s = s.replace(/className=\{`([^`]*?)'([^']+)'([^`]*?)`\}/g, (_, before, token, after) => {
  const merged = `${before}${token}${after}`.replace(/\s+/g, ' ').trim();
  return `className="${merged}"`;
});

// Fix className={`${expr} 'token'`} patterns - rare, skip

// Fix remaining isDarkMode ternaries
s = s.replace(
  /: isDarkMode\s*\?\s*'bg-neutral-800 border border-neutral-700 text-gray-600 cursor-not-allowed'\s*:\s*'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'/g,
  ": 'bg-muted border border-border text-muted-foreground cursor-not-allowed'",
);
s = s.replace(
  /: isDarkMode\s*\?\s*'border-red-900\/30 bg-neutral-900\/40 opacity-70 hover:border-red-800\/40 cursor-pointer'\s*:\s*'border-red-200\/50 bg-red-50\/20 opacity-70 hover:border-red-300\/50 cursor-pointer'/g,
  ": 'border-[color:var(--status-critical)]/30 bg-muted/40 opacity-70 hover:border-[color:var(--status-critical)]/50 cursor-pointer'",
);

// Remove gradient from veriff button - use brand token
s = s.replace(
  /\? 'bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white shadow-md hover:shadow-lg'/g,
  "? 'bg-[color:var(--status-ai)] text-primary-foreground hover:opacity-90 shadow-sm'",
);

// Add pattern imports if missing
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
console.log('gray/neutral:', (s.match(/text-gray|bg-gray|border-gray|bg-neutral|border-neutral|text-neutral|slate-/g) || []).length);
console.log('broken quoted in template:', (s.match(/`'[^']+'`/g) || []).length);
