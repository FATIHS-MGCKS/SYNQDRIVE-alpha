import {
  formatFrontRearWeightDistribution,
  parseFrontWeightDistributionPct,
  parsePositiveIntegerField,
} from './vehicle-technical-spec.util';

describe('vehicle-technical-spec.util', () => {
  it('formats Audi 58/42 and Tiguan 60/40', () => {
    expect(formatFrontRearWeightDistribution(58)).toBe('58/42');
    expect(formatFrontRearWeightDistribution(60)).toBe('60/40');
  });

  it('returns empty for unknown Arteon-style null', () => {
    expect(formatFrontRearWeightDistribution(null)).toBe('');
    expect(formatFrontRearWeightDistribution(undefined)).toBe('');
  });

  it('parses slash and single front percent forms', () => {
    expect(parseFrontWeightDistributionPct('58/42')).toBe(58);
    expect(parseFrontWeightDistributionPct('60/40')).toBe(60);
    expect(parseFrontWeightDistributionPct('58')).toBe(58);
  });

  it('rejects invalid weight distribution', () => {
    expect(parseFrontWeightDistributionPct('0/100')).toBeNull();
    expect(parseFrontWeightDistributionPct('abc')).toBeNull();
  });

  it('parses positive integers for displacement and cylinders', () => {
    expect(parsePositiveIntegerField('1968')).toBe(1968);
    expect(parsePositiveIntegerField(4)).toBe(4);
    expect(parsePositiveIntegerField(0)).toBeNull();
    expect(parsePositiveIntegerField('')).toBeNull();
  });
});
