import type { Prisma } from '@prisma/client';
import type { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  readPhysicalDriveIntervalAuthority,
  waitForNextFreshAuthoritativeWindowClose,
  type Exp021CanaryWaitWindowResult,
  type Exp021CanaryWindowPollDeps,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
export type { Exp021CanaryWindowPollDeps };

export type Exp021CanarySettlementShadowExperimentRow = {
  id: string;
  metadataJson: Prisma.JsonValue;
  updatedAt: Date;
};

export type Exp021CanarySettlementShadowLoader = () => Promise<
  Exp021CanarySettlementShadowExperimentRow[]
>;

/**
 * Baseline from CLI startup snapshot only — excludes windows that close after launch.
 */
export function computeCanaryWaitAfterPhysicalEndMs(
  experiments: Array<{ metadataJson: Prisma.JsonValue }>,
): number {
  let afterPhysicalEndMs = 0;
  for (const experiment of experiments) {
    const physical = readPhysicalDriveIntervalAuthority(experiment.metadataJson);
    const endMs = physical?.physicalEndAt ? Date.parse(physical.physicalEndAt) : NaN;
    if (Number.isFinite(endMs) && endMs > afterPhysicalEndMs) {
      afterPhysicalEndMs = endMs;
    }
  }
  return afterPhysicalEndMs;
}

export function buildCanaryWaitModePollDeps(input: {
  loadSettlementShadowExperiments: Exp021CanarySettlementShadowLoader;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  config: ReferenceCaptureConfig;
  tokenId: number;
}): Exp021CanaryWindowPollDeps {
  return {
    listSettlementShadowExperiments: input.loadSettlementShadowExperiments,
    sleep: input.sleep,
    now: input.now,
    config: input.config,
    tokenId: input.tokenId,
  };
}

/**
 * Wait-mode wiring: baseline frozen at startup; each poll refreshes DB via loader.
 */
export async function waitForNextCanaryWindowWithRefreshingDb(
  input: {
    startupBaselineExperiments: Array<{ metadataJson: Prisma.JsonValue }>;
    loadSettlementShadowExperiments: Exp021CanarySettlementShadowLoader;
    sleep: (ms: number) => Promise<void>;
    now: () => Date;
    config: ReferenceCaptureConfig;
    tokenId: number;
    onProspectivePdiCandidate?: Exp021CanaryWindowPollDeps['onProspectivePdiCandidate'];
  },
  options: {
    timeoutMs?: number;
    pollMs?: number;
    /** Cohort watch: enrolled-window cursor + prospective PDI discovery semantics. */
    cohortProspectiveDiscovery?: {
      activationNotBeforeMs: number;
      enrollmentCursorPhysicalEndMs: number;
    };
  } = {},
): Promise<Exp021CanaryWaitWindowResult> {
  const afterPhysicalEndMs =
    options.cohortProspectiveDiscovery?.enrollmentCursorPhysicalEndMs ??
    computeCanaryWaitAfterPhysicalEndMs(input.startupBaselineExperiments);
  return waitForNextFreshAuthoritativeWindowClose(
    buildCanaryWaitModePollDeps(input),
    {
      afterPhysicalEndMs,
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      activationNotBeforeMs: options.cohortProspectiveDiscovery?.activationNotBeforeMs,
      enrollmentFreshnessMode: options.cohortProspectiveDiscovery
        ? 'PROSPECTIVE_PDI_DISCOVERY'
        : 'OPERATOR_IMMEDIATE',
    },
  );
}
