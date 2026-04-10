import type { VehicleData } from './vehicles';

export interface MileagePackage {
  id: string;
  km: number;
  price: number;
}

export interface InsuranceOption {
  id: string;
  name: string;
  dailyPrice: number;
  description: string;
}

export interface ExtraOption {
  id: string;
  label: string;
  dailyPrice: number;
  description: string;
  icon: string; // emoji icon
}

export type VehicleCategory = 'All' | 'Compact' | 'Sedan' | 'Premium' | 'Electric' | 'MPV';

export interface PeriodRate {
  rate: number;
  kmLimit: number;
}

export interface VehicleTariff {
  vehicleId: string;
  category: VehicleCategory;
  daily: PeriodRate;
  weekly: PeriodRate;
  monthly: PeriodRate;
  extraKmPrice: number;
  mileagePackages: MileagePackage[];
  insurances: InsuranceOption[];
  extras: ExtraOption[];
}

export const getVehicleCategory = (model: string, fuelType: string): VehicleCategory => {
  if (fuelType === 'Electric') return 'Electric';
  const lm = model.toLowerCase();
  if (lm.includes('touran') || lm.includes('sharan') || lm.includes('caddy') || lm.includes('transporter')) return 'MPV';
  if (lm.includes('golf') || lm.includes('focus') || lm.includes('fiat')) return 'Compact';
  if (lm.includes('audi a6') || lm.includes('mercedes') || lm.includes('bmw')) return 'Premium';
  return 'Sedan';
};

export const categoryConfig: Record<VehicleCategory, { icon: string; color: string; bg: string; darkBg: string; text: string; darkText: string; border: string; darkBorder: string }> = {
  'All': { icon: '\u{1F697}', color: 'blue', bg: 'bg-blue-100', darkBg: 'bg-blue-900/30', text: 'text-blue-700', darkText: 'text-blue-400', border: 'border-blue-400/60', darkBorder: 'border-blue-500/60' },
  'Compact': { icon: '\u{1F699}', color: 'emerald', bg: 'bg-emerald-100', darkBg: 'bg-emerald-900/30', text: 'text-emerald-700', darkText: 'text-emerald-400', border: 'border-emerald-400/60', darkBorder: 'border-emerald-500/60' },
  'Sedan': { icon: '\u{1F698}', color: 'amber', bg: 'bg-amber-100', darkBg: 'bg-amber-900/30', text: 'text-amber-700', darkText: 'text-amber-400', border: 'border-amber-400/60', darkBorder: 'border-amber-500/60' },
  'Premium': { icon: '\u2728', color: 'purple', bg: 'bg-purple-100', darkBg: 'bg-purple-900/30', text: 'text-purple-700', darkText: 'text-purple-400', border: 'border-purple-400/60', darkBorder: 'border-purple-500/60' },
  'Electric': { icon: '\u26A1', color: 'cyan', bg: 'bg-cyan-100', darkBg: 'bg-cyan-900/30', text: 'text-cyan-700', darkText: 'text-cyan-400', border: 'border-cyan-400/60', darkBorder: 'border-cyan-500/60' },
  'MPV': { icon: '\u{1F690}', color: 'indigo', bg: 'bg-indigo-100', darkBg: 'bg-indigo-900/30', text: 'text-indigo-700', darkText: 'text-indigo-400', border: 'border-indigo-400/60', darkBorder: 'border-indigo-500/60' },
};

export const defaultInsurances: InsuranceOption[] = [
  { id: 'ins-cdw', name: 'CDW Plus', dailyPrice: 15, description: 'Reduces excess to 0 for collision damage' },
  { id: 'ins-theft', name: 'Theft Protection', dailyPrice: 8, description: 'Full coverage for theft and vandalism' },
  { id: 'ins-glass', name: 'Glass & Tire', dailyPrice: 5, description: 'Covers windshield, windows and tire damage' },
  { id: 'ins-pai', name: 'Personal Accident', dailyPrice: 4, description: 'Medical costs for driver and passengers' },
];

export const defaultMileagePackages: MileagePackage[] = [
  { id: 'pkg-500', km: 500, price: 69 },
  { id: 'pkg-1000', km: 1000, price: 119 },
  { id: 'pkg-2000', km: 2000, price: 199 },
];

export const defaultExtras: ExtraOption[] = [
  { id: 'gps', label: 'GPS Navigation', dailyPrice: 5, description: 'Portable GPS with latest maps', icon: '\u{1F4CD}' },
  { id: 'child-seat', label: 'Child Seat', dailyPrice: 8, description: 'ISOFIX child seat (9-36 kg)', icon: '\u{1F476}' },
  { id: 'winter-tires', label: 'Winter Tires', dailyPrice: 10, description: 'Premium winter tire set pre-mounted', icon: '\u2744\uFE0F' },
  { id: 'additional-driver', label: 'Additional Driver', dailyPrice: 12, description: 'Register a second driver', icon: '\u{1F464}' },
  { id: 'roadside', label: 'Premium Roadside', dailyPrice: 6, description: '24/7 premium roadside assistance', icon: '\u{1F6E0}\uFE0F' },
  { id: 'wifi', label: 'Mobile WiFi', dailyPrice: 7, description: 'Portable WiFi hotspot with 10GB data', icon: '\u{1F4F6}' },
];

export const buildTariffs = (vehicles: VehicleData[]): VehicleTariff[] => vehicles.map(v => {
  const cat = getVehicleCategory(v.model, v.fuelType);
  const base = cat === 'Premium' ? 89 : cat === 'Electric' ? 79 : cat === 'Sedan' ? 59 : 45;
  const yearMod = v.year >= 2025 ? 12 : v.year >= 2024 ? 6 : 0;
  const d = base + yearMod;
  return {
    vehicleId: v.id,
    category: cat,
    daily: { rate: d, kmLimit: 200 },
    weekly: { rate: Math.round(d * 5.5), kmLimit: 1200 },
    monthly: { rate: Math.round(d * 20), kmLimit: 4000 },
    extraKmPrice: cat === 'Premium' ? 0.35 : cat === 'Electric' ? 0.28 : cat === 'Sedan' ? 0.22 : 0.19,
    mileagePackages: defaultMileagePackages.map(p => ({
      ...p,
      price: cat === 'Premium' ? Math.round(p.price * 1.4) : cat === 'Electric' ? Math.round(p.price * 1.2) : p.price,
    })),
    insurances: defaultInsurances.map(ins => ({
      ...ins,
      dailyPrice: cat === 'Premium' ? Math.round(ins.dailyPrice * 1.5) : cat === 'Electric' ? Math.round(ins.dailyPrice * 1.3) : ins.dailyPrice,
    })),
    extras: defaultExtras.map(ext => ({
      ...ext,
      dailyPrice: cat === 'Premium' ? Math.round(ext.dailyPrice * 1.3) : ext.dailyPrice,
    })),
  };
});

export const formatCurrency = (amount: number) => `\u20AC ${amount.toFixed(2).replace('.', ',')}`;
