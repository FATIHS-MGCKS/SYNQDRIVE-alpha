import { useCallback, useMemo, useState } from 'react';
import {
  Car,
  ClipboardCheck,
  Eye,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { EmptyState, ErrorState, PageHeader } from '../../../../components/patterns';
import { useRentalOrg } from '../../../RentalContext';
import { RENTAL_RULES_PERMISSION_DENIED_MESSAGE } from '../../../lib/rental-rules-permissions';
import { useRentalRulesPermissions } from '../../../hooks/useRentalRulesPermissions';
import { CategoryDetailDrawer } from './CategoryDetailDrawer';
import { DefaultRulesDrawer } from './DefaultRulesDrawer';
import { EffectiveRulesPreviewDrawer } from './EffectiveRulesPreviewDrawer';
import { VehicleAssignmentDrawer } from './VehicleAssignmentDrawer';
import { RentalRulesSummaryTile } from './RentalRulesSummaryTile';
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
import {
  RentalRequirementsStatusBadge,
  RentalRulesSectionIntro,
  RuleInheritanceSteps,
  RuleValueTile,
} from '../../shared/rental-requirements-ui';

interface RentalRulesTabProps {
  /** @deprecated Use internal `useRentalRulesPermissions` — kept for test injection only */
  permissions?: ReturnType<typeof useRentalRulesPermissions>;
}

const RULE_HIERARCHY_STEPS = [
  { key: 'org', label: 'Organization defaults', labelDe: 'Organisationsstandard' },
  { key: 'category', label: 'Vehicle category', labelDe: 'Fahrzeugkategorie' },
  { key: 'override', label: 'Vehicle override', labelDe: 'Fahrzeug-Override' },
  { key: 'effective', label: 'Effective requirements', labelDe: 'Effektive Anforderungen' },
] as const;

const DEFAULT_RULE_FIELD_KEYS: Record<string, string> = {
  'Minimum age': 'minimumAgeYears',
  'License holding period': 'minimumLicenseHoldingYears',
  'Deposit required': 'depositAmount',
  'Credit card required': 'creditCardRequired',
  'Foreign travel': 'foreignTravelPolicy',
  'Additional driver': 'additionalDriverPolicy',
  'Young driver': 'youngDriverPolicy',
  Insurance: 'insuranceRequirement',
};

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 items-start gap-1 sm:gap-1.5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="booking-kpi-tile booking-kpi-tile--dense animate-pulse motion-reduce:animate-none">
          <div className="h-2.5 w-20 rounded bg-muted/70" />
          <div className="mt-1.5 h-4 w-10 rounded bg-muted/60" />
          <div className="mt-1 h-2 w-24 rounded bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

export function RentalRulesTab({ permissions: permissionsOverride }: RentalRulesTabProps = {}) {
  const { orgId } = useRentalOrg();
  const resolvedPermissions = useRentalRulesPermissions();
  const permissions = permissionsOverride ?? resolvedPermissions;
  const {
    canRead,
    canWrite,
    canAssignVehicles,
  } = permissions;
  const {
    overview,
    defaults,
    categories,
    fleetVehicles,
    loading,
    error,
    actionId,
    accessDenied,
    load,
    runAction,
  } = useRentalRulesCenter(orgId);

  if (!canRead) {
    return (
      <ErrorState
        title="Kein Zugriff auf Mietregeln"
        description={RENTAL_RULES_PERMISSION_DENIED_MESSAGE}
      />
    );
  }

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

  const unassignedVehicles = useMemo(
    () => fleetVehicles.filter((v) => !v.rentalCategoryId),
    [fleetVehicles],
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

  const openCreateCategory = useCallback(() => {
    setAssignedVehicles([]);
    setCategoryDrawer({ mode: 'create', category: null });
  }, []);

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
        <SummarySkeleton />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <ErrorState
        title={accessDenied ? 'Kein Zugriff auf Mietregeln' : 'Rental rules could not be loaded'}
        description={error}
        onRetry={accessDenied ? undefined : () => void load()}
      />
    );
  }

  const defaultSummary = defaults ? summarizeRules(defaults) : [];
  const configuredFields = countConfiguredRuleFields(defaults);
  const overrideCount = overview?.vehiclesWithOverrides ?? 0;
  const unassignedCount = overview?.vehiclesMissingCategory ?? 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Rental Rules"
        actions={
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void load()}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
            </Button>
            {canWrite && (
              <>
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={() => setDefaultsOpen(true)}
                >
                  <Pencil />
                  Edit default rules
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={openCreateCategory}>
                  <Plus />
                  Create category
                </Button>
              </>
            )}
          </div>
        }
      />

      <RuleInheritanceSteps
        steps={RULE_HIERARCHY_STEPS}
        activeStep="effective"
        rulesActive={overview?.defaultsActive ?? true}
        locale="en"
      />
      <p className="-mt-2 text-[11px] leading-snug text-muted-foreground sm:text-[12px]">
        Organization defaults are the baseline. Categories override defaults for grouped vehicles.
        Vehicle overrides apply to one vehicle. Effective requirements drive booking validation.
      </p>

      <div className="grid grid-cols-2 items-start gap-1 sm:gap-1.5 lg:grid-cols-4">
        <RentalRulesSummaryTile
          label="Organization defaults"
          value={
            overview?.defaultsConfigured ? `${configuredFields} fields` : 'Not configured'
          }
          valueVariant={overview?.defaultsConfigured ? 'text' : 'status'}
          subdued={!overview?.defaultsConfigured}
          status={overview?.defaultsConfigured ? 'success' : 'watch'}
          hint="Baseline rules when no category or override applies."
          icon={<ClipboardCheck aria-hidden />}
        />
        <RentalRulesSummaryTile
          label="Vehicle categories"
          value={overview?.activeCategoryCount ?? 0}
          valueVariant="numeric"
          subdued={(overview?.activeCategoryCount ?? 0) === 0}
          hint={`${activeCategories.length} active · ${categories.length} total · rule groups for vehicle classes`}
          icon={<Layers aria-hidden />}
        />
        <RentalRulesSummaryTile
          label="Vehicle overrides"
          value={overrideCount}
          valueVariant="numeric"
          subdued={overrideCount === 0}
          status={overrideCount > 0 ? 'watch' : 'neutral'}
          hint="Vehicles with individual requirement exceptions."
          icon={<Car aria-hidden />}
        />
        <RentalRulesSummaryTile
          label="Unassigned vehicles"
          value={unassignedCount}
          valueVariant="numeric"
          subdued={unassignedCount === 0}
          status="neutral"
          hint="Vehicles currently using organization defaults."
          icon={<Car aria-hidden />}
        />
      </div>

      <section className="surface-premium rounded-2xl border border-border/70 surface-premium p-3 sm:p-4">
        <RentalRulesSectionIntro
          title="Organization default rules"
          description="Baseline requirements when categories and vehicle overrides do not specify a value."
          action={
            canWrite ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDefaultsOpen(true)}
              >
                Edit
              </Button>
            ) : undefined
          }
        />

        {!overview?.defaultsConfigured ? (
          <EmptyState
            compact
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="No default rules configured yet"
            description="Set organization-wide minimum age, deposit, license duration and travel policies."
            action={
              canWrite ? (
                <Button type="button" variant="primary" size="sm" onClick={() => setDefaultsOpen(true)}>
                  Configure defaults
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-3">
            {defaultSummary.map((row) => (
              <RuleValueTile
                key={row.label}
                label={row.label}
                value={row.value}
                fieldKey={DEFAULT_RULE_FIELD_KEYS[row.label]}
                density="mini"
                locale="en"
              />
            ))}
            <RuleValueTile
              label="Manual approval"
              value={formatBool(defaults?.manualApprovalRequired)}
              fieldKey="manualApprovalRequired"
              density="mini"
              locale="en"
              highlighted={Boolean(defaults?.manualApprovalRequired)}
            />
            {defaults?.notes?.trim() ? (
              <RuleValueTile
                label="Notes"
                value={defaults.notes.trim()}
                fieldKey="notes"
                density="mini"
                locale="en"
                className="col-span-2 lg:col-span-3"
              />
            ) : null}
          </div>
        )}
      </section>

      {unassignedCount > 0 && (
        <section className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 sm:px-3.5">
          <p className="text-[12px] font-semibold text-foreground">Unassigned vehicles</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            These vehicles currently use organization defaults. Assign a category to apply shared rules.
          </p>
          <ul className="mt-2 space-y-1">
            {unassignedVehicles.slice(0, 6).map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
              >
                <span className="min-w-0 truncate text-foreground">
                  {v.licensePlate || '—'} · {v.displayName}
                </span>
                <span className="shrink-0">Org defaults</span>
              </li>
            ))}
          </ul>
          {unassignedVehicles.length > 6 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              +{unassignedVehicles.length - 6} more vehicles
            </p>
          ) : null}
        </section>
      )}

      <section>
        <RentalRulesSectionIntro
          title="Vehicle categories"
          description="Group vehicles with shared eligibility requirements."
          action={
            canWrite ? (
              <Button type="button" variant="neutral" size="sm" onClick={openCreateCategory}>
                <Plus />
                Create category
              </Button>
            ) : undefined
          }
        />

        {activeCategories.length === 0 ? (
          <div className="surface-premium rounded-xl border border-border/60 surface-premium p-4">
            <EmptyState
              compact
              icon={<Layers className="h-5 w-5" />}
              title="No vehicle categories yet"
              description="Create categories for Compact, Premium, Van, SUV, and other vehicle classes."
              action={
                canWrite ? (
                  <Button type="button" variant="primary" size="sm" onClick={openCreateCategory}>
                    Create category
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {activeCategories.map((cat) => (
              <article
                key={cat.id}
                className="surface-premium overflow-hidden rounded-xl border border-border/60 surface-premium"
              >
                <div className="h-0.5 w-full" style={{ backgroundColor: cat.color ?? 'var(--brand)' }} />
                <div className="p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold text-foreground">{cat.name}</h3>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
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

                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                    <div>
                      <dt className="text-muted-foreground">Minimum age</dt>
                      <dd className="font-medium tabular-nums">{cat.minimumAgeYears ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">License holding</dt>
                      <dd className="font-medium">
                        {formatLicenseHolding(cat.minimumLicenseHoldingMonths, undefined, {
                          long: true,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Deposit</dt>
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

                  <div className="mt-2.5 flex flex-wrap gap-1 border-t border-border/50 pt-2">
                    {canWrite && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => void openCategoryEdit(cat)}
                      >
                        Edit
                      </Button>
                    )}
                    {canAssignVehicles && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => void openAssign(cat)}
                      >
                        Assign vehicles
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => void previewFromCategory(cat)}
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <RentalRulesSectionIntro
          title="Vehicle overrides"
          description="Individual requirement exceptions on top of category defaults."
        />
        <div className="surface-premium rounded-xl border border-border/60 surface-premium p-3 sm:p-4">
          {overrideCount === 0 ? (
            <EmptyState
              compact
              icon={<Car className="h-5 w-5" />}
              title="No vehicle overrides"
              description="Vehicle overrides are individual exceptions for specific vehicles."
            />
          ) : (
            <ul className="space-y-2">
              {overview!.overrideVehicles.map((row) => (
                <li
                  key={row.vehicleId}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[12px] font-semibold text-foreground">
                        {row.licensePlate || '—'} · {row.displayName}
                      </p>
                      <RentalRequirementsStatusBadge kind="vehicle-override" />
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {row.categoryName ? `Category: ${row.categoryName}` : 'Missing category'}
                      {' · '}
                      {row.overrideCount} override{row.overrideCount === 1 ? '' : 's'}
                      {row.topOverrideField
                        ? ` · ${labelRuleField(row.topOverrideField)}: ${formatRuleValue(row.topOverrideField, row.topOverrideValue)}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="neutral"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setPreviewVehicle({ id: row.vehicleId, label: row.displayName })}
                  >
                    View effective requirements
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
          canAssignVehicles={canAssignVehicles}
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
          canWrite={canAssignVehicles}
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
