import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/rental/components/NewBookingView.tsx');
let s = fs.readFileSync(filePath, 'utf8');

// Merge ${'static-classes'} into the surrounding template literal
s = s.replace(/className=\{`([^`]+)`\}/g, (match, inner) => {
  let cleaned = inner.replace(/\$\{'([^']+)'\}/g, '$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned.includes('${')) {
    return `className="${cleaned}"`;
  }
  return `className={\`${cleaned}\`}`;
});

// className={'token'} → className="token"
s = s.replace(/className=\{'([^']+)'\}/g, 'className="$1"');

// span/div with {'token'}
s = s.replace(/className=\{'([^']+)'\}/g, 'className="$1"');

fs.writeFileSync(filePath, s);
console.log('done, remaining ${\'', (s.match(/\$\{'/g) || []).length);
