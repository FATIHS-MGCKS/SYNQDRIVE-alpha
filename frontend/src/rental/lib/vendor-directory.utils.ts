import type { Vendor, VendorCategory } from '../../lib/api';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase, Building2, Car, Cog, Eye, Factory, FileSearch, Globe, Paintbrush,
  Shield, ShieldCheck, ShoppingCart, Sparkles, Tag, Truck, Wrench,
} from 'lucide-react';

export const VENDOR_CATEGORIES: { value: VendorCategory; label: string; icon: LucideIcon }[] = [
  { value: 'WORKSHOP', label: 'Werkstatt', icon: Wrench },
  { value: 'SERVICE_PARTNER', label: 'Service Partner', icon: Cog },
  { value: 'PAINT_SHOP', label: 'Lackiererei', icon: Paintbrush },
  { value: 'BODY_REPAIR', label: 'Karosserie', icon: Car },
  { value: 'AUTO_GLASS', label: 'Autoglas', icon: Eye },
  { value: 'TIRE_DEALER', label: 'Reifenhändler', icon: Truck },
  { value: 'PARTS_DEALER', label: 'Teilehandel', icon: ShoppingCart },
  { value: 'DETAILING', label: 'Detailing', icon: Sparkles },
  { value: 'TUV_STATION', label: 'TÜV-Station', icon: Shield },
  { value: 'ONLINE_SUPPLIER', label: 'Online', icon: Globe },
  { value: 'INSURANCE', label: 'Versicherung', icon: ShieldCheck },
  { value: 'APPRAISER', label: 'Gutachter', icon: FileSearch },
  { value: 'TOWING', label: 'Abschleppdienst', icon: Truck },
  { value: 'DEALERSHIP', label: 'Autohaus', icon: Building2 },
  { value: 'OEM_SERVICE', label: 'OEM Service', icon: Factory },
  { value: 'OTHER', label: 'Sonstige', icon: Briefcase },
];

export const VENDOR_SERVICE_AREAS = [
  'Tires', 'Brakes', 'Oil / Service', 'Body Repair', 'Paint', 'Auto Glass',
  'Inspections (TÜV/HU)', 'Parts Supply', 'Detailing / Reconditioning',
  'Battery / EV Service', 'Roadside / Towing', 'General Workshop',
  'Windshield', 'Suspension', 'Exhaust', 'AC / Climate', 'Electrical',
] as const;

export type VendorDirectoryScope = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'LINKED' | 'PREFERRED';

export function getVendorCategoryLabel(cat: VendorCategory): string {
  return VENDOR_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export function getVendorCategoryIcon(cat: VendorCategory) {
  return VENDOR_CATEGORIES.find((c) => c.value === cat)?.icon ?? Briefcase;
}

export function vendorHasPreferredLink(vendor: Vendor): boolean {
  return vendor.linkedVehicles?.some((lv) => lv.isPreferred) ?? false;
}

export function formatVendorAddress(vendor: Pick<Vendor, 'street' | 'postalCode' | 'city' | 'country'>): string {
  return [vendor.street, [vendor.postalCode, vendor.city].filter(Boolean).join(' '), vendor.country]
    .filter(Boolean)
    .join(', ');
}

export function filterVendorDirectory(
  vendors: Vendor[],
  opts: {
    search: string;
    category: VendorCategory | 'ALL';
    serviceArea: string | 'ALL';
    scope: VendorDirectoryScope;
  },
): Vendor[] {
  let list = vendors;
  if (opts.category !== 'ALL') list = list.filter((v) => v.category === opts.category);
  if (opts.serviceArea !== 'ALL') {
    list = list.filter((v) => v.serviceAreas?.includes(opts.serviceArea));
  }
  if (opts.scope === 'ACTIVE') list = list.filter((v) => v.isActive);
  if (opts.scope === 'INACTIVE') list = list.filter((v) => !v.isActive);
  if (opts.scope === 'LINKED') list = list.filter((v) => v.linkedVehicleCount > 0);
  if (opts.scope === 'PREFERRED') list = list.filter(vendorHasPreferredLink);
  const q = opts.search.trim().toLowerCase();
  if (q) {
    list = list.filter((v) =>
      [v.name, v.city, v.contactName, v.phone, v.email, ...(v.serviceAreas ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }
  return list;
}
