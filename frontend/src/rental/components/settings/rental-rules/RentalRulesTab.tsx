import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';
import { ErrorState } from '../../../../components/patterns';
import { useRentalOrg } from '../../../RentalContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { RENTAL_RULES_PERMISSION_DENIED_MESSAGE } from '../../../lib/rental-rules-permissions';
import { useRentalRulesPermissions } from '../../../hooks/useRentalRulesPermissions';
import { CategoryDetailDrawer } from './CategoryDetailDrawer';
import { DefaultRulesDrawer } from './DefaultRulesDrawer';
import { EffectiveRulesPreviewDrawer } from './EffectiveRulesPreviewDrawer';
import { RentalRulesHistorySection } from './RentalRulesHistorySection';
import { RentalRulesMatrixSection } from './RentalRulesMatrixSection';
import { RentalRulesOrganizationSection } from './RentalRulesOrganizationSection';
import { RentalRulesOverviewPanel } from './RentalRulesOverviewPanel';
import { RentalRulesOverridesSection } from './RentalRulesOverridesSection';
import { RentalRulesPageHeader } from './RentalRulesPageHeader';
import { RentalRulesPublishDrawer } from './RentalRulesPublishDrawer';
import { RentalRulesSubNav } from './RentalRulesSubNav';
import { VehicleAssignmentDrawer } from './VehicleAssignmentDrawer';
import { buildCategoryAssignmentDelta } from './rental-rules-category-assignment.utils';
import { rentalRulesMutate } from './rental-rules-concurrency.errors';
import { resolveExpectedVersion, withExpectedVersion } from './rental-rules-concurrency.utils';
import {
  buildRentalRulesHeaderMeta,
  buildRentalRulesKpis,
  collectPublishableDrafts,
  type RentalRulesSectionId,
} from './rental-rules-matrix.utils';
import type {
  CategoryAssignmentResultDto,
  RentalCategoryVehicleDto,
  RentalVehicleCategoryDto,
} from './rental-rules.types';
import { useRentalRulesCenter } from './useRentalRulesCenter';

interface RentalRulesTabProps {
  /** @deprecated Use internal `useRentalRulesPermissions` — kept for test injection only */
  permissions?: ReturnType<typeof useRentalRulesPermissions>;
  onCheckBooking?: () => void;
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 items-start gap-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-[78px] animate-pulse rounded-xl border border-border/45 bg-muted/20 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export function RentalRulesTab({
  permissions: permissionsOverride,
  onCheckBooking,
}: RentalRulesTabProps = {}) {
  const { orgId } = useRentalOrg();
  const { locale } = useLanguage();
  const resolvedPermissions = useRentalRulesPermissions();
  const permissions = permissionsOverride ?? resolvedPermissions;
  const { canRead, canWrite, canPublish, canAssignVehicles, canManageOverrides } = permissions;

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

  const [section, setSection] = useState<RentalRulesSectionId>('overview');
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [categoryDrawer, setCategoryDrawer] = useState<{
    mode: 'create' | 'edit';
    category: RentalVehicleCategoryDto | null;
  } | null>(null);
  const [assignedVehicles, setAssignedVehicles] = useState<RentalCategoryVehicleDto[]>([]);
  const [assignDrawer, setAssignDrawer] = useState<RentalVehicleCategoryDto | null>(null);
  const [previewVehicle, setPreviewVehicle] = useState<{ id: string; label: string } | null>(null);

  const headerMeta = useMemo(
    () => buildRentalRulesHeaderMeta(overview, defaults, categories),
    [overview, defaults, categories],
  );
  const kpis = useMemo(
    () => buildRentalRulesKpis(overview, defaults, categories),
    [overview, defaults, categories],
  );
  const publishableDrafts = useMemo(
    () => collectPublishableDrafts(defaults, categories),
    [defaults, categories],
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
      const inCategory = fleetVehicles.find((vehicle) => vehicle.rentalCategoryId === category.id);
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

  if (!canRead) {
    return (
      <ErrorState
        title="Kein Zugriff auf Mietregeln"
        description={RENTAL_RULES_PERMISSION_DENIED_MESSAGE}
      />
    );
  }

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

  return (
    <div className="space-y-4 sm:space-y-5">
      <RentalRulesPageHeader
        meta={headerMeta}
        loading={loading}
        canWrite={canWrite}
        canPublish={canPublish}
        onRefresh={() => void load()}
        onEditDefaults={() => setDefaultsOpen(true)}
        onCreateCategory={openCreateCategory}
        onPublish={() => setPublishOpen(true)}
        onCheckBooking={onCheckBooking}
      />

      <RentalRulesSubNav
        active={section}
        onChange={setSection}
        draftCount={headerMeta.unpublishedDraftCount}
      />

      {section === 'overview' ? (
        <RentalRulesOverviewPanel
          kpis={kpis}
          rulesActive={overview?.defaultsActive ?? true}
          localeCode={locale}
          onNavigate={setSection}
        />
      ) : null}

      {section === 'organization' ? (
        <RentalRulesOrganizationSection
          orgId={orgId ?? ''}
          overview={overview}
          defaults={defaults}
          canWrite={canWrite}
          canPublish={canPublish}
          onEdit={() => setDefaultsOpen(true)}
          onPublished={load}
        />
      ) : null}

      {section === 'categories' ? (
        <RentalRulesMatrixSection
          categories={categories}
          canEdit={canWrite}
          canAssign={canAssignVehicles}
          onEdit={(category) => void openCategoryEdit(category)}
          onAssign={(category) => void openAssign(category)}
          onPreview={(category) => void previewFromCategory(category)}
        />
      ) : null}

      {section === 'overrides' ? (
        <RentalRulesOverridesSection
          orgId={orgId}
          overview={overview}
          canManageOverrides={canManageOverrides}
          onPreviewVehicle={(vehicleId, label) => setPreviewVehicle({ id: vehicleId, label })}
          onReload={load}
        />
      ) : null}

      {section === 'history' ? <RentalRulesHistorySection orgId={orgId} /> : null}

      <DefaultRulesDrawer
        open={defaultsOpen}
        onOpenChange={setDefaultsOpen}
        orgId={orgId ?? ''}
        defaults={defaults}
        canWrite={canWrite}
        canPublish={canPublish}
        saving={actionId === 'defaults'}
        onSaved={load}
      />

      {categoryDrawer ? (
        <CategoryDetailDrawer
          open={Boolean(categoryDrawer)}
          onOpenChange={(open) => !open && setCategoryDrawer(null)}
          orgId={orgId ?? ''}
          mode={categoryDrawer.mode}
          category={categoryDrawer.category}
          organizationDefaults={defaults}
          assignedVehicles={assignedVehicles}
          canWrite={canWrite}
          canPublish={canPublish}
          canAssignVehicles={canAssignVehicles}
          saving={actionId === 'category'}
          onSaved={load}
          onAssignVehicles={() => {
            if (categoryDrawer.category) void openAssign(categoryDrawer.category);
          }}
          onPreviewVehicle={(id, label) => setPreviewVehicle({ id, label })}
        />
      ) : null}

      {assignDrawer && orgId ? (
        <VehicleAssignmentDrawer
          open={Boolean(assignDrawer)}
          onOpenChange={(open) => !open && setAssignDrawer(null)}
          categoryId={assignDrawer.id}
          categoryName={assignDrawer.name}
          fleetVehicles={fleetVehicles}
          assignedIds={assignedVehicles.map((vehicle) => vehicle.id)}
          canWrite={canAssignVehicles}
          saving={actionId === 'assign'}
          onSave={async (vehicleIds) => {
            const delta = buildCategoryAssignmentDelta(
              assignedVehicles.map((vehicle) => vehicle.id),
              vehicleIds,
              fleetVehicles,
              assignDrawer.id,
            );
            const payload = withExpectedVersion(
              delta as unknown as Record<string, unknown>,
              resolveExpectedVersion(assignDrawer.version),
            );
            const result = await runAction('assign', () =>
              rentalRulesMutate<CategoryAssignmentResultDto>(
                'PATCH',
                `/organizations/${orgId}/rental-rules/categories/${assignDrawer.id}/vehicles`,
                payload,
              ),
            );
            if (result) {
              setAssignedVehicles(result.vehicles);
              setAssignDrawer({ ...assignDrawer, version: result.version });
            }
          }}
        />
      ) : null}

      <RentalRulesPublishDrawer
        open={publishOpen}
        onOpenChange={setPublishOpen}
        orgId={orgId ?? ''}
        drafts={publishableDrafts}
        canPublish={canPublish}
        onPublished={load}
      />

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
