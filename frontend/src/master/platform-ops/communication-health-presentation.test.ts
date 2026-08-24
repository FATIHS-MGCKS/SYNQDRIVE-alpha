import { describe, expect, it } from 'vitest';
import {
  communicationHealthStateTone,
  COMMUNICATION_HEALTH_STATE_LABEL_DE,
} from '../../components/patterns/status-utils';

describe('communication health presentation (C13.2)', () => {
  it('maps health states to correct presentation tones', () => {
    expect(communicationHealthStateTone('HEALTHY')).toBe('success');
    expect(communicationHealthStateTone('DEGRADED')).toBe('warning');
    expect(communicationHealthStateTone('UNHEALTHY')).toBe('critical');
    expect(communicationHealthStateTone('UNKNOWN')).toBe('neutral');
    expect(communicationHealthStateTone('DISABLED')).toBe('neutral');
    expect(communicationHealthStateTone('NOT_APPLICABLE')).toBe('neutral');
    expect(communicationHealthStateTone('NOT_CONFIGURED')).toBe('neutral');
  });

  it('provides readable German labels for all canonical health states', () => {
    for (const state of [
      'HEALTHY',
      'DEGRADED',
      'UNHEALTHY',
      'UNKNOWN',
      'DISABLED',
      'NOT_APPLICABLE',
      'NOT_CONFIGURED',
    ]) {
      expect(COMMUNICATION_HEALTH_STATE_LABEL_DE[state]).toBeTruthy();
      expect(COMMUNICATION_HEALTH_STATE_LABEL_DE[state]).not.toBe(state);
    }
  });
});
