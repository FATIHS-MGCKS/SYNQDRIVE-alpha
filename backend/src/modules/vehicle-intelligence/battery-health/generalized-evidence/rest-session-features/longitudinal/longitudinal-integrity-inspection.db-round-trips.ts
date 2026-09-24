/** Test/diagnostic counter for SQL round trips inside one D4 inspection transaction. */
let activeRoundTripCount = 0;

export function resetDbRoundTripCount(): void {
  activeRoundTripCount = 0;
}

export function getDbRoundTripCount(): number {
  return activeRoundTripCount;
}

export function incrementDbRoundTripCount(): void {
  activeRoundTripCount += 1;
}
