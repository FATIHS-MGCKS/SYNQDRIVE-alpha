import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { MasterNavBadgeType } from './master-nav.types';

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
        const [dashboard, dimoStats, mfaStatus] = await Promise.all([
          api.admin.dashboard().catch(() => null),
          api.dimo.stats().catch(() => ({ connected: 0, total: 0 })),
          api.account.mfa.status().catch(() => null),
        ]);

        if (!mounted) return;

        const dimo = dimoStats as { connected?: number; total?: number };
        const hasDimoFleet = (dimo.total ?? 0) > 0;
        const dimoConnected = !hasDimoFleet || (dimo.connected ?? 0) > 0;

        setBadgeState({
          platformHealthy: dashboard != null,
          platformCritical: false,
          openSupportTickets: Number(dashboard?.openSupportTickets ?? 0),
          dimoConnected,
          billingAnomaly: false,
          mfaRequired: Boolean(mfaStatus?.enrollmentRequired && !mfaStatus?.enrolled),
        });
      } catch {
        if (mounted) {
          setBadgeState((prev) => ({ ...prev, platformHealthy: false, platformCritical: true }));
        }
      }
    };

    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return deriveBadges(badgeState);
}

export function useMasterPlatformStatusLabel(badges: MasterNavBadges): 'operational' | 'degraded' {
  return badges['platform-critical'] ? 'degraded' : 'operational';
}
