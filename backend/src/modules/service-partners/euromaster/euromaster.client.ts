import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import euromasterConfig from '@config/euromaster.config';
import { EuromasterAuthService } from './euromaster-auth.service';
import {
  EmAppointmentCreateRequest,
  EmAppointmentCreateResponse,
  EmServiceStatusResponse,
  EmBranchSearchRequest,
  EmBranchSearchResponse,
} from './euromaster.types';
import {
  EuromasterApiError,
  EuromasterTimeoutError,
  EuromasterConfigError,
} from './euromaster.errors';

/**
 * Low-level typed HTTP client for the Euromaster fleet API.
 *
 * ENDPOINT NOTES:
 * The exact endpoint paths below are structured assumptions based on
 * common fleet-service API patterns. They must be confirmed against
 * the actual Euromaster fleet API documentation once available.
 * Each method is clearly named so that wiring to real endpoints is
 * a single-line path change, not a structural refactor.
 */
@Injectable()
export class EuromasterClient {
  private readonly logger = new Logger(EuromasterClient.name);
  private readonly httpClient: AxiosInstance;

  constructor(
    @Inject(euromasterConfig.KEY) private readonly conf: ConfigType<typeof euromasterConfig>,
    private readonly auth: EuromasterAuthService,
  ) {
    this.httpClient = axios.create({
      baseURL: conf.baseUrl,
      timeout: conf.requestTimeoutMs,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  }

  // ─── Appointments ─────────────────────────────────────────────────

  async createAppointment(payload: EmAppointmentCreateRequest): Promise<EmAppointmentCreateResponse> {
    return this.request<EmAppointmentCreateResponse>(
      'POST',
      '/appointments',
      payload,
      'createAppointment',
    );
  }

  async getAppointmentStatus(appointmentId: string): Promise<EmServiceStatusResponse> {
    return this.request<EmServiceStatusResponse>(
      'GET',
      `/appointments/${encodeURIComponent(appointmentId)}/status`,
      undefined,
      'getAppointmentStatus',
    );
  }

  // ─── Branches ─────────────────────────────────────────────────────

  async searchBranches(params: EmBranchSearchRequest): Promise<EmBranchSearchResponse> {
    const query = new URLSearchParams();
    if (params.latitude != null) query.set('lat', String(params.latitude));
    if (params.longitude != null) query.set('lng', String(params.longitude));
    if (params.postalCode) query.set('postalCode', params.postalCode);
    if (params.radiusKm != null) query.set('radius', String(params.radiusKm));
    if (params.services?.length) query.set('services', params.services.join(','));

    return this.request<EmBranchSearchResponse>(
      'GET',
      `/branches?${query.toString()}`,
      undefined,
      'searchBranches',
    );
  }

  // ─── Core request executor with retry & error mapping ─────────────

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    operationName = 'unknown',
  ): Promise<T> {
    if (!this.conf.liveApiEnabled) {
      throw new EuromasterConfigError('Live API is not enabled');
    }

    const headers = await this.auth.getAuthHeaders();
    const url = path;
    const start = Date.now();
    let lastError: Error | null = null;

    const isIdempotent = method === 'GET';
    const maxAttempts = isIdempotent ? this.conf.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.debug(
          `Euromaster ${operationName} [${method} ${path}] attempt ${attempt}/${maxAttempts}`,
        );

        const response = await this.httpClient.request<T>({
          method,
          url,
          data: body,
          headers,
        });

        const duration = Date.now() - start;
        this.logger.log(
          `Euromaster ${operationName} completed in ${duration}ms (status ${response.status})`,
        );

        return response.data;
      } catch (err) {
        lastError = this.mapError(err as AxiosError, operationName);

        if (lastError instanceof EuromasterTimeoutError && attempt < maxAttempts) {
          this.logger.warn(
            `Euromaster ${operationName} timeout on attempt ${attempt} — retrying in ${this.conf.retryDelayMs}ms`,
          );
          await this.delay(this.conf.retryDelayMs);
          continue;
        }

        const axErr = err as AxiosError;
        const status = axErr.response?.status;
        if (status && status >= 500 && isIdempotent && attempt < maxAttempts) {
          this.logger.warn(
            `Euromaster ${operationName} upstream ${status} on attempt ${attempt} — retrying`,
          );
          await this.delay(this.conf.retryDelayMs * attempt);
          continue;
        }

        break;
      }
    }

    const duration = Date.now() - start;
    this.logger.error(
      `Euromaster ${operationName} failed after ${duration}ms: ${lastError?.message}`,
    );
    throw lastError;
  }

  private mapError(err: AxiosError, operation: string): EuromasterApiError | EuromasterTimeoutError {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new EuromasterTimeoutError(operation, this.conf.requestTimeoutMs);
    }

    const status = err.response?.status ?? 500;
    const data = err.response?.data as Record<string, unknown> | undefined;
    const upstreamCode = (data?.code as string) ?? undefined;
    const detail = (data?.message as string) ?? err.message;

    return new EuromasterApiError(detail, status, upstreamCode, data);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
