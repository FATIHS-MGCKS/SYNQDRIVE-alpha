import type { Twilio } from 'twilio';
import twilio = require('twilio');

import {
  TWILIO_DEFAULT_EDGE,
  TWILIO_DEFAULT_REGION,
} from './twilio.config';

export interface TwilioClientOptions {
  accountSid?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  region?: string;
  edge?: string;
}

/**
 * Creates an isolated Twilio REST client instance. Does not perform network I/O
 * until an API method is invoked.
 */
export function createTwilioClient(options: TwilioClientOptions): Twilio | null {
  const accountSid = options.accountSid?.trim();
  const apiKeySid = options.apiKeySid?.trim();
  const apiKeySecret = options.apiKeySecret?.trim();
  const region = options.region?.trim() || TWILIO_DEFAULT_REGION;
  const edge = options.edge?.trim() || TWILIO_DEFAULT_EDGE;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return null;
  }

  return twilio(apiKeySid, apiKeySecret, {
    accountSid,
    region,
    edge,
  });
}

/**
 * Parent-account management client (subaccount create, API keys).
 * Account Admin API is not available on IE1 — use Auth Token on default US routing.
 */
export function createTwilioAccountsManagementClient(
  options: TwilioClientOptions & { authToken?: string },
): Twilio | null {
  const accountSid = options.accountSid?.trim();
  const authToken = options.authToken?.trim();
  if (accountSid && authToken) {
    return twilio(accountSid, authToken);
  }
  const apiKeySid = options.apiKeySid?.trim();
  const apiKeySecret = options.apiKeySecret?.trim();
  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return null;
  }
  return twilio(apiKeySid, apiKeySecret, { accountSid });
}

let legacyControlPlaneSingleton: Twilio | null = null;

/**
 * @deprecated Prefer TwilioControlPlaneClient or TwilioTenantClientFactory.
 * Retained for backward-compatible import tests; uses a control-plane singleton.
 */
export function getTwilioClient(options?: TwilioClientOptions): Twilio | null {
  const accountSid =
    options?.accountSid?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid =
    options?.apiKeySid?.trim() || process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret =
    options?.apiKeySecret?.trim() || process.env.TWILIO_API_KEY_SECRET?.trim();
  const region =
    options?.region?.trim() ||
    process.env.TWILIO_REGION?.trim() ||
    TWILIO_DEFAULT_REGION;
  const edge =
    options?.edge?.trim() ||
    process.env.TWILIO_EDGE?.trim() ||
    TWILIO_DEFAULT_EDGE;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return null;
  }

  if (!legacyControlPlaneSingleton) {
    legacyControlPlaneSingleton = createTwilioClient({
      accountSid,
      apiKeySid,
      apiKeySecret,
      region,
      edge,
    });
  }

  return legacyControlPlaneSingleton;
}

export function resetTwilioClientForTests(): void {
  legacyControlPlaneSingleton = null;
}
