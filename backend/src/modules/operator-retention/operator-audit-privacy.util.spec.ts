import {
  sanitizeOperatorAuditDescription,
  sanitizeOperatorAuditRoute,
} from './operator-audit-privacy.util';

describe('operator-audit-privacy.util', () => {
  it('redacts signature data URLs from audit descriptions', () => {
    const input = 'POST /handover → 200 data:image/png;base64,AAAAbbbbCCCC';
    expect(sanitizeOperatorAuditDescription(input)).toBe(
      'POST /handover → 200 [signature-data-url]',
    );
  });

  it('redacts sensitive query params from routes', () => {
    const url = '/api/v1/foo?email=test@example.com&token=secret';
    expect(sanitizeOperatorAuditRoute(url)).toBe(
      '/api/v1/foo?email=%5Bredacted%5D&token=%5Bredacted%5D',
    );
  });
});
