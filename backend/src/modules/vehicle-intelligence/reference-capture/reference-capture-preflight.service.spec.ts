import { ReferenceCapturePreflightService } from './reference-capture-preflight.service';
import { buildCanonicalKeyLookup } from './reference-capture-manifest.loader';

describe('ReferenceCapturePreflightService', () => {
  const service = new ReferenceCapturePreflightService({} as never, {} as never, {} as never);

  it('builds dynamic broad observation set from availableSignals (not hard-coded 33)', () => {
    const availableSignals = ['speed', 'angularVelocityYaw', 'customUnmappedField'];
    const fields = service.buildBroadObservationSetFromAvailableSignals(availableSignals, {
      speed: { value: 10, unit: 'km/h', timestamp: '2026-08-31T12:00:00.000Z' },
    });

    expect(fields.length).toBe(3);
    expect(fields.find((f) => f.providerField === 'customUnmappedField')?.canonicalKey).toBeNull();
    expect(fields.find((f) => f.providerField === 'speed')?.canonicalKey).toBe(
      buildCanonicalKeyLookup().get('speed') ?? null,
    );
  });

  it('retains unmapped provider fields with DIMO:: rawIdentity', () => {
    const fields = service.buildBroadObservationSetFromAvailableSignals(['mysterySignal']);
    expect(fields[0].rawIdentity).toBe('DIMO::mysterySignal');
    expect(fields[0].canonicalKey).toBeNull();
  });

  it('assigns temporal classes independently from canonical mapping', () => {
    const fields = service.buildBroadObservationSetFromAvailableSignals(['speed', 'mysterySignal']);
    expect(fields.find((f) => f.providerField === 'speed')?.temporalClass).toBe('WAVEFORM_DYNAMICS');
    expect(fields.find((f) => f.providerField === 'mysterySignal')?.temporalClass).toBe(
      'SLOW_PHYSICAL_CONTEXT',
    );
  });
});
