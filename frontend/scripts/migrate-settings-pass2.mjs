import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/SettingsView.tsx');
let s = fs.readFileSync(filePath, 'utf8');

const pairs = [
  [/isDarkMode\s*\?\s*'bg-red-500\/10 border-red-500\/30 text-red-300'\s*:\s*'bg-red-50 border-red-200 text-red-700'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700\/60'\s*:\s*'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'/g, "'border border-border/60 bg-card text-foreground hover:bg-muted'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700\/60'\s*:\s*'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'/g, "'border border-border/60 bg-card text-foreground hover:bg-muted'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800 text-gray-400 hover:bg-neutral-700'\s*:\s*'bg-gray-100 text-gray-600 hover:bg-gray-200'/g, "'bg-muted text-muted-foreground hover:bg-muted/80'"],
  [/isDarkMode\s*\?\s*'bg-neutral-700\/60'\s*:\s*'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode\s*\?\s*'bg-blue-500\/20 text-blue-300'\s*:\s*'bg-blue-100 text-blue-700'/g, "'sq-tone-brand'"],
  [/isDarkMode\s*\?\s*'bg-amber-500\/20 text-amber-300'\s*:\s*'bg-amber-100 text-amber-700'/g, "'sq-tone-watch'"],
  [/isDarkMode\s*\?\s*'bg-blue-500\/30 text-blue-200'\s*:\s*'bg-blue-100 text-blue-700'/g, "'sq-tone-brand'"],
  [/isDarkMode\s*\?\s*'text-amber-300'\s*:\s*'text-amber-700'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800\/40 border-neutral-700\/30'\s*:\s*'bg-white\/\[0\.02\] hover:bg-white\/5'/g, "'bg-card hover:bg-muted/40'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800\/60 border-neutral-700\/50 text-gray-300'\s*:\s*'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'/g, "'border border-border bg-card text-foreground hover:bg-muted'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300'\s*:\s*'bg-white border-gray-200 text-gray-700'/g, "'border border-border bg-card text-foreground'"],
  [/isDarkMode\s*\?\s*'bg-neutral-800 text-gray-300'\s*:\s*'bg-white text-gray-600'/g, "'bg-muted text-muted-foreground'"],
  [/isDarkMode\s*\?\s*'text-gray-200'\s*:\s*'text-gray-800'/g, "'text-foreground'"],
  [/isDarkMode\s*\?\s*'bg-blue-500\/15 text-blue-300'\s*:\s*'bg-blue-100 text-blue-600'/g, "'sq-tone-brand'"],
  [/isDarkMode\s*\?\s*'border-neutral-700'\s*:\s*'border-gray-200'/g, "'border-border'"],
  [/isDarkMode\s*\?\s*'hover:bg-neutral-800'\s*:\s*'hover:bg-gray-100'/g, "'hover:bg-muted'"],
  [/isDarkMode\s*\n\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700\/60'\s*\n\s*:\s*'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'/g, "'border border-border/60 bg-card text-foreground hover:bg-muted'"],
  [/isDarkMode\s*\n\s*\?\s*'bg-red-500\/10 border-red-500\/30 text-red-300'\s*\n\s*:\s*'bg-red-50 border-red-200 text-red-700'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode\s*\n\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300'\s*\n\s*:\s*'bg-white border-gray-200 text-gray-700'/g, "'border border-border bg-card text-foreground'"],
];

for (const [re, rep] of pairs) s = s.replace(re, rep);

fs.writeFileSync(filePath, s);
const left = (s.match(/isDarkMode/g) || []).length;
console.log(`remaining isDarkMode: ${left}`);
if (left > 0) {
  s.split('\n').forEach((line, i) => {
    if (line.includes('isDarkMode')) console.log(`${i + 1}: ${line.trim()}`);
  });
}
