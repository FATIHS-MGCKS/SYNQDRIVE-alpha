export interface DataProcessingHubMetrics {
  activeProcessingActivities: number;
  blockingControlGaps: number;
  reviewsDue: number;
  revocationsInProgress: number;
  enforcementErrors: number;
  dpiaOverdue: number;
  legacy: {
    total: number;
    active: number;
    pending: number;
    revoked: number;
    expired: number;
    highRisk: number;
    expiringSoon: number;
  };
}

export interface DataProcessingSavedView {
  id: string;
  name: string;
  section: 'activities' | 'providers' | 'consents' | 'audit';
  filters: Record<string, string | number | boolean | null>;
  createdAt: string;
}

const storageKey = (orgId: string) => `synqdrive:data-processing-saved-views:${orgId}`;

export function loadSavedViews(orgId: string): DataProcessingSavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DataProcessingSavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(orgId: string, views: DataProcessingSavedView[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(orgId), JSON.stringify(views));
}

export function upsertSavedView(orgId: string, view: DataProcessingSavedView): DataProcessingSavedView[] {
  const existing = loadSavedViews(orgId);
  const next = [...existing.filter((v) => v.id !== view.id), view];
  persistSavedViews(orgId, next);
  return next;
}

export function deleteSavedView(orgId: string, viewId: string): DataProcessingSavedView[] {
  const next = loadSavedViews(orgId).filter((v) => v.id !== viewId);
  persistSavedViews(orgId, next);
  return next;
}
