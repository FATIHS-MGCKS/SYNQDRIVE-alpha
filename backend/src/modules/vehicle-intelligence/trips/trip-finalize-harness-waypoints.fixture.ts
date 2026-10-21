/** Credible route waypoints for processFinalize unit-test harnesses (post quality-gate finalize). */
export function defaultFinalizeHarnessRouteWaypoints(startTime: Date) {
  return [
    {
      latitude: 50.937,
      longitude: 6.96,
      speedKmh: 30,
      recordedAt: new Date(startTime.getTime() + 60_000),
    },
    {
      latitude: 50.939,
      longitude: 6.965,
      speedKmh: 25,
      recordedAt: new Date(startTime.getTime() + 120_000),
    },
  ];
}
