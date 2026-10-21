import { BehaviorEventCategory } from '@prisma/client';
import { TripBehaviorEnrichmentService } from './trip-behavior-enrichment.service';

/**
 * EXP-021 C0.3 — future-derivation gate and historical-row protection on the
 * enrichment write path (private helpers exercised directly; no DB).
 */
describe('TripBehaviorEnrichmentService R1 temporal containment', () => {
  function makeService() {
    const service = Object.create(TripBehaviorEnrichmentService.prototype) as any;
    service.logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    return service;
  }

  const detected = [
    { eventType: 'FULL_BRAKING' },
    { eventType: 'ENGINE_SHUTDOWN_WHILE_DRIVING' },
    { eventType: 'KICKDOWN' },
  ];

  it('suppresses contained HF abuse detections for R1 and logs a bounded summary', () => {
    const service = makeService();
    const kept = service.containR1HfAbuse('trip-1', detected, 'RUPTELA_R1');
    expect(kept.map((e: { eventType: string }) => e.eventType)).toEqual(['KICKDOWN']);
    expect(service.logger.log).toHaveBeenCalledTimes(1);
    const line = service.logger.log.mock.calls[0][0] as string;
    expect(line).toBe(
      'R1_HF_ABUSE_CONTAINED trip=trip-1 suppressed={"FULL_BRAKING":1,"ENGINE_SHUTDOWN_WHILE_DRIVING":1}',
    );
  });

  it.each(['API_SYNTHETIC', 'UNKNOWN'] as const)(
    'keeps all detections and does not log for %s',
    (family) => {
      const service = makeService();
      expect(service.containR1HfAbuse('trip-1', detected, family)).toBe(detected);
      expect(service.logger.log).not.toHaveBeenCalled();
    },
  );

  it('R1 re-enrichment never deletes existing contained abuse rows', () => {
    const service = makeService();
    expect(service.buildBehaviorEventReplaceScope('trip-1', 'RUPTELA_R1')).toEqual({
      tripId: 'trip-1',
      NOT: {
        eventCategory: BehaviorEventCategory.ABUSE,
        eventType: {
          in: [
            'FULL_BRAKING',
            'POSSIBLE_IMPACT',
            'ENGINE_SHUTDOWN_WHILE_DRIVING',
            'COLD_ENGINE_FULL_THROTTLE',
          ],
        },
      },
    });
  });

  it.each(['API_SYNTHETIC', 'UNKNOWN'] as const)(
    'keeps the full per-trip replace scope for %s',
    (family) => {
      expect(makeService().buildBehaviorEventReplaceScope('trip-1', family)).toEqual({
        tripId: 'trip-1',
      });
    },
  );
});
