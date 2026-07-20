import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DEFAULT_FLEET_DISPLAY_TIMEZONE } from '../../lib/vehicle-operational-booking-display';

export function useOrganizationTimeZone(orgId: string | null | undefined): string {
  const [timeZone, setTimeZone] = useState(DEFAULT_FLEET_DISPLAY_TIMEZONE);

  useEffect(() => {
    if (!orgId) {
      setTimeZone(DEFAULT_FLEET_DISPLAY_TIMEZONE);
      return;
    }
    let cancelled = false;
    api.organizations
      .getProfile(orgId)
      .then((profile) => {
        if (cancelled) return;
        setTimeZone(profile.timezone?.trim() || DEFAULT_FLEET_DISPLAY_TIMEZONE);
      })
      .catch(() => {
        if (!cancelled) setTimeZone(DEFAULT_FLEET_DISPLAY_TIMEZONE);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return timeZone;
}
