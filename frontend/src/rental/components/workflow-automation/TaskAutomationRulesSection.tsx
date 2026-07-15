import { useMemo, useState } from 'react';
import { ClipboardList, Pencil, RefreshCw, Search, Settings2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, PageHeader } from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { TaskAutomationRuleDrawer } from './TaskAutomationRuleDrawer';
import type { TaskAutomationRuleDto } from './task-automation.types';
import { countOverriddenFields, summarizeChecklistState } from './task-automation.utils';
import { useTaskAutomationCenter } from './useTaskAutomationCenter';

interface TaskAutomationRulesSectionProps {
  canWrite?: boolean;
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="booking-kpi-tile booking-kpi-tile--dense">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RuleRow({
  rule,
  canWrite,
  onOpen,
}: {
  rule: TaskAutomationRuleDto;
  canWrite: boolean;
  onOpen: (rule: TaskAutomationRuleDto) => void;
}) {
  const overrideCount = countOverriddenFields(rule);

  return (
    <button
      type="button"
      onClick={() => onOpen(rule)}
      className="w-full rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/20"
      data-testid={`task-automation-rule-${rule.catalogKey}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{rule.nameDe}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                rule.effectivelyEnabled
                  ? 'bg-status-success-soft text-status-success'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {rule.effectivelyEnabled ? 'Aktiv' : 'Inaktiv'}
            </span>
            {rule.hasOrgOverride && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                Angepasst
              </span>
            )}
            {rule.isCritical && (
              <span className="rounded-full bg-status-attention-soft px-2 py-0.5 text-[10px] font-semibold text-status-attention">
                Kritisch
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rule.descriptionDe}</p>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            <span>Trigger: {rule.triggerLabelDe}</span>
            <span>Aktivierung: {rule.activationLabelDe}</span>
            <span>Fälligkeit: {rule.dueLabelDe}</span>
            <span>Priorität: {rule.priorityLabelDe}</span>
            <span>Zuweisung: {rule.assignmentLabelDe}</span>
            <span>Eskalation: {rule.escalationLabelDe}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClipboardList className="h-3 w-3" />
              {summarizeChecklistState(rule)}
            </span>
            {overrideCount > 0 && <span>{overrideCount} angepasste Felder</span>}
          </div>
        </div>
        <div className="shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground">
            {canWrite ? <Pencil className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
            {canWrite ? 'Bearbeiten' : 'Ansehen'}
          </span>
        </div>
      </div>
    </button>
  );
}

export function TaskAutomationRulesSection({ canWrite = false }: TaskAutomationRulesSectionProps) {
  const { orgId } = useRentalOrg();
  const { overview, loading, error, actionRuleId, reload, saveOverride, resetOverride } =
    useTaskAutomationCenter(orgId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'customized'>('all');
  const [selectedRule, setSelectedRule] = useState<TaskAutomationRuleDto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredRules = useMemo(() => {
    let rules = overview?.rules ?? [];
    if (statusFilter === 'active') rules = rules.filter((rule) => rule.effectivelyEnabled);
    if (statusFilter === 'disabled') rules = rules.filter((rule) => !rule.effectivelyEnabled);
    if (statusFilter === 'customized') rules = rules.filter((rule) => rule.hasOrgOverride);
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      rules = rules.filter(
        (rule) =>
          rule.nameDe.toLowerCase().includes(query) ||
          rule.descriptionDe.toLowerCase().includes(query) ||
          rule.categoryDe.toLowerCase().includes(query) ||
          rule.triggerLabelDe.toLowerCase().includes(query),
      );
    }
    return rules;
  }, [overview?.rules, search, statusFilter]);

  const openRule = (rule: TaskAutomationRuleDto) => {
    setSelectedRule(rule);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="task-automation-rules-section">
      <PageHeader
        title="Aufgaben-Automationen"
        description="Systemregeln für automatisch erzeugte operative Aufgaben — SynqDrive-Standard oder organisationsspezifische Anpassungen."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
        }
      />

      {!canWrite && (
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          Sie haben nur Lesezugriff. Änderungen erfordern Workflow-Automatisierungs-Schreibrechte.
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SummaryTile label="Regeln gesamt" value={overview.summary.total} />
          <SummaryTile label="Aktiv" value={overview.summary.active} />
          <SummaryTile label="Angepasst" value={overview.summary.customized} />
          <SummaryTile label="Deaktiviert" value={overview.summary.disabled} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Regeln durchsuchen…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-xs"
          />
        </div>
        {[
          { key: 'all', label: 'Alle' },
          { key: 'active', label: 'Aktiv' },
          { key: 'customized', label: 'Angepasst' },
          { key: 'disabled', label: 'Inaktiv' },
        ].map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.key as typeof statusFilter)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-medium ${
              statusFilter === filter.key
                ? 'bg-brand text-brand-foreground'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading && !overview ? (
        <div className="rounded-xl border border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Aufgaben-Automationen werden geladen…
        </div>
      ) : error ? (
        <ErrorState title="Aufgaben-Automationen konnten nicht geladen werden" description={error} onRetry={() => void reload()} />
      ) : filteredRules.length === 0 ? (
        <EmptyState
          title="Keine Regeln gefunden"
          description="Passen Sie die Suche oder den Filter an."
        />
      ) : (
        <div className="space-y-2">
          {filteredRules.map((rule) => (
            <RuleRow key={rule.ruleId} rule={rule} canWrite={canWrite} onOpen={openRule} />
          ))}
        </div>
      )}

      <TaskAutomationRuleDrawer
        open={drawerOpen}
        rule={selectedRule}
        canWrite={canWrite}
        saving={Boolean(selectedRule && actionRuleId === selectedRule.ruleId)}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedRule(null);
        }}
        onSave={saveOverride}
        onReset={resetOverride}
      />
    </div>
  );
}
