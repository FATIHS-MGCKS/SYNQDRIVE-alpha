import { useMemo, useState } from 'react';
import { ExternalLink, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import type { VehicleData } from '../../data/vehicles';
import { useVehicleRentalRequirements } from '../../hooks/useVehicleRentalRequirements';
import {
  buildEffectiveRequirementRows,
  deriveRequirementsStatus,
  effectiveSourceSummaryDe,
} from '../../lib/vehicle-rental-requirements.utils';
import { EmptyState, ErrorState } from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { VehicleCategoryAssignDrawer } from './VehicleCategoryAssignDrawer';
import { VehicleOverrideEditorDrawer } from './VehicleOverrideEditorDrawer';
import {
  EffectiveRequirementsSummaryGrid,
  EffectiveRulesListSkeleton,
  RentalRequirementsStatusBadge,
  RuleInheritanceSteps,
  RuleValueTile,
} from '../shared/rental-requirements-ui';

interface VehicleRequirementsTabProps {
  selectedVehicle: VehicleData | null;
  orgId: string;
  onOpenRentalRulesCenter?: () => void;
}

const INHERITANCE_STEPS = [
  { key: 'org', label: 'Organization defaults', labelDe: 'Organisationsstandard' },
  { key: 'category', label: 'Category rules', labelDe: 'Kategorieregeln' },
  { key: 'override', label: 'Vehicle overrides', labelDe: 'Fahrzeug-Overrides' },
  { key: 'effective', label: 'Effective rules', labelDe: 'Effektive Regeln' },
] as const;

const LOCALE = 'de' as const;

export function VehicleRequirementsTab({
  selectedVehicle,
  orgId,
  onOpenRentalRulesCenter,
}: VehicleRequirementsTabProps) {
  const { hasPermission } = useRentalOrg();
  const canWrite = hasPermission('company-info', 'write');
  const vehicleId = selectedVehicle?.id ?? null;

  const { effective, requirements, orgDefaults, loading, error, reload } =
    useVehicleRentalRequirements(orgId, vehicleId, Boolean(vehicleId));

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const quick = useMemo(
    () => deriveRequirementsStatus(effective, requirements, orgDefaults?.configured ?? false),
    [effective, requirements, orgDefaults],
  );

  const rows = useMemo(
    () => (effective ? buildEffectiveRequirementRows(effective) : []),
    [effective],
  );

  const vehicleLabel = selectedVehicle
    ? [selectedVehicle.license, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(' · ')
    : 'Fahrzeug';

  if (!vehicleId) {
    return (
      <EmptyState
        title="Kein Fahrzeug ausgewählt"
        description="Wähle ein Fahrzeug aus der Flotte, um Mietvoraussetzungen anzuzeigen."
      />
    );
  }

  if (loading && !effective) {
    return (
      <div className="space-y-4">
        <EffectiveRulesListSkeleton rows={4} />
      </div>
    );
  }

  if (error && !effective) {
    return (
      <ErrorState
        title="Mietvoraussetzungen konnten nicht geladen werden"
        description={error}
        onRetry={() => void reload()}
        retryLabel="Erneut laden"
      />
    );
  }

  const missingCategory = !requirements?.rentalCategoryId;
  const incompleteRules = !orgDefaults?.configured && missingCategory;
  const hasCategory = Boolean(requirements?.rentalCategory?.name);

  const activeStep = (() => {
    if (!effective) return 'org';
    if (rows.some((r) => r.isOverridden)) return 'override';
    if (requirements?.rentalCategoryId) return 'category';
    return 'org';
  })();

  return (
    <div className="mb-4 animate-fade-up space-y-4">
      {/* ── Header ── */}
      <section className="sq-card rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="sq-section-label">Mietvoraussetzungen</p>
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
              {vehicleLabel}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <RentalRequirementsStatusBadge kind={quick.statusKind} locale={LOCALE} />
              {hasCategory && (
                <span className="sq-chip border border-border/60 bg-muted/20 text-[10px] text-muted-foreground">
                  Kategorie: {requirements!.rentalCategory!.name}
                </span>
              )}
              {effective?.rulesActive === false && (
                <RentalRequirementsStatusBadge kind="incomplete" locale={LOCALE} />
              )}
            </div>
            {effective ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {effectiveSourceSummaryDe(effective)}
              </p>
            ) : null}
            {hasCategory && !rows.some((r) => r.isOverridden) && (
              <p className="text-[11px] text-muted-foreground/90">
                Regeln stammen primär aus dieser Kategorie.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
            <button
              type="button"
              className="sq-btn sq-btn-ghost flex h-8 w-8 items-center justify-center p-0"
              onClick={() => void reload()}
              disabled={loading}
              title="Aktualisieren"
              aria-label="Aktualisieren"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canWrite && (
              <button
                type="button"
                className="sq-btn sq-btn-secondary min-h-8 gap-1 px-2.5 text-[11px] sm:text-[12px]"
                onClick={() => setOverrideOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Overrides bearbeiten
              </button>
            )}
            {onOpenRentalRulesCenter && (
              <button
                type="button"
                className="sq-btn sq-btn-ghost min-h-8 gap-1 px-2.5 text-[11px] sm:text-[12px]"
                onClick={onOpenRentalRulesCenter}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Mietregeln
              </button>
            )}
          </div>
        </div>
      </section>

      <RuleInheritanceSteps
        steps={INHERITANCE_STEPS}
        activeStep={activeStep}
        rulesActive={effective?.rulesActive}
        locale={LOCALE}
      />

      {incompleteRules && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-3 sm:px-4">
          <p className="text-[13px] font-semibold text-foreground">Mietregeln unvollständig</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Konfiguriere Organisationsregeln oder weise eine Fahrzeugkategorie zu.
          </p>
          {onOpenRentalRulesCenter && (
            <button
              type="button"
              className="sq-btn sq-btn-primary mt-2.5 min-h-8 text-[12px]"
              onClick={onOpenRentalRulesCenter}
            >
              Mietregeln öffnen
            </button>
          )}
        </div>
      )}

      {missingCategory && orgDefaults?.configured && (
        <div className="rounded-xl border border-border/70 bg-muted/15 px-3.5 py-3 sm:px-4">
          <p className="text-[13px] font-semibold text-foreground">
            Keine Fahrzeugkategorie zugewiesen
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Aktuell gelten die Standardregeln der Organisation. Weise eine Kategorie zu, wenn dieses
            Fahrzeug eigene Fahrzeuggruppen-Regeln nutzen soll.
          </p>
          {canWrite && (
            <button
              type="button"
              className="sq-btn sq-btn-secondary mt-2.5 min-h-8 text-[12px]"
              onClick={() => setAssignOpen(true)}
            >
              Kategorie zuweisen
            </button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-[13px] font-semibold text-foreground">Kernanforderungen</h3>
          <EffectiveRequirementsSummaryGrid rows={rows} locale={LOCALE} />
        </section>
      )}

      <section className="space-y-2.5">
        <h3 className="text-[13px] font-semibold text-foreground">Effektive Anforderungen</h3>
        {rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <RuleValueTile
                key={row.key}
                fieldKey={row.key}
                label={row.label}
                value={row.value}
                source={row.source}
                sourceName={row.sourceName}
                highlighted={row.isOverridden}
                density="compact"
                locale={LOCALE}
              />
            ))}
          </div>
        ) : !loading ? (
          <EmptyState
            compact
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Noch keine effektiven Regeln"
            description="Richte Mietregeln in der Administration ein, um Anforderungen hier zu sehen."
            action={
              onOpenRentalRulesCenter ? (
                <button
                  type="button"
                  className="sq-btn sq-btn-primary min-h-9 text-[12px]"
                  onClick={onOpenRentalRulesCenter}
                >
                  Mietregeln öffnen
                </button>
              ) : undefined
            }
          />
        ) : null}
      </section>

      <VehicleOverrideEditorDrawer
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        orgId={orgId}
        vehicleId={vehicleId}
        requirements={requirements}
        canWrite={canWrite}
        onSaved={() => void reload()}
      />

      <VehicleCategoryAssignDrawer
        open={assignOpen}
        onOpenChange={setAssignOpen}
        orgId={orgId}
        vehicleId={vehicleId}
        currentCategoryId={requirements?.rentalCategoryId ?? null}
        canWrite={canWrite}
        onAssigned={() => void reload()}
      />
    </div>
  );
}
