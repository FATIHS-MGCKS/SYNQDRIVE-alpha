import { describe, expect, it, beforeEach } from 'vitest';
import { readActiveExtractionPointer, writeActiveExtractionPointer } from './document-extraction-session';

describe('document-extraction session recovery', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
  });

  it('round-trips active extraction pointer', () => {
    writeActiveExtractionPointer({ vehicleId: 'v1', extractionId: 'ext-1' });
    expect(readActiveExtractionPointer()).toEqual({ vehicleId: 'v1', extractionId: 'ext-1' });
  });

  it('clears pointer when null', () => {
    writeActiveExtractionPointer({ vehicleId: 'v1', extractionId: 'ext-1' });
    writeActiveExtractionPointer(null);
    expect(readActiveExtractionPointer()).toBeNull();
  });

  it('ignores malformed session data', () => {
    store.set('synqdrive_rental_active_extraction', '{"vehicleId":"v1"}');
    expect(readActiveExtractionPointer()).toBeNull();
  });
});
