import type { NormalizedDimoWebhookPayload } from './dimo-webhook-payload.util';
import {
  DeviceConnectionWebhookService,
} from './device-connection-webhook.service';
import {
  inferObdPlugStateFromWebhookContext,
  isBlockedEngineWebhookSignal,
  isRpmWebhookSignal,
} from './dimo-webhook-payload.util';

export type DimoWebhookRoute =
  | 'rpm'
  | 'obd'
  | 'dtc'
  | 'speed'
  | 'ignition'
  | 'blocked_engine'
  | 'acknowledged';

export interface DimoWebhookLogContext {
  tokenId: number | null;
  vehicleId?: string;
  metricName: string | null;
  signalName: string | null;
  webhookName: string | null;
  value: unknown;
  route: DimoWebhookRoute;
  status: 'processed' | 'ignored' | 'rejected';
  outcome?: string;
  reason?: string;
}

export function classifyDimoWebhookRoute(
  payload: NormalizedDimoWebhookPayload,
): DimoWebhookRoute {
  if (isBlockedEngineWebhookSignal(payload.signalName)) return 'blocked_engine';
  if (payload.signalName === 'obdDTCList') return 'dtc';
  if (isRpmWebhookSignal(payload.signalName, payload.metricName)) return 'rpm';
  if (
    DeviceConnectionWebhookService.isObdPluggedSignal(payload.signalName, payload.metricName) ||
    inferObdPlugStateFromWebhookContext(payload) != null
  ) {
    return 'obd';
  }
  if (payload.signalName === 'speed') return 'speed';
  if (payload.signalName === 'isIgnitionOn') return 'ignition';
  return 'acknowledged';
}

export function formatDimoWebhookLogLine(ctx: DimoWebhookLogContext): string {
  const parts = [
    `route=${ctx.route}`,
    `status=${ctx.status}`,
    ctx.tokenId != null ? `tokenId=${ctx.tokenId}` : null,
    ctx.vehicleId ? `vehicleId=${ctx.vehicleId}` : null,
    ctx.metricName ? `metric=${ctx.metricName}` : null,
    ctx.signalName ? `signal=${ctx.signalName}` : null,
    ctx.webhookName ? `display=${JSON.stringify(ctx.webhookName)}` : null,
    ctx.value != null ? `value=${String(ctx.value)}` : null,
    ctx.outcome ? `outcome=${ctx.outcome}` : null,
    ctx.reason ? `reason=${ctx.reason}` : null,
  ].filter(Boolean);
  return `DIMO webhook routed: ${parts.join(' ')}`;
}
