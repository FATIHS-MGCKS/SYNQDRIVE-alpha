import axios, { type AxiosInstance } from 'axios';
import type { ReferenceCaptureSessionView } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.types';

export type ReferenceCaptureOpsHttpConfig = {
  baseUrl: string;
  bearerToken: string;
};

export class ReferenceCaptureOpsHttpClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ReferenceCaptureOpsHttpConfig) {
    const baseURL = config.baseUrl.replace(/\/$/, '');
    this.http = axios.create({
      baseURL,
      timeout: 30_000,
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

  private sessionPath(orgId: string, vehicleId: string, sessionId: string): string {
    return `/organizations/${orgId}/vehicles/${vehicleId}/reference-capture/sessions/${sessionId}`;
  }

  async getSession(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
  ): Promise<{ status: number; data: ReferenceCaptureSessionView | { message?: string } }> {
    const resp = await this.http.get(this.sessionPath(organizationId, vehicleId, sessionId));
    return { status: resp.status, data: resp.data };
  }

  async startRecording(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
  ): Promise<{ status: number; data: ReferenceCaptureSessionView | { message?: string } }> {
    const resp = await this.http.post(`${this.sessionPath(organizationId, vehicleId, sessionId)}/start`);
    return { status: resp.status, data: resp.data };
  }

  async abortSession(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    reason: string,
  ): Promise<{ status: number; data: ReferenceCaptureSessionView | { message?: string } }> {
    const resp = await this.http.post(`${this.sessionPath(organizationId, vehicleId, sessionId)}/abort`, {
      reason,
    });
    return { status: resp.status, data: resp.data };
  }

  async listObservations(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    limit = 100,
  ): Promise<{ status: number; data: unknown }> {
    const resp = await this.http.get(
      `${this.sessionPath(organizationId, vehicleId, sessionId)}/observations?limit=${limit}`,
    );
    return { status: resp.status, data: resp.data };
  }
}
