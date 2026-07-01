import {
  classifyDimoAgentError,
  extractNodeErrorCode,
  formatDimoAgentChatError,
  formatDimoAgentChatUserMessage,
} from './dimo-agent-error-classification.util';

describe('dimo-agent-error-classification', () => {
  it('classifies ENOTFOUND as DNS_ERROR', () => {
    const classified = classifyDimoAgentError({
      err: Object.assign(new Error('getaddrinfo ENOTFOUND agents.dimo.zone'), { code: 'ENOTFOUND' }),
      hostname: 'agents.dimo.zone',
    });

    expect(classified.kind).toBe('DNS_ERROR');
    expect(classified.errorCode).toBe('ENOTFOUND');
    expect(classified.failedBeforeHttp).toBe(true);
    expect(classified.adminDetail).toContain('DNS resolution failed');
    expect(classified.adminDetail).toContain('agents.dimo.zone');
    expect(classified.userMessage).not.toContain('agents.dimo.zone');
    expect(classified.userMessage).not.toContain('ENOTFOUND');
  });

  it('classifies EAI_AGAIN as DNS_ERROR', () => {
    const classified = classifyDimoAgentError({
      err: Object.assign(new Error('getaddrinfo EAI_AGAIN agents.dimo.zone'), { code: 'EAI_AGAIN' }),
      hostname: 'agents.dimo.zone',
    });

    expect(classified.kind).toBe('DNS_ERROR');
    expect(classified.errorCode).toBe('EAI_AGAIN');
  });

  it('classifies ECONNREFUSED as NETWORK_ERROR', () => {
    const classified = classifyDimoAgentError({
      err: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      hostname: 'agents.dimo.zone',
    });

    expect(classified.kind).toBe('NETWORK_ERROR');
    expect(classified.failedBeforeHttp).toBe(true);
    expect(classified.adminDetail).toContain('Outbound HTTPS/network request');
  });

  it('classifies HTTP status as DIMO_HTTP_ERROR', () => {
    const classified = classifyDimoAgentError({
      statusCode: 502,
      errorMessage: 'Bad gateway',
      hostname: 'agents.dimo.zone',
    });

    expect(classified.kind).toBe('DIMO_HTTP_ERROR');
    expect(classified.statusCode).toBe(502);
    expect(classified.failedBeforeHttp).toBe(false);
    expect(classified.adminDetail).toBe('DIMO Agents returned HTTP 502.');
    expect(classified.userMessage).not.toContain('502');
  });

  it('classifies parser failures', () => {
    const classified = classifyDimoAgentError({
      parserFailure: true,
      errorMessage: 'Empty stream — no content received from agent',
    });

    expect(classified.kind).toBe('PARSER_ERROR');
    expect(classified.adminDetail).toContain('Empty stream');
  });

  it('classifies config failures', () => {
    const classified = classifyDimoAgentError({
      configFailure: true,
      errorMessage: 'DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set',
    });

    expect(classified.kind).toBe('CONFIG_ERROR');
    expect(classified.failedBeforeHttp).toBe(true);
    expect(classified.userMessage).toBe('AI Assistant is not configured correctly.');
    expect(classified.adminDetail).toContain('DIMO_API_KEY');
    expect(classified.adminDetail).not.toContain('secret');
  });

  it('extractNodeErrorCode reads axios-style code', () => {
    expect(extractNodeErrorCode({ code: 'ETIMEDOUT', message: 'timeout' })).toBe('ETIMEDOUT');
  });

  it('classifies auth failures', () => {
    const classified = classifyDimoAgentError({
      authFailure: true,
      errorMessage: 'Developer JWT not available — DIMO Agents API requires Bearer authentication',
    });

    expect(classified.kind).toBe('AUTH_ERROR');
    expect(classified.errorCode).toBe('DEVELOPER_JWT_MISSING');
    expect(classified.failedBeforeHttp).toBe(true);
    expect(classified.userMessage).toBe('AI Assistant is not configured correctly.');
    expect(classified.adminDetail).not.toContain('Bearer eyJ');
  });

  describe('formatDimoAgentChatError', () => {
    it('DNS_ERROR chat copy excludes hostname and ENOTFOUND (EN)', () => {
      const text = formatDimoAgentChatError({ errorKind: 'DNS_ERROR', locale: 'en' });

      expect(text).toContain('temporarily unavailable');
      expect(text).not.toContain('agents.dimo.zone');
      expect(text).not.toContain('ENOTFOUND');
      expect(text).not.toContain('getaddrinfo');
      expect(text).not.toContain('Docker');
      expect(text).not.toContain('VPS');
    });

    it('DNS_ERROR chat copy is German when locale=de', () => {
      const text = formatDimoAgentChatError({ errorKind: 'DNS_ERROR', locale: 'de' });

      expect(text).toContain('vorübergehend nicht verfügbar');
      expect(text).not.toContain('agents.dimo.zone');
    });

    it('NETWORK_ERROR chat copy excludes technical detail', () => {
      const text = formatDimoAgentChatError({ errorKind: 'NETWORK_ERROR', locale: 'en' });

      expect(text).toContain('not reachable');
      expect(text).not.toContain('ECONNREFUSED');
    });

    it('formatDimoAgentChatUserMessage defaults to English', () => {
      expect(formatDimoAgentChatUserMessage('DIMO_HTTP_ERROR')).toBe(
        'AI Assistant is temporarily unavailable.',
      );
    });
  });
});
