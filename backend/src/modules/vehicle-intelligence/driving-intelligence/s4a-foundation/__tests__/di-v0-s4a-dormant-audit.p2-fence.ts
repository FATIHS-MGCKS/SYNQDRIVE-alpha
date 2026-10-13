import * as path from 'path';

/** EXP-021 P2 trip-speed-quality — explicit, audit-gated S4A edges (read-only types + test harness only). */
export const P2_TRIP_SPEED_QUALITY_DIR = path.join(__dirname, '../../trip-speed-quality');

export const P2_ALLOWED_PRODUCTION_S4A_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'build-di-v0-trip-speed-quality-projection.v1.ts': ['../s4a-foundation/di-v0-s4a-contract'],
  'di-v0-trip-speed-quality-evidence.ts': ['../s4a-foundation/di-v0-s4a-evidence-container-parse'],
  'di-v0-trip-speed-quality-projection.service.ts': ['../s4a-foundation/di-v0-s4a-contract'],
  'di-v0-trip-speed-quality-projection.types.ts': ['../s4a-foundation/di-v0-s4a-contract'],
};

export const P2_ALLOWED_TEST_S4A_IMPORTS = new Set([
  '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness',
  '../../s4a-foundation/__tests__/di-v0-s4a-dormant-audit.p2-fence',
]);

const FORBIDDEN_P2_S4A_RUNTIME_SYMBOLS =
  /\b(DiV0S4WorkItemRepository|persistDiV0S4FencedS2Run|DiV0S4ControlPlane|parseDiV0S4ControlPlaneConfig)\b/;

const FORBIDDEN_P2_S4A_MUTATION_IMPORT_FRAGMENTS = [
  'di-v0-s4a-work-item.repository',
  'di-v0-s4a-s2-fenced-persistence',
  'di-v0-s4a-control-plane',
  'di-v0-s4a-state-machine',
];

export const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+'([^']+)'|require\('([^']+)'\)|import\('([^']+)'\)/g)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );

export const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

export function isP2TripSpeedQualityFile(file: string): boolean {
  return file.startsWith(P2_TRIP_SPEED_QUALITY_DIR + path.sep);
}

export function collectP2S4aFenceViolations(file: string, source: string): string[] {
  if (!isP2TripSpeedQualityFile(file)) return [];
  const violations: string[] = [];
  const rel = path.relative(P2_TRIP_SPEED_QUALITY_DIR, file).split(path.sep).join('/');
  const base = path.basename(file);
  const code = stripComments(source);
  const inTests = rel.startsWith('__tests__/');

  if (!inTests && FORBIDDEN_P2_S4A_RUNTIME_SYMBOLS.test(code)) {
    violations.push(`${rel}: forbidden S4A runtime symbol reference`);
  }

  for (const spec of importsOf(source)) {
    if (!/s4a-foundation|di-v0-s4a-/.test(spec)) continue;

    if (
      !inTests &&
      FORBIDDEN_P2_S4A_MUTATION_IMPORT_FRAGMENTS.some((frag) => spec.includes(frag))
    ) {
      violations.push(`${rel}: S4A mutation/control import not permitted: ${spec}`);
      continue;
    }

    if (inTests || base.includes('postgres-harness')) {
      if (!P2_ALLOWED_TEST_S4A_IMPORTS.has(spec)) {
        violations.push(`${rel}: test-only S4A import not allowlisted: ${spec}`);
      }
      continue;
    }

    const allowed = P2_ALLOWED_PRODUCTION_S4A_IMPORTS[base];
    if (!allowed?.includes(spec)) {
      violations.push(`${rel}: production S4A import not allowlisted: ${spec}`);
    }
  }

  return violations;
}

/** Returns true when a non-P2 file illegally references s4a-foundation (for negative tests). */
export function isUnauthorizedNonP2S4aImport(file: string, source: string): boolean {
  if (isP2TripSpeedQualityFile(file)) return false;
  const importsFoundation = importsOf(source).some((spec) => /s4a-foundation|di-v0-s4a-/.test(spec));
  const namesFoundation = /\b(DiV0S4WorkItemRepository|persistDiV0S4FencedS2Run)\b/.test(stripComments(source));
  return importsFoundation || namesFoundation;
}
