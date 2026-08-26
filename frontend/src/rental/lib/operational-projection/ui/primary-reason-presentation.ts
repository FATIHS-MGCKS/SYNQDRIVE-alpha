import type { ConnectivityReasonCode } from '../../../../lib/api';
import type { TranslationKey } from '../../../i18n/translations/en';
import { reasonCodeHint } from '../../../components/fleet-connectivity/fleet-connectivity.presentation';
import type { VehicleOperationalAudience } from './types';

export type OperationalTranslator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

/**
 * P0.2 operator primaryReason codes — fleet.operationalAvailability.reason.* (DE/EN).
 * Connectivity-owned codes fall back to fleetConnectivity.reason.* via reasonCodeHint.
 */
export const OPERATIONAL_PRIMARY_REASON_LABEL_KEYS: Record<string, TranslationKey> = {
  BUSINESS_WORKFLOW_BLOCKED: 'fleet.operationalAvailability.reason.businessWorkflowBlocked',
  HEALTH_RENTAL_BLOCKED: 'fleet.operationalAvailability.reason.healthRentalBlocked',
  DEVICE_UNPLUG_WEBHOOK: 'fleet.operationalAvailability.reason.deviceUnplugWebhook',
  CONNECTIVITY_CONFIRMED_INTERRUPTION:
    'fleet.operationalAvailability.reason.connectivityConfirmedInterruption',
  DEVICE_CHECK_REQUIRED: 'fleet.operationalAvailability.reason.deviceCheckRequired',
  CONNECTIVITY_VERIFICATION_REQUIRED:
    'fleet.operationalAvailability.reason.connectivityVerificationRequired',
  TELEMETRY_OFFLINE: 'fleet.operationalAvailability.reason.telemetryOffline',
  DATA_COVERAGE_INSUFFICIENT: 'fleet.operationalAvailability.reason.dataCoverageInsufficient',
  INSUFFICIENT_CROSS_DOMAIN_EVIDENCE:
    'fleet.operationalAvailability.reason.insufficientCrossDomainEvidence',
};

const UNKNOWN_REASON_KEY: TranslationKey = 'fleet.operationalAvailability.reason.unknown';

export interface PrimaryReasonPresentation {
  code: string | null;
  label: string | null;
  /** Whether the label is a safe human translation vs technical fallback. */
  resolution: 'mapped' | 'connectivity_fallback' | 'explicit_null' | 'unknown_safe' | 'technical_raw';
}

function isConnectivityReasonCode(code: string): code is ConnectivityReasonCode {
  return code.startsWith('TELEMETRY_') ||
    code.startsWith('DEVICE_') ||
    code.startsWith('DATA_COVERAGE_') ||
    code.startsWith('AUTHORIZATION_') ||
    code.startsWith('CONSENT_') ||
    code.startsWith('TOKEN_') ||
    code.startsWith('PROVIDER_') ||
    code.startsWith('LINK_') ||
    code.startsWith('WEBHOOK_') ||
    code.startsWith('STATE_') ||
    code.startsWith('MANUAL_') ||
    code === 'NO_ACTIVE_PROVIDER_LINK' ||
    code === 'NO_TELEMETRY_TIMESTAMP';
}

export function mapPrimaryReasonPresentation(
  code: string | null,
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): PrimaryReasonPresentation {
  if (code === null) {
    return { code: null, label: null, resolution: 'explicit_null' };
  }

  const operationalKey = OPERATIONAL_PRIMARY_REASON_LABEL_KEYS[code];
  if (operationalKey) {
    return {
      code,
      label: options.t(operationalKey),
      resolution: 'mapped',
    };
  }

  if (isConnectivityReasonCode(code)) {
    const label = reasonCodeHint(code as ConnectivityReasonCode, options.t);
    const isRawKey = label === `fleetConnectivity.reason.${code}`;
    return {
      code,
      label: isRawKey ? options.t(UNKNOWN_REASON_KEY) : label,
      resolution: isRawKey ? 'unknown_safe' : 'connectivity_fallback',
    };
  }

  if (options.audience === 'master_admin') {
    return { code, label: code, resolution: 'technical_raw' };
  }

  return {
    code,
    label: options.t(UNKNOWN_REASON_KEY),
    resolution: 'unknown_safe',
  };
}

export function mapReasonCodeListPresentation(
  codes: readonly string[],
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): PrimaryReasonPresentation[] {
  return codes.map((code) => mapPrimaryReasonPresentation(code, options));
}
