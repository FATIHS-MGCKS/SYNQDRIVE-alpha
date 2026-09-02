import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ReferenceCaptureSessionView } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.types';
import {
  clampHttpRequestTimeoutMs,
  DEFAULT_OPS_HTTP_TIMEOUT_MS,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-fast-go.policy';

export type ReferenceCaptureOpsHttpConfig = {
  baseUrl: string;
  bearerToken: string;
  defaultTimeoutMs?: number;
};

export type ReferenceCaptureOpsHttpRequestOptions = {
  /** Absolute GO deadline (epoch ms). When set, per-request timeout = min(default, remaining). */
  goDeadlineAtMs?: number;
  /** Explicit per-request timeout override (ms). */
  timeoutMs?: number;
  nowMs?: number;
};

export type ReferenceCaptureOpsHttpResult<T> = {
  status: number;
  data: T;
  timedOut?: boolean;
  budgetExhausted?: boolean;
};

export class ReferenceCaptureOpsHttpClient {
  private readonly http: AxiosInstance;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly config: ReferenceCaptureOpsHttpConfig) {
    const baseURL = config.baseUrl.replace(/\/$/, '');
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_OPS_HTTP_TIMEOUT_MS;
    this.http = axios.create({
      baseURL,
      timeout: this.defaultTimeoutMs,
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });
  }

  static fromEnv(): ReferenceCaptureOpsHttpClient {
    const baseUrl =
      process.env.REFERENCE_CAPTURE_OPS_API_BASE_URL ??
      process.env.SYNQDRIVE_API_BASE_URL ??
      '';
    const bearerToken = process.env.REFERENCE_CAPTURE_OPS_BEARER_TOKEN ?? '';
    if (!baseUrl.trim()) {
      throw new Error(
        'REFERENCE_CAPTURE_OPS_API_BASE_URL (or SYNQDRIVE_API_BASE_URL) is required for FAST GO',
      );
    }
    if (!bearerToken.trim()) {
      throw new Error('REFERENCE_CAPTURE_OPS_BEARER_TOKEN is required for FAST GO');
    }
    return new ReferenceCaptureOpsHttpClient({ baseUrl: baseUrl.trim(), bearerToken: bearerToken.trim() });
  }

  private resolveRequestTimeoutMs(options?: ReferenceCaptureOpsHttpRequestOptions): number | null {
    if (options?.timeoutMs != null) {
      return options.timeoutMs > 0 ? options.timeoutMs : null;
    }
    if (options?.goDeadlineAtMs != null) {
      const nowMs = options.nowMs ?? Date.now();
      return clampHttpRequestTimeoutMs(
        options.goDeadlineAtMs - nowMs,
        this.defaultTimeoutMs,
      );
    }
    return this.defaultTimeoutMs;
  }

  private async request<T>(
    config: AxiosRequestConfig,
    options?: ReferenceCaptureOpsHttpRequestOptions,
  ): Promise<ReferenceCaptureOpsHttpResult<T>> {
    const timeoutMs = this.resolveRequestTimeoutMs(options);
    if (timeoutMs == null) {
      return {
        status: 0,
        data: { message: 'go_budget_exhausted' } as T,
        budgetExhausted: true,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await this.http.request<T>({
        ...config,
        timeout: timeoutMs,
        signal: controller.signal,
      });
      return { status: resp.status, data: resp.data };
    } catch (error) {
      if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.name === 'CanceledError')) {
        return {
          status: 0,
          data: { message: 'request_timeout' } as T,
          timedOut: true,
        };
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private sessionPath(orgId: string, vehicleId: string, sessionId: string): string {
    return `/organizations/${orgId}/vehicles/${vehicleId}/reference-capture/sessions/${sessionId}`;
  }

  async getSession(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    options?: ReferenceCaptureOpsHttpRequestOptions,
  ): Promise<ReferenceCaptureOpsHttpResult<ReferenceCaptureSessionView | { message?: string }>> {
    return this.request(
      { method: 'GET', url: this.sessionPath(organizationId, vehicleId, sessionId) },
      options,
    );
  }

  async startRecording(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    options?: ReferenceCaptureOpsHttpRequestOptions,
  ): Promise<ReferenceCaptureOpsHttpResult<ReferenceCaptureSessionView | { message?: string }>> {
    return this.request(
      { method: 'POST', url: `${this.sessionPath(organizationId, vehicleId, sessionId)}/start` },
      options,
    );
  }

  async abortSession(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    reason: string,
    options?: ReferenceCaptureOpsHttpRequestOptions,
  ): Promise<ReferenceCaptureOpsHttpResult<ReferenceCaptureSessionView | { message?: string }>> {
    return this.request(
      {
        method: 'POST',
        url: `${this.sessionPath(organizationId, vehicleId, sessionId)}/abort`,
        data: { reason },
      },
      options,
    );
  }

  async listObservations(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    limit = 100,
    options?: ReferenceCaptureOpsHttpRequestOptions,
  ): Promise<ReferenceCaptureOpsHttpResult<unknown>> {
    return this.request(
      {
        method: 'GET',
        url: `${this.sessionPath(organizationId, vehicleId, sessionId)}/observations?limit=${limit}`,
      },
      options,
    );
  }
}
