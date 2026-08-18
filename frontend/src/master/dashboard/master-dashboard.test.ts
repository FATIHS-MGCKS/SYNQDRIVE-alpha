import { describe, expect, it } from 'vitest';
import {
  domainLevelTone,
  overallStatusLabel,
  overallStatusTone,
  attentionReasonLabel,
} from './dashboard.utils';

describe('master dashboard utils', () => {
  it('maps overall status labels in German', () => {
    expect(overallStatusLabel('healthy')).toBe('Betriebsbereit');
    expect(overallStatusLabel('critical')).toBe('Kritisch');
    expect(overallStatusLabel('unknown')).toBe('Unbekannt');
  });

  it('maps overall status tones', () => {
    expect(overallStatusTone('healthy')).toBe('success');
    expect(overallStatusTone('critical')).toBe('critical');
    expect(overallStatusTone('unknown')).toBe('neutral');
  });

  it('maps domain levels', () => {
    expect(domainLevelTone('ok')).toBe('success');
    expect(domainLevelTone('warning')).toBe('warning');
    expect(domainLevelTone('unknown')).toBe('neutral');
  });

  it('translates attention reason codes', () => {
    expect(attentionReasonLabel('PAST_DUE')).toBe('Überfällig');
    expect(attentionReasonLabel('CUSTOM')).toBe('CUSTOM');
  });
});
