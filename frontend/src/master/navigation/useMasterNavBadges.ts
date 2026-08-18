import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import type { MasterNavBadgeType } from './master-nav.types';
import {
  fetchOperationalDashboard,
  getCachedOperationalDashboard,
  subscribeOperationalDashboard,
  OPERATIONAL_REFRESH_MS,
} from '../dashboard/operational-cache';
import { operationalToNavBadgeState } from '../dashboard/useMasterDashboardOperational';

export interface MasterNavBadgeState {
  platformHealthy: boolean;
  platformCritical: boolean;
  openSupportTickets: number;
  vehicleAttention: number;
  hmIntegrationAttention: boolean;
  billingAnomaly: boolean;
  mfaRequired: boolean;
  securityAttention: number;
  integrationAttention: number;
}

export type MasterNavBadges = Partial<Record<MasterNavBadgeType, string | number | boolean>>;

function deriveBadges(state: MasterNavBadgeState): MasterNavBadges {
  const badges: MasterNavBadges = {};

  if (!state.platformHealthy || state.platformCritical) {
    badges['platform-critical'] = true;
  }
  if (state.openSupportTickets > 0) {
    badges['support-count'] = state.openSupportTickets > 9 ? '9+' : state.openSupportTickets;
  }
  if (state.integrationAttention > 0) {
    badges['integration-attention'] = state.integrationAttention > 9 ? '9+' : state.integrationAttention;
  }
  if (state.vehicleAttention > 0) {
    badges['connectivity-warning'] = state.vehicleAttention > 9 ? '9+' : state.vehicleAttention;
  }
  if (state.hmIntegrationAttention) {
    badges['integration-outage'] = true;
  }
  if (state.billingAnomaly) {
    badges['billing-anomaly'] = true;
  }
  if (state.mfaRequired) {
    badges['mfa-required'] = true;
  }
  if (state.securityAttention > 0) {
    badges['security-attention'] = state.securityAttention > 9 ? '9+' : state.securityAttention;
  }

  return badges;
}

export function useMasterNavBadges(): MasterNavBadges {
  const [badgeState, setBadgeState] = useState<MasterNavBadgeState>({
    platformHealthy: true,
    platformCritical: false,
    openSupportTickets: 0,
    vehicleAttention: 0,
    hmIntegrationAttention: false,
    billingAnomaly: false,
    mfaRequired: false,
    integrationAttention: 0,
    securityAttention: 0,
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [operational, mfaStatus, securityAttention, integrationAttention, vehiclesOverview, integrationsDirectory] =
          await Promise.all([
            fetchOperationalDashboard().catch(() => null),
            api.account.mfa.status().catch(() => null),
            api.admin.securityAccess.attentionSummary().catch(() => null),
            api.admin.platformIntegrations.attentionSummary().catch(() => null),
            api.vehicles.operationalOverview().catch(() => null),
            api.admin.platformIntegrations.directory().catch(() => null),
          ]);

        if (!mounted) return;

        const opsState = operationalToNavBadgeState(operational);
        const hmEntry = integrationsDirectory?.entries?.find(
          (e: { id: string }) => e.id === 'high-mobility',
        );

        setBadgeState({
          platformHealthy: opsState.platformHealthy,
          platformCritical: opsState.platformCritical,
          openSupportTickets: opsState.openSupportTickets,
          billingAnomaly: opsState.billingAnomaly,
          vehicleAttention: vehiclesOverview?.counts?.withAttention ?? 0,
          hmIntegrationAttention: Boolean(
            hmEntry &&
              (hmEntry.attentionCodes.length > 0 ||
                hmEntry.runtimeHealth === 'degraded' ||
                hmEntry.runtimeHealth === 'error'),
          ),
          mfaRequired: Boolean(mfaStatus?.enrollmentRequired && !mfaStatus?.enrolled),
          securityAttention: securityAttention?.total ?? 0,
          integrationAttention: integrationAttention?.total ?? 0,
        });
      } catch {
        if (mounted) {
          setBadgeState((prev) => ({ ...prev, platformHealthy: false, platformCritical: true }));
        }
      }
    };

    void load();
    const unsub = subscribeOperationalDashboard(() => {
      const { data } = getCachedOperationalDashboard();
      if (!mounted || !data) return;
      setBadgeState((prev) => {
        const ops = operationalToNavBadgeState(data);
        return {
          platformHealthy: ops.platformHealthy,
          platformCritical: ops.platformCritical,
          openSupportTickets: ops.openSupportTickets,
          billingAnomaly: ops.billingAnomaly,
          vehicleAttention: prev.vehicleAttention,
          hmIntegrationAttention: prev.hmIntegrationAttention,
          mfaRequired: prev.mfaRequired,
          securityAttention: prev.securityAttention,
          integrationAttention: prev.integrationAttention,
        };
      });
    });
    const interval = setInterval(() => void load(), OPERATIONAL_REFRESH_MS);
    return () => {
      mounted = false;
      unsub();
      clearInterval(interval);
    };
  }, []);

  return deriveBadges(badgeState);
}

export function useMasterPlatformStatusLabel(badges: MasterNavBadges): 'operational' | 'degraded' {
  return badges['platform-critical'] ? 'degraded' : 'operational';
}
