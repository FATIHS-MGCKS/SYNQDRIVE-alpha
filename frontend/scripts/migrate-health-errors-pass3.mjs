import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/HealthErrorsView.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const before = (s.match(/isDarkMode/g) || []).length;

const pairs = [
  [/isDarkMode \? 'bg-amber-500\/20 text-amber-300' : 'bg-amber-100 text-amber-700'/g, "'sq-chip-watch'"],
  [/isDarkMode \? 'bg-blue-500\/20 text-blue-300' : 'bg-blue-100 text-blue-700'/g, "'sq-chip-info'"],
  [/isDarkMode \? 'bg-green-500\/20 text-green-300' : 'bg-green-100 text-green-700'/g, "'sq-chip-success'"],
  [/isDarkMode \? 'text-amber-400\/80' : 'text-amber-700\/80'/g, "'text-[color:var(--status-watch)]'"],
  [/tireModalTab === tab \? \(isDarkMode \? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'\)/g, "tireModalTab === tab ? 'bg-card text-foreground shadow-sm'"],
  [/isDarkMode \? 'bg-neutral-800\/40 border-amber-500\/20' : 'bg-amber-50\/50 border-amber-200'/g, "'sq-tone-watch border border-border'"],
  [/isDarkMode \? 'text-amber-500\/60' : 'text-amber-400'/g, "'text-[color:var(--status-watch)]/60'"],
  [/isDarkMode \? 'bg-blue-500\/10 text-blue-400 hover:bg-blue-500\/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'/g, "'sq-tone-info hover:opacity-90'"],
  [/isDarkMode \? 'text-blue-400 hover:bg-blue-500\/10' : 'text-blue-600 hover:bg-blue-50'/g, "'text-[color:var(--status-info)] hover:bg-muted'"],
  [/editSetupForm\.tireSeason === opt\.val \? \(isDarkMode \? 'border-blue-500 bg-blue-500\/10 text-blue-400' : 'border-blue-400 bg-blue-50 text-blue-700'\) : \(isDarkMode \? 'border-neutral-700 text-gray-500 hover:border-neutral-600' : 'border-gray-200 text-gray-400 hover:border-gray-300'\)/g, "editSetupForm.tireSeason === opt.val ? 'border-[color:var(--brand)] sq-tone-brand' : 'border-border text-muted-foreground hover:border-border/80'"],
  [/editSetupForm\.tireCondition === opt\.val \? \(isDarkMode \? 'border-blue-500 bg-blue-500\/10 text-blue-400' : 'border-blue-400 bg-blue-50 text-blue-700'\) : \(isDarkMode \? 'border-neutral-700 text-gray-500 hover:border-neutral-600' : 'border-gray-200 text-gray-400 hover:border-gray-300'\)/g, "editSetupForm.tireCondition === opt.val ? 'border-[color:var(--brand)] sq-tone-brand' : 'border-border text-muted-foreground hover:border-border/80'"],
  [/isDarkMode \? 'text-amber-400\/80' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'/g, "'bg-muted text-muted-foreground cursor-not-allowed'"],
  [/isDarkMode \? 'bg-neutral-700 text-gray-300' : 'bg-gray-800 text-white'/g, "'bg-popover text-popover-foreground'"],
  [/isDarkMode \? 'text-purple-300' : 'text-purple-700'/g, "'text-[color:var(--status-ai)]'"],
  [/isDarkMode \? 'text-amber-400\/70' : 'text-amber-600'/g, "'text-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-red-500\/10 border border-red-800\/20' : 'bg-red-50 border border-red-200'/g, "'sq-tone-critical border border-border'"],
  [/isDarkMode \? 'text-red-400\/70' : 'text-red-600'/g, "'text-[color:var(--status-critical)]'"],
  [/isLow \? \(isDarkMode \? 'bg-amber-500\/15 text-amber-400' : 'bg-amber-50 text-amber-700'\) : \(isDarkMode \? 'bg-green-500\/15 text-green-400' : 'bg-green-50 text-green-700'\)/g, "isLow ? 'sq-chip-watch' : 'sq-chip-success'"],
  [/isDarkMode \? 'bg-green-500\/10' : 'bg-green-50'/g, "'sq-tone-success'"],
  [/isDarkMode \? 'bg-neutral-800\/60' : 'bg-gray-50'/g, "'bg-muted/60'"],
  [/isDarkMode \? 'stroke-gray-500' : 'stroke-gray-400'/g, "'stroke-muted-foreground'"],
  [/isDarkMode \? 'stroke-gray-600' : 'stroke-gray-300'/g, "'stroke-border'"],
  [/isDarkMode \? 'bg-amber-500' : 'bg-amber-400'/g, "'bg-[color:var(--status-watch)]'"],
  [/isDarkMode \? 'bg-blue-500' : 'bg-blue-400'/g, "'bg-[color:var(--status-info)]'"],
  [/isDarkMode \? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'/g, "'bg-background border border-border text-foreground'"],
  [/isDarkMode \? 'text-blue-400\/70' : 'text-blue-600\/70'/g, "'text-[color:var(--status-info)]'"],
  [/isDarkMode \? 'text-blue-400\/60' : 'text-blue-500\/60'/g, "'text-[color:var(--status-info)]/60'"],
  [/hvBatteryStatus\.sohInterpretation\.color === 'green' \? \(isDarkMode \? 'bg-green-500\/10' : 'bg-green-50'\)/g, "hvBatteryStatus.sohInterpretation.color === 'green' ? 'sq-tone-success'"],
  // multiline unselected borders
  [/: isDarkMode\s*\n\s*\? 'border-neutral-700 hover:border-neutral-600'\s*\n\s*: 'border-gray-200 hover:border-gray-300'/g, ": 'border-border hover:border-border/80'"],
  [/: isDarkMode\s*\n\s*\? 'border-neutral-700 text-gray-300'\s*\n\s*: 'border-gray-200 text-gray-700'/g, ": 'border-border text-foreground'"],
  [/: isDarkMode\s*\n\s*\? 'border-neutral-700'\s*\n\s*: 'border-gray-200'/g, ": 'border-border'"],
];

for (const [re, rep] of pairs) s = s.replace(re, rep);

fs.writeFileSync(filePath, s);
const after = (s.match(/isDarkMode/g) || []).length;
console.log(`pass3: ${before} → ${after}`);
if (after > 0) {
  s.split('\n').forEach((line, i) => {
    if (line.includes('isDarkMode')) console.log(`${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}
