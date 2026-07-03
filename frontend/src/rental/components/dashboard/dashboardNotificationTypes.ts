/** Shared notification row shape for dashboard action queue (not tied to legacy BusinessInsightsBox UI). */
export interface DashboardNotificationItem {
  type: 'alert' | 'booking' | 'return' | 'maintenance' | 'feedback' | 'system';
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}
