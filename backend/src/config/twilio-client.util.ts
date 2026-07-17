import type { Twilio } from 'twilio';
import twilio = require('twilio');

import {
  TWILIO_DEFAULT_EDGE,
  TWILIO_DEFAULT_REGION,
} from './twilio.config';

let twilioSingleton: Twilio | null = null;

export interface TwilioClientOptions {
  accountSid?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  region?: string;
  edge?: string;
}

/**
 * Lazy Twilio REST client factory. Does not perform network I/O until an API
 * method is invoked. Returns null when credentials are incomplete.
 *
 * SynqDrive EU routing: region `ie1` requires edge `dublin`; API keys must be
 * created in the IE1 region. Do not configure region and edge independently.
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

  if (!twilioSingleton) {
    twilioSingleton = twilio(apiKeySid, apiKeySecret, {
      accountSid,
      region,
      edge,
    });
  }

  return twilioSingleton;
}

export function resetTwilioClientForTests(): void {
  twilioSingleton = null;
}
