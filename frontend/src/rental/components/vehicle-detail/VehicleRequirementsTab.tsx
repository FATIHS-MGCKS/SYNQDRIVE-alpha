import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Pencil,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { VehicleData } from '../../data/vehicles';
import { useVehicleRentalRequirements } from '../../hooks/useVehicleRentalRequirements';
import {
  buildEffectiveRequirementRows,
  deriveRequirementsStatus,
  effectiveSourceSummary,
} from '../../lib/vehicle-rental-requirements.utils';
import {
  DataCard,
  EmptyState,
  ErrorState,
  SkeletonMetricGrid,
} from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { VehicleCategoryAssignDrawer } from './VehicleCategoryAssignDrawer';
import { VehicleOverrideEditorDrawer } from './VehicleOverrideEditorDrawer';
import {
  RentalRequirementsStatusBadge,
  RuleValueTile,
} from '../shared/rental-requirements-ui';

interface VehicleRequirementsTabProps {
  selectedVehicle: VehicleData | null;
  orgId: string;
  onOpenRentalRulesCenter?: () => void;
}

const INHERITANCE_STEPS = [
  { key: 'org', label: 'Organization defaults' },
  { key: 'category', label: 'Category rules' },
  { key: 'override', label: 'Vehicle overrides' },
  { key: 'effective', label: 'Effective rules' },
] as const;

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
    : 'Vehicle';

  if (!vehicleId) {
    return (
      <EmptyState
        title="No vehicle selected"
        description="Select a vehicle from the fleet to view rental requirements."
      />
    );
  }

  if (loading && !effective) {
    return (
      <div className="space-y-4">
        <SkeletonMetricGrid count={3} />
      </div>
    );
  }

  if (error && !effective) {
    return (
      <ErrorState
        title="Requirements could not be loaded"
        description={error}
        onRetry={() => void reload()}
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
    <div className="space-y-5 mb-4 animate-fade-up">
      <DataCard
        title={vehicleLabel}
        description="Active rental eligibility for this vehicle"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="sq-btn sq-btn-ghost min-h-8 gap-1 text-[12px]"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canWrite && (
              <button
                type="button"
                className="sq-btn sq-btn-secondary min-h-8 gap-1 text-[12px]"
                onClick={() => setOverrideOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit overrides
              </button>
            )}
            {onOpenRentalRulesCenter && (
              <button
                type="button"
                className="sq-btn sq-btn-ghost min-h-8 gap-1 text-[12px]"
                onClick={onOpenRentalRulesCenter}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Rental Rules
              </button>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <RentalRequirementsStatusBadge kind={quick.statusKind} />
          {hasCategory && (
            <span className="sq-chip text-[10px] border border-border/60 bg-muted/20 text-muted-foreground">
              {requirements!.rentalCategory!.name}
            </span>
          )}
          {effective?.rulesActive === false && (
            <RentalRequirementsStatusBadge kind="incomplete" />
          )}
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {effective ? effectiveSourceSummary(effective) : '—'}
        </p>
      </DataCard>

      {incompleteRules && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">Rental requirements are incomplete</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Configure organization defaults or assign a vehicle category to define eligibility rules.
          </p>
          {onOpenRentalRulesCenter && (
            <button
              type="button"
              className="sq-btn sq-btn-primary mt-3 min-h-8 text-[12px]"
              onClick={onOpenRentalRulesCenter}
            >
              Open Rental Rules
            </button>
          )}
        </div>
      )}

      {missingCategory && orgDefaults?.configured && (
        <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">Using organization default rules</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            This vehicle uses organization default rules because no category is assigned.
          </p>
          {canWrite && (
            <button
              type="button"
              className="sq-btn sq-btn-secondary mt-3 min-h-8 text-[12px]"
              onClick={() => setAssignOpen(true)}
            >
              Assign category
            </button>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          Effective requirements
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <RuleValueTile
              key={row.key}
              label={row.label}
              value={row.value}
              source={row.source}
              sourceName={row.sourceName}
              highlighted={row.isOverridden}
            />
          ))}
        </div>
      </div>

      <DataCard
        title="Rule inheritance"
        description="How organization, category and vehicle layers combine"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {INHERITANCE_STEPS.map((step, index) => {
            const isActive =
              step.key === activeStep ||
              (step.key === 'effective' && effective?.rulesActive);
            return (
              <div key={step.key} className="flex items-center gap-2">
                <span
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                    isActive
                      ? 'border-brand/30 bg-brand/8 text-foreground'
                      : 'border-border/60 bg-muted/10 text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
                {index < INHERITANCE_STEPS.length - 1 && (
                  <ArrowRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </DataCard>

      {!rows.length && !loading && (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title="No effective rules yet"
          description="Set up rental rules in administration to see requirements here."
          action={
            onOpenRentalRulesCenter ? (
              <button
                type="button"
                className="sq-btn sq-btn-primary min-h-9"
                onClick={onOpenRentalRulesCenter}
              >
                Open Rental Rules
              </button>
            ) : undefined
          }
        />
      )}

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
