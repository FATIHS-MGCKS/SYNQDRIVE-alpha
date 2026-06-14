import fs from 'fs';
const p = 'src/rental/components/BookingsView.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/^(\s+)'sq-tone-brand'$/gm, "$1? 'sq-tone-brand'");
fs.writeFileSync(p, s);
console.log('fixed BookingsView ternaries');
