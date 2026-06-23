import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgWhatsAppConfig } from '@prisma/client';
import { MetaWhatsAppCloudProvider } from './meta-whatsapp-cloud.provider';
import {
  WhatsAppProviderInterface,
  WhatsAppProviderRuntimeConfig,
  WhatsAppProviderSendResult,
  WhatsAppSendMetadata,
} from './whatsapp-provider.interface';

@Injectable()
export class WhatsAppProviderService {
  private readonly provider: WhatsAppProviderInterface;

  constructor(
    private readonly configService: ConfigService,
    metaProvider: MetaWhatsAppCloudProvider,
  ) {
    this.provider = metaProvider;
  }

  get activeProvider(): WhatsAppProviderInterface {
    return this.provider;
  }

  resolveRuntimeConfig(orgConfig: OrgWhatsAppConfig): WhatsAppProviderRuntimeConfig {
    const orgId = orgConfig.organizationId;
    const perOrgToken = process.env[`WHATSAPP_TOKEN_${orgId}`];
    const globalToken = this.configService.get<string>('whatsapp.cloudAccessToken', '');
    const perOrgSecret = process.env[`WHATSAPP_APP_SECRET_${orgId}`];
    const globalSecret = this.configService.get<string>('whatsapp.cloudAppSecret', '');

    const accessToken =
      orgConfig.accessTokenConfigured && (perOrgToken || globalToken)
        ? perOrgToken || globalToken
        : null;

    const appSecret =
      orgConfig.appSecretConfigured && (perOrgSecret || globalSecret)
        ? perOrgSecret || globalSecret
        : null;

    return {
      organizationId: orgId,
      phoneNumberId: orgConfig.phoneNumberId,
      wabaId: orgConfig.wabaId,
      accessToken,
      appSecret,
      webhookVerifyToken: orgConfig.webhookVerifyToken,
      metaApiVersion: orgConfig.metaApiVersion,
    };
  }

  isConfigured(orgConfig: OrgWhatsAppConfig): boolean {
    return this.provider.isConfigured(this.resolveRuntimeConfig(orgConfig));
  }

  sendTextMessage(
    orgConfig: OrgWhatsAppConfig,
    toPhoneNumber: string,
    body: string,
    metadata: WhatsAppSendMetadata,
  ): Promise<WhatsAppProviderSendResult> {
    return this.provider.sendTextMessage(
      this.resolveRuntimeConfig(orgConfig),
      toPhoneNumber,
      body,
      metadata,
    );
  }

  sendTemplateMessage(
    orgConfig: OrgWhatsAppConfig,
    toPhoneNumber: string,
    templateName: string,
    language: string,
    variables: Record<string, string>,
    metadata: WhatsAppSendMetadata,
  ): Promise<WhatsAppProviderSendResult> {
    return this.provider.sendTemplateMessage(
      this.resolveRuntimeConfig(orgConfig),
      toPhoneNumber,
      templateName,
      language,
      variables,
      metadata,
    );
  }

  verifyWebhook(
    orgConfig: OrgWhatsAppConfig,
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    return this.provider.verifyWebhook(
      mode,
      token,
      challenge,
      this.resolveRuntimeConfig(orgConfig),
    );
  }

  parseWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>) {
    return this.provider.parseWebhook(payload, headers);
  }

  validateSignature(
    orgConfig: OrgWhatsAppConfig,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    return this.provider.validateSignature(
      rawBody,
      headers,
      this.resolveRuntimeConfig(orgConfig),
    );
  }

  healthCheck(orgConfig: OrgWhatsAppConfig) {
    return this.provider.healthCheck(this.resolveRuntimeConfig(orgConfig));
  }
}
