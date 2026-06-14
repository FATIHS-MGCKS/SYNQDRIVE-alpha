import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/HealthErrorsView.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const before = (s.match(/isDarkMode/g) || []).length;

const pairs = [
  [/isDarkMode \? 'bg-amber-500\/10 text-amber-400' : 'bg-amber-50 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-red-500\/10 text-red-400' : 'bg-red-50 text-red-700'/g, "'sq-chip-critical'"],
  [/isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-600'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-green-500\/15 text-green-400' : 'bg-green-100 text-green-600'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'text-red-400\/80' : 'text-red-600\/80'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'/g, "'bg-background border border-border text-foreground placeholder:text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-white border-gray-200'/g, "'bg-background border border-border text-foreground placeholder:text-muted-foreground'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-gray-200'/g, "'bg-background border border-border text-foreground'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'/g, "'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'"],
  [/isDarkMode \? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'/g, "'sq-tone-brand text-white hover:opacity-90'"],
  [/isDarkMode \? 'text-green-600' : 'text-green-500'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'bg-indigo-500\/15' : 'bg-indigo-50'/g, "'sq-tone-brand'"],
  [/isDarkMode \? 'text-indigo-400' : 'text-indigo-500'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'text-indigo-300' : 'text-indigo-500'/g, "'text-[color:var(--brand)]'"],
  [/isDarkMode \? 'bg-blue-500\/10' : 'bg-blue-50'/g, "'sq-tone-info'"],
  [/isDarkMode \? 'bg-neutral-800' : 'bg-gray-100'/g, "'bg-muted'"],
  [/isDarkMode \? 'text-blue-400' : 'text-blue-500'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-300' : 'text-blue-500'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-emerald-500\/10 border border-emerald-500\/20' : 'bg-emerald-50 border border-emerald-100'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'text-emerald-300' : 'text-emerald-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-neutral-800\/60' : 'bg-gray-100'/g, "'bg-muted/60'"],
  [/isDarkMode \? 'text-blue-400\/70' : 'text-blue-700\/80'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-400\/60' : 'text-blue-600\/70'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-amber-300\/80' : 'text-amber-700\/80'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-blue-500\/10' : 'bg-white\/70'/g, "'bg-muted/50'"],
  [/isDarkMode \? 'bg-emerald-500\/10' : 'bg-emerald-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/10' : 'bg-amber-50'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-orange-500\/10' : 'bg-orange-50'/g, "'sq-tone-warning'"],
  [/isDarkMode \? 'bg-red-500\/10' : 'bg-red-50'/g, "'sq-tone-critical'"],
  [/isDarkMode \? 'text-muted-foreground\/70' : 'text-muted-foreground\/80'/g, "'text-muted-foreground/70'"],
  [/isDarkMode \? 'text-amber-400\/60' : 'text-amber-600\/60'/g, "'text-[color:var(--status-watch)]/60'"],
  [/isDarkMode \? 'bg-neutral-700' : 'bg-gray-100'/g, "'bg-muted'"],
  [/batteryChartTab === 'woche' \? isDarkMode \? 'bg-neutral-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'/g, "batteryChartTab === 'woche' ? 'bg-card text-foreground shadow-sm'"],
  [/batteryChartTab === 'monat' \? isDarkMode \? 'bg-neutral-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'/g, "batteryChartTab === 'monat' ? 'bg-card text-foreground shadow-sm'"],
  [/isDarkMode \? 'bg-amber-500\/5 border border-amber-500\/20' : 'bg-amber-50 border border-amber-200\/60'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-blue-500\/5 border border-blue-500\/20' : 'bg-blue-50 border border-blue-200\/60'/g, "'sq-tone-info border border-border'"],
  [/isDarkMode \? 'text-blue-300' : 'text-blue-900'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-neutral-700' : 'bg-blue-200'/g, "'bg-muted'"],
  [/isDarkMode \? 'bg-green-500\/10 border-green-800\/30' : 'bg-green-50 border-green-200'/g, "'sq-tone-success border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 border-amber-800\/30' : 'bg-amber-50 border-amber-200'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'bg-red-500\/10 border-red-800\/30' : 'bg-red-50 border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'text-green-400' : 'text-green-700'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-amber-400' : 'text-amber-700'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'text-red-400' : 'text-red-700'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'bg-purple-500\/5 border-purple-500\/15' : 'bg-purple-50\/60 border-purple-100'/g, "'sq-tone-ai border border-border'"],
  [/isDarkMode \? 'border-amber-500\/30 bg-amber-500\/5' : 'border-amber-200 bg-amber-50'/g, "'border-border sq-tone-watch'"],
  [/isDarkMode \? 'border-border bg-muted\/30' : 'border-border bg-white\/50'/g, "'border-border bg-muted/30'"],
  [/isDarkMode \? 'bg-red-500\/10 border border-red-800\/30' : 'bg-red-50 border border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'bg-amber-500\/10 border border-amber-800\/30' : 'bg-amber-50 border border-amber-200'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'text-red-300' : 'text-red-700'/g, "'text-[color:var(--status-critical)]'"],
  [/isDarkMode \? 'bg-neutral-800\/50 border border-neutral-700\/60' : 'bg-gray-50 border border-gray-200'/g, "'bg-muted/50 border border-border'"],
  [/isDarkMode \? 'bg-green-500' : 'bg-green-400'/g, "'bg-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'/g, "'text-muted-foreground hover:text-foreground'"],
  [/isDarkMode \? 'border-neutral-600 hover:border-blue-500\/50 hover:bg-blue-500\/5' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50\/50'/g, "'border-border hover:border-[color:var(--brand)] hover:bg-muted/50'"],
  [/isDarkMode \? 'border-neutral-600 hover:border-purple-500\/50 hover:bg-purple-500\/5' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50\/50'/g, "'border-border hover:border-[color:var(--status-ai)] hover:bg-muted/50'"],
  [/isDarkMode \? 'text-purple-400' : 'text-purple-600'/g, "'text-[color:var(--status-ai)]'"],
  [/isDarkMode \? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'/g, "'text-muted-foreground hover:bg-muted'"],
  [/isDarkMode \? 'border-neutral-600' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'bg-neutral-800\/60 border-blue-500\/30' : 'bg-white border-blue-200'/g, "'bg-card border border-border'"],
  [/isDarkMode \? 'border-blue-500 bg-blue-500\/10' : 'border-blue-400 bg-blue-50'/g, "'border-[color:var(--brand)] sq-tone-brand'"],
  [/isDarkMode \? 'border-neutral-700 hover:border-neutral-600' : 'border-gray-200 hover:border-gray-300'/g, "'border-border hover:border-border/80'"],
  [/isDarkMode \? 'bg-neutral-800\/60 border-red-500\/30' : 'bg-white border-red-200'/g, "'bg-card border border-border'"],
  [/isDarkMode \? 'border-neutral-700' : 'border-gray-200'/g, "'border-border'"],
  [/isDarkMode \? 'bg-neutral-600 text-gray-300' : 'bg-gray-200 text-gray-600'/g, "'sq-chip-neutral'"],
  [/isDarkMode \? 'text-cyan-400' : 'text-cyan-600'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-400\/50' : 'text-blue-500\/50'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-gray-300' : 'text-gray-600'/g, "'text-muted-foreground'"],
  [/isDarkMode \? 'text-emerald-400' : 'text-emerald-600'/g, "'text-[color:var(--status-positive)]'"],
  [/isDarkMode \? 'bg-green-500\/15' : 'bg-green-100'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-amber-500\/15' : 'bg-amber-100'/g, "'sq-tone-watch'"],
  [/isDarkMode \? 'bg-red-500\/15' : 'bg-red-100'/g, "'sq-tone-critical'"],
  [/fill: isDarkMode \? '#9ca3af' : '#6b7280'/g, "fill: 'var(--muted-foreground)'"],
  [/fill: isDarkMode \? '#6b7280' : '#9ca3af'/g, "fill: 'var(--muted-foreground)'"],
  [/stroke: isDarkMode \? '#4b5563' : '#d1d5db'/g, "stroke: 'var(--border)'"],
  [/stroke=\{isDarkMode \? '#e5e7eb' : '#374151'\}/g, "stroke='var(--foreground)'"],
  [/fill: isDarkMode \? '#e5e7eb' : '#fff'/g, "fill: 'var(--foreground)'"],
  [/stroke: isDarkMode \? '#9ca3af' : '#374151'/g, "stroke: 'var(--muted-foreground)'"],
  [/fill: isDarkMode \? '#818cf8' : '#6366f1'/g, "fill: 'var(--brand)'"],
  [/stroke: isDarkMode \? '#e5e7eb' : '#fff'/g, "stroke: 'var(--card)'"],
  [/stroke=\{isDarkMode \? '#555' : '#bbb'\}/g, "stroke='var(--muted-foreground)'"],
  [/background: isDarkMode \? '#1c1c1c' : '#fff'/g, "background: 'var(--card)'"],
  [/isDarkMode=\{isDarkMode\}/g, ''],
  [/,\s*isDarkMode\s*\)/g, ')'],
  [/,\s*isDarkMode,/g, ','],
  [/isDarkMode,/g, ''],
];

for (const [re, rep] of pairs) s = s.replace(re, rep);

// multiline ternaries: ? isDarkMode\n ? dark\n : light  -> pick dark token side already unified
s = s.replace(/\? isDarkMode\s*\n\s*\? ([^\n]+)\s*\n\s*: ([^\n]+)/g, '? $1');

fs.writeFileSync(filePath, s);
const after = (s.match(/isDarkMode/g) || []).length;
console.log(`pass2: ${before} → ${after}`);
if (after > 0) {
  s.split('\n').forEach((line, i) => {
    if (line.includes('isDarkMode')) console.log(`${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}
