#!/usr/bin/env node
/**
 * Validate vehicle-onboarding knowledge graph YAML — docs only.
 * Delegates to architecture/vehicle-onboarding/scripts/validate-graph.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(dir, 'scripts', 'validate-graph.mjs');
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);