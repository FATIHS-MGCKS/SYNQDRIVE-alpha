import * as fs from 'fs';
import * as path from 'path';
import {
  classifyPreS4f7rDefect,
  DI_S4F7R_OLD_PRODUCTION_SHA,
  DI_S4F7R_RUNTIME_RC_SHA,
  guardedDeployUsesControllerOrchestration,
  resolveAttestationCliBackendRoot,
  simulateS4f7rRollingSequence,
} from './di-v0-s4f7r-deploy-controller-orchestration.lib';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const RC_SHA = '9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4';

describe('di-v0-s4f7r-deploy-controller-orchestration.lib', () => {
  const rcFixture: DiS4f7rTopologyFixture = {
    controllerHasS4f7qLib: true,
    controllerHasS4f7qCli: true,
    targetHasS4f7qLib: false,
    targetHasS4f7qCli: false,
    currentSymlinkPointsToTarget: true,
    attestationGateEnabled: true,
    forwardExactRcGate: true,
    deployControllerRootSet: true,
    controllerShaMatchesExpected: true,
  };

  it('reproduces pre-S4F-7R RC deploy defects', () => {
    const d = classifyPreS4f7rDefect(rcFixture);
    expect(d.targetReleaseSuppliesReplicaLib).toBe(true);
    expect(d.rcContainsS4f7qGuard).toBe(false);
    expect(d.gateReachableDuringRealRcDeploy).toBe(false);
    expect(d.rcContainsS4f7qCli).toBe(false);
    expect(d.gateCliPathValidDuringRealDeploy).toBe(false);
    expect(d.rollbackWithGateAcceptsOldSha).toBe(false);
  });

  it('A-only failure: B not restarted, rollback to old', () => {
    const r = simulateS4f7rRollingSequence({
      phase: 'FORWARD',
      targetSha: DI_S4F7R_RUNTIME_RC_SHA,
      currentReleaseShaBeforeSwitch: DI_S4F7R_OLD_PRODUCTION_SHA,
      attestationGate: true,
      forwardExactRcGate: true,
      aHealthy: true,
      aAttestationPass: false,
      bRestarted: false,
      bHealthy: false,
      bAttestationPass: false,
      controllerCliAvailable: true,
    });
    expect(r.bRestartAttempted).toBe(false);
    expect(r.rollbackTriggered).toBe(true);
    expect(r.finalCurrentReleaseSha).toBe(DI_S4F7R_OLD_PRODUCTION_SHA);
    expect(r.replicaAFinalSha).toBe(DI_S4F7R_OLD_PRODUCTION_SHA);
    expect(r.replicaBFinalSha).toBe(DI_S4F7R_OLD_PRODUCTION_SHA);
    expect(r.finalMixedSha).toBe(false);
  });

  it('B failure triggers full rollback to old SHA', () => {
    const r = simulateS4f7rRollingSequence({
      phase: 'FORWARD',
      targetSha: DI_S4F7R_RUNTIME_RC_SHA,
      currentReleaseShaBeforeSwitch: DI_S4F7R_OLD_PRODUCTION_SHA,
      attestationGate: true,
      forwardExactRcGate: true,
      aHealthy: true,
      aAttestationPass: true,
      bRestarted: true,
      bHealthy: true,
      bAttestationPass: false,
      controllerCliAvailable: true,
    });
    expect(r.rollbackTriggered).toBe(true);
    expect(r.replicaAFinalSha).toBe(DI_S4F7R_OLD_PRODUCTION_SHA);
    expect(r.replicaBFinalSha).toBe(DI_S4F7R_OLD_PRODUCTION_SHA);
    expect(r.finalMixedSha).toBe(false);
  });

  it('success path: target lacks S4F-7Q files, controller provides CLI', () => {
    const r = simulateS4f7rRollingSequence({
      phase: 'FORWARD',
      targetSha: DI_S4F7R_RUNTIME_RC_SHA,
      currentReleaseShaBeforeSwitch: DI_S4F7R_OLD_PRODUCTION_SHA,
      attestationGate: true,
      forwardExactRcGate: true,
      aHealthy: true,
      aAttestationPass: true,
      bRestarted: true,
      bHealthy: true,
      bAttestationPass: true,
      controllerCliAvailable: true,
    });
    expect(r.successfulGuardedSequence).toBe(true);
    expect(r.finalMixedSha).toBe(false);
  });

  it('fails closed when controller CLI unavailable after current switch', () => {
    const r = simulateS4f7rRollingSequence({
      phase: 'FORWARD',
      targetSha: DI_S4F7R_RUNTIME_RC_SHA,
      currentReleaseShaBeforeSwitch: DI_S4F7R_OLD_PRODUCTION_SHA,
      attestationGate: true,
      forwardExactRcGate: true,
      aHealthy: true,
      aAttestationPass: true,
      bRestarted: false,
      bHealthy: false,
      bAttestationPass: false,
      controllerCliAvailable: false,
    });
    expect(r.rollbackTriggered).toBe(true);
    expect(r.successfulGuardedSequence).toBe(false);
  });

  it('attestation CLI resolves from controller root not current symlink', () => {
    const root = resolveAttestationCliBackendRoot('/controller', '/opt/synqdrive/current/backend');
    expect(root).toBe('/controller/backend');
    expect(root).not.toContain('current');
  });

  it('rollback phase allows old SHA without forward RC pin', () => {
    const r = simulateS4f7rRollingSequence({
      phase: 'ROLLBACK',
      targetSha: DI_S4F7R_RUNTIME_RC_SHA,
      currentReleaseShaBeforeSwitch: DI_S4F7R_RUNTIME_RC_SHA,
      attestationGate: false,
      forwardExactRcGate: false,
      aHealthy: true,
      aAttestationPass: true,
      bRestarted: true,
      bHealthy: true,
      bAttestationPass: true,
      controllerCliAvailable: true,
    });
    expect(r.finalCurrentReleaseSha).toBe(DI_S4F7R_OLD_PRODUCTION_SHA);
  });

  it('guarded orchestration requires controller SHA pin', () => {
    expect(
      guardedDeployUsesControllerOrchestration({
        attestationGate: true,
        deployControllerRootSet: true,
        controllerShaMatches: true,
      }),
    ).toBe(true);
    expect(
      guardedDeployUsesControllerOrchestration({
        attestationGate: true,
        deployControllerRootSet: true,
        controllerShaMatches: false,
      }),
    ).toBe(false);
  });

  it('bash: rollback disables forward gate', () => {
    const lib = fs.readFileSync(
      path.join(BACKEND_ROOT, 'scripts/ops/lib/vps-production-replica.lib.sh'),
      'utf8',
    );
    expect(lib).toContain('SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0');
    expect(lib).toContain('SYNQDRIVE_DI_S4F7Q_FORWARD_EXACT_RC_GATE=0');
    expect(lib).toContain('ROLLBACK_FORWARD_GATE_DISABLED=YES');
  });

  it('bash: guarded deploy sources s4f7q from controller root', () => {
    const lib = fs.readFileSync(
      path.join(BACKEND_ROOT, 'scripts/ops/lib/vps-production-replica.lib.sh'),
      'utf8',
    );
    expect(lib).toContain('SYNQDRIVE_DEPLOY_CONTROLLER_ROOT}/backend/scripts/ops/lib/di-v0-s4f7q');
  });

  it('bash: deploy-release sources replica lib from controller when gate on', () => {
    const deploy = fs.readFileSync(path.join(BACKEND_ROOT, 'scripts/ops/vps-deploy-release.sh'), 'utf8');
    expect(deploy).toContain('SYNQDRIVE_DEPLOY_CONTROLLER_ROOT');
    expect(deploy).toContain('EXPECTED_DEPLOY_CONTROLLER_SHA');
    expect(deploy).toContain('CONTROLLER_OPS_DIR');
  });

  it('generic deploy: gate default off', () => {
    const lib = fs.readFileSync(
      path.join(BACKEND_ROOT, 'scripts/ops/lib/vps-production-replica.lib.sh'),
      'utf8',
    );
    expect(lib).toContain('SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE:-0');
  });

  it('RC at frozen SHA has no s4f7q ops files', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', RC_SHA, 'backend/scripts/ops/'], {
      encoding: 'utf8',
    });
    expect(names).not.toContain('backend/scripts/ops/lib/di-v0-s4f7q-exact-rc-attestation-deploy.lib.sh');
    expect(names).not.toMatch(/di-v0-s4f7q-exact-rc-attestation-deploy-cli/);
  });
});

type DiS4f7rTopologyFixture = import('./di-v0-s4f7r-deploy-controller-orchestration.lib').DiS4f7rTopologyFixture;
