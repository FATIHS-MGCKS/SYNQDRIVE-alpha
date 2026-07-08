import type { TripBehaviorEvent } from './trips.types';

export type BehaviorCategoryKey = 'ACCELERATION' | 'BRAKING' | 'CORNERING' | 'ABUSE';

export type BehaviorCategoryFilter = 'all' | BehaviorCategoryKey;

export const BEHAVIOR_CATEGORY_ORDER: Array<{ key: BehaviorCategoryKey; label: string }> = [
  { key: 'ACCELERATION', label: 'Beschleunigung' },
  { key: 'BRAKING', label: 'Bremsen' },
  { key: 'CORNERING', label: 'Kurvenfahrt' },
  { key: 'ABUSE', label: 'Missbrauchsrelevant' },
];

export function isCorneringEvent(event: TripBehaviorEvent): boolean {
  const type = event.eventType.toLowerCase();
  return type.includes('corner') || type.includes('kurven');
}

export function resolveBehaviorCategoryKey(event: TripBehaviorEvent): BehaviorCategoryKey | 'UNCLASSIFIED' {
  if (event.eventCategory === 'ABUSE') return 'ABUSE';
  if (isCorneringEvent(event)) return 'CORNERING';
  if (event.eventCategory === 'ACCELERATION') return 'ACCELERATION';
  if (event.eventCategory === 'BRAKING') return 'BRAKING';
  return 'UNCLASSIFIED';
}

export function countBehaviorEventsByCategory(events: TripBehaviorEvent[]): Record<BehaviorCategoryKey, number> {
  const counts: Record<BehaviorCategoryKey, number> = {
    ACCELERATION: 0,
    BRAKING: 0,
    CORNERING: 0,
    ABUSE: 0,
  };

  for (const event of events) {
    const key = resolveBehaviorCategoryKey(event);
    if (key !== 'UNCLASSIFIED') counts[key]++;
  }

  return counts;
}

export function eventMatchesCategoryFilter(
  event: TripBehaviorEvent,
  filter: BehaviorCategoryFilter,
): boolean {
  if (filter === 'all') return true;
  return resolveBehaviorCategoryKey(event) === filter;
}
