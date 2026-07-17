import { Injectable } from '@nestjs/common';
import { SecretRefResolver } from '../secrets/secret-ref.resolver';
import type { TwilioSubaccountCredentials } from '../secrets/twilio-credential.types';

const SUBACCOUNT_ENV_PREFIX = 'VOICE_TWILIO_SUB_';

@Injectable()
export class TwilioSecretStoreService {
  constructor(private readonly secretRefResolver: SecretRefResolver) {}

  buildEnvKeyForOrganization(organizationId: string): string {
    return `${SUBACCOUNT_ENV_PREFIX}${organizationId.replace(/-/g, '_').toUpperCase()}`;
  }

  /**
   * Registers subaccount runtime credentials in the secret store and returns an opaque reference.
   * Plaintext credentials are never persisted in Prisma.
   */
  registerSubaccountCredentials(
    organizationId: string,
    credentials: TwilioSubaccountCredentials,
  ): string {
    const envKey = this.buildEnvKeyForOrganization(organizationId);
    return this.secretRefResolver.registerMemoryJson(envKey, credentials);
  }

  /**
   * Rotation preparation hook — returns the target secret ref without mutating stored credentials.
   */
  prepareCredentialRotationRef(organizationId: string): string {
    return `env-json://${this.buildEnvKeyForOrganization(organizationId)}`;
  }
}
