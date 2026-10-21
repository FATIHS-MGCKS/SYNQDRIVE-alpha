import { Test } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { BatteryGeneralizedEvidenceModule } from '../generalized-evidence.module';
import { BatteryRestSessionService } from '../battery-rest-session.service';
import { LateTripAssociationService } from '../late-trip-association.service';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import { RestSessionFeatureShadowTriggerService } from './rest-session-feature-shadow-trigger.service';

describe('BatteryGeneralizedEvidenceModule C4 DI', () => {
  it('C4_NEST_DI_RESOLUTION: resolves feature + lifecycle services without circular deps', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BatteryGeneralizedEvidenceModule, PrismaModule],
    }).compile();

    expect(moduleRef.get(RestSessionFeatureComputationService)).toBeInstanceOf(
      RestSessionFeatureComputationService,
    );
    expect(moduleRef.get(RestSessionFeatureShadowTriggerService)).toBeInstanceOf(
      RestSessionFeatureShadowTriggerService,
    );
    expect(moduleRef.get(BatteryRestSessionService)).toBeInstanceOf(BatteryRestSessionService);
    expect(moduleRef.get(LateTripAssociationService)).toBeInstanceOf(LateTripAssociationService);

    await moduleRef.close();
  });
});
