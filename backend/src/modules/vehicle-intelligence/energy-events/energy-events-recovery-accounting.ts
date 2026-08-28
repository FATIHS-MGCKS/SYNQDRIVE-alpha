/**
 * Single run-level DIMO request accounting authority for the E3A recovery dry-run.
 *
 * Every network call a run performs is recorded here: developer auth, per-vehicle
 * token exchange, capability/`availableSignals` probes and per-mechanism segment
 * queries. `telemetryGraphqlRequests` is the TOTAL telemetry GraphQL traffic
 * (capability probes + mechanism queries) — never mechanism-only traffic.
 */
export interface DimoRequestAccounting {
  /** TOTAL telemetry GraphQL requests = capabilityProbeRequests + mechanismRequests. */
  telemetryGraphqlRequests: number;
  /** `availableSignals` capability probes issued before the recovery loop. */
  capabilityProbeRequests: number;
  /** Refuel + recharge segment queries issued inside the recovery loop. */
  mechanismRequests: number;
  refuelSegmentRequests: number;
  rechargeSegmentRequests: number;
  /** Vehicle JWT token-exchange calls (token-exchange API, not telemetry). */
  tokenExchangeRequests: number;
  /** Developer JWT challenge/submit round trips (auth API, not telemetry). */
  developerAuthRequests: number;
  retries: number;
}

export function createDimoRequestAccounting(): DimoRequestAccounting {
  return {
    telemetryGraphqlRequests: 0,
    capabilityProbeRequests: 0,
    mechanismRequests: 0,
    refuelSegmentRequests: 0,
    rechargeSegmentRequests: 0,
    tokenExchangeRequests: 0,
    developerAuthRequests: 0,
    retries: 0,
  };
}

export function cloneDimoRequestAccounting(
  source: DimoRequestAccounting,
): DimoRequestAccounting {
  return { ...source };
}

export function mergeDimoRequestAccounting(
  total: DimoRequestAccounting,
  delta: DimoRequestAccounting,
): void {
  total.telemetryGraphqlRequests += delta.telemetryGraphqlRequests;
  total.capabilityProbeRequests += delta.capabilityProbeRequests;
  total.mechanismRequests += delta.mechanismRequests;
  total.refuelSegmentRequests += delta.refuelSegmentRequests;
  total.rechargeSegmentRequests += delta.rechargeSegmentRequests;
  total.tokenExchangeRequests += delta.tokenExchangeRequests;
  total.developerAuthRequests += delta.developerAuthRequests;
  total.retries += delta.retries;
}

export function recordDeveloperAuthRequest(
  accounting?: DimoRequestAccounting,
): void {
  if (accounting) accounting.developerAuthRequests += 1;
}

export function recordTokenExchangeRequest(
  accounting?: DimoRequestAccounting,
): void {
  if (accounting) accounting.tokenExchangeRequests += 1;
}

export function recordCapabilityProbeRequest(
  accounting?: DimoRequestAccounting,
): void {
  if (!accounting) return;
  accounting.capabilityProbeRequests += 1;
  accounting.telemetryGraphqlRequests += 1;
}

export function recordMechanismRequest(
  mechanism: 'refuel' | 'recharge',
  accounting?: DimoRequestAccounting,
): void {
  if (!accounting) return;
  accounting.mechanismRequests += 1;
  accounting.telemetryGraphqlRequests += 1;
  if (mechanism === 'refuel') {
    accounting.refuelSegmentRequests += 1;
  } else {
    accounting.rechargeSegmentRequests += 1;
  }
}

export function recordRetry(accounting?: DimoRequestAccounting): void {
  if (accounting) accounting.retries += 1;
}

/**
 * TOTAL telemetry traffic must always equal the sum of its parts. A drift means
 * some traffic was counted outside the authority (or dropped on the floor).
 */
export function isTelemetryTotalConsistent(
  accounting: DimoRequestAccounting,
): boolean {
  return (
    accounting.telemetryGraphqlRequests ===
    accounting.capabilityProbeRequests + accounting.mechanismRequests
  );
}
