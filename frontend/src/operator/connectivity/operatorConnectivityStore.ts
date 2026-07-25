import { operatorUploadQueue } from '../upload-queue/operatorUploadQueue';
import type { OperatorUploadQueueItem } from '../upload-queue/operatorUploadQueue.types';
import { hasBlockingUploads } from '../upload-queue/operatorUploadQueue.types';
import { computeOperatorConnectivityBanner } from './operatorConnectivity.compute';
import {
  HANDOVER_DRAFT_CONNECTIVITY_EVENT,
  OPERATOR_API_FAILURE_EVENT,
  OPERATOR_API_SUCCESS_EVENT,
  OPERATOR_AUTH_EXPIRED_EVENT,
  type HandoverDraftConnectivityDetail,
} from './operatorConnectivity.events';
import { probeOperatorBackendHealth } from './operatorConnectivityHealth';
import type {
  OperatorConnectivityBannerModel,
  OperatorConnectivitySignals,
} from './operatorConnectivity.types';

type Listener = () => void;

const RECONNECT_ACK_MS = 12_000;
const MIN_PROBE_INTERVAL_MS = 45_000;
const FAILURE_PROBE_DELAY_MS = 15_000;

function createDefaultSignals(): OperatorConnectivitySignals {
  return {
    browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    backendReachable: null,
    authExpired: false,
    apiPartialFailure: false,
    uploadServiceDegraded: false,
    draftSaveFailed: false,
    draftBufferedLocally: false,
    draftSyncing: false,
    queuePendingCount: 0,
    queueFailedCount: 0,
    queueBlockingFailed: false,
    queueUploadingCount: 0,
    recentlyReconnected: false,
  };
}

function summarizeUploadQueue(items: OperatorUploadQueueItem[]) {
  let queuePendingCount = 0;
  let queueFailedCount = 0;
  let queueUploadingCount = 0;

  for (const item of items) {
    if (item.status === 'failed') queueFailedCount += 1;
    if (item.status === 'pending') queuePendingCount += 1;
    if (item.status === 'uploading') queueUploadingCount += 1;
  }

  return {
    queuePendingCount,
    queueFailedCount,
    queueUploadingCount,
    queueBlockingFailed: hasBlockingUploads(items),
    uploadServiceDegraded: queueFailedCount > 0 && !hasBlockingUploads(items),
  };
}

class OperatorConnectivityStore {
  private signals: OperatorConnectivitySignals = createDefaultSignals();
  private listeners = new Set<Listener>();
  private started = false;
  private probeAbort: AbortController | null = null;
  private lastProbeAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private failureProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private wasBrowserOffline = !this.signals.browserOnline;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureStarted();
    return () => this.listeners.delete(listener);
  }

  getSignals(): OperatorConnectivitySignals {
    return this.signals;
  }

  getBanner(): OperatorConnectivityBannerModel {
    return computeOperatorConnectivityBanner(this.signals);
  }

  setApiPartialFailure(value: boolean): void {
    this.patch({ apiPartialFailure: value });
  }

  setDraftBufferedLocally(value: boolean): void {
    this.patch({ draftBufferedLocally: value });
  }

  private ensureStarted(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    window.addEventListener(OPERATOR_AUTH_EXPIRED_EVENT, this.onAuthExpired);
    window.addEventListener(OPERATOR_API_FAILURE_EVENT, this.onApiFailure);
    window.addEventListener(OPERATOR_API_SUCCESS_EVENT, this.onApiSuccess);
    window.addEventListener(HANDOVER_DRAFT_CONNECTIVITY_EVENT, this.onDraftConnectivity);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.refreshUploadSignals(operatorUploadQueue.getItems());
    operatorUploadQueue.subscribe(() => {
      this.refreshUploadSignals(operatorUploadQueue.getItems());
    });

    void this.probeBackend('startup');
  }

  private onOnline = (): void => {
    const wasOffline = this.wasBrowserOffline;
    this.wasBrowserOffline = false;
    this.patch({ browserOnline: true });
    if (wasOffline) {
      this.markRecentlyReconnected();
    }
    void this.probeBackend('online');
  };

  private onOffline = (): void => {
    this.wasBrowserOffline = true;
    this.patch({
      browserOnline: false,
      backendReachable: null,
      recentlyReconnected: false,
    });
    this.clearReconnectTimer();
  };

  private onAuthExpired = (): void => {
    this.patch({ authExpired: true });
  };

  private onApiFailure = (): void => {
    if (!this.signals.browserOnline) return;
    this.patch({ backendReachable: false });
    this.scheduleFailureProbe();
  };

  private onApiSuccess = (): void => {
    if (!this.signals.browserOnline) return;
    this.patch({ backendReachable: true });
    this.clearFailureProbe();
  };

  private onDraftConnectivity = (event: Event): void => {
    const detail = (event as CustomEvent<HandoverDraftConnectivityDetail>).detail;
    switch (detail.status) {
      case 'saving':
        this.patch({ draftSyncing: true, draftSaveFailed: false });
        break;
      case 'saved':
        this.patch({ draftSyncing: false, draftSaveFailed: false });
        break;
      case 'offline':
        this.patch({ draftSyncing: false });
        break;
      case 'error':
        this.patch({ draftSyncing: false, draftSaveFailed: true });
        break;
      case 'cleared':
        this.patch({
          draftSyncing: false,
          draftSaveFailed: false,
          draftBufferedLocally: false,
        });
        break;
      default:
        break;
    }
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible' || !this.signals.browserOnline) return;
    const elapsed = Date.now() - this.lastProbeAt;
    if (elapsed >= MIN_PROBE_INTERVAL_MS) {
      void this.probeBackend('visibility');
    }
  };

  private refreshUploadSignals(items: OperatorUploadQueueItem[]): void {
    this.patch(summarizeUploadQueue(items));
  }

  private async probeBackend(reason: string): Promise<void> {
    if (!this.signals.browserOnline) return;

    const now = Date.now();
    if (reason !== 'online' && reason !== 'startup' && now - this.lastProbeAt < MIN_PROBE_INTERVAL_MS) {
      return;
    }

    this.probeAbort?.abort();
    const controller = new AbortController();
    this.probeAbort = controller;

    const reachable = await probeOperatorBackendHealth(controller.signal);
    if (controller.signal.aborted) return;

    this.lastProbeAt = Date.now();
    this.patch({ backendReachable: reachable });

    if (!reachable) {
      this.scheduleFailureProbe();
    } else {
      this.clearFailureProbe();
    }
  }

  private scheduleFailureProbe(): void {
    if (this.failureProbeTimer) return;
    this.failureProbeTimer = setTimeout(() => {
      this.failureProbeTimer = null;
      void this.probeBackend('failure-retry');
    }, FAILURE_PROBE_DELAY_MS);
  }

  private clearFailureProbe(): void {
    if (!this.failureProbeTimer) return;
    clearTimeout(this.failureProbeTimer);
    this.failureProbeTimer = null;
  }

  private markRecentlyReconnected(): void {
    this.patch({ recentlyReconnected: true });
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.patch({ recentlyReconnected: false });
      this.reconnectTimer = null;
    }, RECONNECT_ACK_MS);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private patch(patch: Partial<OperatorConnectivitySignals>): void {
    this.signals = { ...this.signals, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const operatorConnectivityStore = new OperatorConnectivityStore();
