export type DashboardUtilizationStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR';

export interface DashboardUtilizationDay {
  readonly date: string;
  readonly utilizationPercent: number | null;
}

export interface DashboardUtilizationMonthMetrics {
  readonly utilizationPercent: number | null;
  readonly bookingCount: number;
  readonly utilizationDeltaPp: number | null;
  readonly bookingDeltaPercent: number | null;
}

export interface DashboardUtilizationOverview {
  readonly status: DashboardUtilizationStatus;
  readonly reason: string | null;
  readonly year: number;
  readonly month: number;
  readonly isPartialMonth: boolean;
  readonly stationScoped: boolean;
  readonly generatedAt: string;
  readonly monthMetrics: DashboardUtilizationMonthMetrics;
  readonly previousMonthMetrics: DashboardUtilizationMonthMetrics;
  readonly days: readonly DashboardUtilizationDay[];
}

export interface DashboardUtilizationMonth {
  readonly year: number;
  readonly month: number;
}
