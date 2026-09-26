import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV,
  isBatteryV2LongitudinalProfileMaterializationEnabled,
} from '@config/battery-health-v2.config';
import { LongitudinalProfileMaterializationService } from './longitudinal-profile-materialization.service';
import {
  closeLongitudinalProfileMaterializationOpsContext,
  createLongitudinalProfileMaterializationOpsContext,
} from './longitudinal-profile-materialization.ops-bootstrap';

describe('longitudinal-profile-materialization.ops-bootstrap', () => {
  const envBackup = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-d3-ops-env-'));
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeEnv(contents: string): string {
    const envPath = path.join(tmpDir, '.env');
    const base =
      'DATABASE_URL=postgresql://synqdrive:synqdrive@localhost:5432/synqdrive?schema=public\n';
    fs.writeFileSync(envPath, `${base}${contents}`, 'utf8');
    process.env.SYNQDRIVE_BACKEND_ENV = envPath;
    delete process.env[BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV];
    return envPath;
  }

  it('A — env absent => materialization flag false after bootstrap', async () => {
    writeEnv('');
    const ctx = await createLongitudinalProfileMaterializationOpsContext({
      envFilePath: process.env.SYNQDRIVE_BACKEND_ENV,
    });
    try {
      expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(false);
    } finally {
      await closeLongitudinalProfileMaterializationOpsContext(ctx);
    }
  });

  it('B — env false => SKIPPED_FLAG_OFF without delegate', async () => {
    writeEnv('BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=false\n');
    const ctx = await createLongitudinalProfileMaterializationOpsContext({
      envFilePath: process.env.SYNQDRIVE_BACKEND_ENV,
    });
    const inner = ctx.app.get(LongitudinalProfileMaterializationService);
    const materializeSpy = jest.spyOn(inner, 'materialize').mockResolvedValue({
      outcome: 'CREATED',
      revisionId: 'x',
      canonicalProfileFingerprint: 'f'.repeat(64),
      longitudinalProfileContractVersion: 'v',
      profilePolicyVersion: 'p',
      revision: {} as never,
    });
    try {
      expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(false);
      const outcome = await ctx.runtime.materialize({
        organizationId: '11111111-1111-1111-1111-111111111111',
        vehicleId: '22222222-2222-2222-2222-222222222222',
        sessionLimit: 10,
        profileGeneratedAt: '2026-09-26T00:00:00.000Z',
      });
      expect(outcome).toEqual({ status: 'SKIPPED_FLAG_OFF' });
      expect(materializeSpy).not.toHaveBeenCalled();
    } finally {
      materializeSpy.mockRestore();
      await closeLongitudinalProfileMaterializationOpsContext(ctx);
    }
  });

  it('C — env true => bootstrap sees true and delegates', async () => {
    writeEnv('BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true\n');
    const ctx = await createLongitudinalProfileMaterializationOpsContext({
      envFilePath: process.env.SYNQDRIVE_BACKEND_ENV,
    });
    const inner = ctx.app.get(LongitudinalProfileMaterializationService);
    const materializeSpy = jest.spyOn(inner, 'materialize').mockResolvedValue({
      outcome: 'D1_REJECTED',
      reason: 'INVALID_SESSION_LIMIT',
    });
    try {
      expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(true);
      const outcome = await ctx.runtime.materialize({
        organizationId: '11111111-1111-1111-1111-111111111111',
        vehicleId: '22222222-2222-2222-2222-222222222222',
        sessionLimit: 10,
        profileGeneratedAt: '2026-09-26T00:00:00.000Z',
      });
      expect(materializeSpy).toHaveBeenCalled();
      expect(outcome).toEqual({ outcome: 'D1_REJECTED', reason: 'INVALID_SESSION_LIMIT' });
    } finally {
      materializeSpy.mockRestore();
      await closeLongitudinalProfileMaterializationOpsContext(ctx);
    }
  });
});
