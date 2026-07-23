import { buildCandidateFromRegistry } from '@modules/notifications/registry/notification-event-registry';
import { fingerprintFromCandidate } from '@modules/notifications/notification-candidate.validator';
import type { LegalOperationalNotificationSignal } from './legal-document-operational-notification.types';

/**
 * Stable deduplication identity for legal-document operational notifications.
 * Uses registry conditionCode + optional per-type variant — never localized labels.
 */
export function legalOperationalNotificationFingerprintKey(
  organizationId: string,
  signal: LegalOperationalNotificationSignal,
): string {
  const candidate = buildCandidateFromRegistry({
    organizationId,
    eventType: signal.eventType,
    entityType: signal.entityType,
    entityId: signal.entityId,
    conditionCodeVariant: signal.conditionVariant,
    sourceRef: signal.sourceRef,
    occurredAt: new Date(),
    templateParams: signal.templateParams,
    metadata: signal.metadata,
  });
  return fingerprintFromCandidate(candidate).canonical;
}

export function legalOperationalNotificationDedupKey(
  organizationId: string,
  signal: LegalOperationalNotificationSignal,
): string {
  return [
    organizationId,
    signal.scope,
    signal.eventType,
    signal.entityType,
    signal.entityId,
    signal.conditionVariant ?? '',
  ].join(':');
}
