import {
  classifyDimoAgentError,
  extractNodeErrorCode,
  formatDimoAgentChatError,
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
    expect(classified.userMessage).toContain('could not be resolved');
    expect(classified.userMessage).toContain('agents.dimo.zone');
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
  });

  it('classifies parser failures', () => {
    const classified = classifyDimoAgentError({
      parserFailure: true,
      errorMessage: 'Empty stream — no content received from agent',
    });

    expect(classified.kind).toBe('PARSER_ERROR');
  });

  it('classifies config failures', () => {
    const classified = classifyDimoAgentError({
      configFailure: true,
      errorMessage: 'DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set',
    });

    expect(classified.kind).toBe('CONFIG_ERROR');
    expect(classified.failedBeforeHttp).toBe(true);
  });

  it('extractNodeErrorCode reads axios-style code', () => {
    expect(extractNodeErrorCode({ code: 'ETIMEDOUT', message: 'timeout' })).toBe('ETIMEDOUT');
  });

  it('formatDimoAgentChatError surfaces DNS context', () => {
    const text = formatDimoAgentChatError({
      errorKind: 'DNS_ERROR',
      error: 'DIMO Agents host could not be resolved from this runtime (agents.dimo.zone). Check Docker/VPS DNS or network access.',
    });

    expect(text).toContain('cannot reach DIMO Agents');
    expect(text).toContain('could not be resolved');
  });
});
