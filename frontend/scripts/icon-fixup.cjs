// Pragmatic fix-up: the icon-codemod handles JSX usages (<LucideName … />
// → <Icon name="kebab" … />) but cannot rewrite non-JSX value uses such as
// `icon: AlertTriangle` in object literals or `[Calendar, Car, ...]` arrays.
// After the codemod removes the lucide-react import, those references become
// undefined → tsc fails with `error TS2304: Cannot find name 'X'`.
//
// This script runs tsc, collects every TS2304 error, classifies the missing
// names into lucide icons (via the LUCIDE_TO_KEBAB list reused from the
// codemod) and React hooks/types, and re-adds focused import statements at
// the top of each affected file. Lucide icons referenced in value positions
// stay rendered through lucide; the JSX swaps that already happened keep
// using the new <Icon /> primitive.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const { LUCIDE_TO_KEBAB } = (() => {
  const src = fs.readFileSync(path.join(__dirname, 'icon-codemod.cjs'), 'utf8');
  const m = src.match(/const LUCIDE_TO_KEBAB = ([\s\S]*?\n});/);
  if (!m) throw new Error('Could not extract LUCIDE_TO_KEBAB from icon-codemod.cjs');
  const obj = eval('(' + m[1] + ')');
  return { LUCIDE_TO_KEBAB: obj };
})();

const REACT_NAMES = new Set([
  'useState',
  'useEffect',
  'useRef',
  'useCallback',
  'useMemo',
  'useContext',
  'useReducer',
  'useLayoutEffect',
  'useImperativeHandle',
  'useDeferredValue',
  'useTransition',
  'useId',
  'forwardRef',
  'memo',
  'createContext',
  'createElement',
  'Fragment',
  'Component',
  'Children',
]);

// React types that may appear as `Cannot find name 'X'` due to missing
// `import type { X } from 'react'`.
const REACT_TYPE_NAMES = new Set([
  'ReactNode',
  'ReactElement',
  'CSSProperties',
  'MouseEvent',
  'KeyboardEvent',
  'ChangeEvent',
  'FormEvent',
  'FocusEvent',
  'PointerEvent',
  'SyntheticEvent',
  'PropsWithChildren',
  'ComponentType',
  'FunctionComponent',
  'FC',
  'RefObject',
  'MutableRefObject',
  'ErrorInfo',
]);

function runTsc() {
  try {
    execSync('npx tsc -p tsconfig.app.json --noEmit', { cwd: ROOT, stdio: 'pipe' });
    return '';
  } catch (e) {
    return (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  }
}

function parseTsErrors(output) {
  // src\rental\components\X.tsx(34,51): error TS2304: Cannot find name 'Car'.
  const re = /^(.+?)\((\d+),(\d+)\): error TS2304: Cannot find name '([^']+)'\.?$/gm;
  const perFile = new Map();
  let m;
  while ((m = re.exec(output)) !== null) {
    const [, file, , , name] = m;
    const norm = file.split(path.sep).join('/');
    // Restrict to rental folder so we don't touch master/etc.
    if (!norm.includes('rental/')) continue;
    if (!perFile.has(norm)) perFile.set(norm, new Set());
    perFile.get(norm).add(name);
  }
  return perFile;
}

function ensureImport(source, statement, predicate) {
  if (predicate.test(source)) return source;
  const firstImport = source.search(/^import\s/m);
  if (firstImport === -1) return statement + '\n' + source;
  return source.slice(0, firstImport) + statement + '\n' + source.slice(firstImport);
}

function patchFile(absFile, missingNames) {
  let src = fs.readFileSync(absFile, 'utf8');
  const lucide = [];
  const reactHooks = [];
  const reactTypes = [];
  const others = [];
  for (const name of missingNames) {
    if (Object.prototype.hasOwnProperty.call(LUCIDE_TO_KEBAB, name)) {
      lucide.push(name);
    } else if (REACT_NAMES.has(name)) {
      reactHooks.push(name);
    } else if (REACT_TYPE_NAMES.has(name)) {
      reactTypes.push(name);
    } else {
      others.push(name);
    }
  }
  if (reactHooks.length) {
    const stmt = `import { ${reactHooks.sort().join(', ')} } from 'react';`;
    src = ensureImport(
      src,
      stmt,
      new RegExp(`import\\s*\\{[^}]*\\b${reactHooks[0]}\\b[^}]*\\}\\s*from\\s*['\"]react['\"]`),
    );
  }
  if (reactTypes.length) {
    const stmt = `import type { ${reactTypes.sort().join(', ')} } from 'react';`;
    src = ensureImport(
      src,
      stmt,
      new RegExp(`import\\s+type\\s*\\{[^}]*\\b${reactTypes[0]}\\b[^}]*\\}\\s*from\\s*['\"]react['\"]`),
    );
  }
  if (lucide.length) {
    const stmt = `import { ${lucide.sort().join(', ')} } from 'lucide-react';`;
    src = ensureImport(
      src,
      stmt,
      new RegExp(`import\\s*\\{[^}]*\\b${lucide[0]}\\b[^}]*\\}\\s*from\\s*['\"]lucide-react['\"]`),
    );
  }
  fs.writeFileSync(absFile, src, 'utf8');
  return { lucide, reactHooks, reactTypes, others };
}

function main() {
  console.log('Running tsc to collect TS2304 errors…');
  const output = runTsc();
  const perFile = parseTsErrors(output);

  if (perFile.size === 0) {
    console.log('No TS2304 errors detected. Nothing to fix.');
    return;
  }

  console.log(`Found TS2304 errors in ${perFile.size} files.\n`);
  const summary = [];
  for (const [file, names] of perFile.entries()) {
    const abs = path.resolve(ROOT, file);
    if (!fs.existsSync(abs)) {
      console.log(`  [skip] ${file} — file not found`);
      continue;
    }
    const { lucide, reactHooks, reactTypes, others } = patchFile(abs, names);
    summary.push({ file, lucide, reactHooks, reactTypes, others });
  }

  console.log(`\n=== icon-fixup summary ===`);
  for (const s of summary) {
    const parts = [];
    if (s.reactHooks.length) parts.push(`react={${s.reactHooks.join(',')}}`);
    if (s.reactTypes.length) parts.push(`react-types={${s.reactTypes.join(',')}}`);
    if (s.lucide.length) parts.push(`lucide={${s.lucide.join(',')}}`);
    if (s.others.length) parts.push(`UNKNOWN={${s.others.join(',')}}`);
    console.log(`  ${s.file}: ${parts.join(' ') || '(no patches needed)'}`);
  }
}

main();
