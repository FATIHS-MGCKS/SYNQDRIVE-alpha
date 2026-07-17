#!/usr/bin/env ts-node
/**
 * Repo-root entrypoint — delegates to backend ops script.
 *
 *   ./scripts/ops/audit-tire-odometer-anchor-candidates.ts --fixtures-only
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts ...
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const backendRoot = path.resolve(__dirname, '..', '..', 'backend');
const script = path.join('scripts', 'ops', 'audit-tire-odometer-anchor-candidates.ts');

execFileSync(
  'npx',
  ['ts-node', '-r', 'tsconfig-paths/register', script, ...process.argv.slice(2)],
  { cwd: backendRoot, stdio: 'inherit' },
);
