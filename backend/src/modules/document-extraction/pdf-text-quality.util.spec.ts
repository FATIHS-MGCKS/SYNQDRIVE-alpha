import { evaluatePdfTextQuality } from './pdf-text-quality.util';

describe('pdf-text-quality.util', () => {
  const thresholds = {
    minTextChars: 20,
    minSensibleCharRatio: 0.5,
    maxRepeatedLineRatio: 0.7,
  };

  it('accepts a digital PDF text layer with meaningful content', () => {
    const result = evaluatePdfTextQuality(
      'Service report for vehicle VIN WBA12345 with odometer 50000 km.',
      thresholds,
    );
    expect(result.usable).toBe(true);
  });

  it('rejects whitespace-only text', () => {
    expect(evaluatePdfTextQuality('   \n\t  ', thresholds).usable).toBe(false);
  });

  it('rejects repetitive artifact lines', () => {
    const repetitive = Array.from({ length: 10 }, () => '|||||').join('\n');
    expect(evaluatePdfTextQuality(repetitive, thresholds).usable).toBe(false);
  });
});
