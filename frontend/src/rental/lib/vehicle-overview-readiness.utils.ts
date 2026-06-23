import type { EffectiveHealthStatus } from '../FleetContext';
import type {
  VehicleOverviewBookingsCardSummary,
  VehicleOverviewCards,
  VehicleOverviewDamagesCardSummary,
  VehicleOverviewDocumentsCardSummary,
  VehicleOverviewHealthSnapshot,
  VehicleOverviewLoadState,
  VehicleOverviewReadinessSummary,
  VehicleOverviewReadinessStatus,
  VehicleOverviewReadinessTone,
  VehicleOverviewTasksCardSummary,
} from './vehicle-overview.types';

const MAX_BLOCKERS = 3;

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function healthIsCritical(status: EffectiveHealthStatus): boolean {
  return status === 'Critical';
}

function healthNeedsAttention(status: EffectiveHealthStatus): boolean {
  return status === 'Warning';
}

function resolveReadinessLoadState(
  cards: VehicleOverviewCards,
  health: VehicleOverviewHealthSnapshot,
): VehicleOverviewLoadState {
  const states = [
    health.loadState,
    cards.trips.loadState,
    cards.bookings.loadState,
    cards.tasks.loadState,
    cards.damages.loadState,
    cards.documents.loadState,
  ];

  if (states.some((state) => state === 'loading')) return 'loading';
  if (states.every((state) => state === 'unavailable' || state === 'error')) return 'error';
  return 'ready';
}

function collectBlockedReasons(input: {
  health: VehicleOverviewHealthSnapshot;
  bookings: VehicleOverviewBookingsCardSummary;
  tasks: VehicleOverviewTasksCardSummary;
  damages: VehicleOverviewDamagesCardSummary;
  documents: VehicleOverviewDocumentsCardSummary;
}): string[] {
  const reasons: string[] = [];

  if (input.health.rentalBlocked) {
    reasons.push(...input.health.blockingReasons);
    if (reasons.length === 0) reasons.push('Vehicle blocked for rental');
  }

  if (healthIsCritical(input.health.effectiveStatus)) {
    reasons.push('Critical vehicle health');
  }

  if (input.damages.blockingCount > 0) {
    reasons.push(
      `${input.damages.blockingCount} blocking damage${input.damages.blockingCount === 1 ? '' : 's'}`,
    );
  } else if (input.damages.safetyCriticalCount > 0) {
    reasons.push(
      `${input.damages.safetyCriticalCount} safety-critical damage${input.damages.safetyCriticalCount === 1 ? '' : 's'}`,
    );
  }

  if (input.tasks.blockingCount > 0) {
    reasons.push(
      `${input.tasks.blockingCount} blocking task${input.tasks.blockingCount === 1 ? '' : 's'}`,
    );
  }

  if (input.documents.missingCount > 0) {
    reasons.push(
      `${input.documents.missingCount} required document${input.documents.missingCount === 1 ? '' : 's'} missing`,
    );
  }

  if (input.documents.expiredCount > 0) {
    reasons.push(
      `${input.documents.expiredCount} expired document${input.documents.expiredCount === 1 ? '' : 's'}`,
    );
  }

  if (input.bookings.isOverdue) {
    reasons.push('Return overdue');
  }

  return uniqueNonEmpty(reasons);
}

function collectAttentionReasons(input: {
  health: VehicleOverviewHealthSnapshot;
  bookings: VehicleOverviewBookingsCardSummary;
  tasks: VehicleOverviewTasksCardSummary;
  damages: VehicleOverviewDamagesCardSummary;
  documents: VehicleOverviewDocumentsCardSummary;
}): string[] {
  const reasons: string[] = [];

  if (healthNeedsAttention(input.health.effectiveStatus)) {
    reasons.push('Vehicle health needs attention');
  }

  if (input.tasks.openCount > 0 && input.tasks.blockingCount === 0) {
    if (input.tasks.dueTodayCount > 0 || input.tasks.criticalCount > 0) {
      reasons.push('Open tasks need attention');
    }
  }

  if (input.damages.openCount > 0 && input.damages.blockingCount === 0) {
    reasons.push('Open damages tracked');
  }

  if (input.documents.expiringSoonCount > 0) {
    reasons.push(`${input.documents.expiringSoonCount} document${input.documents.expiringSoonCount === 1 ? '' : 's'} expiring soon`);
  }

  if (input.documents.needsReviewCount > 0) {
    reasons.push(`${input.documents.needsReviewCount} document review${input.documents.needsReviewCount === 1 ? '' : 's'} pending`);
  }

  if (input.bookings.status === 'attention' || input.bookings.status === 'active') {
    if (input.bookings.dueLabel) reasons.push(input.bookings.dueLabel);
  }

  return uniqueNonEmpty(reasons);
}

function buildPositiveSubtitle(input: {
  bookings: VehicleOverviewBookingsCardSummary;
  tasks: VehicleOverviewTasksCardSummary;
  damages: VehicleOverviewDamagesCardSummary;
  documents: VehicleOverviewDocumentsCardSummary;
}): string {
  const parts: string[] = ['No active blockers'];

  if (input.bookings.nextBookingLabel && input.bookings.dueLabel) {
    parts.push(input.bookings.dueLabel);
  } else if (input.bookings.nextBookingLabel) {
    parts.push(input.bookings.nextBookingLabel);
  } else if (input.bookings.activeBookingLabel) {
    parts.push(input.bookings.activeBookingLabel);
  }

  if (parts.length === 1 && input.tasks.openCount === 0 && input.damages.openCount === 0) {
    return 'No active blockers · All tracked areas clear';
  }

  return parts.join(' · ');
}

function mapTone(status: VehicleOverviewReadinessStatus): VehicleOverviewReadinessTone {
  switch (status) {
    case 'ready':
      return 'clear';
    case 'attention':
      return 'attention';
    case 'blocked':
      return 'critical';
    case 'unknown':
    default:
      return 'neutral';
  }
}

/**
 * Readiness is derived only from existing overview card + rental-health indicators.
 * No new business rules beyond summarizing what is already tracked.
 */
export function deriveVehicleOverviewReadiness(input: {
  health: VehicleOverviewHealthSnapshot;
  cards: VehicleOverviewCards;
}): VehicleOverviewReadinessSummary {
  const loadState = resolveReadinessLoadState(input.cards, input.health);

  if (loadState === 'loading') {
    return {
      readinessStatus: 'unknown',
      title: 'Checking readiness',
      subtitle: 'Loading vehicle overview data',
      blockers: [],
      totalBlockerCount: 0,
      tone: 'neutral',
      loadState,
    };
  }

  if (input.health.effectiveStatus === 'Unknown' && loadState === 'error') {
    return {
      readinessStatus: 'unknown',
      title: 'Status unknown',
      subtitle: 'No data yet',
      blockers: [],
      totalBlockerCount: 0,
      tone: 'neutral',
      loadState,
    };
  }

  const blockers = collectBlockedReasons({
    health: input.health,
    bookings: input.cards.bookings,
    tasks: input.cards.tasks,
    damages: input.cards.damages,
    documents: input.cards.documents,
  });

  if (blockers.length > 0) {
    const visible = blockers.slice(0, MAX_BLOCKERS);
    return {
      readinessStatus: 'blocked',
      title: 'Not ready',
      subtitle: visible.join(' · '),
      blockers: visible,
      totalBlockerCount: blockers.length,
      tone: mapTone('blocked'),
      loadState,
    };
  }

  const attention = collectAttentionReasons({
    health: input.health,
    bookings: input.cards.bookings,
    tasks: input.cards.tasks,
    damages: input.cards.damages,
    documents: input.cards.documents,
  });

  if (attention.length > 0) {
    const visible = attention.slice(0, MAX_BLOCKERS);
    return {
      readinessStatus: 'attention',
      title: 'Attention needed',
      subtitle: visible.join(' · '),
      blockers: visible,
      totalBlockerCount: attention.length,
      tone: mapTone('attention'),
      loadState,
    };
  }

  return {
    readinessStatus: 'ready',
    title: 'Ready for rental',
    subtitle: buildPositiveSubtitle({
      bookings: input.cards.bookings,
      tasks: input.cards.tasks,
      damages: input.cards.damages,
      documents: input.cards.documents,
    }),
    blockers: [],
    totalBlockerCount: 0,
    tone: mapTone('ready'),
    loadState,
  };
}
