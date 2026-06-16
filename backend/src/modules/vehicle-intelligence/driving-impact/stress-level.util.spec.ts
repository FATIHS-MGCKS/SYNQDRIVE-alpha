import { classifyStressLevel } from './stress-level.util';
import { computeDrivingStressScore } from './driving-impact-scorer';

describe('stress-level.util', () => {
  it('classifies low stress (0–25)', () => {
    expect(classifyStressLevel(0)).toBe('low');
    expect(classifyStressLevel(25)).toBe('low');
  });

  it('classifies moderate stress (26–50)', () => {
    expect(classifyStressLevel(26)).toBe('moderate');
    expect(classifyStressLevel(50)).toBe('moderate');
  });

  it('classifies high stress (51–75)', () => {
    expect(classifyStressLevel(51)).toBe('high');
    expect(classifyStressLevel(75)).toBe('high');
  });

  it('classifies critical stress (76–100)', () => {
    expect(classifyStressLevel(76)).toBe('critical');
    expect(classifyStressLevel(100)).toBe('critical');
  });

  it('returns null for missing values', () => {
    expect(classifyStressLevel(null)).toBeNull();
    expect(classifyStressLevel(undefined)).toBeNull();
  });
});

describe('computeDrivingStressScore', () => {
  it('higher component stress yields higher composite stress', () => {
    const low = computeDrivingStressScore({
      longitudinalStressScore: 10,
      brakingStressScore: 10,
      stopGoStressScore: 10,
      highSpeedStressScore: 10,
    });
    const high = computeDrivingStressScore({
      longitudinalStressScore: 80,
      brakingStressScore: 80,
      stopGoStressScore: 80,
      highSpeedStressScore: 80,
    });
    expect(high).toBeGreaterThan(low);
    expect(classifyStressLevel(high)).toBe('critical');
    expect(classifyStressLevel(low)).toBe('low');
  });
});
