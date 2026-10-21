import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMasterOffboardUiEnabled } from '../master/connected-vehicles/vo5c-release-gates';

const frontendSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN_RUNTIME_PATTERNS: RegExp[] = [
  /\/admin\/vehicles\/[^`'"]*\/deregister/,
  /vehicles\.deregister\s*\(/,
  /\bderegister\s*:\s*\(\s*vehicleId/,
  /LEGACY_VEHICLE_DESTRUCTION_DISABLED/,
  /USE_CANONICAL_OFFBOARD/,
];

const DOC_ONLY_FILES = new Set([
  'master/components/ChangesView.tsx',
  'master/components/ArchitekturView.tsx',
]);

function isTestFile(rel: string): boolean {
  return (
    rel.includes('.test.') ||
    rel.includes('.spec.') ||
    rel.endsWith('.test.ts') ||
    rel.endsWith('.test.tsx')
  );
}

function walkTsFiles(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'i18n') continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full, rel));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    out.push(rel);
  }
  return out;
}

describe('VO5C-P2B2 legacy deregister frontend retirement', () => {
  it('api.vehicles has no deregister client; canonical offboard client remains', () => {
    const apiSrc = readFileSync(path.join(frontendSrc, 'lib/api.ts'), 'utf8');
    expect(apiSrc).not.toMatch(/deregister\s*:\s*\(vehicleId/);
    expect(apiSrc).not.toMatch(/\/admin\/vehicles\/\$\{vehicleId\}\/deregister/);
    expect(apiSrc).toMatch(/vehicleOnboarding\s*:\s*\{/);
    expect(apiSrc).toMatch(/offboardVehicle\s*:\s*async/);
    expect(apiSrc).toMatch(
      /\/admin\/vehicle-onboarding\/organizations\/\$\{organizationId\}\/vehicles\/\$\{vehicleId\}\/offboard/,
    );
  });

  it('no production frontend source invokes retired deregister paths', () => {
    const violations: string[] = [];
    for (const rel of walkTsFiles(frontendSrc)) {
      if (isTestFile(rel) || DOC_ONLY_FILES.has(rel)) continue;
      const src = readFileSync(path.join(frontendSrc, rel), 'utf8');
      for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
        if (pattern.test(src)) {
          violations.push(`${rel} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('Connected Vehicles offboard uses canonical hook only (no deregister string)', () => {
    const hub = readFileSync(
      path.join(frontendSrc, 'master/connected-vehicles/ConnectedVehiclesHub.tsx'),
      'utf8',
    );
    const drawer = readFileSync(
      path.join(frontendSrc, 'master/connected-vehicles/ConnectedVehicleDetailDrawer.tsx'),
      'utf8',
    );
    const hook = readFileSync(
      path.join(frontendSrc, 'master/connected-vehicles/useVehicleOffboard.ts'),
      'utf8',
    );
    expect(hub).toMatch(/useVehicleOffboard/);
    expect(hook).toMatch(/api\.vehicleOnboarding\.offboardVehicle/);
    expect(hub).not.toMatch(/deregister/i);
    expect(drawer).not.toMatch(/deregister/i);
    expect(hook).not.toMatch(/deregister/i);
    expect(hook).not.toMatch(/LEGACY_VEHICLE_DESTRUCTION/);
  });

  it('release gate OFF by default — offboard UI mutation disabled without explicit env', () => {
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('tenant org-scoped vehicle delete wrapper may exist but has no located runtime caller', () => {
    const apiSrc = readFileSync(path.join(frontendSrc, 'lib/api.ts'), 'utf8');
    expect(apiSrc).toMatch(
      /delete:\s*\(orgId:\s*string,\s*id:\s*string\)\s*=>\s*del<void>\(`\/organizations\/\$\{orgId\}\/vehicles\/\$\{id\}`\)/,
    );
    const runtimeFiles = walkTsFiles(frontendSrc).filter(
      (rel) => !isTestFile(rel) && !DOC_ONLY_FILES.has(rel) && rel !== 'lib/api.ts',
    );
    const deleteCallers = runtimeFiles.filter((rel) => {
      const src = readFileSync(path.join(frontendSrc, rel), 'utf8');
      return /api\.vehicles\.delete\s*\(/.test(src);
    });
    expect(deleteCallers).toEqual([]);
  });
});
