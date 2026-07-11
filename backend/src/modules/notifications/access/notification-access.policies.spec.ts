import { MembershipRole, NotificationDomain, NotificationSeverity } from '@prisma/client';
import { isMandatoryNotification } from './notification-mandatory.policy';
import { isOrgWideNotification } from './notification-org-wide.policy';
import { redactTemplateParamsForRole } from './notification-privacy.policy';
import { NotificationPreferenceService } from './notification-preference.service';
import { isUserSnoozeActive } from './notification-receipt.policy';
import { NotificationStationScopeService } from './notification-station-scope.service';
import { NOTIFICATION_ACCESS_MATRIX } from './notification-access.matrix';

describe('Notification access policies', () => {
  describe('NOTIFICATION_ACCESS_MATRIX', () => {
    it('defines all real roles including CUSTOMER without API access', () => {
      const roles = NOTIFICATION_ACCESS_MATRIX.map((e) => e.role);
      expect(roles).toEqual(
        expect.arrayContaining(['MASTER_ADMIN', 'ORG_ADMIN', 'SUB_ADMIN', 'WORKER', 'DRIVER', 'CUSTOMER']),
      );
      const customer = NOTIFICATION_ACCESS_MATRIX.find((e) => e.role === 'CUSTOMER');
      expect(customer?.apiAccess).toBe(false);
    });
  });

  describe('isOrgWideNotification', () => {
    it('treats integration disconnect as org-wide', () => {
      expect(
        isOrgWideNotification({
          eventType: 'INTEGRATION_DISCONNECTED',
          domain: 'SYSTEM',
          severity: NotificationSeverity.CRITICAL,
          entityType: 'ORGANIZATION',
        }),
      ).toBe(true);
    });
  });

  describe('isMandatoryNotification', () => {
    it('SECURITY category is mandatory', () => {
      expect(isMandatoryNotification('WEBHOOK_FAILURE', NotificationSeverity.WARNING)).toBe(true);
    });

    it('CRITICAL with override policy is mandatory', () => {
      expect(isMandatoryNotification('INTEGRATION_DISCONNECTED', NotificationSeverity.CRITICAL)).toBe(true);
    });
  });

  describe('NotificationPreferenceService', () => {
    const svc = new NotificationPreferenceService();

    it('suppresses non-mandatory when inApp off', () => {
      const decision = svc.evaluateInAppDelivery('STATION_SHORTAGE', NotificationSeverity.WARNING, [
        {
          category: 'BOOKINGS',
          inApp: false,
          email: true,
          push: false,
          sms: false,
          criticalOnly: false,
        } as any,
      ]);
      expect(decision.suppressedByPreference).toBe(true);
    });

    it('shows mandatory SECURITY despite preference off', () => {
      const decision = svc.evaluateInAppDelivery('WEBHOOK_FAILURE', NotificationSeverity.WARNING, [
        {
          category: 'SECURITY',
          inApp: false,
          email: true,
          push: false,
          sms: false,
          criticalOnly: false,
        } as any,
      ]);
      expect(decision.mandatory).toBe(true);
      expect(decision.inApp).toBe(true);
    });
  });

  describe('isUserSnoozeActive', () => {
    it('returns true before expiry', () => {
      expect(isUserSnoozeActive(new Date(Date.now() + 60_000))).toBe(true);
    });

    it('returns false after expiry', () => {
      expect(isUserSnoozeActive(new Date(Date.now() - 60_000))).toBe(false);
    });
  });

  describe('redactTemplateParamsForRole', () => {
    it('strips billing params for DRIVER in allowed domain', () => {
      const result = redactTemplateParamsForRole(
        { label: 'Booking', amountCents: 5000, customerName: 'Max' },
        MembershipRole.DRIVER,
        NotificationDomain.BOOKINGS,
      );
      expect(result.amountCents).toBeNull();
      expect(result.customerName).toBeNull();
      expect(result.label).toBe('Booking');
    });
  });

  describe('NotificationStationScopeService', () => {
    const prisma = {
      vehicle: { findMany: jest.fn(async () => [{ id: 'veh-a' }]) },
      booking: { findMany: jest.fn(async () => [{ id: 'book-a' }]) },
    };
    const svc = new NotificationStationScopeService(prisma as any);

    it('loads vehicles and bookings for station scope', async () => {
      const ctx = await svc.buildScopeContext('org-1', MembershipRole.WORKER, 'station-a');
      expect(ctx.scopedStationId).toBe('station-a');
      expect(ctx.scopedVehicleIds).toEqual(['veh-a']);
      expect(ctx.scopedBookingIds).toEqual(['book-a']);
    });

    it('matches booking entity in scope', () => {
      const inScope = svc.isNotificationInScope(
        {
          id: 'n1',
          eventType: 'PICKUP_OVERDUE',
          domain: 'HANDOVERS',
          severity: NotificationSeverity.WARNING,
          entityType: 'BOOKING',
          entityId: 'book-a',
          actionTarget: {},
          status: 'OPEN',
        },
        {
          userId: 'u1',
          organizationId: 'org-1',
          membershipRole: MembershipRole.WORKER,
          stationScope: 'station-a',
          scopedStationId: 'station-a',
          scopedVehicleIds: [],
          scopedBookingIds: ['book-a'],
          bypassStationScope: false,
          preferences: [],
        },
      );
      expect(inScope).toBe(true);
    });
  });
});
