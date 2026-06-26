import { useCallback, useMemo, useState } from 'react';
import {
  Car,
  ClipboardCheck,
  Eye,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';
import {
  DataCard,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  SectionHeader,
  SkeletonMetricGrid,
} from '../../../../components/patterns';
import { useRentalOrg } from '../../../RentalContext';
import { CategoryDetailDrawer } from './CategoryDetailDrawer';
import { DefaultRulesDrawer } from './DefaultRulesDrawer';
import { EffectiveRulesPreviewDrawer } from './EffectiveRulesPreviewDrawer';
import { VehicleAssignmentDrawer } from './VehicleAssignmentDrawer';
import type { RentalCategoryVehicleDto, RentalVehicleCategoryDto } from './rental-rules.types';
import {
  countConfiguredRuleFields,
  formatBool,
  formatDeposit,
  formatLicenseHolding,
  labelPolicy,
  labelRuleField,
  formatRuleValue,
  summarizeRules,
} from './rental-rules.utils';
import { useRentalRulesCenter } from './useRentalRulesCenter';
import { RentalRequirementsStatusBadge } from '../../shared/rental-requirements-ui';

interface RentalRulesTabProps {
  canWrite?: boolean;
}

export function RentalRulesTab({ canWrite = false }: RentalRulesTabProps) {
  const { orgId } = useRentalOrg();
  const {
    overview,
    defaults,
    categories,
    fleetVehicles,
    loading,
    error,
    actionId,
    load,
    runAction,
  } = useRentalRulesCenter(orgId);

  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [categoryDrawer, setCategoryDrawer] = useState<{
    mode: 'create' | 'edit';
    category: RentalVehicleCategoryDto | null;
  } | null>(null);
  const [assignedVehicles, setAssignedVehicles] = useState<RentalCategoryVehicleDto[]>([]);
  const [assignDrawer, setAssignDrawer] = useState<RentalVehicleCategoryDto | null>(null);
  const [previewVehicle, setPreviewVehicle] = useState<{ id: string; label: string } | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories],
  );

  const openCategoryEdit = useCallback(
    async (category: RentalVehicleCategoryDto) => {
      setCategoryDrawer({ mode: 'edit', category });
      if (!orgId) return;
      try {
        const vehicles = await api.rentalRules.listCategoryVehicles(orgId, category.id);
        setAssignedVehicles(vehicles);
      } catch {
        setAssignedVehicles([]);
      }
    },
    [orgId],
  );

  const openAssign = useCallback(
    async (category: RentalVehicleCategoryDto) => {
      if (!orgId) return;
      try {
        const vehicles = await api.rentalRules.listCategoryVehicles(orgId, category.id);
        setAssignedVehicles(vehicles);
        setAssignDrawer(category);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Could not load vehicles');
      }
    },
    [orgId],
  );

  const previewFromCategory = useCallback(
    async (category: RentalVehicleCategoryDto) => {
      if (!orgId) return;
      const inCategory = fleetVehicles.find((v) => v.rentalCategoryId === category.id);
      if (inCategory) {
        setPreviewVehicle({ id: inCategory.id, label: inCategory.displayName });
        return;
      }
      try {
        const vehicles = await api.rentalRules.listCategoryVehicles(orgId, category.id);
        if (vehicles[0]) {
          setPreviewVehicle({ id: vehicles[0].id, label: vehicles[0].displayName });
        } else {
          toast.message('Assign a vehicle to preview effective rules for this category.');
        }
      } catch {
        toast.error('Preview unavailable');
      }
    },
    [orgId, fleetVehicles],
  );

  if (loading && !overview && !defaults) {
    return (
      <div className="space-y-4">
        <SkeletonMetricGrid count={4} />
      </div>
    );
  }

  if (error && !overview) {
    return <ErrorState title="Rental rules could not be loaded" description={error} onRetry={() => void load()} />;
  }

  const defaultSummary = defaults ? summarizeRules(defaults) : [];
  const configuredFields = countConfiguredRuleFields(defaults);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rental Rules"
        icon={<ShieldCheck className="h-4 w-4" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="sq-btn sq-btn-ghost min-h-9 gap-1.5"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canWrite && (
              <>
                <button
                  type="button"
                  className="sq-btn sq-btn-secondary min-h-9 gap-1.5"
                  onClick={() => setDefaultsOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit default rules
                </button>
                <button
                  type="button"
                  className="sq-btn sq-btn-primary min-h-9 gap-1.5"
                  onClick={() => {
                    setAssignedVehicles([]);
                    setCategoryDrawer({ mode: 'create', category: null });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create category
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Default rules"
          value={overview?.defaultsConfigured ? `${configuredFields} fields` : 'Not configured'}
          hint={overview?.defaultsActive ? 'Active baseline for the org' : 'Defaults inactive'}
          icon={<ClipboardCheck className="h-5 w-5" />}
          status={overview?.defaultsConfigured ? 'success' : 'watch'}
        />
        <MetricCard
          label="Vehicle categories"
          value={overview?.activeCategoryCount ?? 0}
          hint={`${activeCategories.length} active · ${categories.length} total`}
          icon={<Layers className="h-5 w-5" />}
          status="neutral"
        />
        <MetricCard
          label="Vehicles with overrides"
          value={overview?.vehiclesWithOverrides ?? 0}
          hint="Individual requirement exceptions"
          icon={<Car className="h-5 w-5" />}
          status={(overview?.vehiclesWithOverrides ?? 0) > 0 ? 'watch' : 'neutral'}
        />
        <MetricCard
          label="Vehicles without category"
          value={overview?.vehiclesMissingCategory ?? 0}
          hint={`${overview?.categoriesRequiringManualApproval ?? 0} categories require manual approval`}
          icon={<Users className="h-5 w-5" />}
          status={(overview?.vehiclesMissingCategory ?? 0) > 0 ? 'warning' : 'success'}
        />
      </div>

      <DataCard
        title="Organization default rules"
        description="Baseline requirements when categories and vehicle overrides do not specify a value."
        actions={
          canWrite ? (
            <button type="button" className="sq-btn sq-btn-ghost min-h-8 text-[12px]" onClick={() => setDefaultsOpen(true)}>
              Edit
            </button>
          ) : undefined
        }
      >
        {!overview?.defaultsConfigured ? (
          <EmptyState
            compact
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="No default rules configured yet"
            description="Set organization-wide minimum age, deposit, license duration and travel policies."
            action={
              canWrite ? (
                <button type="button" className="sq-btn sq-btn-primary min-h-9" onClick={() => setDefaultsOpen(true)}>
                  Configure defaults
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {defaultSummary.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-border/60 bg-card/60 px-3.5 py-3 transition-colors hover:bg-muted/15"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
                <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-foreground">{row.value}</p>
              </div>
            ))}
            <div className="rounded-xl border border-border/60 bg-card/60 px-3.5 py-3 sm:col-span-2 lg:col-span-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Manual approval</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-foreground">
                  {formatBool(defaults?.manualApprovalRequired)}
                </p>
                {defaults?.manualApprovalRequired && (
                  <RentalRequirementsStatusBadge kind="manual-approval" />
                )}
              </div>
            </div>
          </div>
        )}
      </DataCard>

      <div>
        <SectionHeader
          title="Vehicle categories"
          description="Group vehicles with shared eligibility requirements."
          actions={
            canWrite ? (
              <button
                type="button"
                className="sq-btn sq-btn-secondary min-h-8 gap-1 text-[12px]"
                onClick={() => {
                  setAssignedVehicles([]);
                  setCategoryDrawer({ mode: 'create', category: null });
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create category
              </button>
            ) : undefined
          }
        />

        {activeCategories.length === 0 ? (
          <DataCard className="mt-3">
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="Create your first vehicle category"
              description="Create your first vehicle category to manage requirements like minimum age, license duration and deposit rules."
              action={
                canWrite ? (
                  <button
                    type="button"
                    className="sq-btn sq-btn-primary min-h-9"
                    onClick={() => {
                      setAssignedVehicles([]);
                      setCategoryDrawer({ mode: 'create', category: null });
                    }}
                  >
                    Create category
                  </button>
                ) : undefined
              }
            />
          </DataCard>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeCategories.map((cat) => (
              <div
                key={cat.id}
                className="sq-card-elevated group overflow-hidden rounded-xl border border-border/70 bg-card transition-all hover:border-brand/25"
              >
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: cat.color ?? 'var(--brand)' }}
                />
                <div className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-foreground">{cat.name}</h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {cat.vehicleCount ?? 0} vehicles
                        {cat.type ? ` · ${cat.type.replace(/_/g, ' ')}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {cat.manualApprovalRequired && (
                        <RentalRequirementsStatusBadge kind="manual-approval" />
                      )}
                      <RentalRequirementsStatusBadge kind={cat.isActive ? 'active' : 'incomplete'} />
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
                    <div>
                      <dt className="text-muted-foreground">Minimum age</dt>
                      <dd className="font-medium tabular-nums">{cat.minimumAgeYears ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">License holding</dt>
                      <dd className="font-medium">
                        {formatLicenseHolding(cat.minimumLicenseHoldingMonths, cat.minimumLicenseHoldingYears, {
                          long: true,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Deposit required</dt>
                      <dd className="font-medium tabular-nums">
                        {formatDeposit(cat.depositAmountCents ?? cat.depositAmount, cat.depositCurrency ?? 'EUR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Credit card</dt>
                      <dd className="font-medium">{formatBool(cat.creditCardRequired)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Foreign travel</dt>
                      <dd className="font-medium">{labelPolicy(cat.foreignTravelPolicy)}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    <button
                      type="button"
                      className="sq-btn sq-btn-ghost h-8 px-2.5 text-[11px]"
                      onClick={() => void openCategoryEdit(cat)}
                    >
                      Edit
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        className="sq-btn sq-btn-ghost h-8 px-2.5 text-[11px]"
                        onClick={() => void openAssign(cat)}
                      >
                        Assign vehicles
                      </button>
                    )}
                    <button
                      type="button"
                      className="sq-btn sq-btn-ghost h-8 px-2.5 text-[11px] gap-1"
                      onClick={() => void previewFromCategory(cat)}
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader
          title="Vehicle-specific overrides"
          description="Vehicles with individual requirement exceptions on top of category defaults."
        />
        <DataCard className="mt-3" flush>
          {(overview?.overrideVehicles.length ?? 0) === 0 ? (
            <EmptyState
              compact
              icon={<Car className="h-5 w-5" />}
              title="No vehicle overrides"
              description="Overrides let you tailor requirements for specific vehicles without changing the whole category."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {overview!.overrideVehicles.map((row) => (
                <div
                  key={row.vehicleId}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 transition-colors hover:bg-muted/10"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-foreground">
                        {row.licensePlate || '—'} · {row.displayName}
                      </p>
                      <RentalRequirementsStatusBadge kind="vehicle-override" />
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {row.categoryName ? `Category: ${row.categoryName}` : 'Missing category'}
                      {' · '}
                      {row.overrideCount} override{row.overrideCount === 1 ? '' : 's'}
                      {row.topOverrideField
                        ? ` · ${labelRuleField(row.topOverrideField)}: ${formatRuleValue(row.topOverrideField, row.topOverrideValue)}`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sq-btn sq-btn-secondary min-h-8 w-full shrink-0 text-[12px] sm:w-auto sm:self-start"
                    onClick={() =>
                      setPreviewVehicle({ id: row.vehicleId, label: row.displayName })
                    }
                  >
                    View effective requirements
                  </button>
                </div>
              ))}
            </div>
          )}
        </DataCard>
      </div>

      <DefaultRulesDrawer
        open={defaultsOpen}
        onOpenChange={setDefaultsOpen}
        defaults={defaults}
        canWrite={canWrite}
        saving={actionId === 'defaults'}
        onSave={async (payload) => {
          if (!orgId) return;
          await runAction('defaults', () => api.rentalRules.patchDefaults(orgId, payload));
        }}
      />

      {categoryDrawer && (
        <CategoryDetailDrawer
          open={Boolean(categoryDrawer)}
          onOpenChange={(open) => !open && setCategoryDrawer(null)}
          mode={categoryDrawer.mode}
          category={categoryDrawer.category}
          assignedVehicles={assignedVehicles}
          canWrite={canWrite}
          saving={actionId === 'category'}
          onSave={async (payload) => {
            if (!orgId) return;
            if (categoryDrawer.mode === 'create') {
              await runAction('category', () => api.rentalRules.createCategory(orgId, payload));
            } else if (categoryDrawer.category) {
              await runAction('category', () =>
                api.rentalRules.updateCategory(orgId, categoryDrawer.category!.id, payload),
              );
            }
          }}
          onAssignVehicles={() => {
            if (categoryDrawer.category) void openAssign(categoryDrawer.category);
          }}
          onPreviewVehicle={(id, label) => setPreviewVehicle({ id, label })}
        />
      )}

      {assignDrawer && orgId && (
        <VehicleAssignmentDrawer
          open={Boolean(assignDrawer)}
          onOpenChange={(open) => !open && setAssignDrawer(null)}
          categoryId={assignDrawer.id}
          categoryName={assignDrawer.name}
          fleetVehicles={fleetVehicles}
          assignedIds={assignedVehicles.map((v) => v.id)}
          canWrite={canWrite}
          saving={actionId === 'assign'}
          onSave={async (vehicleIds) => {
            await runAction('assign', () =>
              api.rentalRules.assignCategoryVehicles(orgId, assignDrawer.id, vehicleIds),
            );
          }}
        />
      )}

      <EffectiveRulesPreviewDrawer
        open={Boolean(previewVehicle)}
        onOpenChange={(open) => !open && setPreviewVehicle(null)}
        orgId={orgId}
        vehicleId={previewVehicle?.id ?? null}
        vehicleLabel={previewVehicle?.label}
      />
    </div>
  );
}
