import { Logger } from '@nestjs/common';
import { TransactionalMailService } from './transactional-mail.service';

describe('TransactionalMailService invite logging', () => {
  it('does not log invite URL or token', async () => {
    const service = new TransactionalMailService();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    await service.sendOrganizationInvite({
      to: 'secret.user@example.com',
      organizationName: 'Acme',
      inviteUrl: 'https://app.example/accept-invite?token=super-secret-token-value',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const combined = [...logSpy.mock.calls, ...debugSpy.mock.calls]
      .flat()
      .map((part) => String(part))
      .join('\n');
    expect(combined).not.toContain('super-secret-token-value');
    expect(combined).not.toContain('accept-invite?token=');
    expect(combined).toContain('s***@example.com');

    logSpy.mockRestore();
    debugSpy.mockRestore();
  });
});
