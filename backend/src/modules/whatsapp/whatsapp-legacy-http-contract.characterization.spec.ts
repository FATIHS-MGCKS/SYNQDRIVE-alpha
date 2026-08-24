import { readFileSync } from 'fs';
import { join } from 'path';

describe('WhatsApp legacy HTTP compatibility contract', () => {
  const source = readFileSync(join(__dirname, 'whatsapp.controller.ts'), 'utf8');

  it('does not restore legacy ai-reply direct-send route', () => {
    expect(source).not.toContain("conversations/:conversationId/ai-reply");
    expect(source).not.toContain('sendAiReply');
  });

  it('marks restored operational routes as deprecated compatibility HTTP', () => {
    expect(source).toContain('DEPRECATED_COMPATIBILITY_HTTP');
    expect(source).toContain("Get('conversations')");
    expect(source).toContain("Post('conversations/:conversationId/messages')");
  });
});
