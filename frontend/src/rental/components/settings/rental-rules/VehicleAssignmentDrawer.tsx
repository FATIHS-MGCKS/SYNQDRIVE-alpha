import { useEffect, useMemo, useState } from 'react';

import { AlertTriangle, Car, Search } from 'lucide-react';

import { toast } from 'sonner';

import { DetailDrawer, EmptyState } from '../../../../components/patterns';

import type { RentalFleetVehicleDto } from './rental-rules.types';

import { RentalRequirementsStatusBadge } from '../../shared/rental-requirements-ui';



interface VehicleAssignmentDrawerProps {

  open: boolean;

  onOpenChange: (open: boolean) => void;

  categoryId: string;

  categoryName: string;

  fleetVehicles: RentalFleetVehicleDto[];

  assignedIds: string[];

  canWrite: boolean;

  saving: boolean;

  onSave: (vehicleIds: string[]) => Promise<void>;

}



type FilterMode = 'all' | 'uncategorized' | 'override' | 'status';



function VehicleListSkeleton() {

  return (

    <div className="space-y-2" aria-busy="true" aria-label="Loading vehicles">

      {Array.from({ length: 5 }).map((_, i) => (

        <div

          key={i}

          className="h-[58px] animate-pulse rounded-xl border border-border/40 bg-muted/25 motion-reduce:animate-none"

        />

      ))}

    </div>

  );

}



export function VehicleAssignmentDrawer({

  open,

  onOpenChange,

  categoryId,

  categoryName,

  fleetVehicles,

  assignedIds,

  canWrite,

  saving,

  onSave,

}: VehicleAssignmentDrawerProps) {

  const [selected, setSelected] = useState<string[]>([]);

  const [search, setSearch] = useState('');

  const [filter, setFilter] = useState<FilterMode>('all');

  const [statusFilter, setStatusFilter] = useState('all');



  useEffect(() => {

    if (open) {

      setSelected(assignedIds);

      setSearch('');

      setFilter('all');

      setStatusFilter('all');

    }

  }, [open, assignedIds]);



  const moveWarnings = useMemo(() => {

    const warnings: { vehicleId: string; from: string }[] = [];

    for (const id of selected) {

      const v = fleetVehicles.find((x) => x.id === id);

      if (!v?.rentalCategoryId || v.rentalCategoryId === categoryId) continue;

      if (v.rentalCategoryName) {

        warnings.push({ vehicleId: id, from: v.rentalCategoryName });

      }

    }

    return warnings;

  }, [selected, fleetVehicles, categoryId]);



  const statusOptions = useMemo(() => {

    const set = new Set(fleetVehicles.map((v) => v.status).filter(Boolean));

    return Array.from(set).sort();

  }, [fleetVehicles]);



  const filtered = useMemo(() => {

    const q = search.trim().toLowerCase();

    return fleetVehicles.filter((v) => {

      if (q) {

        const hay = `${v.displayName} ${v.licensePlate ?? ''}`.toLowerCase();

        if (!hay.includes(q)) return false;

      }

      if (filter === 'uncategorized' && v.rentalCategoryId) return false;

      if (filter === 'override' && !v.hasOverride) return false;

      if (statusFilter !== 'all' && v.status !== statusFilter) return false;

      return true;

    });

  }, [fleetVehicles, search, filter, statusFilter]);



  const toggle = (id: string) => {

    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  };



  const handleSave = async () => {

    try {

      await onSave(selected);

      toast.success('Vehicle assignment updated');

      onOpenChange(false);

    } catch (e: unknown) {

      toast.error(e instanceof Error ? e.message : 'Assignment failed');

    }

  };



  const listLoading = open && fleetVehicles.length === 0;



  return (

    <DetailDrawer

      open={open}

      onOpenChange={onOpenChange}

      eyebrow="Vehicle assignment"

      title={categoryName}

      description="Select vehicles for this category. Each vehicle belongs to one category at a time."

      widthClassName="sm:max-w-2xl"

      footer={

        canWrite ? (

          <>

            <span className="mr-auto text-[12px] text-muted-foreground tabular-nums">

              {selected.length} selected

            </span>

            <button type="button" className="sq-btn sq-btn-ghost min-h-9" onClick={() => onOpenChange(false)}>

              Cancel

            </button>

            <button

              type="button"

              className="sq-btn sq-btn-primary min-h-9"

              disabled={saving}

              onClick={() => void handleSave()}

            >

              {saving ? 'Saving…' : 'Save assignment'}

            </button>

          </>

        ) : undefined

      }

    >

      <div className="space-y-4">

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">

          <div className="relative min-w-0 flex-1 sm:min-w-[200px]">

            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

            <input

              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-brand/50 focus:ring-2 focus:ring-brand/15"

              placeholder="Search plate, make, model…"

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              aria-label="Search vehicles"

            />

          </div>

          <select

            className="rounded-lg border border-border bg-background px-3 py-2 text-[12px]"

            value={filter}

            onChange={(e) => setFilter(e.target.value as FilterMode)}

            aria-label="Filter vehicles"

          >

            <option value="all">All vehicles</option>

            <option value="uncategorized">Without category</option>

            <option value="override">With override</option>

          </select>

          <select

            className="rounded-lg border border-border bg-background px-3 py-2 text-[12px]"

            value={statusFilter}

            onChange={(e) => setStatusFilter(e.target.value)}

            aria-label="Filter by fleet status"

          >

            <option value="all">Any status</option>

            {statusOptions.map((s) => (

              <option key={s} value={s}>{s}</option>

            ))}

          </select>

        </div>



        {moveWarnings.length > 0 && (

          <div

            className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[12px]"

            role="status"

          >

            <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">

              <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--status-watch)]" aria-hidden />

              Category moves

            </div>

            <ul className="space-y-0.5 text-muted-foreground">

              {moveWarnings.slice(0, 5).map((w) => {

                const v = fleetVehicles.find((x) => x.id === w.vehicleId);

                return (

                  <li key={w.vehicleId}>

                    {v?.licensePlate || v?.displayName} will move from <strong>{w.from}</strong> to{' '}

                    <strong>{categoryName}</strong>.

                  </li>

                );

              })}

              {moveWarnings.length > 5 && (

                <li>…and {moveWarnings.length - 5} more</li>

              )}

            </ul>

          </div>

        )}



        <div className="max-h-[min(52vh,420px)] overflow-y-auto pr-1">

          {listLoading ? (

            <VehicleListSkeleton />

          ) : filtered.length === 0 ? (

            <EmptyState

              compact

              icon={<Car className="h-5 w-5" />}

              title="No vehicles match"

              description="Try a different search or filter."

            />

          ) : (

            <div className="space-y-1.5">

              {filtered.map((v) => {

                const checked = selected.includes(v.id);

                const foreign =

                  v.rentalCategoryId && v.rentalCategoryId !== categoryId ? v.rentalCategoryName : null;

                const inputId = `assign-vehicle-${v.id}`;

                return (

                  <label

                    key={v.id}

                    htmlFor={inputId}

                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all sq-press ${

                      checked

                        ? 'border-brand/35 bg-brand/5'

                        : 'border-border/70 bg-card hover:border-border hover:bg-muted/10'

                    }`}

                  >

                    <input

                      id={inputId}

                      type="checkbox"

                      className="h-4 w-4 rounded border-border"

                      checked={checked}

                      disabled={!canWrite}

                      onChange={() => toggle(v.id)}

                    />

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">

                      <Car className="h-4 w-4" aria-hidden />

                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="truncate text-[13px] font-medium text-foreground">

                        {v.licensePlate || '—'} · {v.displayName}

                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">

                        <span className="text-[11px] text-muted-foreground">

                          {foreign ? `Current: ${foreign}` : v.rentalCategoryName ? `In ${v.rentalCategoryName}` : 'No category'}

                        </span>

                        {!v.rentalCategoryId && (

                          <RentalRequirementsStatusBadge kind="missing-category" />

                        )}

                        {v.hasOverride && <RentalRequirementsStatusBadge kind="vehicle-override" />}

                      </div>

                    </div>

                  </label>

                );

              })}

            </div>

          )}

        </div>

      </div>

    </DetailDrawer>

  );

}


