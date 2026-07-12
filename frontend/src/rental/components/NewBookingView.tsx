import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import { resolveDrivingStressScore } from '../lib/scoreFormat';
import { usePriceTariffs } from '../hooks/usePriceTariffs';
import { usePricingSimulation } from '../hooks/usePricingSimulation';
import {
  formatNetAsGross,
  getVehicleTariffFromCatalog,
  catalogCurrency,
  discountableNetCents,
  grossFromNetCents,
  isPricingQuoteStaleError,
  majorUnitsFromCents,
  parseApiError,
  resolvePricingCurrency,
} from '../pricing/pricingUtils';
import { findLineItemBySourceId, sumExtrasGrossCents } from '../pricing/pricingLineItems';
import {
  buildCustomerCreatePayload,
  buildBookingCreatePayload,
  customerTypeApiToUi,
  customerStatusApiToUi,
  customerRiskApiToUi,
  mapApiBooking,
  uploadPendingCustomerDocuments,
  type PendingCustomerDocumentFiles,
} from '../lib/entityMappers';
import {
  DEFAULT_ADD_CUSTOMER_FORM,
  ensureWizardDraftCustomer,
  validateAddCustomerDocumentsStep,
  addCustomerFormToPayload,
  DEFAULT_VERIFICATION_PLAN,
  type CustomerVerificationPlanState,
} from '../lib/add-customer-wizard';
import { useFleetHealthMap } from '../hooks/useVehicleHealth';
import type { BookingRentalEligibilityResult } from '../lib/booking-rental-eligibility.types';
import { PageHeader } from '../../components/patterns';
import {
  resolveDefaultPickupStationId,
  stationLabel,
} from '../lib/stationBookingUtils';
import type { Station } from '../../lib/api';
import { buildMMY } from '../lib/vehicleMmy';
import { BookingVehiclePreflightBanner } from '../lib/booking-vehicle-preflight-banner';
import {
  isBookingVehicleHardBlocked,
  vehicleStationId,
} from '../lib/booking-vehicle-preflight';
import { VehiclePickerStep } from './new-booking/VehiclePickerStep';
import { BookingStepper } from './new-booking/BookingStepper';
import { BookingStepCard } from './new-booking/BookingStepCard';
import { BookingSuccessState } from './new-booking/BookingSuccessState';
import { BookingSidebar } from './new-booking/BookingSidebar';
import { MobileBookingFooter } from './new-booking/MobileBookingFooter';
import { PeriodStep } from './new-booking/PeriodStep';
import { ExtrasStep } from './new-booking/ExtrasStep';
import { CustomerStep } from './new-booking/CustomerStep';
import { CheckoutStep } from './new-booking/CheckoutStep';
import type { BookingCustomer, BookingCustomerEligibility, BookingWizardStepId } from './new-booking/types';
import { Icon } from './ui/Icon';
import { useCustomerVerification } from './customer-verification/useCustomerVerification';
import { useDocumentDark } from '../hooks/useDocumentDark';

const EM_DASH = '\u2014';

interface NewBookingViewProps {
  onBack: () => void;
  onCustomerCreated?: (customer: any) => void;
  onBookingCreated?: (booking: any) => void;
  /** Pre-select customer when opening booking flow from Customer Detail. */
  initialCustomerId?: string | null;
}

const formatEuro = (value?: number | null): string => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  } catch {
    return `€ ${n.toFixed(2)}`;
  }
};

const mapApiCustomerToBookingCustomer = (c: any): BookingCustomer => {
  const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || c?.email || 'Kunde';
  return {
    id: String(c?.id ?? ''),
    name,
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    company: c?.company ?? undefined,
    type: customerTypeApiToUi(c?.customerType),
    status: customerStatusApiToUi(c?.status, c?.archivedAt),
    riskLevel: customerRiskApiToUi(c?.riskLevel),
    drivingStressScore: resolveDrivingStressScore(c),
    stressLevel: c?.stressLevel ?? null,
    totalBookings: typeof c?.totalRentals === 'number' ? c.totalRentals : 0,
    totalRevenue: formatEuro(typeof c?.totalRevenue === 'number' ? c.totalRevenue : 0),
    city: c?.city ?? '',
    licenseVerified: Boolean(c?.licenseVerified),
    idVerified: Boolean(c?.idVerified),
  };
};

// V4.6.67 — Reordered steps so that the booking flow is logically gated:
//   Fahrzeug → Zeitraum → Extras → Kunde → Abschluss
// Extras (mileage / insurance / accessories) need rentalDays + the vehicle
// tariff to compute prices; choosing them before the period was confusing and
// the user could not advance from Period because the bottom Next button kept
// asking for fields the calendar step does not actually own.
// Step labels + navigation UI: `BookingWizardStepper`.

export function NewBookingView({
  onBack,
  onCustomerCreated,
  onBookingCreated,
  initialCustomerId = null,
}: NewBookingViewProps) {
  const isDarkMode = useDocumentDark();
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const { catalog, loading: catalogLoading } = usePriceTariffs(orgId);
  const taxRatePercent = catalog?.priceBook?.taxRatePercent ?? 19;
  const [customers, setCustomers] = useState<BookingCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // V4.6.67 — Real org bookings (used to compute calendar conflicts per
  // selected vehicle). Replaces the previous hardcoded `vehicleBookings`
  // dictionary that only worked for the legacy v1..v6 demo IDs.
  const [orgBookings, setOrgBookings] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<BookingCustomer | null>(null);

  const [customerEligibility, setCustomerEligibility] = useState<BookingCustomerEligibility | null>(null);

  const [rentalEligibility, setRentalEligibility] = useState<BookingRentalEligibilityResult | null>(null);
  const [rentalEligibilityLoading, setRentalEligibilityLoading] = useState(false);
  const [rentalEligibilityError, setRentalEligibilityError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCustomersLoading(true);
      setCustomersError(null);
      try {
        const params: { limit: number; page: number; search?: string } = {
          limit: 25,
          page: 1,
        };
        if (customerSearch.trim()) params.search = customerSearch.trim();
        const res = await api.customers.list(orgId, params);
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCustomers(list.map(mapApiCustomerToBookingCustomer));
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Kunden konnten nicht geladen werden';
        setCustomersError(msg);
        setCustomers([]);
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId, customerSearch]);

  // V4.6.67 — load all org bookings once so the calendar in the Period step
  // can mark days that are actually blocked for the selected vehicle.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.bookings.list(orgId);
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
        setOrgBookings(list);
      } catch {
        if (!cancelled) setOrgBookings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const getVehicleDailyRateLabel = useCallback(
    (vehicleId: string): string | null => {
      if (catalogLoading) return null;
      const ctx = getVehicleTariffFromCatalog(catalog, vehicleId);
      if (!ctx?.version.rate) return null;
      const currency = catalogCurrency(catalog) ?? 'EUR';
      return formatNetAsGross(ctx.version.rate.dailyRateCents, taxRatePercent, currency);
    },
    [catalog, catalogLoading, taxRatePercent],
  );

  const vehicleHasTariff = useCallback(
    (vehicleId: string): boolean => {
      if (catalogLoading) return true;
      return Boolean(getVehicleTariffFromCatalog(catalog, vehicleId));
    },
    [catalog, catalogLoading],
  );

  const [currentStep, setCurrentStep] = useState<BookingWizardStepId>(1);

  useEffect(() => {
    if (!orgId || !initialCustomerId || selectedCustomer?.id === initialCustomerId) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api.customers.get(orgId, initialCustomerId);
        if (cancelled) return;
        setSelectedCustomer(mapApiCustomerToBookingCustomer(row));
        setCurrentStep(2);
      } catch {
        /* prefill is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, initialCustomerId, selectedCustomer?.id]);

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleStationFilter, setVehicleStationFilter] = useState('all');
  const [vehicleFuelFilter, setVehicleFuelFilter] = useState('all');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('all');
  const [vehicleBrandFilter, setVehicleBrandFilter] = useState('all');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [pickupTime, setPickupTime] = useState('10:00');
  const [returnTime, setReturnTime] = useState('10:00');

  useEffect(() => {
    if (!orgId || !selectedCustomer?.id) {
      setCustomerEligibility(null);
      return;
    }
    let cancelled = false;
    const startIso = pickupDate
      ? new Date(`${pickupDate}T${pickupTime || '10:00'}`).toISOString()
      : undefined;
    api.customers
      .eligibility(orgId, selectedCustomer.id, startIso)
      .then((result) => {
        if (!cancelled) setCustomerEligibility(result);
      })
      .catch(() => {
        if (!cancelled) setCustomerEligibility(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedCustomer?.id, pickupDate, pickupTime]);

  const [showPickupTimePicker, setShowPickupTimePicker] = useState(false);
  const [showReturnTimePicker, setShowReturnTimePicker] = useState(false);
  const [pickupStationId, setPickupStationId] = useState('');
  const [returnStationId, setReturnStationId] = useState('');
  const [sameReturnStation, setSameReturnStation] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'invoice'>('card');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [extras, setExtras] = useState<string[]>([]);
  const [selectedMileagePackage, setSelectedMileagePackage] = useState<string | null>(null);
  const [selectedInsurances, setSelectedInsurances] = useState<string[]>([]);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [createdBookingRef, setCreatedBookingRef] = useState<string | null>(null);
  const [invoiceGenerated, setInvoiceGenerated] = useState(false);
  const [contractGenerated, setContractGenerated] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [quickViewDoc, setQuickViewDoc] = useState<'invoice' | 'contract' | null>(null);
  // V4.6.67 — Default the calendar to TODAY (was hardcoded to March 2026).
  // Tracks both month and year so the calendar keeps working past 2026.
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [calendarSelectMode, setCalendarSelectMode] = useState<'pickup' | 'return'>('pickup');

  // Customer Detail Modal state
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [customerDetailTarget, setCustomerDetailTarget] = useState<BookingCustomer | null>(null);

  // Add Customer Modal state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [newCustomer, setNewCustomer] = useState(DEFAULT_ADD_CUSTOMER_FORM);
  const [verificationPlan, setVerificationPlan] = useState<CustomerVerificationPlanState>(DEFAULT_VERIFICATION_PLAN);
  const [pendingDocFiles, setPendingDocFiles] = useState<PendingCustomerDocumentFiles>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [draftCustomerId, setDraftCustomerId] = useState<string | null>(null);
  const [isEnsuringDraft, setIsEnsuringDraft] = useState(false);
  const { eligibility: wizardEligibility, refresh: refreshWizardEligibility } = useCustomerVerification(
    draftCustomerId ?? undefined,
  );

  const resetAddCustomerForm = () => {
    setNewCustomer(DEFAULT_ADD_CUSTOMER_FORM);
    setVerificationPlan(DEFAULT_VERIFICATION_PLAN);
    setPendingDocFiles({});
    setFormErrors({});
    setDraftCustomerId(null);
    setIsEnsuringDraft(false);
    setAddStep(0);
  };

  const validateAddStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!newCustomer.firstName.trim()) errors.firstName = 'First name required';
      if (!newCustomer.lastName.trim()) errors.lastName = 'Last name required';
      if (!newCustomer.email.trim()) errors.email = 'Email required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) errors.email = 'Invalid email address';
      if (!newCustomer.phone.trim()) errors.phone = 'Phone number required';
      if (!newCustomer.city.trim()) errors.city = 'City required';
      if (newCustomer.type === 'Corporate' && !newCustomer.company.trim()) errors.company = 'Company name required';
    } else if (step === 1) {
      if (!newCustomer.licenseNumber.trim()) errors.licenseNumber = 'License number required';
      if (!newCustomer.licenseExpiry) errors.licenseExpiry = 'Expiry date required';
      if (!newCustomer.idNumber.trim()) errors.idNumber = 'ID number required';
      if (!newCustomer.idExpiry) errors.idExpiry = 'Expiry date required';
    } else if (step === 2) {
      Object.assign(
        errors,
        validateAddCustomerDocumentsStep(pendingDocFiles, wizardEligibility, {
          idFront: 'ID front side or Didit check required',
          idBack: 'ID back side or Didit check required',
          licenseFront: 'License front side or Didit check required',
        }),
      );
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNextStep = async () => {
    if (!validateAddStep(addStep)) return;
    if (addStep === 1) {
      if (!orgId) {
        toast.error('Keine Organisation geladen');
        return;
      }
      setIsEnsuringDraft(true);
      try {
        const id = await ensureWizardDraftCustomer(orgId, draftCustomerId, newCustomer, verificationPlan);
        setDraftCustomerId(id);
        setAddStep(2);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
            ?.message ||
          (err as Error)?.message ||
          'Customer could not be prepared';
        toast.error('Didit preparation failed', { description: String(msg) });
      } finally {
        setIsEnsuringDraft(false);
      }
      return;
    }
    if (addStep < 3) setAddStep(addStep + 1);
  };

  const handleSubmitNewCustomer = async () => {
    if (!orgId || isSavingCustomer) return;
    setIsSavingCustomer(true);
    try {
      const payload = buildCustomerCreatePayload(addCustomerFormToPayload(newCustomer, verificationPlan));
      let customerId = draftCustomerId;
      if (customerId) {
        await api.customers.update(orgId, customerId, payload);
      } else {
        const created = await api.customers.create(orgId, payload as Record<string, unknown>);
        customerId = created.id;
      }
      await uploadPendingCustomerDocuments(orgId, customerId, pendingDocFiles);
      const saved = await api.customers.get(orgId, customerId);
      const bookingCustomer = mapApiCustomerToBookingCustomer(saved);
      setCustomers(prev => [bookingCustomer, ...prev.filter(c => c.id !== bookingCustomer.id)]);
      setSelectedCustomer(bookingCustomer);
      const startIso = pickupDate
        ? new Date(`${pickupDate}T${pickupTime || '10:00'}`).toISOString()
        : undefined;
      api.customers.eligibility(orgId, customerId, startIso).then(setCustomerEligibility).catch(() => setCustomerEligibility(null));
      if (onCustomerCreated) {
        onCustomerCreated({
          ...bookingCustomer,
          lastTrip: '—',
          joinDate: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          licenseExpiry: newCustomer.licenseExpiry,
          accidents: 0,
          violations: 0,
          notes: newCustomer.notes || undefined,
        });
      }
      toast.success('Kunde gespeichert', { description: bookingCustomer.name });
      setIsAddCustomerOpen(false);
      resetAddCustomerForm();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Kunde konnte nicht gespeichert werden';
      toast.error('Fehler beim Anlegen', { description: String(msg) });
    } finally {
      setIsSavingCustomer(false);
    }
  };


  // V4.6.83 — CustomerDetailModal consumes the full Customer shape. We pass
  // through whatever the booking-flow Customer row already knows and leave
  // back-end-sourced fields empty/zero. The modal itself fetches the real
  // detail record (`api.customers.get`) and renders em-dashes for missing
  // values, so we never fabricate trip/license dates or derive fake
  // accident/violation counts from a score.
  const mapToDetailCustomer = (c: BookingCustomer) => ({
    ...c,
    lastTrip: (c as BookingCustomer & { lastTrip?: string }).lastTrip ?? EM_DASH,
    joinDate: (c as BookingCustomer & { joinDate?: string }).joinDate ?? EM_DASH,
    licenseExpiry: (c as BookingCustomer & { licenseExpiry?: string }).licenseExpiry ?? EM_DASH,
    accidents: 0,
    violations: 0,
    notes: '',
    currentVehicle: undefined as string | undefined,
  });

  const [orgStations, setOrgStations] = useState<Station[]>([]);

  useEffect(() => {
    if (!orgId) {
      setOrgStations([]);
      return;
    }
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setOrgStations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOrgStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Derived
  const filteredCustomers = customers;

  const fuelTypes = [...new Set(fleetVehicles.map(v => v.fuelType))];

  const getBrand = (model: string) => model.split(' ')[0];
  const brands = [...new Set(fleetVehicles.map(v => getBrand(v.model)))].sort();

  const stationOptions = useMemo(() => {
    if (orgStations.length > 0) {
      return orgStations.map((s) => ({
        id: s.id,
        label: stationLabel(s),
      }));
    }
    const byId = new Map<string, string>();
    for (const v of fleetVehicles) {
      const id = vehicleStationId(v);
      if (!id) continue;
      const named = (v as { stationName?: string | null }).stationName;
      byId.set(id, named ?? v.station ?? id);
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [orgStations, fleetVehicles]);

  const availableVehicles = fleetVehicles.filter(v => {
    const q = vehicleSearch.toLowerCase();
    const matchesSearch =
      v.model.toLowerCase().includes(q) ||
      v.license.toLowerCase().includes(q) ||
      (v.make ?? '').toLowerCase().includes(q);
    const vehicleStation = vehicleStationId(v);
    const matchesStation =
      vehicleStationFilter === 'all' || vehicleStation === vehicleStationFilter;
    const matchesFuel = vehicleFuelFilter === 'all' || v.fuelType === vehicleFuelFilter;
    const matchesBrand = vehicleBrandFilter === 'all' || getBrand(v.model) === vehicleBrandFilter;
    return matchesSearch && matchesStation && matchesFuel && matchesBrand;
  });

  // V4.6.76 Rental Health V1 — preload the canonical health map for the
  // vehicles visible in the picker. We pass the full fleet IDs (not the
  // filtered subset) so applying/removing search/station/fuel filters
  // doesn't refetch every keystroke.
  const fleetPickerIds = useMemo(
    () => fleetVehicles.map((v) => v.id).filter(Boolean),
    [fleetVehicles],
  );
  const { map: pickerHealthMap } = useFleetHealthMap(orgId, fleetPickerIds);

  const selectedVehicleHealth = selectedVehicle
    ? pickerHealthMap.get(selectedVehicle.id) ?? null
    : null;

  const rentalDays = useMemo(() => {
    if (!pickupDate || !returnDate) return 0;
    const d1 = new Date(pickupDate);
    const d2 = new Date(returnDate);
    return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }, [pickupDate, returnDate]);

  const pickupAtIso = pickupDate
    ? new Date(`${pickupDate}T${pickupTime || '10:00'}:00`).toISOString()
    : '';
  const returnAtIso = returnDate
    ? new Date(`${returnDate}T${returnTime || '10:00'}:00`).toISOString()
    : '';

  useEffect(() => {
    if (!orgId || !selectedVehicle?.id || !selectedCustomer?.id || !pickupAtIso) {
      setRentalEligibility(null);
      setRentalEligibilityError(null);
      setRentalEligibilityLoading(false);
      return;
    }
    let cancelled = false;
    setRentalEligibilityLoading(true);
    setRentalEligibilityError(null);
    api.bookings
      .checkRentalEligibility(orgId, {
        vehicleId: selectedVehicle.id,
        customerId: selectedCustomer.id,
        startDate: pickupAtIso,
        endDate: returnAtIso || undefined,
        paymentMethod,
      })
      .then((result) => {
        if (!cancelled) setRentalEligibility(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRentalEligibility(null);
          setRentalEligibilityError(
            err instanceof Error ? err.message : 'Fahrzeugvoraussetzungen konnten nicht geprüft werden',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRentalEligibilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedVehicle?.id, selectedCustomer?.id, pickupAtIso, returnAtIso, paymentMethod]);

  const pricingInputBase = useMemo(
    () => ({
      selectedMileagePackageId: selectedMileagePackage ?? undefined,
      selectedInsuranceOptionIds: selectedInsurances,
      selectedExtraOptionIds: extras,
    }),
    [selectedMileagePackage, selectedInsurances, extras],
  );

  const simParamsNoDiscount = useMemo(() => {
    if (!selectedVehicle?.id || !pickupAtIso || !returnAtIso) return null;
    return {
      vehicleId: selectedVehicle.id,
      pickupAt: pickupAtIso,
      returnAt: returnAtIso,
      pricing: pricingInputBase,
    };
  }, [selectedVehicle?.id, pickupAtIso, returnAtIso, pricingInputBase]);

  const { result: priceSimBase } = usePricingSimulation(orgId, simParamsNoDiscount, 400);

  const manualDiscountCents = useMemo(() => {
    if (discountPercent <= 0) return undefined;
    const base = discountableNetCents(priceSimBase);
    if (base <= 0) return undefined;
    return Math.round(base * discountPercent / 100);
  }, [discountPercent, priceSimBase]);

  const simParams = useMemo(() => {
    if (!simParamsNoDiscount) return null;
    return {
      ...simParamsNoDiscount,
      pricing: {
        ...pricingInputBase,
        ...(manualDiscountCents != null ? { manualDiscountCents } : {}),
      },
    };
  }, [simParamsNoDiscount, pricingInputBase, manualDiscountCents]);

  const {
    result: priceSim,
    loading: priceLoading,
    error: priceError,
  } = usePricingSimulation(orgId, simParams, manualDiscountCents != null ? 300 : 400);

  const pricingContext = priceSim?.pricingContext ?? priceSimBase?.pricingContext ?? null;
  const resolvedTaxRatePercent = pricingContext?.taxRatePercent ?? taxRatePercent;

  const mileagePackages = useMemo(
    () => pricingContext?.mileagePackages.filter((p) => p.isActive) ?? [],
    [pricingContext],
  );
  const insuranceOptions = useMemo(
    () => pricingContext?.insuranceOptions.filter((i) => i.isActive) ?? [],
    [pricingContext],
  );
  const extraOptions = useMemo(
    () => pricingContext?.extraOptions.filter((e) => e.isActive) ?? [],
    [pricingContext],
  );

  useEffect(() => {
    setExtras([]);
    setSelectedMileagePackage(null);
    const defaults = pricingContext?.insuranceOptions
      .filter((i) => i.isActive && i.isDefault)
      .map((i) => i.id) ?? [];
    setSelectedInsurances(defaults);
  }, [selectedVehicle?.id, pricingContext?.tariffVersionId]);

  const displayRentalDays = priceSim?.rentalDays ?? rentalDays;
  const pricingCurrency = resolvePricingCurrency(priceSim ?? priceSimBase, pricingContext);
  const grandTotal = majorUnitsFromCents(priceSim?.totalGrossCents);
  const tax = majorUnitsFromCents(priceSim?.taxAmountCents);
  const subtotalNet = majorUnitsFromCents(priceSim?.subtotalNetCents);
  const depositAmount = majorUnitsFromCents(priceSim?.depositAmountCents);
  const totalFreeKm = priceSim?.includedKm ?? 0;
  const extraKmPrice = majorUnitsFromCents(priceSim?.extraKmPriceCents);
  const dailyRateGross =
    priceSim?.effectiveDailyRateCents != null
      ? majorUnitsFromCents(
          grossFromNetCents(priceSim.effectiveDailyRateCents, resolvedTaxRatePercent),
        )
      : pricingContext?.rate
        ? majorUnitsFromCents(
            grossFromNetCents(pricingContext.rate.dailyRateCents, resolvedTaxRatePercent),
          )
        : null;
  const freeKmPerDay = pricingContext?.rate.includedKmPerDay ?? 0;
  const baseFreeKm = freeKmPerDay * displayRentalDays;
  const mileagePkgKm = selectedMileagePackage
    ? mileagePackages.find((p) => p.id === selectedMileagePackage)?.includedKm ?? 0
    : 0;
  const discountAmount = manualDiscountCents != null ? manualDiscountCents / 100 : 0;
  const hasPrice = Boolean(priceSim && grandTotal != null);
  const periodSelected = Boolean(selectedVehicle && pickupDate && returnDate);
  const noTariffForVehicle = Boolean(
    periodSelected && !priceLoading && !pricingContext && Boolean(priceError || priceSimBase === null),
  );
  const canCalculatePrice = Boolean(periodSelected && (priceLoading || pricingContext));
  const selectedVehicleHasTariff =
    !selectedVehicle || catalogLoading || vehicleHasTariff(selectedVehicle.id);

  const baseRentalLine = priceSim?.lineItems.find((li) => li.type === 'BASE_RENTAL');
  const subtotal = baseRentalLine ? baseRentalLine.totalGrossCents / 100 : 0;
  const extrasTotal = priceSim ? sumExtrasGrossCents(priceSim.lineItems) / 100 : 0;

  // Auto-redirect countdown
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (redirectCountdown !== null && redirectCountdown > 0) {
      redirectTimerRef.current = setTimeout(() => {
        setRedirectCountdown(redirectCountdown - 1);
      }, 1000);
    } else if (redirectCountdown === 0) {
      onBack();
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [redirectCountdown]);

  const handleConfirm = async () => {
    if (isSavingBooking) return;

    if (!orgId || !selectedVehicle || !selectedCustomer || !pickupDate || !returnDate) {
      toast.error('Buchung unvollständig', {
        description: 'Fahrzeug, Kunde, Abhol- und Rückgabedatum werden benötigt.',
      });
      return;
    }

    if (customerEligibility && !customerEligibility.canConfirmBooking) {
      toast.error('Kunde nicht freigegeben', {
        description:
          customerEligibility.blockingReasons.join(' · ') ||
          'Der Kunde erfüllt die Anforderungen für eine bestätigte Buchung nicht.',
      });
      return;
    }

    if (isBookingVehicleHardBlocked(selectedVehicle, selectedVehicleHealth, vehicleHasTariff(selectedVehicle.id), catalogLoading)) {
      toast.error('Fahrzeug nicht vermietbar', {
        description:
          selectedVehicleHealth?.blocking_reasons?.join(' · ') ||
          (!vehicleHasTariff(selectedVehicle.id)
            ? 'Kein aktiver Tarif zugewiesen — bitte unter Preise & Tarife zuweisen.'
            : 'Dieses Fahrzeug kann aktuell nicht gebucht werden.'),
        duration: 8000,
      });
      return;
    }

    if (!priceSim?.quoteId || !pricingContext || !priceSim || grandTotal == null) {
      toast.error('Preis nicht verfügbar', {
        description:
          priceError ||
          'Die serverseitige Preisquote fehlt oder ist ungültig. Bitte Preisberechnung aktualisieren.',
      });
      return;
    }

    const effectiveReturnStationId = sameReturnStation ? pickupStationId : returnStationId;
    if (!pickupStationId || !effectiveReturnStationId) {
      toast.error('Stationen fehlen', {
        description: 'Bitte Abhol- und Rückgabestation auswählen.',
      });
      return;
    }

    setIsSavingBooking(true);
    try {
      const insuranceLabel = selectedInsurances.length > 0
        ? insuranceOptions.filter((i) => selectedInsurances.includes(i.id)).map((i) => i.label).join(', ')
        : 'Haftpflicht';
      const paymentLabel = paymentMethod === 'card' ? 'Kreditkarte' : paymentMethod === 'cash' ? 'Barzahlung' : 'Rechnung';
      const pickupName = orgStations.find((s) => s.id === pickupStationId)?.name ?? '';
      const returnName = orgStations.find((s) => s.id === effectiveReturnStationId)?.name ?? '';

      const extrasForPayload = extras
        .map((id) => {
          const opt = extraOptions.find((o) => o.id === id);
          if (!opt) return null;
          const line = findLineItemBySourceId(priceSim.lineItems, opt.id);
          return {
            id: opt.id,
            name: line?.label ?? opt.label,
            price: line
              ? line.totalGrossCents / 100
              : grossFromNetCents(opt.priceCents, resolvedTaxRatePercent) / 100,
          };
        })
        .filter(Boolean) as Array<{ id: string; name: string; price: number }>;

      const payload = buildBookingCreatePayload({
        vehicleId: selectedVehicle.id,
        customerId: selectedCustomer.id,
        pickupDate,
        pickupTime,
        returnDate,
        returnTime,
        pickupStationId,
        returnStationId: effectiveReturnStationId,
        includedKm: totalFreeKm,
        insuranceLabels: insuranceLabel ? [insuranceLabel] : [],
        extras: extrasForPayload,
        pricingInput: {
          selectedMileagePackageId: selectedMileagePackage ?? undefined,
          selectedInsuranceOptionIds: selectedInsurances,
          selectedExtraOptionIds: extras,
          manualDiscountCents,
        },
        quoteId: priceSim.quoteId,
        notes: `Abholung: ${pickupName || selectedVehicle.station} • Rückgabe: ${returnName || pickupName || selectedVehicle.station} • Zahlung: ${paymentLabel}`,
        status: customerEligibility?.canConfirmBooking ? 'CONFIRMED' : 'PENDING',
      });

      const created = await api.bookings.create(orgId, payload as any);
      const uiBooking = mapApiBooking(created);

      setCreatedBookingRef(uiBooking.bookingRef ?? uiBooking.id ?? null);
      setBookingConfirmed(true);
      toast.success('Buchung erfolgreich erstellt!', {
        description: `${buildMMY(selectedVehicle)} • ${selectedCustomer.name} • ${rentalDays} Tage`,
        duration: 5000,
      });
      setRedirectCountdown(4);

      if (onBookingCreated) {
        onBookingCreated({
          id: uiBooking.id,
          customer: uiBooking.customer,
          customerPhone: selectedCustomer.phone || '+49 000 0000 0000',
          vehicle: uiBooking.vehicle,
          plate: uiBooking.plate,
          startDate: uiBooking.startDate,
          endDate: uiBooking.endDate,
          startTime: uiBooking.startTime,
          endTime: uiBooking.endTime,
          pickupLocation: uiBooking.pickupLocation,
          returnLocation: uiBooking.returnLocation,
          revenue: uiBooking.revenue,
          status: uiBooking.status,
          bookingRef: uiBooking.bookingRef,
          insurance: insuranceLabel,
          paymentMethod: paymentLabel,
          fuelLevel: 'Voll',
          mileageStart: selectedVehicle.odometer || 10000,
          mileageEnd: null,
          notes: '',
          pickupProtocol: null,
          returnProtocol: null,
          bookingSource: 'App',
          bookedBy: 'Current User',
          pickupHandoverBy: null,
          returnHandoverBy: null,
          includedKm: totalFreeKm,
          drivenKm: null,
          drivingScore: null,
          drivingBehavior: null,
          abuseDetection: null,
        });
      }
    } catch (err: any) {
      // V4.6.76 Rental Health V1 — surface the rental_blocked hard-gate with a
      // dedicated message so dispatchers see WHY the booking was rejected
      // (TÜV überfällig, Limp Mode aktiv, Bremsen kritisch, etc.) instead of
      // a generic conflict toast.
      const body = err?.response?.data;
      const code = body?.code;
      const reasons: string[] = Array.isArray(body?.blockingReasons)
        ? (body.blockingReasons as string[])
        : [];
      if (code === 'VEHICLE_RENTAL_BLOCKED' && reasons.length > 0) {
        toast.error('Fahrzeug nicht vermietbar', {
          description: reasons.join(' · '),
          duration: 8000,
        });
      } else if (code === 'VEHICLE_HEALTH_GATE_UNAVAILABLE') {
        // Health gate failed technically — never a silent fail-open. The
        // operator is told the check could not run, not that the car is fine.
        toast.error('Health-Prüfung nicht verfügbar', {
          description:
            body?.message ||
            'Fahrzeug-Gesundheit konnte nicht geprüft werden — manuelle Prüfung erforderlich. Buchung wurde nicht freigegeben.',
          duration: 9000,
        });
      } else if (
        (code === 'CUSTOMER_BOOKING_BLOCKED' ||
          code === 'CUSTOMER_CONFIRMATION_BLOCKED' ||
          code === 'CUSTOMER_PICKUP_BLOCKED') &&
        reasons.length > 0
      ) {
        toast.error('Kunde nicht freigegeben', {
          description: reasons.join(' · '),
          duration: 8000,
        });
      } else {
        const msg = parseApiError(err);
        if (isPricingQuoteStaleError(err)) {
          toast.error('Preis veraltet', {
            description: msg,
            duration: 9000,
          });
        } else {
          toast.error('Fehler beim Speichern', { description: msg });
        }
      }
      setIsSavingBooking(false);
      return;
    }
    setIsSavingBooking(false);

  };

  // Build a stable YYYY-MM-DD key from (year, month, day) using calendarYear.
  const calendarDateStr = (day: number) =>
    `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // V4.6.67 — Real bookings of the selected vehicle that fall in the
  // currently displayed calendar month. Replaces the legacy v1..v6 mock map.
  // We only block days for non-cancelled bookings (CONFIRMED / ACTIVE / etc.).
  // A booking is treated as a blocker for any day it overlaps within the month.
  const vehicleBlockedInfo = useMemo(() => {
    const info: Record<number, { customer: string; startDay: number; endDay: number; reason: 'booking' | 'maintenance' }> = {};
    if (!selectedVehicle || orgBookings.length === 0) return info;

    const monthStart = new Date(calendarYear, calendarMonth, 1);
    const monthEnd = new Date(calendarYear, calendarMonth + 1, 0); // last day of the month
    const monthEndExclusive = new Date(calendarYear, calendarMonth + 1, 1);

    for (const b of orgBookings) {
      if (!b) continue;
      // V4.6.74 — only block days for bookings that belong to the CURRENTLY
      // selected vehicle. Previously we allowed bookings without a
      // `vehicleId` on the response to "fall through" (treating them as
      // matching), which caused every org booking to appear as a blocker on
      // every vehicle's calendar — making it impossible to reserve a free
      // second vehicle for a date range already booked for a different one.
      // The backend now always includes `vehicleId`; we therefore require a
      // strict match here and skip any record that cannot be positively
      // attributed to the selected vehicle.
      const bookingVehicleId =
        b.vehicleId ?? b.vehicle?.id ?? null;
      if (!bookingVehicleId || bookingVehicleId !== selectedVehicle.id) continue;
      const status = (b.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'CANCELED' || status === 'NO_SHOW') continue;
      const startRaw = b.startDate ? new Date(b.startDate) : null;
      const endRaw = b.endDate ? new Date(b.endDate) : null;
      if (!startRaw || !endRaw || isNaN(+startRaw) || isNaN(+endRaw)) continue;
      // Skip bookings that don't overlap the current month at all.
      if (endRaw < monthStart || startRaw >= monthEndExclusive) continue;
      const clampedStart = startRaw < monthStart ? monthStart : startRaw;
      const clampedEnd = endRaw > monthEnd ? monthEnd : endRaw;
      const startDay = clampedStart.getDate();
      const endDay = clampedEnd.getDate();
      const customer = b.customerName ?? b.customer ?? 'Reservierung';
      const reason: 'booking' | 'maintenance' = status === 'MAINTENANCE' ? 'maintenance' : 'booking';
      for (let d = startDay; d <= endDay; d++) {
        // First booking wins; this is good enough for visual hint purposes.
        if (!info[d]) info[d] = { customer, startDay, endDay, reason };
      }
    }
    return info;
  }, [selectedVehicle, orgBookings, calendarMonth, calendarYear]);

  const blockedDays = Object.keys(vehicleBlockedInfo).map(Number);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // Helper: check if any blocked day exists between two days (exclusive)
  const hasBlockedDaysBetween = (startDay: number, endDay: number) => {
    return blockedDays.some(bd => bd > startDay && bd < endDay);
  };

  const handleCalendarDayClick = (day: number) => {
    if (!day) return;
    if (blockedDays.includes(day)) return;
    const dateStr = calendarDateStr(day);
    if (calendarSelectMode === 'pickup') {
      setPickupDate(dateStr);
      if (returnDate && dateStr >= returnDate) {
        setReturnDate('');
      } else if (returnDate) {
        const returnDay = parseInt(returnDate.split('-')[2], 10);
        const returnMonth = parseInt(returnDate.split('-')[1], 10) - 1;
        const returnYear = parseInt(returnDate.split('-')[0], 10);
        if (returnYear === calendarYear && returnMonth === calendarMonth && hasBlockedDaysBetween(day, returnDay)) {
          setReturnDate('');
        }
      }
      setCalendarSelectMode('return');
    } else {
      if (pickupDate && dateStr <= pickupDate) {
        setPickupDate(dateStr);
        setReturnDate('');
        setCalendarSelectMode('return');
      } else {
        if (pickupDate) {
          const pickupDay = parseInt(pickupDate.split('-')[2], 10);
          const pickupMonth = parseInt(pickupDate.split('-')[1], 10) - 1;
          const pickupYear = parseInt(pickupDate.split('-')[0], 10);
          if (pickupYear === calendarYear && pickupMonth === calendarMonth && hasBlockedDaysBetween(pickupDay, day)) {
            return;
          }
        }
        setReturnDate(dateStr);
        setCalendarSelectMode('pickup');
      }
    }
  };

  // V4.6.67 — Conflict detection now respects calendarYear and walks the
  // full range across month boundaries by comparing date strings rather than
  // raw day numbers.
  const rangeHasConflict = useMemo(() => {
    if (!pickupDate || !returnDate || !selectedVehicle) return false;
    if (returnDate < pickupDate) return false;
    for (const dayKey of Object.keys(vehicleBlockedInfo)) {
      const day = parseInt(dayKey, 10);
      if (Number.isNaN(day)) continue;
      const ds = calendarDateStr(day);
      if (ds >= pickupDate && ds <= returnDate) return true;
    }
    return false;
  }, [pickupDate, returnDate, vehicleBlockedInfo, calendarYear, calendarMonth, selectedVehicle]);

  // V4.6.67 — Gating rules for the new step order
  //   1: Vehicle  → must be selected
  //   2: Period   → pickup + return + non-empty range, no calendar conflict
  //                 (pickupStation is auto-derived from the vehicle so it is
  //                 NOT part of the gate; see below.)
  //   3: Extras   → always proceedable (everything is optional)
  //   4: Customer → must be selected
  //   5: Checkout → both consents must be ticked
  const canProceed = () => {
    switch (currentStep) {
      case 1: {
        if (!selectedVehicle) return false;
        return !isBookingVehicleHardBlocked(
          selectedVehicle,
          selectedVehicleHealth,
          vehicleHasTariff(selectedVehicle.id),
          catalogLoading,
        );
      }
      case 2: {
        if (!pickupDate || !returnDate || rentalDays <= 0) return false;
        if (returnDate <= pickupDate) return false;
        if (rangeHasConflict) return false;
        return true;
      }
      case 3:
        return true;
      case 4:
        if (!selectedCustomer) return false;
        if (
          customerEligibility &&
          !customerEligibility.canCreatePendingBooking &&
          customerEligibility.blockingReasons.length > 0
        ) {
          return false;
        }
        return true;
      case 5:
        return agbAccepted && privacyAccepted && hasPrice && !priceLoading && Boolean(priceSim?.quoteId);
      default:
        return false;
    }
  };

  const handleSelectVehicle = (v: VehicleData) => {
    const health = pickerHealthMap.get(v.id) ?? null;
    if (isBookingVehicleHardBlocked(v, health, vehicleHasTariff(v.id), catalogLoading)) return;
    setSelectedVehicle(v);
    const defaultPickup = resolveDefaultPickupStationId(
      orgStations,
      v.homeStationId ?? v.stationId,
    );
    if (defaultPickup) {
      setPickupStationId(defaultPickup);
      if (sameReturnStation) setReturnStationId(defaultPickup);
    }
  };

  const handleResetVehicleFilters = () => {
    setVehicleBrandFilter('all');
    setVehicleStationFilter('all');
    setVehicleFuelFilter('all');
  };

  const handleResetBooking = () => {
    setRedirectCountdown(null);
    setBookingConfirmed(false);
    setCreatedBookingRef(null);
    setCurrentStep(1);
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setAgbAccepted(false);
    setPrivacyAccepted(false);
    setExtras([]);
    setSelectedMileagePackage(null);
    setSelectedInsurances([]);
    setDiscountPercent(0);
    setInvoiceGenerated(false);
    setContractGenerated(false);
    setGeneratingInvoice(false);
    setGeneratingContract(false);
    setQuickViewDoc(null);
  };

  const summaryPanelProps = {
    selectedVehicle,
    selectedCustomer,
    pickupDate,
    returnDate,
    pickupTime,
    returnTime,
    rentalDays,
    displayRentalDays,
    pickupStationId,
    returnStationId,
    sameReturnStation,
    orgStations,
    selectedMileagePackage,
    selectedInsurances,
    extras,
    mileagePackages,
    insuranceOptions,
    extraOptions,
    noTariffForVehicle,
    canCalculatePrice,
    priceLoading,
    priceError,
    priceSim,
    pricingContext,
    totalFreeKm,
    extraKmPrice,
    mileagePkgKm,
    freeKmPerDay,
    baseFreeKm,
    subtotalNet,
    tax,
    taxRatePercent: resolvedTaxRatePercent,
    grandTotal,
    depositAmount,
    pricingCurrency,
    isDarkMode,
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:space-y-5">
      <PageHeader
        title="Neue Buchung"
        icon={<Icon name="calendar" className="w-4 h-4" />}
        className="min-w-0 w-full max-w-full"
        titleClassName="break-words"
        actions={
          <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto">
            {selectedCustomer && currentStep > 1 && (
              <div className="hidden min-w-0 max-w-[min(100%,12rem)] items-center gap-2 rounded-lg border surface-premium border-border px-2.5 py-2 sm:flex sm:max-w-[14rem]">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs sq-tone-brand">
                  {selectedCustomer.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">{selectedCustomer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{selectedCustomer.city}</p>
                </div>
              </div>
            )}
            <button
              onClick={onBack}
              aria-label="Back"
              className="shrink-0 rounded-lg border p-2.5 transition-all duration-200 hover:shadow-md surface-premium border-border text-muted-foreground hover:bg-muted"
            >
              <Icon name="arrow-left" className="h-5 w-5" />
            </button>
          </div>
        }
      />

      <BookingStepper
        currentStep={currentStep}
        onStepSelect={(stepId) => setCurrentStep(stepId)}
      />

      {selectedVehicle && currentStep >= 1 && currentStep <= 5 && (
        <BookingVehiclePreflightBanner
          vehicle={selectedVehicle}
          health={selectedVehicleHealth}
          hasTariff={selectedVehicleHasTariff}
          catalogLoading={catalogLoading}
          rangeHasConflict={currentStep >= 2 && rangeHasConflict}
        />
      )}

      {/* Step Content */}
      {bookingConfirmed ? (
        <BookingSuccessState
          selectedCustomer={selectedCustomer}
          selectedVehicle={selectedVehicle}
          rentalDays={rentalDays}
          grandTotal={grandTotal}
          pricingCurrency={pricingCurrency}
          bookingRef={createdBookingRef}
          redirectCountdown={redirectCountdown}
          onBack={onBack}
          onNewBooking={handleResetBooking}
        />
      ) : (
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Main Content - 2 cols on desktop */}
          <div className="min-w-0 space-y-5 lg:col-span-2">
            {currentStep === 4 && (
              <CustomerStep
                orgId={orgId}
                customerSearch={customerSearch}
                onCustomerSearchChange={setCustomerSearch}
                customersLoading={customersLoading}
                customersError={customersError}
                filteredCustomers={filteredCustomers}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={setSelectedCustomer}
                customerEligibility={customerEligibility}
                customerDetailOpen={customerDetailOpen}
                customerDetailTarget={customerDetailTarget}
                onOpenCustomerDetail={(c) => {
                  setCustomerDetailTarget(c);
                  setCustomerDetailOpen(true);
                }}
                onCloseCustomerDetail={() => {
                  setCustomerDetailOpen(false);
                  setCustomerDetailTarget(null);
                }}
                mapToDetailCustomer={mapToDetailCustomer}
                isAddCustomerOpen={isAddCustomerOpen}
                onOpenAddCustomer={() => {
                  setIsAddCustomerOpen(true);
                  resetAddCustomerForm();
                }}
                onCloseAddCustomer={() => {
                  setIsAddCustomerOpen(false);
                  resetAddCustomerForm();
                }}
                addStep={addStep}
                onAddStepChange={setAddStep}
                newCustomer={newCustomer}
                onNewCustomerChange={setNewCustomer}
                verificationPlan={verificationPlan}
                onVerificationPlanChange={setVerificationPlan}
                pendingDocFiles={pendingDocFiles}
                onPendingDocFileChange={(type, file) =>
                  setPendingDocFiles((prev) => ({
                    ...prev,
                    [type]: file ?? undefined,
                  }))
                }
                formErrors={formErrors}
                draftCustomerId={draftCustomerId}
                isEnsuringDraft={isEnsuringDraft}
                wizardEligibility={wizardEligibility}
                onRefreshWizardEligibility={() => void refreshWizardEligibility()}
                onAddNextStep={() => void handleAddNextStep()}
                onSubmitNewCustomer={handleSubmitNewCustomer}
                isSavingCustomer={isSavingCustomer}
              />
            )}

            {currentStep === 1 && (
              <BookingStepCard>
                <VehiclePickerStep
                  vehicles={availableVehicles}
                  selectedVehicleId={selectedVehicle?.id ?? null}
                  onSelectVehicle={handleSelectVehicle}
                  search={vehicleSearch}
                  onSearchChange={setVehicleSearch}
                  brandFilter={vehicleBrandFilter}
                  onBrandFilterChange={setVehicleBrandFilter}
                  stationFilter={vehicleStationFilter}
                  onStationFilterChange={setVehicleStationFilter}
                  fuelFilter={vehicleFuelFilter}
                  onFuelFilterChange={setVehicleFuelFilter}
                  statusFilter={vehicleStatusFilter}
                  onStatusFilterChange={setVehicleStatusFilter}
                  onResetFilters={handleResetVehicleFilters}
                  brands={brands}
                  stationOptions={stationOptions}
                  fuelTypes={fuelTypes}
                  pickerHealthMap={pickerHealthMap}
                  catalogLoading={catalogLoading}
                  vehicleHasTariff={vehicleHasTariff}
                  getDailyRateLabel={getVehicleDailyRateLabel}
                  isDarkMode={isDarkMode}
                />
              </BookingStepCard>
            )}

            {currentStep === 3 && (
              <ExtrasStep
                hasResolvedPricing={Boolean(pricingContext)}
                mileagePackages={mileagePackages}
                insuranceOptions={insuranceOptions}
                extraOptions={extraOptions}
                selectedMileagePackage={selectedMileagePackage}
                selectedInsurances={selectedInsurances}
                extras={extras}
                taxRatePercent={resolvedTaxRatePercent}
                displayRentalDays={displayRentalDays}
                hasPrice={hasPrice}
                extrasTotal={extrasTotal}
                pricingCurrency={pricingCurrency}
                onSelectMileagePackage={setSelectedMileagePackage}
                onToggleInsurance={(id) =>
                  setSelectedInsurances((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
                  )
                }
                onToggleExtra={(id) =>
                  setExtras((prev) =>
                    prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
                  )
                }
              />
            )}

            {currentStep === 2 && (
              <PeriodStep
                pickupDate={pickupDate}
                returnDate={returnDate}
                pickupTime={pickupTime}
                returnTime={returnTime}
                showPickupTimePicker={showPickupTimePicker}
                showReturnTimePicker={showReturnTimePicker}
                pickupStationId={pickupStationId}
                returnStationId={returnStationId}
                sameReturnStation={sameReturnStation}
                orgStations={orgStations}
                calendarMonth={calendarMonth}
                calendarYear={calendarYear}
                calendarSelectMode={calendarSelectMode}
                selectedVehicle={selectedVehicle}
                blockedDays={blockedDays}
                vehicleBlockedInfo={vehicleBlockedInfo}
                hoveredDay={hoveredDay}
                rangeHasConflict={rangeHasConflict}
                onPickupDateChange={setPickupDate}
                onReturnDateChange={setReturnDate}
                onPickupTimeChange={setPickupTime}
                onReturnTimeChange={setReturnTime}
                onShowPickupTimePickerChange={setShowPickupTimePicker}
                onShowReturnTimePickerChange={setShowReturnTimePicker}
                onPickupStationChange={setPickupStationId}
                onReturnStationChange={setReturnStationId}
                onSameReturnStationChange={setSameReturnStation}
                onCalendarMonthChange={setCalendarMonth}
                onCalendarYearChange={setCalendarYear}
                onCalendarSelectModeChange={setCalendarSelectMode}
                onHoveredDayChange={setHoveredDay}
                onCalendarDayClick={handleCalendarDayClick}
              />
            )}

            {currentStep === 5 && (
              <CheckoutStep
                selectedCustomer={selectedCustomer}
                selectedVehicle={selectedVehicle}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                discountPercent={discountPercent}
                onDiscountPercentChange={setDiscountPercent}
                discountAmount={discountAmount}
                agbAccepted={agbAccepted}
                privacyAccepted={privacyAccepted}
                onAgbAcceptedChange={setAgbAccepted}
                onPrivacyAcceptedChange={setPrivacyAccepted}
                invoiceGenerated={invoiceGenerated}
                contractGenerated={contractGenerated}
                generatingInvoice={generatingInvoice}
                generatingContract={generatingContract}
                onGenerateInvoice={() => {
                  setGeneratingInvoice(true);
                  setTimeout(() => {
                    setGeneratingInvoice(false);
                    setInvoiceGenerated(true);
                  }, 1500);
                }}
                onGenerateContract={() => {
                  setGeneratingContract(true);
                  setTimeout(() => {
                    setGeneratingContract(false);
                    setContractGenerated(true);
                  }, 2000);
                }}
                quickViewDoc={quickViewDoc}
                onQuickViewDocChange={setQuickViewDoc}
                pickupDate={pickupDate}
                returnDate={returnDate}
                pickupTime={pickupTime}
                returnTime={returnTime}
                rentalDays={rentalDays}
                displayRentalDays={displayRentalDays}
                taxRatePercent={resolvedTaxRatePercent}
                subtotal={subtotal}
                extrasTotal={extrasTotal}
                tax={tax}
                grandTotal={grandTotal}
                depositAmount={depositAmount}
                totalFreeKm={totalFreeKm}
                dailyRateGross={dailyRateGross}
                pricingCurrency={pricingCurrency}
              />
            )}
          </div>

          <div className="min-w-0 space-y-5">
            <BookingSidebar
              {...summaryPanelProps}
              rentalEligibility={rentalEligibility}
              rentalEligibilityLoading={rentalEligibilityLoading}
              rentalEligibilityError={rentalEligibilityError}
              onCompleteCustomerData={() => {
                if (!selectedCustomer) return;
                setCustomerDetailTarget(selectedCustomer);
                setCustomerDetailOpen(true);
              }}
              onChooseAnotherVehicle={() => setCurrentStep(1)}
            />
            <MobileBookingFooter
              currentStep={currentStep}
              canProceed={canProceed()}
              isSavingBooking={isSavingBooking}
              onBackStep={() => setCurrentStep((s) => (s - 1) as BookingWizardStepId)}
              onNextStep={() => setCurrentStep((s) => (s + 1) as BookingWizardStepId)}
              onConfirm={handleConfirm}
            />
          </div>

        </div>
      )}
    </div>
  );
}
