import { describe, expect, it } from 'vitest';
import {
  computeOperatorConnectivityBanner,
  resolveOperatorConnectivityPresentation,
} from './operatorConnectivity.compute';
import type { OperatorConnectivitySignals } from './operatorConnectivity.types';

function baseSignals(overrides: Partial<OperatorConnectivitySignals> = {}): OperatorConnectivitySignals {
  return {
    browserOnline: true,
    backendReachable: true,
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
    ...overrides,
  };
}

describe('resolveOperatorConnectivityPresentation', () => {
  it('prioritizes auth expired over all other states', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        authExpired: true,
        draftBufferedLocally: true,
        browserOnline: false,
        backendReachable: false,
        queueBlockingFailed: true,
        draftSaveFailed: true,
      }),
    );
    expect(result?.stateId).toBe('auth-expired');
    expect(result?.message).toContain('Draft erhalten');
  });

  it('prioritizes browser offline over backend and queue states', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        browserOnline: false,
        backendReachable: false,
        queueBlockingFailed: true,
      }),
    );
    expect(result?.stateId).toBe('browser-offline');
    expect(result?.message).toBe('Offline – Änderungen werden noch nicht synchronisiert.');
  });

  it('shows backend unreachable only when browser is online', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        backendReachable: false,
        queuePendingCount: 2,
      }),
    );
    expect(result?.stateId).toBe('backend-unreachable');
  });

  it('prioritizes blocking upload failure over draft save failure', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        queueBlockingFailed: true,
        draftSaveFailed: true,
      }),
    );
    expect(result?.stateId).toBe('upload-failed');
    expect(result?.message).toBe('Upload fehlgeschlagen – Abschluss ist noch nicht möglich.');
  });

  it('shows draft save failed when uploads are not blocking', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        draftSaveFailed: true,
      }),
    );
    expect(result?.stateId).toBe('draft-save-failed');
  });

  it('shows connection restored with upload count after reconnect', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        recentlyReconnected: true,
        queuePendingCount: 2,
        queueUploadingCount: 1,
      }),
    );
    expect(result?.stateId).toBe('connection-restored');
    expect(result?.message).toBe('Verbindung wiederhergestellt – 3 Uploads werden synchronisiert.');
  });

  it('shows partial API degradation below reconnect sync', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        apiPartialFailure: true,
        uploadServiceDegraded: true,
      }),
    );
    expect(result?.stateId).toBe('api-partial');
  });

  it('shows upload service degraded when only non-blocking uploads failed', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        uploadServiceDegraded: true,
        queueFailedCount: 1,
      }),
    );
    expect(result?.stateId).toBe('upload-service-degraded');
  });

  it('shows queue pending when uploads are waiting', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        queuePendingCount: 2,
      }),
    );
    expect(result?.stateId).toBe('queue-pending');
    expect(result?.message).toContain('2 Uploads ausstehend');
  });

  it('shows syncing for active draft or upload work', () => {
    const draftSync = resolveOperatorConnectivityPresentation(
      baseSignals({
        draftSyncing: true,
      }),
    );
    expect(draftSync?.stateId).toBe('syncing');

    const uploadSync = resolveOperatorConnectivityPresentation(
      baseSignals({
        queueUploadingCount: 1,
      }),
    );
    expect(uploadSync?.stateId).toBe('syncing');
  });

  it('shows synced only briefly after reconnect with no pending work', () => {
    const result = resolveOperatorConnectivityPresentation(
      baseSignals({
        recentlyReconnected: true,
      }),
    );
    expect(result?.stateId).toBe('synced');
    expect(result?.message).toBe('Vollständig synchronisiert.');
  });

  it('returns null when fully healthy', () => {
    expect(resolveOperatorConnectivityPresentation(baseSignals())).toBeNull();
  });
});

describe('computeOperatorConnectivityBanner', () => {
  it('hides the banner when no state applies', () => {
    const banner = computeOperatorConnectivityBanner(baseSignals());
    expect(banner.visible).toBe(false);
    expect(banner.stateId).toBeNull();
    expect(banner.message).toBe('');
  });

  it('marks visible banners as announceable except syncing', () => {
    const offline = computeOperatorConnectivityBanner(baseSignals({ browserOnline: false }));
    expect(offline.visible).toBe(true);
    expect(offline.announce).toBe(true);

    const syncing = computeOperatorConnectivityBanner(baseSignals({ draftSyncing: true }));
    expect(syncing.visible).toBe(true);
    expect(syncing.announce).toBe(false);
  });
});
