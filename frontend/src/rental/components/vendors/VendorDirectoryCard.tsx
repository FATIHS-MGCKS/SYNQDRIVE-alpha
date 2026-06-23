import { ClipboardList, Eye, Pencil, Star } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import type { Vendor } from '../../../lib/api';
import {
  formatVendorAddress,
  getVendorCategoryIcon,
  getVendorCategoryLabel,
  vendorHasPreferredLink,
} from '../../lib/vendor-directory.utils';
import { Icon } from '../ui/Icon';

interface VendorDirectoryCardProps {
  vendor: Vendor;
  onView: (vendor: Vendor) => void;
  onEdit?: (vendor: Vendor) => void;
  onCreateTask?: (vendor: Vendor) => void;
}

export function VendorDirectoryCard({
  vendor,
  onView,
  onEdit,
  onCreateTask,
}: VendorDirectoryCardProps) {
  const CatIcon = getVendorCategoryIcon(vendor.category);
  const isPreferred = vendorHasPreferredLink(vendor);
  const address = formatVendorAddress(vendor);

  return (
    <article
      className={`sq-card rounded-2xl border p-4 shadow-[var(--shadow-1)] transition-colors ${
        !vendor.isActive ? 'opacity-75 border-dashed' : 'border-border/45'
      } ${isPreferred ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]' : ''}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <button
          type="button"
          onClick={() => onView(vendor)}
          className="min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-muted/25 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isPreferred ? 'sq-tone-brand' : 'bg-muted/50'}`}>
              <CatIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground truncate">{vendor.name}</span>
                {isPreferred && (
                  <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold sq-tone-brand">
                    <Star className="w-3 h-3" />
                    Bevorzugt
                  </span>
                )}
                {!vendor.isActive && <StatusChip tone="watch">Inaktiv</StatusChip>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{getVendorCategoryLabel(vendor.category)}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                {address && (
                  <span className="inline-flex items-center gap-1 max-w-full">
                    <Icon name="map-pin" className="w-3 h-3 shrink-0" />
                    <span className="truncate">{address}</span>
                  </span>
                )}
                {vendor.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="phone" className="w-3 h-3" />
                    {vendor.phone}
                  </span>
                )}
                {vendor.contactName && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="user" className="w-3 h-3" />
                    {vendor.contactName}
                  </span>
                )}
              </div>
              {vendor.serviceAreas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {vendor.serviceAreas.slice(0, 4).map((sa) => (
                    <StatusChip key={sa} tone="info" className="text-[9px]">{sa}</StatusChip>
                  ))}
                  {vendor.serviceAreas.length > 4 && (
                    <span className="text-[9px] text-muted-foreground self-center">+{vendor.serviceAreas.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-3 shrink-0 lg:flex-col lg:items-end">
          <div className="text-center lg:text-right">
            <p className="text-lg font-bold tabular-nums text-foreground">{vendor.linkedVehicleCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Fahrzeuge</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onView(vendor)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted/40"
            >
              <Eye className="w-3 h-3" />
              Ansehen
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(vendor)}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted/40"
              >
                <Pencil className="w-3 h-3" />
                Bearbeiten
              </button>
            )}
            {onCreateTask && (
              <button
                type="button"
                onClick={() => onCreateTask(vendor)}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]"
              >
                <ClipboardList className="w-3 h-3" />
                Aufgabe
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
