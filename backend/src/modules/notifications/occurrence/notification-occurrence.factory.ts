import { NotificationOccurrenceRecoveryState, Prisma } from '@prisma/client';
import type { NotificationCandidate } from '../notification.types';
import type { CreateOccurrenceInput } from '../notification.repository';
import { buildOccurrencePayload } from './notification-occurrence.payload';
import { mapRecoveryStateToOccurrence } from './notification-occurrence.policy';

export function buildOccurrenceCreateInput(
  notificationId: string,
  candidate: NotificationCandidate,
  options: { recovery?: boolean } = {},
): CreateOccurrenceInput {
  const recoveryState = mapRecoveryStateToOccurrence(
    candidate.severity,
    candidate.recoveryState,
  );

  return {
    notificationId,
    organizationId: candidate.organizationId,
    occurredAt: candidate.occurredAt,
    observedAt: candidate.observedAt ?? candidate.occurredAt,
    sourceType: candidate.sourceSystem ?? candidate.sourceType,
    sourceRef: candidate.sourceEventId ?? candidate.sourceRef,
    sourceEventId: candidate.sourceEventId ?? candidate.sourceRef,
    severityAtOccurrence: candidate.severity,
    recoveryState:
      recoveryState === 'RECOVERED'
        ? NotificationOccurrenceRecoveryState.RECOVERED
        : NotificationOccurrenceRecoveryState.ACTIVE,
    correlationId: candidate.correlationId ?? null,
    causationId: candidate.causationId ?? null,
    payload: buildOccurrencePayload(candidate) as Prisma.InputJsonValue | undefined,
  };
}
