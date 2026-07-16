import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Driving Intelligence V2 feature flags.
 * Hard invariant: trip detection modules must not import this service.
 */
@Injectable()
export class DrivingIntelligenceV2Config {
  constructor(private readonly config: ConfigService) {}

  /** Always false — flags must never affect live trip detection. */
  isTripDetectionAffected(): false {
    return false;
  }

  isMasterEnabled(): boolean {
    return this.config.get<boolean>('drivingIntelligenceV2.masterEnabled', false);
  }

  isDimoSegmentValidationEnabled(): boolean {
    if (!this.isMasterEnabled()) return false;
    return this.config.get<boolean>('drivingIntelligenceV2.dimoSegmentValidationEnabled', false);
  }

  isEngineDetectorShadowEnabled(): boolean {
    if (!this.isMasterEnabled()) return false;
    return this.config.get<boolean>('drivingIntelligenceV2.engineDetectorShadowEnabled', true);
  }

  isHfDetectorShadowEnabled(): boolean {
    if (!this.isMasterEnabled()) return false;
    return this.config.get<boolean>('drivingIntelligenceV2.hfDetectorShadowEnabled', true);
  }
}
