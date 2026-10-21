import type { DimoAuthService } from '../../../dimo/dimo-auth.service';
import type { DimoTelemetryService } from '../../../dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../../dimo/provider/dimo-provider-request-context.util';
import type {
  DiV0HistoricalPositionQueryInput,
  DiV0HistoricalPositionTransport,
} from './di-v0-position-acquisition.types';
import { DiV0VehicleJwtUnavailableError } from './di-v0-position-errors';

/**
 * Adapter onto the shared DIMO transport (auth, provider gateway, budget, executor retries).
 * Not registered with Nest and not wired to any caller in S3A. The vehicle JWT is used only
 * for the call and never returned, stored, or hashed.
 */
export class DimoTelemetryDiV0HistoricalPositionTransport implements DiV0HistoricalPositionTransport {
  constructor(
    private readonly auth: Pick<DimoAuthService, 'getVehicleJwt'>,
    private readonly telemetry: Pick<DimoTelemetryService, 'queryGraphQL'>,
  ) {}

  async executeHistoricalPositionQuery(input: DiV0HistoricalPositionQueryInput): Promise<unknown> {
    const vehicleJwt = await this.auth.getVehicleJwt(input.dimoTokenId);
    if (typeof vehicleJwt !== 'string' || vehicleJwt.length === 0) {
      throw new DiV0VehicleJwtUnavailableError();
    }
    return this.telemetry.queryGraphQL(
      vehicleJwt,
      input.query,
      undefined,
      buildDimoProviderRequestContext(input.dimoTokenId, {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
      }),
    );
  }
}
