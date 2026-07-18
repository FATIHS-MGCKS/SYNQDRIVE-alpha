import { Injectable } from '@nestjs/common';
import type { Twilio } from 'twilio';
import { TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { TwilioControlPlaneClient } from '../twilio-control-plane.client';
import { mapTwilioSdkError } from '../errors/twilio-provider-error.mapper';
import type { TwilioSubaccountCredentials } from '../secrets/twilio-credential.types';
import type { TwilioProvisioningNumberType } from './twilio-provisioning.types';

export type TwilioAvailablePhoneNumber = {
  phoneNumber: string;
  locality: string | null;
  region: string | null;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  regulatoryRequirements: string[];
};

export type TwilioPurchasedPhoneNumber = {
  sid: string;
  phoneNumber: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
};

export type TwilioRegulatoryProviderStatus = {
  bundle: string;
  address: string;
  endUser: string;
};

export type TwilioProvisioningProviderPort = {
  createSubaccount(friendlyName: string): Promise<{ accountSid: string; authToken: string }>;
  createRestrictedSubaccountApiKey(
    accountSid: string,
    friendlyName: string,
  ): Promise<TwilioSubaccountCredentials>;
  searchAvailablePhoneNumbers(
    client: Twilio,
    input: {
      country: string;
      numberType: TwilioProvisioningNumberType;
      areaCode?: string;
      contains?: string;
      limit: number;
    },
  ): Promise<TwilioAvailablePhoneNumber[]>;
  purchasePhoneNumber(client: Twilio, phoneNumber: string): Promise<TwilioPurchasedPhoneNumber>;
  getRegulatoryStatus(client: Twilio): Promise<TwilioRegulatoryProviderStatus>;
};

@Injectable()
export class TwilioProvisioningProviderClient implements TwilioProvisioningProviderPort {
  constructor(private readonly controlPlane: TwilioControlPlaneClient) {}

  async createSubaccount(friendlyName: string): Promise<{ accountSid: string; authToken: string }> {
    try {
      const client = this.controlPlane.getAccountsManagementClient();
      const account = await client.api.accounts.create({ friendlyName });
      if (!account.sid || !account.authToken) {
        throw new Error('Twilio subaccount response missing sid or auth token.');
      }
      return { accountSid: account.sid, authToken: account.authToken };
    } catch (err) {
      throw mapTwilioSdkError(err);
    }
  }

  async createRestrictedSubaccountApiKey(
    accountSid: string,
    friendlyName: string,
  ): Promise<TwilioSubaccountCredentials> {
    try {
      const client = this.controlPlane.getAccountsManagementClient();
      const created = await client.api.accounts(accountSid).newKeys.create({ friendlyName });
      if (!created.sid || !created.secret) {
        throw new Error('Twilio API key response missing sid or secret.');
      }
      return {
        accountSid,
        apiKeySid: created.sid,
        apiKeySecret: created.secret,
      };
    } catch (err) {
      throw mapTwilioSdkError(err);
    }
  }

  async searchAvailablePhoneNumbers(
    client: Twilio,
    input: {
      country: string;
      numberType: TwilioProvisioningNumberType;
      areaCode?: string;
      contains?: string;
      limit: number;
    },
  ): Promise<TwilioAvailablePhoneNumber[]> {
    try {
      const listParams = {
        voiceEnabled: true,
        limit: input.limit,
        ...(input.areaCode ? { areaCode: Number.parseInt(input.areaCode, 10) } : {}),
        ...(input.contains ? { contains: input.contains } : {}),
      };

      const rows =
        input.numberType === 'mobile'
          ? await client.availablePhoneNumbers(input.country).mobile.list(listParams)
          : await client.availablePhoneNumbers(input.country).local.list(listParams);

      return rows.map((row: {
        phoneNumber?: string;
        locality?: string;
        region?: string;
        capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean };
        requirements?: string[];
      }) => ({
        phoneNumber: row.phoneNumber ?? '',
        locality: row.locality ?? null,
        region: row.region ?? null,
        capabilities: {
          voice: Boolean(row.capabilities?.voice),
          sms: Boolean(row.capabilities?.sms),
          mms: Boolean(row.capabilities?.mms),
        },
        regulatoryRequirements: Array.isArray(row.requirements) ? row.requirements : [],
      }));
    } catch (err) {
      throw mapTwilioSdkError(err);
    }
  }

  async purchasePhoneNumber(
    client: Twilio,
    phoneNumber: string,
  ): Promise<TwilioPurchasedPhoneNumber> {
    try {
      const purchased = await client.incomingPhoneNumbers.create({ phoneNumber });
      return {
        sid: purchased.sid,
        phoneNumber: purchased.phoneNumber ?? phoneNumber,
        capabilities: {
          voice: Boolean(purchased.capabilities?.voice),
          sms: Boolean(purchased.capabilities?.sms),
          mms: Boolean(purchased.capabilities?.mms),
        },
      };
    } catch (err) {
      throw mapTwilioSdkError(err);
    }
  }

  async getRegulatoryStatus(client: Twilio): Promise<TwilioRegulatoryProviderStatus> {
    try {
      const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({ limit: 1 });
      const addresses = await client.addresses.list({ limit: 1 });
      const endUsers = await client.numbers.v2.regulatoryCompliance.endUsers.list({ limit: 1 });

      return {
        bundle: bundles[0]?.status ?? 'pending',
        address: addresses[0] ? 'approved' : 'pending',
        endUser: endUsers[0] ? 'in_review' : 'pending',
      };
    } catch {
      return {
        bundle: 'pending',
        address: 'pending',
        endUser: 'pending',
      };
    }
  }

  getRequiredRegion(): string {
    return TWILIO_DEFAULT_REGION;
  }

  getRequiredEdge(): string {
    return TWILIO_DEFAULT_EDGE;
  }
}
