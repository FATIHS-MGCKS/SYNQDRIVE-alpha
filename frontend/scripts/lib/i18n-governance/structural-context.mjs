/**
 * Stable local structural context for fingerprinting (line-independent).
 */

const SYMBOL_PATTERNS = [
  /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g,
  /export\s+function\s+([A-Za-z_$][\w$]*)/g,
  /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\()/g,
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\()/g,
];

/**
 * @param {string} source
 * @param {number} index
 * @returns {string}
 */
export function extractStructuralContext(source, index) {
  const before = source.slice(0, index);
  let symbol = 'module';
  let lastIndex = -1;

  for (const pattern of SYMBOL_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(before)) !== null) {
      if (match.index >= lastIndex) {
        lastIndex = match.index;
        symbol = match[1] ?? symbol;
      }
    }
  }

  return symbol;
}
