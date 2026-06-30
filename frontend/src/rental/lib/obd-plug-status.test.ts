import { describe, expect, it } from 'vitest';
import {
  appendObdUnpluggedToHint,
  buildObdPlugIndex,
  hintAlreadyMentionsObdUnplugged,
  isObdSnapshotExplicitlyUnplugged,
  isTelemetryOfflineAttentionItem,
  shouldShowObdUnpluggedBadge,
} from './obd-plug-status';

describe('obd-plug-status', () => {
  it('treats only explicit false as unplugged', () => {
    expect(isObdSnapshotExplicitlyUnplugged(false)).toBe(true);
    expect(shouldShowObdUnpluggedBadge(false)).toBe(true);
    expect(shouldShowObdUnpluggedBadge(true)).toBe(false);
    expect(shouldShowObdUnpluggedBadge(null)).toBe(false);
    expect(shouldShowObdUnpluggedBadge(undefined)).toBe(false);
  });

  it('builds vehicle index from fleet connectivity rows', () => {
    const map = buildObdPlugIndex([
      { vehicleId: 'v1', obdIsPluggedIn: false },
      { vehicleId: 'v2', obdIsPluggedIn: true },
      { vehicleId: 'v3', obdIsPluggedIn: null },
    ]);
    expect(map.get('v1')).toBe(false);
    expect(map.get('v2')).toBe(true);
    expect(map.get('v3')).toBe(null);
  });

  it('detects telemetry offline attention items', () => {
    expect(
      isTelemetryOfflineAttentionItem({
        title: 'Offline',
        semanticKey: 'vehicle:abc:telemetry:offline',
      }),
    ).toBe(true);
    expect(
      isTelemetryOfflineAttentionItem({
        title: 'Soft Offline',
        semanticKey: 'vehicle:abc:telemetry:soft_offline',
      }),
    ).toBe(false);
  });

  it('appends OBD unplugged to offline hint only once', () => {
    expect(appendObdUnpluggedToHint('Seit 48h kein Signal', true)).toBe(
      'Seit 48h kein Signal · OBD unplugged',
    );
    expect(appendObdUnpluggedToHint('Seit 48h kein Signal', false)).toBe(
      'Seit 48h kein Signal',
    );
    expect(
      appendObdUnpluggedToHint('Seit 48h kein Signal · OBD unplugged', true),
    ).toBe('Seit 48h kein Signal · OBD unplugged');
    expect(hintAlreadyMentionsObdUnplugged('OBD Device NOT plugged in')).toBe(true);
  });
});
