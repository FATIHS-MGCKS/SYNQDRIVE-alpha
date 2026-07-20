import { cn } from '../../../components/ui/utils';
import {
  DASHBOARD_KPI_HINT_CLASS,
  DASHBOARD_KPI_NUMBER_CLASS,
  DASHBOARD_KPI_TITLE_CLASS,
  INTERACTIVE_ROW_CLASS,
  META_TEXT_CLASS,
  MICRO_LABEL_CLASS,
  PANEL_BODY_CLASS,
  ROW_BODY_CLASS,
  ROW_TITLE_CLASS,
  panelShellClass,
} from '../dashboard/dashboardShell';

export const fhs = {
  panel: panelShellClass('secondary'),
  panelBody: PANEL_BODY_CLASS,
  sectionLabel: MICRO_LABEL_CLASS,
  rowTitle: ROW_TITLE_CLASS,
  rowBody: ROW_BODY_CLASS,
  meta: META_TEXT_CLASS,
  interactiveRow: cn(
    INTERACTIVE_ROW_CLASS,
    'flex items-start gap-2.5 rounded-xl border border-border/45 surface-elevated px-3 py-2.5 hover:bg-muted/20',
  ),
  kpiGrid: 'grid grid-cols-2 gap-2 lg:grid-cols-4',
  kpiTitle: DASHBOARD_KPI_TITLE_CLASS,
  kpiNumber: DASHBOARD_KPI_NUMBER_CLASS,
  kpiHint: DASHBOARD_KPI_HINT_CLASS,
  kpiCard:
    'sq-press group relative min-h-[78px] overflow-hidden rounded-xl border border-border/45 bg-background/40 px-2.5 py-2.5 text-left transition-colors duration-200 hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
  kpiCardActive: 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_30%,transparent)] bg-[color:var(--brand-soft)]/40',
  kpiCardCritical:
    'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.03]',
  kpiCardWarning: 'border-[color:var(--status-watch)]/28 bg-[color:var(--status-watch)]/[0.025]',
  kpiCardSuccess:
    'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
  filterBar: 'surface-premium rounded-2xl p-3 shadow-[var(--shadow-xs)]',
  sourceTag: 'text-[10px] text-muted-foreground/80',
} as const;
