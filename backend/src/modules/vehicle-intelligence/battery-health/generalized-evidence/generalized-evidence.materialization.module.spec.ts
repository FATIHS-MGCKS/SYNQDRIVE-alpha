import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { BatteryGeneralizedEvidenceModule } from './generalized-evidence.module';
import { LongitudinalProfileMaterializationRepository } from './rest-session-features/longitudinal/longitudinal-profile-materialization.repository';
import { LongitudinalProfileMaterializationRuntimeService } from './rest-session-features/longitudinal/longitudinal-profile-materialization.runtime.service';
import { LongitudinalProfileMaterializationService } from './rest-session-features/longitudinal/longitudinal-profile-materialization.service';

describe('BatteryGeneralizedEvidenceModule D3 F1 DI', () => {
  it('N — resolves D3 providers; exports gated facade only', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BatteryGeneralizedEvidenceModule, PrismaModule],
    }).compile();

    expect(moduleRef.get(LongitudinalProfileMaterializationRepository)).toBeInstanceOf(
      LongitudinalProfileMaterializationRepository,
    );
    expect(moduleRef.get(LongitudinalProfileMaterializationService)).toBeInstanceOf(
      LongitudinalProfileMaterializationService,
    );
    expect(moduleRef.get(LongitudinalProfileMaterializationRuntimeService)).toBeInstanceOf(
      LongitudinalProfileMaterializationRuntimeService,
    );

    const exportsMeta =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, BatteryGeneralizedEvidenceModule) ?? [];
    expect(exportsMeta).toContain(LongitudinalProfileMaterializationRuntimeService);
    expect(exportsMeta).not.toContain(LongitudinalProfileMaterializationService);
    expect(exportsMeta).not.toContain(LongitudinalProfileMaterializationRepository);

    await moduleRef.close();
  });

  it('R/S/T — module source has no reconciliation scheduler or E3 imports for D3 runtime', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const modulePath = path.join(__dirname, 'generalized-evidence.module.ts');
    const runtimePath = path.join(
      __dirname,
      './rest-session-features/longitudinal/longitudinal-profile-materialization.runtime.service.ts',
    );
    const moduleSource = fs.readFileSync(modulePath, 'utf8');
    const runtimeSource = fs.readFileSync(runtimePath, 'utf8');

    expect(moduleSource).not.toMatch(/BatteryV2Reconciliation/);
    expect(moduleSource).not.toMatch(/longitudinal.*evaluat/i);
    expect(runtimeSource).not.toMatch(/integrity-inspection\.service/);
    expect(runtimeSource).not.toMatch(/battery-assessment/i);
  });
});
