import type { Vendor, VendorCategory } from '../../lib/api';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase, Building2, Car, Cog, Eye, Factory, FileSearch, Globe, Paintbrush,
  Shield, ShieldCheck, ShoppingCart, Sparkles, Tag, Truck, Wrench,
} from 'lucide-react';

export const VENDOR_CATEGORIES: { value: VendorCategory; icon: LucideIcon }[] = [
  { value: 'WORKSHOP', icon: Wrench },
  { value: 'SERVICE_PARTNER', icon: Cog },
  { value: 'PAINT_SHOP', icon: Paintbrush },
  { value: 'BODY_REPAIR', icon: Car },
  { value: 'AUTO_GLASS', icon: Eye },
  { value: 'TIRE_DEALER', icon: Truck },
  { value: 'PARTS_DEALER', icon: ShoppingCart },
  { value: 'DETAILING', icon: Sparkles },
  { value: 'TUV_STATION', icon: Shield },
  { value: 'ONLINE_SUPPLIER', icon: Globe },
  { value: 'INSURANCE', icon: ShieldCheck },
  { value: 'APPRAISER', icon: FileSearch },
  { value: 'TOWING', icon: Truck },
  { value: 'DEALERSHIP', icon: Building2 },
  { value: 'OEM_SERVICE', icon: Factory },
  { value: 'OTHER', icon: Briefcase },
];

export const VENDOR_SERVICE_AREAS = [
  'Tires', 'Brakes', 'Oil / Service', 'Body Repair', 'Paint', 'Auto Glass',
  'Inspections (TÜV/HU)', 'Parts Supply', 'Detailing / Reconditioning',
  'Battery / EV Service', 'Roadside / Towing', 'General Workshop',
  'Windshield', 'Suspension', 'Exhaust', 'AC / Climate', 'Electrical',
] as const;

export type VendorDirectoryScope = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'LINKED' | 'PREFERRED';

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
