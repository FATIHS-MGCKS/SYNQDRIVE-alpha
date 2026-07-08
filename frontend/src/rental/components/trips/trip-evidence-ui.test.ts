import { describe, expect, it } from 'vitest';
import {
  clickhouseStatusHintDe,
  signalQualityLabelDe,
} from './trip-evidence-ui';

describe('trip-evidence-ui', () => {
  it('maps signal quality without score language', () => {
    expect(signalQualityLabelDe('good')).toBe('Gut');
    expect(signalQualityLabelDe('unavailable')).toBe('Nicht verfügbar');
  });

  it('returns hint only for non-available CH status', () => {
    expect(clickhouseStatusHintDe('available')).toBeNull();
    expect(clickhouseStatusHintDe('degraded')).toContain('eingeschränkt');
  });
});
