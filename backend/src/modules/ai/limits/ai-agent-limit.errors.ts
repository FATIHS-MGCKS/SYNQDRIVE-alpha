import { HttpException, HttpStatus } from '@nestjs/common';
import type { AiAgentLimitDecision, AiAgentLimitKind } from './ai-agent-limit.types';

const USER_MESSAGES: Record<
  AiAgentLimitKind,
  { de: string; en: string }
> = {
  rate_limit: {
    de: 'Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
    en: 'Too many requests. Please wait a moment and try again.',
  },
  budget_exceeded: {
    de: 'Das tägliche KI-Budget ist erreicht. Bitte versuchen Sie es später erneut.',
    en: 'The daily AI budget has been reached. Please try again later.',
  },
  provider_overloaded: {
    de: 'Der KI-Anbieter ist derzeit überlastet. Bitte versuchen Sie es in Kürze erneut.',
    en: 'The AI provider is currently overloaded. Please try again shortly.',
  },
  circuit_breaker_open: {
    de: 'Der KI-Assistent ist vorübergehend nicht verfügbar. Bitte versuchen Sie es in Kürze erneut.',
    en: 'The AI assistant is temporarily unavailable. Please try again shortly.',
  },
  tool_timeout: {
    de: 'Ein Datenabruf hat zu lange gedauert. Bitte versuchen Sie es erneut.',
    en: 'A data request took too long. Please try again.',
  },
  request_timeout: {
    de: 'Die Anfrage hat zu lange gedauert. Bitte formulieren Sie die Frage kürzer oder versuchen Sie es erneut.',
    en: 'The request took too long. Please shorten your question or try again.',
  },
  concurrency_limit: {
    de: 'Zu viele parallele Anfragen. Bitte warten Sie, bis die laufende Anfrage abgeschlossen ist.',
    en: 'Too many parallel requests. Please wait for the current request to finish.',
  },
};

export class AiAgentLimitException extends HttpException {
  readonly kind: AiAgentLimitKind;
  readonly retryAfterSeconds: number;
  readonly userMessage: { de: string; en: string };

  constructor(decision: AiAgentLimitDecision) {
    const status =
      decision.kind === 'rate_limit' || decision.kind === 'concurrency_limit'
        ? HttpStatus.TOO_MANY_REQUESTS
        : HttpStatus.SERVICE_UNAVAILABLE;
    super(
      {
        code: decision.kind,
        retryAfterSeconds: decision.retryAfterSeconds,
        message: decision.message,
      },
      status,
    );
    this.kind = decision.kind;
    this.retryAfterSeconds = decision.retryAfterSeconds;
    this.userMessage = decision.message;
  }

  static fromKind(
    kind: AiAgentLimitKind,
    retryAfterSeconds = 60,
    scope?: AiAgentLimitDecision['scope'],
  ): AiAgentLimitException {
    return new AiAgentLimitException({
      allowed: false,
      kind,
      retryAfterSeconds,
      scope,
      message: USER_MESSAGES[kind],
    });
  }

  resolveText(locale: 'de' | 'en' | 'unknown' = 'de'): string {
    return locale === 'en' ? this.userMessage.en : this.userMessage.de;
  }
}
