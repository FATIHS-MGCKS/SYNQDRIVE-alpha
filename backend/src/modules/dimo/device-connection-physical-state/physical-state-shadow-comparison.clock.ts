let shadowComparisonClock: (() => Date) | null = null;

export function getShadowComparisonObservedAt(): Date {
  return shadowComparisonClock ? shadowComparisonClock() : new Date();
}

export function setShadowComparisonClockForTests(clock: (() => Date) | null): void {
  shadowComparisonClock = clock;
}
