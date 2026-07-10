import type { ComponentProps } from 'react';
import type { VehicleData } from '../../data/vehicles';
import type { Station } from '../../../lib/api';
import type { BookingRentalEligibilityResult } from '../../lib/booking-rental-eligibility.types';
import type { CustomerDetailModal } from '../CustomerDetailModal';
import type {
  ExtraOptionRow,
  InsuranceOptionRow,
  MileagePackageOption,
  PricingSimulationResult,
} from '../../pricing/pricingTypes';
import type { AddCustomerFormState } from '../../lib/add-customer-wizard';
import type { CustomerVerificationPlanState } from '../add-customer/AddCustomerVerificationPlanSection';
import type { PendingCustomerDocumentFiles } from '../../lib/entityMappers';
import type { CustomerVerificationEligibility } from '../../lib/customer-verification';

export type BookingPaymentMethod = 'card' | 'cash' | 'invoice';

export type BookingWizardStepId = 1 | 2 | 3 | 4 | 5;

/** Customer row in the New Booking picker (mapped from API). */
export interface BookingCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  drivingStressScore: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  totalBookings: number;
  totalRevenue: string;
  city: string;
  licenseVerified: boolean;
  idVerified: boolean;
}

export interface BookingCustomerEligibility {
  canCreatePendingBooking: boolean;
  canConfirmBooking: boolean;
  canStartRental: boolean;
  blockingReasons: string[];
  warnings: string[];
  requiredActions: string[];
}

export interface VehiclePickerStationOption {
  id: string;
  label: string;
}

export interface PeriodBlockedDayInfo {
  customer: string;
  startDay: number;
  endDay: number;
  reason: 'booking' | 'maintenance';
}

export interface BookingSummaryPanelProps {
  selectedVehicle: VehicleData | null;
  selectedCustomer: BookingCustomer | null;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  rentalDays: number;
  displayRentalDays: number;
  pickupStationId: string;
  returnStationId: string;
  sameReturnStation: boolean;
  orgStations: Station[];
  selectedMileagePackage: string | null;
  selectedInsurances: string[];
  extras: string[];
  mileagePackages: Array<{ id: string; includedKm: number }>;
  insuranceOptions: Array<{ id: string; label: string }>;
  extraOptions: Array<{ id: string; label: string }>;
  noTariffForVehicle: boolean;
  canCalculatePrice: boolean;
  priceLoading: boolean;
  priceError: string | null;
  priceSim: PricingSimulationResult | null;
  totalFreeKm: number;
  extraKmPrice: number | null;
  mileagePkgKm: number;
  freeKmPerDay: number;
  baseFreeKm: number;
  subtotalNet: number | null;
  tax: number | null;
  taxRatePercent: number;
  grandTotal: number | null;
  depositAmount: number | null;
  pricingCurrency: string | null;
  isDarkMode: boolean;
}

export interface BookingSidebarProps extends BookingSummaryPanelProps {
  rentalEligibility: BookingRentalEligibilityResult | null;
  rentalEligibilityLoading: boolean;
  rentalEligibilityError: string | null;
  onCompleteCustomerData: () => void;
  onChooseAnotherVehicle: () => void;
}

export interface MobileBookingFooterProps {
  currentStep: BookingWizardStepId;
  canProceed: boolean;
  isSavingBooking: boolean;
  onBackStep: () => void;
  onNextStep: () => void;
  onConfirm: () => void;
}

export interface PeriodStepProps {
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  showPickupTimePicker: boolean;
  showReturnTimePicker: boolean;
  pickupStationId: string;
  returnStationId: string;
  sameReturnStation: boolean;
  orgStations: Station[];
  calendarMonth: number;
  calendarYear: number;
  calendarSelectMode: 'pickup' | 'return';
  selectedVehicle: VehicleData | null;
  blockedDays: number[];
  vehicleBlockedInfo: Record<number, PeriodBlockedDayInfo>;
  hoveredDay: number | null;
  rangeHasConflict: boolean;
  onPickupDateChange: (value: string) => void;
  onReturnDateChange: (value: string) => void;
  onPickupTimeChange: (value: string) => void;
  onReturnTimeChange: (value: string) => void;
  onShowPickupTimePickerChange: (open: boolean) => void;
  onShowReturnTimePickerChange: (open: boolean) => void;
  onPickupStationChange: (id: string) => void;
  onReturnStationChange: (id: string) => void;
  onSameReturnStationChange: (same: boolean) => void;
  onCalendarMonthChange: (month: number) => void;
  onCalendarYearChange: (year: number) => void;
  onCalendarSelectModeChange: (mode: 'pickup' | 'return') => void;
  onHoveredDayChange: (day: number | null) => void;
  onCalendarDayClick: (day: number) => void;
}

export interface ExtrasStepProps {
  vehicleTariffCtx: { version: { id: string } } | null;
  mileagePackages: MileagePackageOption[];
  insuranceOptions: InsuranceOptionRow[];
  extraOptions: ExtraOptionRow[];
  selectedMileagePackage: string | null;
  selectedInsurances: string[];
  extras: string[];
  taxRatePercent: number;
  displayRentalDays: number;
  hasPrice: boolean;
  extrasTotal: number;
  pricingCurrency: string | null;
  onSelectMileagePackage: (id: string | null) => void;
  onToggleInsurance: (id: string) => void;
  onToggleExtra: (id: string) => void;
}

export interface CustomerStepProps {
  orgId: string | null;
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  customersLoading: boolean;
  customersError: string | null;
  filteredCustomers: BookingCustomer[];
  selectedCustomer: BookingCustomer | null;
  onSelectCustomer: (customer: BookingCustomer) => void;
  customerEligibility: BookingCustomerEligibility | null;
  customerDetailOpen: boolean;
  customerDetailTarget: BookingCustomer | null;
  onOpenCustomerDetail: (customer: BookingCustomer) => void;
  onCloseCustomerDetail: () => void;
  mapToDetailCustomer: (customer: BookingCustomer) => ComponentProps<typeof CustomerDetailModal>['customer'];
  isAddCustomerOpen: boolean;
  onOpenAddCustomer: () => void;
  onCloseAddCustomer: () => void;
  addStep: number;
  onAddStepChange: (step: number) => void;
  newCustomer: AddCustomerFormState;
  onNewCustomerChange: (customer: AddCustomerFormState) => void;
  verificationPlan: CustomerVerificationPlanState;
  onVerificationPlanChange: (plan: CustomerVerificationPlanState) => void;
  pendingDocFiles: PendingCustomerDocumentFiles;
  onPendingDocFileChange: (type: keyof PendingCustomerDocumentFiles, file: File | null) => void;
  formErrors: Record<string, string>;
  draftCustomerId: string | null;
  isEnsuringDraft: boolean;
  wizardEligibility: CustomerVerificationEligibility | null;
  onRefreshWizardEligibility: () => void;
  onAddNextStep: () => void;
  onSubmitNewCustomer: () => void;
  isSavingCustomer: boolean;
}

export interface CheckoutStepProps {
  selectedCustomer: BookingCustomer | null;
  selectedVehicle: VehicleData | null;
  paymentMethod: BookingPaymentMethod;
  onPaymentMethodChange: (method: BookingPaymentMethod) => void;
  discountPercent: number;
  onDiscountPercentChange: (percent: number) => void;
  discountAmount: number;
  agbAccepted: boolean;
  privacyAccepted: boolean;
  onAgbAcceptedChange: (accepted: boolean) => void;
  onPrivacyAcceptedChange: (accepted: boolean) => void;
  invoiceGenerated: boolean;
  contractGenerated: boolean;
  generatingInvoice: boolean;
  generatingContract: boolean;
  onGenerateInvoice: () => void;
  onGenerateContract: () => void;
  quickViewDoc: 'invoice' | 'contract' | null;
  onQuickViewDocChange: (doc: 'invoice' | 'contract' | null) => void;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  rentalDays: number;
  displayRentalDays: number;
  taxRatePercent: number;
  subtotal: number;
  extrasTotal: number;
  tax: number | null;
  grandTotal: number | null;
  depositAmount: number | null;
  totalFreeKm: number;
  dailyRateGross: number | null;
  pricingCurrency: string | null;
}
