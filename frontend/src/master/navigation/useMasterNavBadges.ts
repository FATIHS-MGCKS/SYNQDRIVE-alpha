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
  dimoConnected: boolean;
  billingAnomaly: boolean;
  mfaRequired: boolean;
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
  if (!state.dimoConnected) {
    badges['integration-outage'] = true;
    badges['connectivity-warning'] = true;
  }
  if (state.billingAnomaly) {
    badges['billing-anomaly'] = true;
  }
  if (state.mfaRequired) {
    badges['mfa-required'] = true;
  }

  return badges;
}

export function useMasterNavBadges(): MasterNavBadges {
  const [badgeState, setBadgeState] = useState<MasterNavBadgeState>({
    platformHealthy: true,
    platformCritical: false,
    openSupportTickets: 0,
    dimoConnected: true,
    billingAnomaly: false,
    mfaRequired: false,
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [operational, mfaStatus] = await Promise.all([
          fetchOperationalDashboard().catch(() => null),
          api.account.mfa.status().catch(() => null),
        ]);

        if (!mounted) return;

        const opsState = operationalToNavBadgeState(operational);

        setBadgeState({
          ...opsState,
          mfaRequired: Boolean(mfaStatus?.enrollmentRequired && !mfaStatus?.enrolled),
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
      setBadgeState((prev) => ({
        ...operationalToNavBadgeState(data),
        mfaRequired: prev.mfaRequired,
      }));
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
