import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/NewBookingView.tsx');
let s = fs.readFileSync(filePath, 'utf8');

// props
s = s.replace(/\s*isDarkMode: boolean;\n/, '\n');

const pairs = [
  [
    /isDarkMode\s*\?\s*'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700'\s*:\s*'bg-white border-gray-200 text-gray-600 hover:bg-white'/g,
    "'bg-card border border-border text-muted-foreground hover:bg-muted'",
  ],
  [
    /isDarkMode\s*\?\s*'border-neutral-700 text-gray-400 hover:border-blue-500\/40 hover:text-blue-400'\s*:\s*'border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600'/g,
    "'border-border text-muted-foreground hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-neutral-800 border border-neutral-700 text-gray-600 cursor-not-allowed'\s*:\s*'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'/g,
    "? 'bg-muted border border-border text-muted-foreground cursor-not-allowed'",
  ],
  [
    /\? isDarkMode\s*\?\s*'border-neutral-700\/40 bg-neutral-900\/40 opacity-60 grayscale cursor-not-allowed'\s*:\s*'border-gray-200\/60 bg-gray-50\/30 opacity-60 grayscale cursor-not-allowed'/g,
    "? 'border-border bg-muted/30 opacity-60 grayscale cursor-not-allowed'",
  ],
  [
    /\? isDarkMode\s*\?\s*'border-blue-500\/40 ring-1 ring-blue-500\/20 bg-blue-600\/5 opacity-70 cursor-pointer'\s*:\s*'border-blue-300 ring-1 ring-blue-200 bg-blue-50\/30 opacity-70 cursor-pointer'/g,
    "? 'border-[color:var(--brand)] ring-1 ring-[color:var(--brand-glow)] bg-[color:var(--brand-soft)] opacity-70 cursor-pointer'",
  ],
  [
    /\? isDarkMode\s*\?\s*'border-red-900\/30 bg-neutral-900\/40 opacity-70 hover:border-red-800\/40 cursor-pointer'\s*:\s*'border-red-200\/50 bg-red-50\/20 opacity-70 hover:border-red-300\/50 cursor-pointer'/g,
    "? 'border-[color:var(--status-critical)]/30 bg-muted/40 opacity-70 hover:border-[color:var(--status-critical)]/50 cursor-pointer'",
  ],
  [
    /\? isDarkMode\s*\?\s*'border-blue-500\/40 ring-1 ring-blue-500\/20 bg-blue-600\/10 cursor-pointer'\s*:\s*'border-blue-300 ring-1 ring-blue-200 bg-blue-50\/50 cursor-pointer'/g,
    "? 'border-[color:var(--brand)] ring-1 ring-[color:var(--brand-glow)] bg-[color:var(--brand-soft)] cursor-pointer'",
  ],
  [
    /: isDarkMode\s*\?\s*'border-neutral-700\/30 bg-neutral-800\/40 hover:border-neutral-600\/50 hover:bg-neutral-800\/70 cursor-pointer'\s*:\s*'border-gray-200\/30 bg-gray-50\/40 hover:border-gray-300\/50 hover:bg-white cursor-pointer'/g,
    ": 'border-border bg-muted/40 hover:border-border hover:bg-card cursor-pointer'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-emerald-600\/15 border-emerald-500\/40 ring-1 ring-emerald-500\/20'\s*:\s*'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200'/g,
    "? 'sq-tone-success border border-border ring-1 ring-[color:var(--status-positive-soft)]'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-purple-600\/15 border-purple-500\/40 ring-1 ring-purple-500\/20'\s*:\s*'bg-purple-50 border-purple-200 ring-1 ring-purple-200'/g,
    "? 'sq-tone-ai border border-border ring-1 ring-border'",
  ],
  [
    /: isDarkMode\s*\?\s*'bg-neutral-800\/40 border-neutral-700\/30 hover:border-neutral-600\/50'\s*:\s*'bg-gray-50\/40 border-gray-200\/30 hover:border-gray-300\/50'/g,
    ": 'bg-muted/40 border border-border hover:border-border'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-neutral-800\/20 border-neutral-700\/20 opacity-40 cursor-not-allowed'\s*:\s*'bg-gray-50\/20 border-gray-200\/20 opacity-40 cursor-not-allowed'/g,
    "? 'bg-muted/20 border border-border opacity-40 cursor-not-allowed'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-green-600\/15 border-green-500\/40 text-green-400'\s*:\s*'bg-green-50 border-green-200 text-green-700'/g,
    "? 'sq-tone-success border border-border'",
  ],
  [
    /: isDarkMode\s*\?\s*'bg-neutral-800\/40 border-neutral-700\/30 text-gray-400 hover:border-neutral-600\/50'\s*:\s*'bg-gray-50\/40 border-gray-200\/30 text-gray-600 hover:border-gray-300\/50'/g,
    ": 'bg-muted/40 border border-border text-muted-foreground hover:border-border'",
  ],
  [
    /\? isDarkMode\s*\?\s*'bg-green-600\/15 border-green-500\/40'\s*:\s*'bg-green-50 border-green-200'/g,
    "? 'sq-tone-success border border-border'",
  ],
  [
    /: isDarkMode\s*\?\s*'bg-neutral-800\/40 border-neutral-700\/30'\s*:\s*'bg-gray-50\/40 border-gray-200\/30'/g,
    ": 'bg-muted/40 border border-border'",
  ],
  [
    /isDarkMode\s*\?\s*'bg-amber-600\/15 border border-amber-500\/30 text-amber-400 hover:bg-amber-600\/25'\s*:\s*'bg-amber-50 border border-amber-200\/60 text-amber-700 hover:bg-amber-100'/g,
    "'sq-tone-watch border border-border hover:opacity-90'",
  ],
  [
    /isDarkMode\s*\?\s*'bg-emerald-600\/15 border border-emerald-500\/30 text-emerald-400 hover:bg-emerald-600\/25'\s*:\s*'bg-emerald-50 border border-emerald-200\/60 text-emerald-700 hover:bg-emerald-100'/g,
    "'sq-tone-success border border-border hover:opacity-90'",
  ],
  [
    /: isDarkMode\s*\?\s*'bg-neutral-700 text-gray-500 cursor-not-allowed'\s*:\s*'bg-gray-200 text-gray-400 cursor-not-allowed'/g,
    ": 'bg-muted text-muted-foreground cursor-not-allowed'",
  ],
  // leftover hardcoded without isDarkMode
  [/border-t border-gray-200\/30/g, 'border-t border-border/30'],
  [/bg-gray-500\/80 text-white/g, 'bg-muted-foreground/80 text-primary-foreground'],
  [/v\.fuelType === 'Electric' \? 'bg-green-100 text-green-700' :\s*v\.fuelType === 'Hybrid' \? 'bg-teal-100 text-teal-700' :\s*v\.fuelType === 'Diesel' \? 'bg-amber-100 text-amber-700' :\s*v\.fuelType === 'Petrol' \? 'bg-orange-100 text-orange-700' :\s*'bg-gray-100 text-gray-600'/g,
    "v.fuelType === 'Electric' ? 'sq-chip-success' : v.fuelType === 'Hybrid' ? 'sq-chip-info' : v.fuelType === 'Diesel' ? 'sq-chip-watch' : v.fuelType === 'Petrol' ? 'sq-chip-warning' : 'sq-chip-neutral'"],
  [/\? 'text-gray-400'/g, "? 'text-muted-foreground'"],
];

for (const [re, rep] of pairs) s = s.replace(re, rep);

fs.writeFileSync(filePath, s);
console.log('remaining isDarkMode:', (s.match(/isDarkMode/g) || []).length);
console.log('remaining gray/neutral:', (s.match(/text-gray|bg-gray|border-gray|bg-neutral|border-neutral|text-neutral|slate-/g) || []).length);
