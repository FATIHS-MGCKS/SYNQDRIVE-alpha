import type { ModuleHealth } from '@modules/rental-health/rental-health.types';
import type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFreshness,
} from '../../evidence/ai-evidence.enums';
import type {
  AiHealthDomainSeverity,
  AiHealthDomainSlice,
  AiHealthDomainStatus,
} from './ai-get-vehicle-health-summary.types';

export function mapHealthStateToSeverity(state: AiHealthDomainStatus): AiHealthDomainSeverity {
  switch (state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'good':
      return 'info';
    case 'n_a':
      return 'not_applicable';
    case 'endpoint_error':
    case 'not_supported':
      return 'unknown';
    case 'unknown':
    default:
      return 'unknown';
  }
}

export function mapFreshnessFromModuleHealth(
  module: Pick<ModuleHealth, 'last_updated_at' | 'data_stale'>,
): AiEvidenceFreshness {
  if (!module.last_updated_at) {
    return 'no_signal';
  }
  if (module.data_stale) {
    return 'offline';
  }
  return 'live';
}

export function mapAvailabilityFromModuleHealth(
  module: ModuleHealth,
  options: { loadFailed?: boolean; notSupported?: boolean } = {},
): AiEvidenceAvailability {
  if (options.notSupported) {
    return 'unavailable';
  }
  if (options.loadFailed) {
    return 'unavailable';
  }
  if (module.state === 'n_a') {
    return 'unavailable';
  }
  if (module.pipeline_available === false) {
    return 'unavailable';
  }
  if (module.state === 'unknown') {
    return module.data_stale ? 'partial' : 'unavailable';
  }
  if (module.data_stale) {
    return 'partial';
  }
  return 'available';
}

export function mapConfidenceFromModuleHealth(
  module: ModuleHealth,
  options: { loadFailed?: boolean } = {},
): AiEvidenceConfidence {
  if (options.loadFailed || module.pipeline_available === false) {
    return 'unknown';
  }
  if (module.state === 'unknown' || !module.last_updated_at) {
    return 'low';
  }
  if (module.state === 'critical') {
    return 'medium';
  }
  if (module.data_stale) {
    return 'low';
  }
  if (module.state === 'warning') {
    return 'medium';
  }
  if (module.state === 'good') {
    return 'high';
  }
  return 'medium';
}

export function mapModuleHealthToDomainSlice(
  module: ModuleHealth,
  options: {
    blocker?: boolean;
    loadFailed?: boolean;
    notSupported?: boolean;
    reasonCodes?: string[];
    warnings?: string[];
    summaryFacts?: string[];
  } = {},
): AiHealthDomainSlice {
  const summaryFacts =
    options.summaryFacts && options.summaryFacts.length > 0
      ? options.summaryFacts
      : module?.reason
        ? [module.reason]
        : [];

  const status: AiHealthDomainStatus = options.loadFailed
    ? 'endpoint_error'
    : options.notSupported
      ? 'not_supported'
      : module.state;

  return {
    status,
    severity: mapHealthStateToSeverity(status),
    observedAt: module.last_updated_at,
    freshness: mapFreshnessFromModuleHealth(module),
    source: module.source ?? 'rental_health',
    summaryFacts,
    blocker: options.blocker === true,
    availability: mapAvailabilityFromModuleHealth(module, {
      loadFailed: options.loadFailed,
      notSupported: options.notSupported,
    }),
    confidence: mapConfidenceFromModuleHealth(module, { loadFailed: options.loadFailed }),
    reasonCodes: options.reasonCodes ?? [],
    warnings: options.warnings ?? [],
    isHistorical: module.data_stale || !module.last_updated_at,
  };
}

export function buildEndpointErrorSlice(input: {
  source: string;
  message: string;
  reasonCodes?: string[];
}): AiHealthDomainSlice {
  return {
    status: 'endpoint_error',
    severity: 'unknown',
    observedAt: null,
    freshness: 'no_signal',
    source: input.source,
    summaryFacts: [input.message],
    blocker: false,
    availability: 'unavailable',
    confidence: 'unknown',
    reasonCodes: input.reasonCodes ?? ['PIPELINE_UNAVAILABLE'],
    warnings: ['provider_timeout'],
    isHistorical: false,
  };
}

export function buildMissingDataSlice(input: {
  source: string;
  message: string;
  reasonCodes?: string[];
}): AiHealthDomainSlice {
  return {
    status: 'unknown',
    severity: 'unknown',
    observedAt: null,
    freshness: 'no_signal',
    source: input.source,
    summaryFacts: [input.message],
    blocker: false,
    availability: 'unavailable',
    confidence: 'unknown',
    reasonCodes: input.reasonCodes ?? ['DATA_UNAVAILABLE'],
    warnings: ['data_not_available'],
    isHistorical: false,
  };
}
