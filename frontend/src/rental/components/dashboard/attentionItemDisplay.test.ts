import { describe, expect, it } from 'vitest';
import {
  attentionExpandLabel,
  composeAttentionItemCopy,
  composeAttentionRowCopy,
  enrichAttentionCopyWithObdUnplugged,
} from './attentionItemDisplay';

describe('attentionItemDisplay', () => {
  it('removes duplicate vehicle and reason lines from row copy', () => {
    const copy = composeAttentionRowCopy('Service überfällig seit 117 Tagen (HM/OEM)', {
      entityLabel: 'KS MX 2024 · Mercedes-Benz C 63 AMG · Zentrale',
      reason: 'Service überfällig seit 117 Tagen (HM/OEM)',
    });

    expect(copy.title).toBe('Service überfällig seit 117 Tagen (HM/OEM)');
    expect(copy.contextLine).toContain('KS MX 2024');
    expect(copy.hintLine).toBeUndefined();
  });

  it('strips Hinweis prefixes from visible copy', () => {
    const copy = composeAttentionItemCopy({
      id: 'x',
      source: 'derived-operations',
      severity: 'critical',
      category: 'health',
      title: 'Offline',
      reason: 'Hinweis: KS MX 2024 · Offline',
      entityLabel: 'KS MX 2024 · Zentrale',
      timeSortMs: 0,
      priority: 1,
      tone: 'critical',
      cta: 'open-vehicle',
      isOverdue: false,
    });

    expect(copy.hintLine).toBeUndefined();
  });

  it('uses expand labels for collapsed and expanded states', () => {
    expect(attentionExpandLabel(7, true, false)).toBe('Alle 7 anzeigen');
    expect(attentionExpandLabel(7, true, true)).toBe('Weniger anzeigen');
    expect(attentionExpandLabel(7, false, false)).toBe('Show all 7');
  });

  it('enriches offline notifications with OBD unplugged when snapshot is false', () => {
    const base = composeAttentionItemCopy({
      id: 'issue-vehicle:v1:telemetry:offline',
      semanticKey: 'vehicle:v1:telemetry:offline',
      source: 'derived-operations',
      severity: 'critical',
      category: 'operations',
      title: 'Offline',
      reason: 'Seit 48h kein Signal',
      entityLabel: 'KS MS 661 · Audi A4 2016',
      vehicleId: 'v1',
      timeSortMs: 0,
      priority: 1,
      tone: 'critical',
      cta: 'open-vehicle',
      isOverdue: false,
    });
    const obdMap = new Map<string, boolean | null>([['v1', false]]);
    const enriched = enrichAttentionCopyWithObdUnplugged(
      base,
      { title: 'Offline', semanticKey: 'vehicle:v1:telemetry:offline', vehicleId: 'v1' },
      obdMap,
    );
    expect(enriched.hintLine).toBe('Seit 48h kein Signal · OBD unplugged');
  });

  it('does not add OBD unplugged for plugged or unknown snapshot', () => {
    const base = composeAttentionItemCopy({
      id: 'issue-vehicle:v2:telemetry:offline',
      semanticKey: 'vehicle:v2:telemetry:offline',
      source: 'derived-operations',
      severity: 'critical',
      category: 'operations',
      title: 'Offline',
      reason: 'Seit 48h kein Signal',
      vehicleId: 'v2',
      timeSortMs: 0,
      priority: 1,
      tone: 'critical',
      cta: 'open-vehicle',
      isOverdue: false,
    });
    expect(
      enrichAttentionCopyWithObdUnplugged(
        base,
        { title: 'Offline', semanticKey: 'vehicle:v2:telemetry:offline', vehicleId: 'v2' },
        new Map([['v2', true]]),
      ).hintLine,
    ).toBe('Seit 48h kein Signal');
    expect(
      enrichAttentionCopyWithObdUnplugged(
        base,
        { title: 'Offline', semanticKey: 'vehicle:v2:telemetry:offline', vehicleId: 'v2' },
        new Map([['v2', null]]),
      ).hintLine,
    ).toBe('Seit 48h kein Signal');
  });
});
