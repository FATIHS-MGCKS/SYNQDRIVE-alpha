import { sanitizeDimoAgentError, sanitizeDimoAgentErrorMessage } from './dimo-agent-error-sanitize.util';

export type DimoAgentErrorKind =
  | 'DNS_ERROR'
  | 'NETWORK_ERROR'
  | 'DIMO_HTTP_ERROR'
  | 'PARSER_ERROR'
  | 'CONFIG_ERROR'
  | 'AUTH_ERROR';

export interface DimoAgentClassifiedError {
  kind: DimoAgentErrorKind;
  errorCode?: string;
  /** Raw/sanitized technical message for logs. */
  message: string;
  /** Short operator-facing chat copy (English default). */
  userMessage: string;
  /** Safe diagnostic detail for admin/diagnostics endpoints (no secrets). */
  adminDetail: string;
  failedBeforeHttp: boolean;
  statusCode?: number;
}

export type DimoAgentChatLocale = 'en' | 'de';

export interface ClassifyDimoAgentErrorInput {
  err?: unknown;
  errorMessage?: string;
  statusCode?: number;
  configFailure?: boolean;
  authFailure?: boolean;
  parserFailure?: boolean;
  hostname?: string;
}

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH']);

export function extractNodeErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) return code.trim();
  const message = err instanceof Error ? err.message : String(err);
  const fromMessage = message.match(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH)\b/);
  return fromMessage?.[1];
}

export function classifyDimoAgentError(input: ClassifyDimoAgentErrorInput): DimoAgentClassifiedError {
  const rawMessage = sanitizeDimoAgentErrorMessage(
    input.errorMessage ?? (input.err != null ? sanitizeDimoAgentError(input.err) : 'Unknown error'),
  );
  const errorCode = extractNodeErrorCode(input.err) ?? extractNodeErrorCode({ message: rawMessage });
  const hostname = input.hostname?.trim() || 'agents.dimo.zone';

  if (input.authFailure) {
    return {
      kind: 'AUTH_ERROR',
      errorCode: errorCode ?? 'DEVELOPER_JWT_MISSING',
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('AUTH_ERROR'),
      adminDetail: 'Developer JWT is not available for DIMO Agents API.',
      failedBeforeHttp: true,
    };
  }

  if (input.configFailure) {
    return {
      kind: 'CONFIG_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('CONFIG_ERROR'),
      adminDetail: rawMessage || 'DIMO Agent API is not configured.',
      failedBeforeHttp: true,
    };
  }

  if (input.parserFailure) {
    return {
      kind: 'PARSER_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('PARSER_ERROR'),
      adminDetail: rawMessage || 'DIMO Agents response could not be parsed.',
      failedBeforeHttp: false,
      statusCode: input.statusCode,
    };
  }

  if (typeof input.statusCode === 'number' && input.statusCode >= 400) {
    return {
      kind: 'DIMO_HTTP_ERROR',
      errorCode: errorCode ?? `HTTP_${input.statusCode}`,
      message: rawMessage || `HTTP ${input.statusCode}`,
      userMessage: formatDimoAgentChatUserMessage('DIMO_HTTP_ERROR'),
      adminDetail: `DIMO Agents returned HTTP ${input.statusCode}.`,
      failedBeforeHttp: false,
      statusCode: input.statusCode,
    };
  }

  if (errorCode && DNS_CODES.has(errorCode)) {
    return {
      kind: 'DNS_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('DNS_ERROR'),
      adminDetail: `DIMO Agents DNS resolution failed for ${hostname}. Check Docker/VPS DNS.`,
      failedBeforeHttp: true,
    };
  }

  if (errorCode && NETWORK_CODES.has(errorCode)) {
    return {
      kind: 'NETWORK_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('NETWORK_ERROR'),
      adminDetail: 'Outbound HTTPS/network request to DIMO Agents failed.',
      failedBeforeHttp: true,
    };
  }

  if (/getaddrinfo\s+ENOTFOUND/i.test(rawMessage) || /ENOTFOUND\s+agents\./i.test(rawMessage)) {
    return {
      kind: 'DNS_ERROR',
      errorCode: errorCode ?? 'ENOTFOUND',
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('DNS_ERROR'),
      adminDetail: `DIMO Agents DNS resolution failed for ${hostname}. Check Docker/VPS DNS.`,
      failedBeforeHttp: true,
    };
  }

  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(rawMessage)) {
    return {
      kind: 'NETWORK_ERROR',
      errorCode: errorCode ?? 'NETWORK',
      message: rawMessage,
      userMessage: formatDimoAgentChatUserMessage('NETWORK_ERROR'),
      adminDetail: 'Outbound HTTPS/network request to DIMO Agents failed.',
      failedBeforeHttp: true,
    };
  }

  return {
    kind: 'NETWORK_ERROR',
    errorCode,
    message: rawMessage,
    userMessage: formatDimoAgentChatUserMessage('NETWORK_ERROR'),
    adminDetail: 'Outbound HTTPS/network request to DIMO Agents failed.',
    failedBeforeHttp: true,
  };
}

export interface DimoAgentErrorResultShape {
  success: false;
  error?: string;
  errorKind?: DimoAgentErrorKind;
  errorCode?: string;
  failedBeforeHttp?: boolean;
  statusCode?: number;
  configFailure?: boolean;
}

export function applyDimoAgentClassifiedError<T extends DimoAgentErrorResultShape>(
  result: T,
  classified: DimoAgentClassifiedError,
): T {
  return {
    ...result,
    error: classified.adminDetail,
    errorKind: classified.kind,
    errorCode: classified.errorCode,
    failedBeforeHttp: classified.failedBeforeHttp,
    statusCode: classified.statusCode ?? result.statusCode,
  };
}

const CHAT_USER_MESSAGES: Record<DimoAgentErrorKind, Record<DimoAgentChatLocale, string>> = {
  DNS_ERROR: {
    en: 'AI Assistant is temporarily unavailable because the DIMO Agent service cannot be reached.',
    de: 'Der AI Assistant ist vorübergehend nicht verfügbar, weil der DIMO Agent Service nicht erreichbar ist.',
  },
  NETWORK_ERROR: {
    en: 'AI Assistant is temporarily unavailable because the DIMO Agent service is not reachable.',
    de: 'Der AI Assistant ist vorübergehend nicht verfügbar, weil der DIMO Agent Service nicht erreichbar ist.',
  },
  DIMO_HTTP_ERROR: {
    en: 'AI Assistant is temporarily unavailable.',
    de: 'Der AI Assistant ist vorübergehend nicht verfügbar.',
  },
  PARSER_ERROR: {
    en: 'AI Assistant is temporarily unavailable.',
    de: 'Der AI Assistant ist vorübergehend nicht verfügbar.',
  },
  CONFIG_ERROR: {
    en: 'AI Assistant is not configured correctly.',
    de: 'Der AI Assistant ist nicht korrekt konfiguriert.',
  },
  AUTH_ERROR: {
    en: 'AI Assistant is not configured correctly.',
    de: 'Der AI Assistant ist nicht korrekt konfiguriert.',
  },
};

function resolveChatLocale(locale?: string): DimoAgentChatLocale {
  return locale?.trim().toLowerCase() === 'de' ? 'de' : 'en';
}

/** Operator-facing chat bubble copy only — no hostnames, codes, or infra hints. */
export function formatDimoAgentChatUserMessage(
  errorKind?: DimoAgentErrorKind,
  locale?: string,
): string {
  const kind = errorKind ?? 'NETWORK_ERROR';
  const resolvedLocale = resolveChatLocale(locale);
  return CHAT_USER_MESSAGES[kind]?.[resolvedLocale] ?? CHAT_USER_MESSAGES.NETWORK_ERROR[resolvedLocale];
}

export function formatDimoAgentChatError(result: {
  errorKind?: DimoAgentErrorKind;
  locale?: string;
}): string {
  return formatDimoAgentChatUserMessage(result.errorKind, result.locale);
}
