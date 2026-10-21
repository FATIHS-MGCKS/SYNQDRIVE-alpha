import { createHash } from 'crypto';
import { Exp021MaturationShadowSignalLane } from '@prisma/client';
import { buildAcquisitionCyclePlan } from '../reference-capture-acquisition-planner';
import {
  loadFrozenReferenceManifest,
  getManifestCanonicalSignals,
} from '../reference-capture-manifest.loader';
import { REFERENCE_CAPTURE_ACQUISITION_TIER } from '../reference-capture.constants';
import { inferTemporalClass } from '../reference-capture-temporal.util';
import { buildRawIdentity } from '../reference-capture.contract';
import {
  HF_AGGREGATION_TYPE,
  HF_REQUESTED_INTERVAL,
} from '../reference-capture-hf-watermark-policy';
import type { Exp021MaturationShadowQueryGeometryMs } from './reference-capture-exp021-maturation-shadow.types';

export type Exp021MaturationShadowFrozenStratumSemantics = {
  resolvedProviderFields: string[];
  resolvedProviderFieldsCanonicalSorted: string[];
  signalSetHash: string;
  signalSetVersion: string;
  querySemanticsHash: string;
  queryBuilderSemanticVersionOrHash: string;
  queryBoundarySemanticVersion: string;
  interval: string;
  aggregation: string;
  manifestIdentifier: string | null;
  manifestHash: string | null;
};

const QUERY_BUILDER_SEMANTIC_VERSION = 'broad-reference-historical-v1';
const QUERY_BOUNDARY_SEMANTIC_VERSION = 'fixed-window-to-geometry-v1';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function resolveHfFastLoopProviderFields(): string[] {
  const manifest = loadFrozenReferenceManifest();
  const broadFields = getManifestCanonicalSignals().map((signal) => ({
    providerField: signal.providerField,
    canonicalKey: signal.canonicalKey,
    rawIdentity: buildRawIdentity(signal.providerField),
    temporalClass: inferTemporalClass(signal.providerField),
    acquisitionTier: REFERENCE_CAPTURE_ACQUISITION_TIER,
    capabilityState: 'SCHEMA_SUPPORTED' as const,
  }));

  const plan = buildAcquisitionCyclePlan({
    cycleNumber: 1,
    captureCycleId: 'exp021-maturation-shadow-enrollment',
    broadFields,
    cycleIntervalMs: 5_000,
    slowCycleEvery: 6,
  });

  const hfSurface = plan.surfaces.find((surface) => surface.surface === 'HF_HISTORICAL');
  return [...(hfSurface?.providerFields ?? [])].sort();
}

function resolveSettlementShadowProviderFields(): string[] {
  const manifest = loadFrozenReferenceManifest();
  return manifest.canonicalSignals.map((signal) => signal.providerField).sort();
}

export function resolveFrozenStratumSemantics(input: {
  signalLane: Exp021MaturationShadowSignalLane;
  queryGeometryMs: Exp021MaturationShadowQueryGeometryMs;
  windowFrom: Date;
  windowTo: Date;
}): Exp021MaturationShadowFrozenStratumSemantics {
  const manifest = loadFrozenReferenceManifest();
  const resolvedProviderFields =
    input.signalLane === Exp021MaturationShadowSignalLane.HF_FAST_LOOP
      ? resolveHfFastLoopProviderFields()
      : resolveSettlementShadowProviderFields();

  const resolvedProviderFieldsCanonicalSorted = [...resolvedProviderFields].sort();
  const signalSetVersion =
    input.signalLane === Exp021MaturationShadowSignalLane.HF_FAST_LOOP
      ? 'hf-fast-loop-preflight-v1'
      : `${manifest.manifestId}@${manifest.manifestVersion}`;

  const signalSetHash = sha256Hex(
    JSON.stringify({
      lane: input.signalLane,
      signalSetVersion,
      fields: resolvedProviderFieldsCanonicalSorted,
    }),
  );

  const interval = HF_REQUESTED_INTERVAL;
  const aggregation = HF_AGGREGATION_TYPE;

  const querySemanticsHash = sha256Hex(
    JSON.stringify({
      lane: input.signalLane,
      geometryMs: input.queryGeometryMs,
      interval,
      aggregation,
      windowFrom: input.windowFrom.toISOString(),
      windowTo: input.windowTo.toISOString(),
      queryBuilder: QUERY_BUILDER_SEMANTIC_VERSION,
      boundary: QUERY_BOUNDARY_SEMANTIC_VERSION,
      fields: resolvedProviderFieldsCanonicalSorted,
    }),
  );

  const manifestIdentifier =
    input.signalLane === Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW
      ? `${manifest.manifestId}@${manifest.manifestVersion}`
      : null;
  const manifestHash =
    input.signalLane === Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW
      ? sha256Hex(JSON.stringify(manifest.canonicalSignals.map((s) => s.canonicalKey).sort()))
      : null;

  return {
    resolvedProviderFields,
    resolvedProviderFieldsCanonicalSorted,
    signalSetHash,
    signalSetVersion,
    querySemanticsHash,
    queryBuilderSemanticVersionOrHash: QUERY_BUILDER_SEMANTIC_VERSION,
    queryBoundarySemanticVersion: QUERY_BOUNDARY_SEMANTIC_VERSION,
    interval,
    aggregation,
    manifestIdentifier,
    manifestHash,
  };
}

export function countSettlementShadowManifestSignals(): number {
  return loadFrozenReferenceManifest().canonicalSignals.length;
}
