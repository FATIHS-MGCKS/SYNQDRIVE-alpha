import { MODULE_METADATA } from '@nestjs/common/constants';
import { ReferenceCaptureAcquisitionService } from '@modules/vehicle-intelligence/reference-capture/reference-capture-acquisition.service';
import { ReferenceCaptureConfig } from '@modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureObservationWriterService } from '@modules/vehicle-intelligence/reference-capture/reference-capture-observation-writer.service';
import { ReferenceCaptureRetentionService } from '@modules/vehicle-intelligence/reference-capture/reference-capture-retention.service';
import { ReferenceCaptureRunnerService } from '@modules/vehicle-intelligence/reference-capture/reference-capture-runner.service';
import { ReferenceCaptureSessionRepository } from '@modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { ReferenceCaptureProcessor } from './processors/reference-capture.processor';
import { ReferenceCaptureRetentionScheduler } from './schedulers/reference-capture-retention.scheduler';

/**
 * Phase 3A.2 deploy gate — WorkersModule registers ReferenceCaptureProcessor and
 * ReferenceCaptureRetentionScheduler, which inject providers that must be exported
 * from VehicleIntelligenceModule (boot check failed in production without this).
 */
describe('WorkersModule reference-capture DI exports', () => {
  const exportedProviders = Reflect.getMetadata(
    MODULE_METADATA.EXPORTS,
    VehicleIntelligenceModule,
  ) as unknown[];

  const requiredExports = [
    ReferenceCaptureConfig,
    ReferenceCaptureSessionRepository,
    ReferenceCaptureAcquisitionService,
    ReferenceCaptureObservationWriterService,
    ReferenceCaptureRunnerService,
    ReferenceCaptureRetentionService,
  ];

  it.each(requiredExports.map((token) => [token.name, token]))(
    'VehicleIntelligenceModule exports %s for WorkersModule',
    (_name, token) => {
      expect(exportedProviders).toContain(token);
    },
  );

  it('documents worker-side consumers that depend on exported reference-capture providers', () => {
    expect(ReferenceCaptureProcessor).toBeDefined();
    expect(ReferenceCaptureRetentionScheduler).toBeDefined();
  });
});
