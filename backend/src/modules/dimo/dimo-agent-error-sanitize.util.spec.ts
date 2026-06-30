import {
  maskDimoAgentWallet,
  sanitizeDimoAgentErrorMessage,
} from './dimo-agent-error-sanitize.util';

describe('dimo-agent-error-sanitize.util', () => {
  it('masks wallet addresses', () => {
    expect(maskDimoAgentWallet('0x0000000000000000000000000000000000000001')).toBe(
      '0x0000…0001',
    );
  });

  it('redacts bearer tokens and api keys from errors', () => {
    const msg = 'failed Bearer eyJhbGciOiJIUzI1NiJ9.abc with DIMO_API_KEY=secret-key-123';
    expect(sanitizeDimoAgentErrorMessage(msg)).toContain('Bearer [redacted]');
    expect(sanitizeDimoAgentErrorMessage(msg)).toContain('DIMO_API_KEY [redacted]');
    expect(sanitizeDimoAgentErrorMessage(msg)).not.toContain('secret-key-123');
  });
});
