import {
  minimizeNotificationDeliveryBody,
  minimizeNotificationPreviewParams,
  stripInternalAuthParams,
} from './notification-preview-minimizer';
import { NOTIFICATION_GATE_KIND } from './notification-enforcement.constants';
import type { NotificationAuthGateSpec } from './notification-enforcement.types';

const healthSpec: NotificationAuthGateSpec = {
  gateKind: NOTIFICATION_GATE_KIND.HEALTH_ALERT,
  dataCategory: 'HEALTH_SIGNALS',
  purpose: 'ALERTS',
  processingPath: 'health-notify',
  serviceIdentity: 'synqdrive-health-alert',
  sensitivePreviewParams: ['wearPct', 'dtcCode'],
};

describe('notification-preview-minimizer', () => {
  it('strips sensitive preview params when scope not allowed', () => {
    const result = minimizeNotificationPreviewParams(
      {
        label: 'AB-123',
        wearPct: 12,
        dtcCode: 'P0420',
        plate: 'AB-123',
      },
      healthSpec,
      false,
    );
    expect(result.wearPct).toBeNull();
    expect(result.dtcCode).toBeNull();
    expect(result.label).toBe('AB-123');
    expect(result._previewMinimized).toBe(true);
  });

  it('keeps params when allowed', () => {
    const result = minimizeNotificationPreviewParams(
      { label: 'AB-123', wearPct: 12 },
      healthSpec,
      true,
    );
    expect(result.wearPct).toBe(12);
    expect(result._previewMinimized).toBeUndefined();
  });

  it('email/push body uses generic keys when denied', () => {
    const result = minimizeNotificationDeliveryBody(
      'notification.title.brakeCritical',
      'notification.body.brakeCritical',
      { label: 'AB-123', wearPct: 5 },
      false,
    );
    expect(result.titleKey).toBe('notification.title.genericAlert');
    expect(result.bodyKey).toBe('notification.body.genericAlert');
    expect(result.params.wearPct).toBeUndefined();
  });

  it('strips internal auth params', () => {
    const result = stripInternalAuthParams({
      label: 'AB-123',
      _authCorrelationId: 'corr-1',
      _authGateKind: 'HEALTH_ALERT',
    });
    expect(result.label).toBe('AB-123');
    expect(result._authCorrelationId).toBeUndefined();
  });
});
