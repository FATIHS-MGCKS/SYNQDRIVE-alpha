import { runR9WakeForensicSafely } from './r9-wake-forensic-observability.util';

describe('runR9WakeForensicSafely', () => {
  it('does not throw when forensic persistence fails', async () => {
    const logger = { warn: jest.fn() };
    await expect(
      runR9WakeForensicSafely(logger as any, 'recordIntake', async () => {
        throw new Error('db down');
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
