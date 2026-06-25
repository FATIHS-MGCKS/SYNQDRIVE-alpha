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

/**
 * Canonical-only blockers.
 *
 * The Vehicle Overview must NOT invent a rental-blocked verdict from local
 * overview aggregates. The only source of a "blocked" status here is the
 * canonical rental-health signal (`health.rentalBlocked` + `blockingReasons`,
 * which the backend rental-health system already sets for booking-relevant
 * compliance/document/safety blockers). Missing documents, incomplete rental
 * requirements, critical health, open/blocking tasks/damages or overdue
 * returns are deliberately NOT treated as a blocker on this surface — they are
 * surfaced as findings/attention or in their own tabs.
 */
function collectBlockedReasons(input: {
  health: VehicleOverviewHealthSnapshot;
}): string[] {
  const reasons: string[] = [];

  if (input.health.rentalBlocked) {
    reasons.push(...input.health.blockingReasons);
    if (reasons.length === 0) reasons.push('Vehicle blocked for rental');
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
 * @deprecated Vehicle Overview must not derive canonical rental readiness
 * locally. Use canonical rental/runtime/blocking sources only. This helper now
 * only summarizes overview "findings" (attention) and reflects the canonical
 * `health.rentalBlocked` flag for the blocked status — it never invents a
 * blocked/not-ready verdict from documents, requirements, health or tasks. It
 * is no longer rendered in the Overview tab (the ReadinessStrip was removed).
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

  const blockers = collectBlockedReasons({ health: input.health });

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
