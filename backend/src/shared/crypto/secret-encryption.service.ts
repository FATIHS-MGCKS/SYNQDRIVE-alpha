import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION_PREFIX = 'v1';

@Injectable()
export class SecretEncryptionService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getKey());
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [VERSION_PREFIX, iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join(
      ':',
    );
  }

  decrypt(ciphertext: string): string {
    const key = this.requireKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
      throw new Error('Invalid encrypted secret format');
    }

    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const encrypted = Buffer.from(dataB64, 'base64url');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private getKey(): Buffer | null {
    return this.config.get<Buffer | null>('security.totpEncryptionKey') ?? null;
  }

  private requireKey(): Buffer {
    const key = this.getKey();
    if (!key) {
      throw new Error('TOTP_ENCRYPTION_KEY is not configured');
    }
    return key;
  }
}
