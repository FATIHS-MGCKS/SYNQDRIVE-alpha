/** Test/diagnostic counter for SQL round trips inside one D4 inspection transaction. */
let activeRoundTripCount = 0;
let lastCompletedInspectionDbRoundTrips = 0;

export function resetDbRoundTripCount(): void {
  activeRoundTripCount = 0;
}

export function getDbRoundTripCount(): number {
  return activeRoundTripCount;
}

export function incrementDbRoundTripCount(): void {
  activeRoundTripCount += 1;
}

export function recordLastD4InspectionDbRoundTripCount(count: number): void {
  lastCompletedInspectionDbRoundTrips = count;
}

export function getLastD4InspectionDbRoundTripCount(): number {
  return lastCompletedInspectionDbRoundTrips;
}
