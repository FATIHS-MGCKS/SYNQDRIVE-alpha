import { HttpException, HttpStatus } from '@nestjs/common';

export type StripeConnectErrorCode =
  | 'PAYMENTS_FEATURE_DISABLED'
  | 'CONNECT_ACCOUNT_ALREADY_EXISTS'
  | 'CONNECT_NOT_CONFIGURED'
  | 'CONNECT_ACCOUNT_RESTRICTED'
  | 'STRIPE_MODE_MISMATCH'
  | 'CONNECT_PROVIDER_ERROR';

export class StripeConnectDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: StripeConnectErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, code }, status);
    this.name = 'StripeConnectDomainError';
  }
}

export class PaymentsFeatureDisabledConnectError extends StripeConnectDomainError {
  constructor(organizationId: string) {
    super(
      `End-customer payments are not enabled for organization ${organizationId}`,
      'PAYMENTS_FEATURE_DISABLED',
      HttpStatus.FORBIDDEN,
    );
    this.name = 'PaymentsFeatureDisabledConnectError';
  }
}

export class ConnectAccountAlreadyExistsError extends StripeConnectDomainError {
  constructor(organizationId: string, connectedAccountId: string) {
    super(
      `Organization ${organizationId} already has connected account ${connectedAccountId}`,
      'CONNECT_ACCOUNT_ALREADY_EXISTS',
      HttpStatus.CONFLICT,
    );
    this.name = 'ConnectAccountAlreadyExistsError';
  }
}

export class ConnectNotConfiguredError extends StripeConnectDomainError {
  constructor(detail?: string) {
    super(
      detail ?? 'Stripe Connect is not configured for this environment',
      'CONNECT_NOT_CONFIGURED',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    this.name = 'ConnectNotConfiguredError';
  }
}

export class ConnectAccountRestrictedError extends StripeConnectDomainError {
  constructor(reason?: string | null) {
    super(
      reason
        ? `Connected account is restricted: ${reason}`
        : 'Connected account is restricted',
      'CONNECT_ACCOUNT_RESTRICTED',
      HttpStatus.FORBIDDEN,
    );
    this.name = 'ConnectAccountRestrictedError';
  }
}

export class StripeModeMismatchError extends StripeConnectDomainError {
  constructor() {
    super(
      'Stripe Connect account operations are only permitted in test mode for this integration phase',
      'STRIPE_MODE_MISMATCH',
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'StripeModeMismatchError';
  }
}

export class ConnectProviderError extends StripeConnectDomainError {
  constructor(message: string) {
    super(message, 'CONNECT_PROVIDER_ERROR', HttpStatus.BAD_GATEWAY);
    this.name = 'ConnectProviderError';
  }
}
