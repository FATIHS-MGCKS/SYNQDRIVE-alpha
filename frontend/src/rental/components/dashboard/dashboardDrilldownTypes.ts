import type { StatusTone } from '../../../components/patterns';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  ActionQueueItem,
  FleetBoardLane,
} from './dashboardTypes';
import type { DashboardSliceId } from './runtime';

export type DashboardDrilldownListKind =
  | 'vehicles'
  | 'bookings'
  | 'alerts'
  | 'financial'
  | 'timeline';

export type DashboardDrilldownCta =
  | 'open-vehicle'
  | 'open-booking'
  | 'open-rental'
  | 'start-handover-pickup'
  | 'start-handover-return'
  | 'open-invoice'
  | 'open-finance'
  | 'open-stations';

export interface DashboardDrilldownRow {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: StatusTone;
  cta: DashboardDrilldownCta;
  ctaLabel?: string;
  vehicleId?: string;
  bookingId?: string;
  invoiceId?: string;
  pickupItem?: PickupTileItem;
  returnItem?: ReturnTileItem;
  actionItem?: ActionQueueItem;
}

export interface DashboardDrilldownGroup {
  id: string;
  title: string;
  count: number;
  rows: DashboardDrilldownRow[];
}

export interface DashboardDrilldownContent {
  listKind: DashboardDrilldownListKind;
  title: string;
  filterLabel: string;
  description?: string;
  rows: DashboardDrilldownRow[];
  groups?: DashboardDrilldownGroup[];
  loading: boolean;
  error?: string;
  footerAction?: DashboardDrilldownCta;
}

export type StationDrilldownMetric =
  | 'ready'
  | 'rented'
  | 'due-today'
  | 'overdue'
  | 'blocked'
  | 'critical'
  | 'pickups'
  | 'returns'
  | 'vehicles';

export type DashboardDrilldownTarget =
  | { type: 'kpi'; target: DashboardSliceId }
  | { type: 'action-item'; itemId: string }
  | { type: 'fleet-lane'; lane: FleetBoardLane }
  | { type: 'station-metric'; stationId: string; metric: StationDrilldownMetric }
  | { type: 'business-metric'; metricId: string };
