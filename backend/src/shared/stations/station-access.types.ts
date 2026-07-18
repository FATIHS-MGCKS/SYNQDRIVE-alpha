import { MembershipRole } from '@prisma/client';

/** Resolved station visibility for list/detail/KPI operations (SEC-05/06, KPI-S-01). */
export interface StationAccessContext {
  bypassScope: boolean;
  /** `null` = all stations in org; `[]` = none; non-empty = allow-list */
  allowedStationIds: string[] | null;
  membershipRole: MembershipRole | null;
  userId: string;
}

export const STATION_ACCESS_BYPASS: StationAccessContext = {
  bypassScope: true,
  allowedStationIds: null,
  membershipRole: null,
  userId: '',
};
