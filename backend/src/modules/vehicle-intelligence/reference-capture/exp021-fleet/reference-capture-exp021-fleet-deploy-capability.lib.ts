import * as fs from 'fs';
import * as path from 'path';

export const EXP021_FLEET_COORDINATOR_CAPABILITY_MARKER =
  'reference-capture-exp021-fleet-coordinator.scheduler';

export const EXP021_FLEET_COORDINATOR_REQUIRED_SOURCE_PATHS = [
  'backend/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.ts',
  'backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.ts',
  'backend/src/workers/workers.module.ts',
  'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts',
] as const;

export const EXP021_FLEET_COORDINATOR_REQUIRED_DIST_PATHS = [
  'backend/dist/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.js',
  'backend/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.js',
] as const;

export type Exp021FleetDeployCapabilityCheck = {
  ok: boolean;
  coordinatorEnabled: boolean;
  releaseRoot: string;
  missingPaths: string[];
  reasons: string[];
};

export function parseFleetCoordinatorEnabledFromEnvText(envText: string): boolean {
  const match = envText.match(/^EXP021_FLEET_COORDINATOR_ENABLED=(.*)$/m);
  if (!match) return false;
  const value = match[1].trim().replace(/^['"]|['"]$/g, '');
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function evaluateExp021FleetDeployCapability(input: {
  releaseRoot: string;
  coordinatorEnabled: boolean;
  exists?: (absolutePath: string) => boolean;
}): Exp021FleetDeployCapabilityCheck {
  const exists = input.exists ?? ((absolutePath: string) => fs.existsSync(absolutePath));
  if (!input.coordinatorEnabled) {
    return {
      ok: true,
      coordinatorEnabled: false,
      releaseRoot: input.releaseRoot,
      missingPaths: [],
      reasons: [],
    };
  }

  const requiredPaths = [
    ...EXP021_FLEET_COORDINATOR_REQUIRED_SOURCE_PATHS,
    ...EXP021_FLEET_COORDINATOR_REQUIRED_DIST_PATHS,
  ];
  const missingPaths = requiredPaths.filter((relativePath) => {
    return !exists(path.join(input.releaseRoot, relativePath));
  });

  const reasons: string[] = [];
  if (missingPaths.length > 0) {
    reasons.push('TARGET_RELEASE_HAS_FLEET_COORDINATOR_CAPABILITY=NO');
  }

  const workersModulePath = path.join(input.releaseRoot, EXP021_FLEET_COORDINATOR_REQUIRED_SOURCE_PATHS[2]);
  if (exists(workersModulePath)) {
    const workersModule = fs.readFileSync(workersModulePath, 'utf8');
    if (!workersModule.includes(EXP021_FLEET_COORDINATOR_CAPABILITY_MARKER)) {
      reasons.push('WORKERS_MODULE_MISSING_FLEET_COORDINATOR_REGISTRATION');
    }
  }

  return {
    ok: missingPaths.length === 0 && reasons.length === 0,
    coordinatorEnabled: true,
    releaseRoot: input.releaseRoot,
    missingPaths,
    reasons,
  };
}
