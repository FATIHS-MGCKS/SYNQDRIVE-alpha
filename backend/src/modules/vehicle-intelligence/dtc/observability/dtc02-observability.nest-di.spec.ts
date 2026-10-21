import { Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DimoWebhookController } from '@modules/dimo/dimo-webhook.controller';
import { VehicleIntelligenceModule } from '../../vehicle-intelligence.module';
import { Dtc02ObservabilityModule } from './dtc02-observability.module';
import { Dtc02ObservabilityService } from './dtc02-observability.service';

/**
 * Production deploy boot-check (`SYNQDRIVE_BOOT_CHECK=1`) resolves AppModule.
 * DTC-02 P2 registered `Dtc02ObservabilityService` only in `Dtc02ObservabilityModule`
 * but `VehicleIntelligenceModule` exported the service class directly — Nest rejects that
 * at bootstrap (deploy abort e9524c5b, production unchanged d43ff450).
 */
describe('DTC-02 observability Nest DI ownership', () => {
  const viProviders: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VehicleIntelligenceModule) ?? [];
  const viExports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, VehicleIntelligenceModule) ?? [];
  const viImports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, VehicleIntelligenceModule) ?? [];
  const dtc02Providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, Dtc02ObservabilityModule) ?? [];
  const dtc02Exports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, Dtc02ObservabilityModule) ?? [];

  it('registers Dtc02ObservabilityService only in Dtc02ObservabilityModule', () => {
    expect(dtc02Providers).toContain(Dtc02ObservabilityService);
    expect(dtc02Exports).toContain(Dtc02ObservabilityService);
    expect(viProviders).not.toContain(Dtc02ObservabilityService);
  });

  it('re-exports Dtc02ObservabilityModule from VehicleIntelligenceModule (not the service token)', () => {
    expect(viImports).toContain(Dtc02ObservabilityModule);
    expect(viExports).toContain(Dtc02ObservabilityModule);
    expect(viExports).not.toContain(Dtc02ObservabilityService);
  });

  it('rejects the invalid direct service export anti-pattern at Nest compile time', async () => {
    @Module({
      imports: [Dtc02ObservabilityModule],
      exports: [Dtc02ObservabilityService],
    })
    class InvalidDtc02ReexportModule {}

    await expect(
      Test.createTestingModule({
        imports: [InvalidDtc02ReexportModule],
      }).compile(),
    ).rejects.toThrow(/export.*Dtc02ObservabilityService|Nest cannot export/i);
  });

  it('resolves Dtc02ObservabilityService once via Dtc02ObservabilityModule re-export', async () => {
    @Module({
      imports: [Dtc02ObservabilityModule],
      exports: [Dtc02ObservabilityModule],
    })
    class HostModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [HostModule],
    })
      .overrideProvider(TripMetricsService)
      .useValue({ registry: undefined })
      .compile();

    const a = moduleRef.get(Dtc02ObservabilityService, { strict: false });
    const b = moduleRef.get(Dtc02ObservabilityService, { strict: false });
    expect(a).toBeInstanceOf(Dtc02ObservabilityService);
    expect(a).toBe(b);
  });

  it('allows DimoWebhookController to declare optional Dtc02ObservabilityService injection', () => {
    const paramTypes: unknown[] =
      Reflect.getMetadata('design:paramtypes', DimoWebhookController) ?? [];
    expect(paramTypes.some((t) => t === Dtc02ObservabilityService)).toBe(true);
  });
});
