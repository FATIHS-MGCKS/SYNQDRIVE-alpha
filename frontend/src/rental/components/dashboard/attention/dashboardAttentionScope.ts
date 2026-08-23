export type DashboardAttentionScope = 'operations' | 'fleet';

export const DASHBOARD_ATTENTION_SCOPES: readonly DashboardAttentionScope[] = [
  'operations',
  'fleet',
] as const;

export const DASHBOARD_ATTENTION_SCOPE_LABEL_KEYS = {
  operations: 'notification.tab.operations',
  fleet: 'nav.fleet',
} as const satisfies Record<DashboardAttentionScope, string>;
