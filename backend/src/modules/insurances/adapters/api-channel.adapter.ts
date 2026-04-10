import { Injectable, Logger } from '@nestjs/common';
import {
  InsurerChannelAdapter,
  InsurerInquiryPayload,
  InsurerDeliveryResult,
  InsurerConnectionTestResult,
} from './insurer-channel.interface';

@Injectable()
export class ApiChannelAdapter implements InsurerChannelAdapter {
  readonly channelType = 'API';
  private readonly logger = new Logger(ApiChannelAdapter.name);

  async sendInquiry(
    payload: InsurerInquiryPayload,
    config: Record<string, unknown>,
  ): Promise<InsurerDeliveryResult> {
    const endpoint = config.apiEndpoint as string;
    const start = Date.now();

    this.logger.log(
      `[API] Sending inquiry ${payload.inquiryId} to endpoint ${endpoint}`,
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          correlationId: payload.correlationId,
          inquiryType: payload.inquiryType,
          vehicle: payload.vehicleSummary,
          insuranceModels: payload.selectedInsuranceModels,
          historicalData: payload.historicalDataSummary,
          liveDataScope: payload.liveDataScope,
          timeRange: payload.timeRange,
        }),
        signal: AbortSignal.timeout(30000),
      });

      return {
        success: response.ok,
        channel: 'API',
        externalReference: response.headers.get('x-reference-id') ?? `api-${Date.now()}`,
        message: response.ok
          ? `API submission successful (${response.status})`
          : `API submission failed (${response.status})`,
        sentAt: new Date(),
      };
    } catch (err: any) {
      this.logger.error(`[API] Failed to send inquiry: ${err.message}`);
      return {
        success: false,
        channel: 'API',
        message: `API error: ${err.message}`,
        sentAt: new Date(),
      };
    }
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<InsurerConnectionTestResult> {
    const endpoint = config.apiEndpoint as string;
    if (!endpoint) {
      return { success: false, latencyMs: 0, message: 'No API endpoint configured', timestamp: new Date() };
    }
    const start = Date.now();
    try {
      const response = await fetch(endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      });
      return {
        success: response.ok || response.status === 405,
        latencyMs: Date.now() - start,
        message: `Endpoint reachable (${response.status})`,
        timestamp: new Date(),
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Connection failed: ${err.message}`,
        timestamp: new Date(),
      };
    }
  }
}
