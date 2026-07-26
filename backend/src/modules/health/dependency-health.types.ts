export type DependencyProbeStatus = 'ok' | 'degraded' | 'error' | 'skipped';

export type ApplicationDependencyKey =
  | 'api'
  | 'postgres'
  | 'redis'
  | 'clickhouse'
  | 'queue'
  | 'workers'
  | 'dimo'
  | 'stripe'
  | 'ai'
  | 'notification'
  | 'storage'
  | 'documentExtraction';

export interface DependencyProbeResult {
  key: ApplicationDependencyKey;
  status: DependencyProbeStatus;
  /** Whether this dependency gates `/health/readiness` (hard). */
  required: boolean;
  responseMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

/** Backwards-compatible shape used by platform-health and older clients. */
export interface DependencyStatus {
  status: 'ok' | 'error';
  responseMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ApplicationHealthReport {
  status: 'ok' | 'degraded' | 'error';
  generatedAt: string;
  probes: Record<ApplicationDependencyKey, DependencyProbeResult>;
  readiness: {
    ready: boolean;
    hardFailures: ApplicationDependencyKey[];
  };
}
