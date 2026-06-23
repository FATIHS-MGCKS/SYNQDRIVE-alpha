import type {
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalVehicleCategoryType,
  RentalYoungDriverPolicy,
} from './rental-rules.types';

export const FOREIGN_TRAVEL_OPTIONS: { value: RentalForeignTravelPolicy; label: string }[] = [
  { value: 'ALLOWED', label: 'Allowed' },
  { value: 'APPROVAL_REQUIRED', label: 'Approval required' },
  { value: 'NOT_ALLOWED', label: 'Not allowed' },
];

export const ADDITIONAL_DRIVER_OPTIONS: { value: RentalAdditionalDriverPolicy; label: string }[] = [
  { value: 'ALLOWED', label: 'Allowed' },
  { value: 'APPROVAL_REQUIRED', label: 'Approval required' },
  { value: 'NOT_ALLOWED', label: 'Not allowed' },
];

export const YOUNG_DRIVER_OPTIONS: { value: RentalYoungDriverPolicy; label: string }[] = [
  { value: 'ALLOWED', label: 'Allowed' },
  { value: 'FEE_REQUIRED', label: 'Fee required' },
  { value: 'NOT_ALLOWED', label: 'Not allowed' },
];

export const CATEGORY_TYPE_OPTIONS: { value: RentalVehicleCategoryType; label: string }[] = [
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'COMPACT', label: 'Compact' },
  { value: 'TRANSPORTER', label: 'Transporter' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'LUXURY', label: 'Luxury' },
  { value: 'EV_PERFORMANCE', label: 'EV Performance' },
  { value: 'CUSTOM', label: 'Custom' },
];

export const CATEGORY_COLOR_PRESETS = [
  '#3D5A73',
  '#4F6D8F',
  '#5B8A72',
  '#8B6B4A',
  '#7C5C8A',
  '#4A7C8B',
  '#8A4A4A',
];
