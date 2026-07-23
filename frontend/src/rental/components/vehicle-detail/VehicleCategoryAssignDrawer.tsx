import { useEffect, useState } from 'react';

import { Layers } from 'lucide-react';

import { toast } from 'sonner';

import { DetailDrawer, EmptyState } from '../../../components/patterns';

import { api } from '../../../lib/api';

import type { RentalVehicleCategoryDto } from '../settings/rental-rules/rental-rules.types';

import { buildSingleVehicleCategoryDelta } from '../settings/rental-rules/rental-rules-category-assignment.utils';
import { rentalRulesMutate } from '../settings/rental-rules/rental-rules-concurrency.errors';
import { resolveExpectedVersion, withExpectedVersion } from '../settings/rental-rules/rental-rules-concurrency.utils';
import { labelCategoryType, parseApiError } from '../settings/rental-rules/rental-rules.utils';



interface VehicleCategoryAssignDrawerProps {

  open: boolean;

  onOpenChange: (open: boolean) => void;

  orgId: string;

  vehicleId: string;

  currentCategoryId: string | null;

  canWrite: boolean;

  onAssigned: () => void;

}



function CategoryListSkeleton() {

  return (

    <div className="space-y-2" aria-busy="true">

      {Array.from({ length: 4 }).map((_, i) => (

        <div

          key={i}

          className="h-16 animate-pulse rounded-xl border border-border/40 bg-muted/20 motion-reduce:animate-none"

        />

      ))}

    </div>

  );

}



export function VehicleCategoryAssignDrawer({

  open,

  onOpenChange,

  orgId,

  vehicleId,

  currentCategoryId,

  canWrite,

  onAssigned,

}: VehicleCategoryAssignDrawerProps) {

  const [categories, setCategories] = useState<RentalVehicleCategoryDto[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(currentCategoryId);

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);



  useEffect(() => {

    if (!open) return;

    setSelectedId(currentCategoryId);

    setLoading(true);

    void api.rentalRules

      .listCategories(orgId, false)

      .then(setCategories)

      .catch(() => setCategories([]))

      .finally(() => setLoading(false));

  }, [open, orgId, currentCategoryId]);



  const handleSave = async () => {

    if (!selectedId) return;

    if (selectedId === currentCategoryId) {

      onOpenChange(false);

      return;

    }

    const selectedCategory = categories.find((category) => category.id === selectedId);

    if (!selectedCategory) return;

    setSaving(true);

    try {

      const delta = buildSingleVehicleCategoryDelta({

        vehicleId,

        currentCategoryId,

        targetCategoryId: selectedId,

      });

      const payload = withExpectedVersion(delta, resolveExpectedVersion(selectedCategory.version));

      await rentalRulesMutate(

        'PATCH',

        `/organizations/${orgId}/rental-rules/categories/${selectedId}/vehicles`,

        payload,

      );

      toast.success('Category assigned');

      onAssigned();

      onOpenChange(false);

    } catch (e: unknown) {

      toast.error(parseApiError(e));

    } finally {

      setSaving(false);

    }

  };



  return (

    <DetailDrawer

      open={open}

      onOpenChange={onOpenChange}

      eyebrow="Category assignment"

      title="Assign vehicle category"

      description="Categories define shared rental eligibility rules for groups of vehicles."

      widthClassName="sm:max-w-md"

      footer={

        canWrite ? (

          <>

            <button type="button" className="sq-btn sq-btn-ghost min-h-9" onClick={() => onOpenChange(false)}>

              Cancel

            </button>

            <button

              type="button"

              className="sq-btn sq-btn-primary min-h-9"

              disabled={!selectedId || saving}

              onClick={() => void handleSave()}

            >

              {saving ? 'Saving…' : 'Assign category'}

            </button>

          </>

        ) : undefined

      }

    >

      {loading ? (

        <CategoryListSkeleton />

      ) : categories.length === 0 ? (

        <EmptyState

          compact

          icon={<Layers className="h-5 w-5" />}

          title="No categories yet"

          description="Create a vehicle category in Rental Rules to assign shared requirements."

        />

      ) : (

        <ul className="space-y-2">

          {categories.map((cat) => {

            const checked = selectedId === cat.id;

            const isMove = currentCategoryId && currentCategoryId !== cat.id && checked;

            const sourceCategory = categories.find((category) => category.id === currentCategoryId);

            const inputId = `vehicle-category-${cat.id}`;

            return (

              <li key={cat.id}>

                <label

                  htmlFor={inputId}

                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-all sq-press ${

                    checked ? 'border-brand/35 bg-brand/5' : 'border-border/70 hover:border-border hover:bg-muted/10'

                  }`}

                >

                  <input

                    id={inputId}

                    type="radio"

                    name="vehicle-category"

                    className="mt-1"

                    checked={checked}

                    disabled={!canWrite}

                    onChange={() => setSelectedId(cat.id)}

                  />

                  <div className="min-w-0">

                    <p className="text-[13px] font-semibold text-foreground">{cat.name}</p>

                    <p className="text-[11px] text-muted-foreground">

                      {cat.vehicleCount ?? 0} vehicles

                      {cat.type ? ` · ${labelCategoryType(cat.type)}` : ''}

                    </p>

                    {isMove && (

                      <p className="mt-1 text-[11px] text-[color:var(--status-watch)]">

                        This vehicle will move from <strong>{sourceCategory?.name ?? 'current category'}</strong> to{' '}

                        <strong>{cat.name}</strong>.

                      </p>

                    )}

                  </div>

                </label>

              </li>

            );

          })}

        </ul>

      )}

    </DetailDrawer>

  );

}


