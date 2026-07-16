/**
 * SynqDrive — Canonical damage incident path (P28).
 *
 * Unifies three product concepts on one evidence ladder:
 *   1. Provider Collision Event (`safety.collision` / SAFETY_COLLISION) — provider evidence
 *   2. Possible Impact Proxy (HF POSSIBLE_IMPACT) — reconstructed proxy only
 *   3. Damage Inspection Recommendation — may recommend inspection, never confirms damage
 *
 * Rules enforced here (pure — no misuse accusation logic):
 *   - Provider collision is authoritative provider evidence
 *   - Possible impact remains a proxy and never replaces provider events
 *   - Collision does NOT imply confirmed damage
 *   - Customer attribution only when confidence + assignment gates pass
 *   - Event time/location redacted per privacy context (no permanent customer block)
 *   - Semantic dedupe of duplicate collision/impact signals in the same incident window
 */
import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import type { DimoVehicleEventRecord } from '../../dimo/dimo-segments.service';
import type { DrivingEvent, TripBehaviorEvent } from '@prisma/client';
import type {
  AttributionFields,
  CaseCandidate,
  EvidenceCandidate,
  TripEvaluationContext,
} from '../misuse-cases/misuse-case.types';
import { maxConfidence } from '../misuse-cases/misuse-case.types';
import { TIMESTAMP_BUCKET_MS } from '../trips/unified-behavior-read-model';

/** HF reconstruction proxy — never provider-classified. */
export const DAMAGE_EVIDENCE_KIND = {
  PROVIDER_COLLISION: 'PROVIDER_COLLISION',
  POSSIBLE_IMPACT_PROXY: 'POSSIBLE_IMPACT_PROXY',
} as const;

export type DamageEvidenceKind =
  (typeof DAMAGE_EVIDENCE_KIND)[keyof typeof DAMAGE_EVIDENCE_KIND];

/** Inspection recommendation codes — damage is never auto-confirmed. */
export type DamageInspectionRecommendationCode = 'FAHRZEUGPRUEFUNG' | 'SCHADENS_INSPEKTION';

export const DAMAGE_INCIDENT_CORROBORATION_WINDOW_MS = 30_000;

export interface DamageIncidentPrivacy {
  showExactTime: boolean;
  showLocation: boolean;
  redactionReason: string | null;
}

export interface DamageInspectionRecommendation {
  code: DamageInspectionRecommendationCode;
  eligible: boolean;
  /** Always false — collision/impact ≠ confirmed damage. */
  damageConfirmed: false;
  customerAttributionEligible: boolean;
  privacy: DamageIncidentPrivacy;
  summary: string;
  disclaimer: string;
}

export interface ProviderCollisionEvidence {
  kind: typeof DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION;
  sourceId: string;
  occurredAt: Date;
  eventType: string;
  latitude: number | null;
  longitude: number | null;
  providerEventName: string | null;
  snapshotJson: Record<string, unknown>;
}

export interface PossibleImpactProxyEvidence {
  kind: typeof DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY;
  sourceId: string;
  occurredAt: Date;
  eventType: 'POSSIBLE_IMPACT';
  snapshotJson: Record<string, unknown>;
}

export interface CanonicalDamageIncident {
  incidentKey: string;
  occurredAt: Date;
  primaryKind: DamageEvidenceKind;
  providerCollision: ProviderCollisionEvidence | null;
  possibleImpactProxy: PossibleImpactProxyEvidence | null;
  corroborated: boolean;
  inspectionRecommendation: DamageInspectionRecommendation;
}

const INSPECTION_DISCLAIMER =
  'Prüfung empfohlen — kein automatisierter Schadensnachweis und kein Kunden-Vorwurf.';

function incidentBucketMs(timestampMs: number): number {
  return Math.floor(timestampMs / TIMESTAMP_BUCKET_MS) * TIMESTAMP_BUCKET_MS;
}

function damageIncidentKey(tripId: string, occurredAt: Date): string {
  return `${tripId}|${incidentBucketMs(occurredAt.getTime())}|damage:collision_or_impact`;
}

function isNearTimestamp(a: Date, b: Date, windowMs: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= windowMs;
}

export function resolveDamageIncidentPrivacy(
  attribution: AttributionFields,
  confidence: MisuseCaseConfidence,
  hasProviderCollision: boolean,
): DamageIncidentPrivacy {
  const isPrivate =
    attribution.isPrivateTripSnapshot ||
    attribution.attributionScope === MisuseAttributionScope.PRIVATE_UNASSIGNED;

  if (isPrivate) {
    return {
      showExactTime: false,
      showLocation: false,
      redactionReason: 'Privatfahrt — Zeit und Ort nur im operativen Kontext sichtbar.',
    };
  }

  const assignedCustomer =
    attribution.attributionScope === MisuseAttributionScope.BOOKING_CUSTOMER;

  const sufficientConfidence =
    confidence === MisuseCaseConfidence.HIGH ||
    (confidence === MisuseCaseConfidence.MEDIUM && hasProviderCollision);

  if (assignedCustomer && sufficientConfidence) {
    return {
      showExactTime: true,
      showLocation: true,
      redactionReason: null,
    };
  }

  return {
    showExactTime: true,
    showLocation: false,
    redactionReason:
      'Ort nur bei zugeordneter Buchung und ausreichender Evidenz-Stärke sichtbar.',
  };
}

export function isCustomerAttributionEligible(
  attribution: AttributionFields,
  confidence: MisuseCaseConfidence,
  primaryKind: DamageEvidenceKind,
): boolean {
  if (
    attribution.isPrivateTripSnapshot ||
    attribution.attributionScope === MisuseAttributionScope.PRIVATE_UNASSIGNED
  ) {
    return false;
  }
  if (attribution.attributionScope !== MisuseAttributionScope.BOOKING_CUSTOMER) {
    return false;
  }
  if (primaryKind === DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY) {
    return confidence === MisuseCaseConfidence.HIGH;
  }
  return (
    confidence === MisuseCaseConfidence.HIGH ||
    confidence === MisuseCaseConfidence.MEDIUM
  );
}

export function buildDamageInspectionRecommendation(input: {
  primaryKind: DamageEvidenceKind;
  corroborated: boolean;
  confidence: MisuseCaseConfidence;
  attribution: AttributionFields;
}): DamageInspectionRecommendation {
  const hasProvider = input.primaryKind === DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION;
  const code: DamageInspectionRecommendationCode =
    hasProvider || input.corroborated ? 'SCHADENS_INSPEKTION' : 'FAHRZEUGPRUEFUNG';

  const confidence = input.corroborated
    ? MisuseCaseConfidence.HIGH
    : input.confidence;

  const privacy = resolveDamageIncidentPrivacy(
    input.attribution,
    confidence,
    hasProvider,
  );

  const customerAttributionEligible = isCustomerAttributionEligible(
    input.attribution,
    confidence,
    input.primaryKind,
  );

  const summary =
    code === 'SCHADENS_INSPEKTION'
      ? 'Schadensaufnahme und sichtbare Fahrzeugschäden prüfen.'
      : 'Fahrzeug auf sichtbare Schäden und Fehlercodes prüfen.';

  return {
    code,
    eligible: true,
    damageConfirmed: false,
    customerAttributionEligible,
    privacy,
    summary,
    disclaimer: INSPECTION_DISCLAIMER,
  };
}

export function collectProviderCollisionEvidence(
  drivingEvents: DrivingEvent[],
  dimoSafetyEvents: DimoVehicleEventRecord[],
): ProviderCollisionEvidence[] {
  const fromPersisted: ProviderCollisionEvidence[] = drivingEvents
    .filter((e) => e.eventType === 'SAFETY_COLLISION')
    .map((e) => {
      const meta = (e.metadataJson as Record<string, unknown> | null) ?? {};
      return {
        kind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
        sourceId: e.id,
        occurredAt: e.recordedAt,
        eventType: e.eventType,
        latitude: e.latitude,
        longitude: e.longitude,
        providerEventName:
          typeof meta.dimoEventName === 'string' ? meta.dimoEventName : 'safety.collision',
        snapshotJson: {
          provider: e.provider,
          providerEventName: meta.dimoEventName ?? 'safety.collision',
          classification: meta.classification ?? 'EXTREME',
          providerFingerprint: e.providerFingerprint,
        },
      };
    });

  const persistedTimes = fromPersisted.map((p) => p.occurredAt.getTime());

  const fromDimoFetch: ProviderCollisionEvidence[] = dimoSafetyEvents
    .filter((e) => e.name.toLowerCase().includes('collision'))
    .filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return !persistedTimes.some((pt) => Math.abs(pt - ts) <= TIMESTAMP_BUCKET_MS);
    })
    .map((e) => ({
      kind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
      sourceId: `${e.timestamp}:${e.name}`,
      occurredAt: new Date(e.timestamp),
      eventType: 'SAFETY_COLLISION',
      latitude: null,
      longitude: null,
      providerEventName: e.name,
      snapshotJson: {
        source: e.source,
        durationNs: e.durationNs,
        metadata: e.metadata,
        ingestPath: 'DIMO_SAFETY_FETCH',
      },
    }));

  return semanticDedupeProviderCollisions([...fromPersisted, ...fromDimoFetch]);
}

function semanticDedupeProviderCollisions(
  items: ProviderCollisionEvidence[],
): ProviderCollisionEvidence[] {
  const sorted = [...items].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const kept: ProviderCollisionEvidence[] = [];
  for (const item of sorted) {
    const dup = kept.find((k) =>
      isNearTimestamp(k.occurredAt, item.occurredAt, DAMAGE_INCIDENT_CORROBORATION_WINDOW_MS),
    );
    if (!dup) {
      kept.push(item);
      continue;
    }
    if (item.snapshotJson.providerFingerprint && !dup.snapshotJson.providerFingerprint) {
      const idx = kept.indexOf(dup);
      kept[idx] = item;
    }
  }
  return kept;
}

export function collectPossibleImpactProxyEvidence(
  behaviorEvents: TripBehaviorEvent[],
): PossibleImpactProxyEvidence[] {
  return behaviorEvents
    .filter((e) => e.eventCategory === 'ABUSE' && e.eventType === 'POSSIBLE_IMPACT')
    .map((e) => {
      const meta = (e.metadataJson as Record<string, unknown> | null) ?? {};
      return {
        kind: DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY,
        sourceId: e.id,
        occurredAt: e.startedAt,
        eventType: 'POSSIBLE_IMPACT' as const,
        snapshotJson: {
          classification: e.classification,
          peakDecelMs2: meta.peakDecelMs2,
          startSpeedKmh: e.startSpeedKmh,
          endSpeedKmh: e.endSpeedKmh,
          peakG: e.peakG,
          evidenceKind: DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY,
        },
      };
    });
}

export function buildCanonicalDamageIncidents(
  tripId: string,
  providerCollisions: ProviderCollisionEvidence[],
  impactProxies: PossibleImpactProxyEvidence[],
  attribution: AttributionFields,
): CanonicalDamageIncident[] {
  const incidents: CanonicalDamageIncident[] = [];
  const consumedProxies = new Set<string>();

  for (const provider of providerCollisions) {
    const matchingProxies = impactProxies.filter(
      (p) =>
        !consumedProxies.has(p.sourceId) &&
        isNearTimestamp(p.occurredAt, provider.occurredAt, DAMAGE_INCIDENT_CORROBORATION_WINDOW_MS),
    );
    matchingProxies.forEach((p) => consumedProxies.add(p.sourceId));

    const corroborated = matchingProxies.length > 0;
    let confidence: MisuseCaseConfidence = MisuseCaseConfidence.MEDIUM;
    if (corroborated) confidence = MisuseCaseConfidence.HIGH;

    const proxy = matchingProxies[0] ?? null;
    incidents.push({
      incidentKey: damageIncidentKey(tripId, provider.occurredAt),
      occurredAt: provider.occurredAt,
      primaryKind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
      providerCollision: provider,
      possibleImpactProxy: proxy,
      corroborated,
      inspectionRecommendation: buildDamageInspectionRecommendation({
        primaryKind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
        corroborated,
        confidence,
        attribution,
      }),
    });
  }

  for (const proxy of impactProxies) {
    if (consumedProxies.has(proxy.sourceId)) continue;
    incidents.push({
      incidentKey: damageIncidentKey(tripId, proxy.occurredAt),
      occurredAt: proxy.occurredAt,
      primaryKind: DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY,
      providerCollision: null,
      possibleImpactProxy: proxy,
      corroborated: false,
      inspectionRecommendation: buildDamageInspectionRecommendation({
        primaryKind: DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY,
        corroborated: false,
        confidence: MisuseCaseConfidence.MEDIUM,
        attribution,
      }),
    });
  }

  return incidents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

function providerToEvidence(p: ProviderCollisionEvidence): EvidenceCandidate {
  return {
    sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
    sourceId: p.sourceId,
    eventType: p.providerEventName ?? 'safety.collision',
    severity: MisuseCaseSeverity.CRITICAL,
    confidence: MisuseCaseConfidence.HIGH,
    occurredAt: p.occurredAt,
    snapshotJson: {
      ...p.snapshotJson,
      evidenceKind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
      latitude: p.latitude,
      longitude: p.longitude,
    },
  };
}

function dimoFetchToEvidence(p: ProviderCollisionEvidence): EvidenceCandidate {
  return {
    sourceType: MisuseEvidenceSourceType.DIMO_EVENT,
    sourceId: p.sourceId,
    eventType: p.providerEventName ?? 'safety.collision',
    severity: MisuseCaseSeverity.CRITICAL,
    confidence: MisuseCaseConfidence.MEDIUM,
    occurredAt: p.occurredAt,
    snapshotJson: {
      ...p.snapshotJson,
      evidenceKind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
    },
  };
}

function proxyToEvidence(p: PossibleImpactProxyEvidence): EvidenceCandidate {
  return {
    sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
    sourceId: p.sourceId,
    eventType: p.eventType,
    severity: MisuseCaseSeverity.SEVERE,
    confidence: MisuseCaseConfidence.MEDIUM,
    occurredAt: p.occurredAt,
    snapshotJson: p.snapshotJson,
  };
}

function providerEvidenceRow(p: ProviderCollisionEvidence): EvidenceCandidate {
  if (p.snapshotJson.ingestPath === 'DIMO_SAFETY_FETCH') {
    return dimoFetchToEvidence(p);
  }
  return providerToEvidence(p);
}

function redactEvidenceSnapshot(
  evidence: EvidenceCandidate,
  privacy: DamageIncidentPrivacy,
): EvidenceCandidate {
  const snap = { ...(evidence.snapshotJson ?? {}) };
  if (!privacy.showLocation) {
    delete snap.latitude;
    delete snap.longitude;
  }
  if (!privacy.showExactTime) {
    snap.occurredAtRedacted = true;
  }
  return { ...evidence, snapshotJson: snap };
}

export function canonicalIncidentsToCaseCandidates(
  incidents: CanonicalDamageIncident[],
): CaseCandidate[] {
  if (!incidents.length) return [];

  const candidates: CaseCandidate[] = [];

  for (const incident of incidents) {
    const privacy = incident.inspectionRecommendation.privacy;
    const evidence: EvidenceCandidate[] = [];

    if (incident.providerCollision) {
      evidence.push(
        redactEvidenceSnapshot(providerEvidenceRow(incident.providerCollision), privacy),
      );
    }
    if (incident.possibleImpactProxy) {
      evidence.push(redactEvidenceSnapshot(proxyToEvidence(incident.possibleImpactProxy), privacy));
    }

    const times = evidence.map((e) => e.occurredAt.getTime());
    const canonicalSummary = {
      damageIncident: {
        incidentKey: incident.incidentKey,
        primaryKind: incident.primaryKind,
        corroborated: incident.corroborated,
        inspectionRecommendation: incident.inspectionRecommendation,
      },
    };

    if (incident.primaryKind === DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION) {
      let confidence: MisuseCaseConfidence = MisuseCaseConfidence.MEDIUM;
      if (incident.corroborated) confidence = MisuseCaseConfidence.HIGH;
      if (incidents.filter((i) => i.primaryKind === DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION).length > 1) {
        confidence = maxConfidence(confidence, MisuseCaseConfidence.HIGH);
      }

      let description =
        'Das Fahrzeug hat ein safety.collision-Ereignis (Provider-Evidenz) gemeldet. Kein bestätigter Schaden.';
      if (incident.corroborated) {
        description +=
          ' Zusätzlich wurde ein lokales Aufprall-Signal (POSSIBLE_IMPACT-Proxy) im selben Zeitfenster erkannt.';
      }

      candidates.push({
        type: MisuseCaseType.DIMO_COLLISION_REPORTED,
        category: MisuseCaseCategory.DAMAGE_SUSPICION,
        severity: MisuseCaseSeverity.CRITICAL,
        confidence,
        title: 'DIMO-Kollision gemeldet',
        description,
        recommendedAction: incident.inspectionRecommendation.summary,
        evidence,
        eventCount: evidence.length,
        firstDetectedAt: new Date(Math.min(...times)),
        lastDetectedAt: new Date(Math.max(...times)),
        evidenceSummary: canonicalSummary,
      });
      continue;
    }

    candidates.push({
      type: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
      category: MisuseCaseCategory.DAMAGE_SUSPICION,
      severity: MisuseCaseSeverity.SEVERE,
      confidence: MisuseCaseConfidence.MEDIUM,
      title: 'Schadenverdacht',
      description:
        'Abrupte Verzögerung (POSSIBLE_IMPACT-Proxy aus HF-Rekonstruktion). Technisches Risiko — kein automatisierter Unfallnachweis.',
      recommendedAction: incident.inspectionRecommendation.summary,
      evidence,
      eventCount: evidence.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
      evidenceSummary: canonicalSummary,
    });
  }

  return candidates;
}

/**
 * Canonical entry: collect provider + proxy evidence, semantically dedupe, emit cases.
 */
export function evaluateCanonicalDamageIncidents(
  context: TripEvaluationContext,
  attribution: AttributionFields,
): CaseCandidate[] {
  const providerCollisions = collectProviderCollisionEvidence(
    context.drivingEvents,
    context.dimoSafetyEvents,
  );
  const impactProxies = collectPossibleImpactProxyEvidence(context.behaviorEvents);
  const incidents = buildCanonicalDamageIncidents(
    context.trip.id,
    providerCollisions,
    impactProxies,
    attribution,
  );
  return canonicalIncidentsToCaseCandidates(incidents);
}
