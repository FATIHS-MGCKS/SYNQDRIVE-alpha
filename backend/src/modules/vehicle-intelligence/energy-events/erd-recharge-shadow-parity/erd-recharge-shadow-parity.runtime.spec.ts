import { ErdRechargeShadowParityRuntimeService } from './erd-recharge-shadow-parity.runtime';
import { ErdRechargeShadowParityService } from './erd-recharge-shadow-parity.service';
import {
  ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV,
  ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG,
} from './erd-recharge-shadow-parity.constants';
import { ERD_RECHARGE_SHADOW_RUN_RESULT } from './erd-recharge-shadow-parity.types';

const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH_X = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const VEH_Y = '22222222-2222-4222-8222-222222222222';
const WINDOW_FROM = new Date('2026-06-01T00:00:00.000Z');
const WINDOW_TO = new Date('2026-06-02T23:59:59.999Z');

function saveEnv(keys: string[]): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('ErdRechargeShadowParityRuntimeService', () => {
  const envKeys = [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG, ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV];
  let savedEnv: Record<string, string | undefined>;
  let evaluateVehicleWindow: jest.Mock;
  let metrics: { recordRun: jest.Mock };
  let runtime: ErdRechargeShadowParityRuntimeService;

  beforeEach(() => {
    savedEnv = saveEnv(envKeys);
    delete process.env[ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG];
    delete process.env[ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV];
    evaluateVehicleWindow = jest.fn().mockResolvedValue({ result: 'PERSISTED' });
    metrics = { recordRun: jest.fn() };
    runtime = new ErdRechargeShadowParityRuntimeService(
      { evaluateVehicleWindow } as unknown as ErdRechargeShadowParityService,
      metrics as never,
    );
  });

  afterEach(() => {
    restoreEnv(savedEnv);
    jest.restoreAllMocks();
  });

  const hookInput = {
    organizationId: ORG_A,
    vehicleId: VEH_X,
    windowFrom: WINDOW_FROM,
    windowTo: WINDOW_TO,
  };

  it('R1: global off / no allowlist → service not called', () => {
    runtime.runAfterEnergyDetectionSafe(hookInput);
    expect(evaluateVehicleWindow).not.toHaveBeenCalled();
    expect(metrics.recordRun).toHaveBeenCalledWith(ERD_RECHARGE_SHADOW_RUN_RESULT.SKIPPED_FLAG_OFF);
  });

  it('R2: global off / exact scoped pair → service called once persist=true', () => {
    process.env[ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV] = `${ORG_A}:${VEH_X}`;
    runtime.runAfterEnergyDetectionSafe(hookInput);
    expect(evaluateVehicleWindow).toHaveBeenCalledTimes(1);
    expect(evaluateVehicleWindow).toHaveBeenCalledWith({
      organizationId: ORG_A,
      vehicleId: VEH_X,
      windowFrom: WINDOW_FROM,
      windowTo: WINDOW_TO,
      persist: true,
    });
  });

  it('R3: global off / wrong vehicle → service not called', () => {
    process.env[ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV] = `${ORG_A}:${VEH_Y}`;
    runtime.runAfterEnergyDetectionSafe(hookInput);
    expect(evaluateVehicleWindow).not.toHaveBeenCalled();
  });

  it('R4: global off / malformed allowlist → service not called', () => {
    process.env[ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV] = `${ORG_A}:${VEH_X},bad`;
    runtime.runAfterEnergyDetectionSafe(hookInput);
    expect(evaluateVehicleWindow).not.toHaveBeenCalled();
  });

  it('R5: global on → service called once persist=true', () => {
    process.env[ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG] = 'true';
    runtime.runAfterEnergyDetectionSafe(hookInput);
    expect(evaluateVehicleWindow).toHaveBeenCalledTimes(1);
    expect(evaluateVehicleWindow.mock.calls[0][0].persist).toBe(true);
  });

  it('R6: authorized service rejection → runAfterEnergyDetectionSafe does not throw', async () => {
    process.env[ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV] = `${ORG_A}:${VEH_X}`;
    evaluateVehicleWindow.mockRejectedValue(new Error('injectPersistenceFailure'));
    expect(() => runtime.runAfterEnergyDetectionSafe(hookInput)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(metrics.recordRun).toHaveBeenCalledWith(
      ERD_RECHARGE_SHADOW_RUN_RESULT.FAILED_ISOLATED,
    );
  });

  it('R7: unauthorized call → evaluateVehicleWindow not invoked (no async work)', () => {
    runtime.runAfterEnergyDetectionSafe(hookInput);
    expect(evaluateVehicleWindow).not.toHaveBeenCalled();
  });
});
