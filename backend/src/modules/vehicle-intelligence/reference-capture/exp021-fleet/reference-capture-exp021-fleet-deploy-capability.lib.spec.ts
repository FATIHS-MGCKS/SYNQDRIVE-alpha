import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateExp021FleetDeployCapability,
  EXP021_FLEET_COORDINATOR_REQUIRED_DIST_PATHS,
  EXP021_FLEET_COORDINATOR_REQUIRED_SOURCE_PATHS,
  parseFleetCoordinatorEnabledFromEnvText,
} from './reference-capture-exp021-fleet-deploy-capability.lib';

describe('EXP-021 fleet deploy capability guard', () => {
  const repoRoot = path.resolve(__dirname, '../../../../../..');

  it('parses coordinator enabled from env text', () => {
    expect(parseFleetCoordinatorEnabledFromEnvText('EXP021_FLEET_COORDINATOR_ENABLED=true\n')).toBe(true);
    expect(parseFleetCoordinatorEnabledFromEnvText('EXP021_FLEET_COORDINATOR_ENABLED=false\n')).toBe(false);
  });

  it('passes when coordinator disabled even if capability files absent', () => {
    const result = evaluateExp021FleetDeployCapability({
      releaseRoot: repoRoot,
      coordinatorEnabled: false,
      exists: () => false,
    });
    expect(result.ok).toBe(true);
  });

  it('passes for current valid release with coordinator enabled', () => {
    const result = evaluateExp021FleetDeployCapability({
      releaseRoot: repoRoot,
      coordinatorEnabled: true,
      exists: (absolutePath) => {
        if (fs.existsSync(absolutePath)) return true;
        // Unit gate may run before `npm run build`; VPS preflight runs post-build.
        return EXP021_FLEET_COORDINATOR_REQUIRED_DIST_PATHS.some((relativePath) =>
          absolutePath.endsWith(relativePath),
        );
      },
    });
    expect(result.ok).toBe(true);
    expect(result.missingPaths).toEqual([]);
  });

  it('fails when coordinator enabled but dist capability missing', () => {
    const result = evaluateExp021FleetDeployCapability({
      releaseRoot: repoRoot,
      coordinatorEnabled: true,
      exists: (absolutePath) => {
        return !EXP021_FLEET_COORDINATOR_REQUIRED_DIST_PATHS.some((relativePath) =>
          absolutePath.endsWith(relativePath),
        );
      },
    });
    expect(result.ok).toBe(false);
    expect(result.missingPaths.length).toBeGreaterThan(0);
  });

  it('fails pre-PR-C style release missing coordinator source', () => {
    const result = evaluateExp021FleetDeployCapability({
      releaseRoot: '/tmp/exp021-missing-capability',
      coordinatorEnabled: true,
      exists: (absolutePath) => {
        return !EXP021_FLEET_COORDINATOR_REQUIRED_SOURCE_PATHS.some((relativePath) =>
          absolutePath.endsWith(relativePath),
        );
      },
    });
    expect(result.ok).toBe(false);
  });
});
