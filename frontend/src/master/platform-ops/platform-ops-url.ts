import type {
  PlatformOpsDiagnosticsTab,
  PlatformOpsProcessingTab,
  PlatformOpsSection,
} from './types';

export interface PlatformOpsLocation {
  section: PlatformOpsSection;
  processingTab: PlatformOpsProcessingTab;
  diagnosticsTab: PlatformOpsDiagnosticsTab;
  incidentId: string | null;
  serviceId: string | null;
}

const DEFAULT: PlatformOpsLocation = {
  section: 'overview',
  processingTab: 'queues',
  diagnosticsTab: 'alerts',
  incidentId: null,
  serviceId: null,
};

export function readPlatformOpsLocation(search: string): PlatformOpsLocation {
  const p = new URLSearchParams(search);
  const section = (p.get('platformOps') as PlatformOpsSection) ?? DEFAULT.section;
  const validSections: PlatformOpsSection[] = [
    'overview',
    'incidents',
    'services',
    'processing',
    'infrastructure',
    'resilience',
    'diagnostics',
  ];
  const processingTab = (p.get('platformOpsTab') as PlatformOpsProcessingTab) ?? DEFAULT.processingTab;
  const diagnosticsTab = (p.get('platformOpsTab') as PlatformOpsDiagnosticsTab) ?? DEFAULT.diagnosticsTab;

  return {
    section: validSections.includes(section) ? section : 'overview',
    processingTab:
      processingTab === 'workers' || processingTab === 'schedulers' ? processingTab : 'queues',
    diagnosticsTab:
      diagnosticsTab === 'poll-logs' ||
      diagnosticsTab === 'token-health' ||
      diagnosticsTab === 'tools'
        ? diagnosticsTab
        : 'alerts',
    incidentId: p.get('incidentId'),
    serviceId: p.get('serviceId'),
  };
}

export function syncPlatformOpsUrl(
  loc: Partial<PlatformOpsLocation>,
  opts?: { replace?: boolean },
) {
  if (typeof window === 'undefined') return;
  const current = readPlatformOpsLocation(window.location.search);
  const next: PlatformOpsLocation = { ...current, ...loc };
  const params = new URLSearchParams(window.location.search);

  params.set('view', 'platform-ops');
  params.set('platformOps', next.section);

  if (next.section === 'processing') {
    params.set('platformOpsTab', next.processingTab);
  } else if (next.section === 'diagnostics') {
    params.set('platformOpsTab', next.diagnosticsTab);
  } else {
    params.delete('platformOpsTab');
  }

  if (next.incidentId) params.set('incidentId', next.incidentId);
  else params.delete('incidentId');

  if (next.serviceId) params.set('serviceId', next.serviceId);
  else params.delete('serviceId');

  const qs = params.toString();
  const url = `${window.location.pathname}?${qs}`;
  if (opts?.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/** Legacy platform-health URL → platform-ops */
export function migratePlatformHealthParams(search: string): string {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  if (view !== 'platform-health') return search;

  p.set('view', 'platform-ops');
  p.set('platformOps', 'overview');
  const opsTab = p.get('opsTab');
  if (opsTab === 'workers' || opsTab === 'queues' || opsTab === 'schedulers') {
    p.set('platformOps', 'processing');
    p.set('platformOpsTab', opsTab);
  }
  p.delete('opsTab');
  return `?${p.toString()}`;
}
