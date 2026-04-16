import { Injectable } from '@nestjs/common';
import { HighMobilityHealthAppAuthService } from './high-mobility-health-app-auth.service';

/**
 * HighMobilityAuthService
 *
 * @deprecated Use HighMobilityHealthAppAuthService or HighMobilityTelemetryAppAuthService.
 * This shim delegates to the Health-APP auth service to avoid breaking existing
 * usages until all call-sites migrate to the typed per-app services.
 */
@Injectable()
export class HighMobilityAuthService {
  constructor(private readonly healthAuth: HighMobilityHealthAppAuthService) {}

  getAccessToken() { return this.healthAuth.getAccessToken(); }
  authHeaders() { return this.healthAuth.authHeaders(); }
  isConfigured() { return this.healthAuth.isConfigured(); }
  flushTokenCache() { return this.healthAuth.flushTokenCache(); }
}
