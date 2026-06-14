import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/HealthErrorsView.tsx');
let s = fs.readFileSync(filePath, 'utf8');

const pairs = [
  [/\$\{d \? 'bg-neutral-700' : 'bg-gray-100'\}/g, "'bg-muted'"],
  [/\$\{d \? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'\}/g, "'sq-chip-neutral'"],
  [/\$\{d \? 'bg-amber-500\/5 border-amber-500\/20' : 'bg-amber-50\/50 border-amber-200\/60'\}/g, "'sq-tone-watch border border-border'"],
  [/\$\{d \? 'text-amber-300' : 'text-amber-800'\}/g, "'text-[color:var(--status-watch)]'"],
  [/\$\{d \? 'text-amber-400\/80' : 'text-amber-700'\}/g, "'text-[color:var(--status-watch)]'"],
  [/\$\{d \? 'bg-violet-500\/15 text-violet-400 hover:bg-violet-500\/25' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'\}/g, "'sq-tone-ai hover:opacity-90'"],
  [/\$\{d \? 'bg-blue-500\/15 text-blue-400 hover:bg-blue-500\/25' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'\}/g, "'sq-tone-info hover:opacity-90'"],
  [/\$\{d \? 'text-red-400' : 'text-red-600'\}/g, "'text-[color:var(--status-critical)]'"],
  [/\$\{d \? 'text-blue-400' : 'text-blue-600'\}/g, "'text-[color:var(--status-info)]'"],
  [/\$\{d \? 'text-neutral-300' : 'text-gray-700'\}/g, "'text-foreground'"],
  [/\$\{d \? 'bg-neutral-800\/40' : 'bg-white'\}/g, "'bg-card'"],
  [/\? d \? 'border-b border-neutral-700\/50' : 'border-b border-gray-100'/g, "? 'border-b border-border'"],
  [/\$\{d \? 'bg-green-500\/10' : 'bg-green-50'\}/g, "'sq-tone-success'"],
  [/\$\{d \? 'text-green-400' : 'text-green-600'\}/g, "'text-[color:var(--status-positive)]'"],
  [/\$\{d \? 'text-gray-600' : 'text-gray-300'\}/g, "'text-muted-foreground'"],
  [/\$\{d \? 'bg-green-500\/10 text-green-400' : 'bg-green-50 text-green-700'\}/g, "'sq-chip-success'"],
  [/\$\{d \? 'bg-violet-500\/10 text-violet-400 hover:bg-violet-500\/20' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'\}/g, "'sq-tone-ai hover:opacity-90'"],
  [/\$\{d \? 'bg-blue-500\/10 text-blue-400 hover:bg-blue-500\/20' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'\}/g, "'sq-tone-info hover:opacity-90'"],
  [/\$\{d \? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'\}/g, "'bg-background border border-border text-foreground'"],
  [/\$\{d \? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'\}/g, "'bg-background border border-border text-foreground placeholder:text-muted-foreground'"],
  [/\$\{d \? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'\}/g, "'text-muted-foreground hover:text-foreground'"],
  [/\$\{d \? 'text-blue-400' : 'text-blue-500'\}/g, "'text-[color:var(--status-info)]'"],
  [/\$\{d \? 'text-gray-400' : 'text-gray-600'\}/g, "'text-muted-foreground'"],
];

for (const [re, rep] of pairs) s = s.replace(re, rep);

fs.writeFileSync(filePath, s);
console.log('remaining d:', (s.match(/\bd \?/g) || []).length);
