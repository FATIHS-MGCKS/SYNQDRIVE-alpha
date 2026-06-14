import { X, Sparkles, ChevronDown, ChevronUp, Save, AlertCircle, CheckCircle2, XCircle, Loader2, Bot, Pencil, Radio, Search, Link2, Shield, Camera } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api, streamAiSpecs, streamAiTireSpecs } from '../../lib/api';
import type { AgentStep, AiSpecsStreamEvent, AiTireSpecsStreamEvent, HmAvailabilityDto } from '../../lib/api';
import type { DimoVehicle, Organization, RegisteredVehicle } from '../data/platform-data';
import { aiWorkerData, getAiWorkerKey, generateId } from '../data/platform-data';
import {
  ExteriorImagesEditor,
  flushBufferedExteriorImages,
  type ExteriorImageBufferEntry,
} from './ExteriorImagesEditor';

interface VehicleRegistrationModalProps {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  dimoVehicle?: DimoVehicle;
  existingVehicle?: RegisteredVehicle;
  organizations: Organization[];
  onRegister: (vehicle: RegisteredVehicle) => void | Promise<void>;
  onUpdate?: (vehicle: RegisteredVehicle) => void | Promise<void>;
}

function inferDefaultFuelType(d: DimoVehicle): string {
  if (d.battery != null && d.fuelLevel == null) return 'Electric';
  const pt = (d.powertrainType || '').toUpperCase();
  if (pt.includes('PHEV') || pt.includes('PLUGIN')) return 'Plugin Hybrid';
  if (pt.includes('HEV') || pt === 'HYBRID') return 'Hybrid';
  if (pt === 'BEV' || pt === 'ELECTRIC') return 'Electric';
  return 'Gasoline';
}

const HIGH_MOBILITY_SIGNALS = [
  { id: 'dashboard_lights', label: 'Dashboard Lights' },
  { id: 'brake_lining_warning', label: 'Brake Lining Pre-Warning' },
  { id: 'oil_level', label: 'Oil Level' },
  { id: 'limp_mode', label: 'Limp Mode' },
  { id: 'distance_next_service', label: 'Distance to Next Service' },
  { id: 'time_next_service', label: 'Time to Next Service' },
  { id: 'tire_pressure', label: 'Tire Pressure' },
  { id: 'tire_pressure_statuses', label: 'Tire Pressure Statuses' },
  { id: 'parking_brake_status', label: 'Parking Brake Status' },
] as const;

export function VehicleRegistrationModal({ isDarkMode, isOpen, onClose, dimoVehicle, existingVehicle, organizations, onRegister, onUpdate }: VehicleRegistrationModalProps) {
  const isEditMode = !!existingVehicle;

  const vehicleIdentity = isEditMode
    ? { vin: existingVehicle.vin, make: existingVehicle.make, model: existingVehicle.model, year: existingVehicle.year, odometer: existingVehicle.mileage }
    : dimoVehicle
      ? { vin: dimoVehicle.vin, make: dimoVehicle.make, model: dimoVehicle.model, year: dimoVehicle.year, odometer: dimoVehicle.odometer }
      : { vin: '', make: '', model: '', year: 0, odometer: 0 };

  const [expandedSections, setExpandedSections] = useState<string[]>(['assignment', 'technical', 'battery', 'brakes', 'tires', 'service', 'history', 'exterior', 'hm', 'hardware']);
  const [aiLoading, setAiLoading] = useState(!isEditMode);
  const [aiDegraded, setAiDegraded] = useState(false);
  const [aiErrorDetail, setAiErrorDetail] = useState('');
  const [aiSteps, setAiSteps] = useState<AgentStep[]>([]);
  const [aiLiveStep, setAiLiveStep] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Assignment
  const [organizationId, setOrganizationId] = useState('');
  const [station, setStation] = useState('');
  const [vehicleType, setVehicleType] = useState('SEDAN');
  const [fuelType, setFuelType] = useState('Gasoline');
  const [licensePlate, setLicensePlate] = useState('');
  const [operationalStatus, setOperationalStatus] = useState('Active');
  const [notes, setNotes] = useState('');

  // V3 Hardware
  const [hardwareType, setHardwareType] = useState<'LTE_R1' | 'SMART5' | 'UNKNOWN'>('UNKNOWN');

  // Technical
  const [drivetrain, setDrivetrain] = useState('');
  const [curbWeight, setCurbWeight] = useState('');
  const [idleRpm, setIdleRpm] = useState('');
  const [maxRpm, setMaxRpm] = useState('');
  const [brakeForceDistribution, setBrakeForceDistribution] = useState('');
  const [frontToRearWeightDistribution, setFrontToRearWeightDistribution] = useState('');

  // LV Battery (12V auxiliary)
  const [batteryType, setBatteryType] = useState('');
  const [batteryAmpere, setBatteryAmpere] = useState('');
  const [batteryVolt, setBatteryVolt] = useState('');
  const [lvBatteryChemistry, setLvBatteryChemistry] = useState('');

  // HV Battery (EV / PHEV traction)
  const [hvBatteryCapacityKwh, setHvBatteryCapacityKwh] = useState('');
  const [hvBatteryPresent, setHvBatteryPresent] = useState('');
  const [hvBatteryChemistry, setHvBatteryChemistry] = useState('');
  const [hvBatteryCellFormat, setHvBatteryCellFormat] = useState('');
  const [hvBatteryGrossCapacityKwh, setHvBatteryGrossCapacityKwh] = useState('');
  const [hvBatteryUsableCapacityKwh, setHvBatteryUsableCapacityKwh] = useState('');
  const [hvBatteryNominalVoltage, setHvBatteryNominalVoltage] = useState('');
  const [hvBatteryArchitecture, setHvBatteryArchitecture] = useState('');
  const [hvBatteryThermalManagement, setHvBatteryThermalManagement] = useState('');
  const [hvBatteryWarrantyYears, setHvBatteryWarrantyYears] = useState('');
  const [hvBatteryWarrantyKm, setHvBatteryWarrantyKm] = useState('');
  const [acOnboardChargerKw, setAcOnboardChargerKw] = useState('');
  const [dcFastChargeMaxKw, setDcFastChargeMaxKw] = useState('');

  // Fuel tank
  const [tankCapacityLiters, setTankCapacityLiters] = useState('');

  // Engine
  const [engineDisplacementCc, setEngineDisplacementCc] = useState('');
  const [cylinderCount, setCylinderCount] = useState('');

  // Brakes
  const [brakeFrontRotorDiameter, setBrakeFrontRotorDiameter] = useState('');
  const [brakeFrontRotorWidth, setBrakeFrontRotorWidth] = useState('');
  const [brakeFrontPadThickness, setBrakeFrontPadThickness] = useState('');
  const [brakeBackRotorDiameter, setBrakeBackRotorDiameter] = useState('');
  const [brakeBackRotorWidth, setBrakeBackRotorWidth] = useState('');
  const [brakeBackPadThickness, setBrakeBackPadThickness] = useState('');

  // Tires
  const [tireFrontDimension, setTireFrontDimension] = useState('');
  const [tireFrontBrandModel, setTireFrontBrandModel] = useState('');
  const [tireFrontSeason, setTireFrontSeason] = useState('All Season');
  const [tireFrontDot, setTireFrontDot] = useState('');
  const [tireFrontLoadIndex, setTireFrontLoadIndex] = useState('');
  const [tireFrontSpeedIndex, setTireFrontSpeedIndex] = useState('');
  const [tireBackDimension, setTireBackDimension] = useState('');
  const [tireBackBrandModel, setTireBackBrandModel] = useState('');
  const [tireBackSeason, setTireBackSeason] = useState('All Season');
  const [tireBackDot, setTireBackDot] = useState('');
  const [tireBackLoadIndex, setTireBackLoadIndex] = useState('');
  const [tireBackSpeedIndex, setTireBackSpeedIndex] = useState('');
  const [treadDepthFL, setTreadDepthFL] = useState('');
  const [treadDepthFR, setTreadDepthFR] = useState('');
  const [treadDepthBL, setTreadDepthBL] = useState('');
  const [treadDepthBR, setTreadDepthBR] = useState('');
  const [tireCondition, setTireCondition] = useState<'' | 'NEW_INSTALLED' | 'ALREADY_MOUNTED'>('');

  // AI Tire Spec agent
  const [tireAiLoading, setTireAiLoading] = useState(false);
  const [tireAiResult, setTireAiResult] = useState<Record<string, unknown> | null>(null);
  const [tireAiError, setTireAiError] = useState('');
  const [tireAiSteps, setTireAiSteps] = useState<AgentStep[]>([]);
  const [tireAiCountdown, setTireAiCountdown] = useState(0);
  const [tireAiResultExpanded, setTireAiResultExpanded] = useState(false);
  const tireAiAbortRef = useRef<AbortController | null>(null);
  const tireAiCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Service & Maintenance
  const [serviceIntervals, setServiceIntervals] = useState('');
  const [serviceIntervalManufacturerKm, setServiceIntervalManufacturerKm] = useState('');
  const [serviceIntervalManufacturerMonths, setServiceIntervalManufacturerMonths] = useState('');
  const [oilChangeIntervalKm, setOilChangeIntervalKm] = useState('');
  const [oilChangeIntervalMonths, setOilChangeIntervalMonths] = useState('');

  // Service History
  const [lastTuev, setLastTuev] = useState('');
  const [lastBokraft, setLastBokraft] = useState('');
  const [lastInspection, setLastInspection] = useState('');
  const [lastOilChange, setLastOilChange] = useState('');
  const [lastBrakePadChange, setLastBrakePadChange] = useState('');
  const [lastBrakeRotorChange, setLastBrakeRotorChange] = useState('');

  // High Mobility — frontend-only signal toggles (legacy, kept for state compat)
  const [hmEnabled, setHmEnabled] = useState(false);
  const [hmSignals, setHmSignals] = useState<Record<string, boolean>>(
    Object.fromEntries(HIGH_MOBILITY_SIGNALS.map(s => [s.id, false])),
  );

  // High Mobility — backend availability state (Phase 1)
  const [hmAvailability, setHmAvailability] = useState<HmAvailabilityDto | null>(null);
  const [hmAvailabilityLoading, setHmAvailabilityLoading] = useState(false);
  const [hmActivating, setHmActivating] = useState(false);
  const [hmActivated, setHmActivated] = useState(false);

  // V4.7.50 — Exterior photos (Damage Map). In edit mode the editor talks to
  // the API directly via the existing vehicleId. In create mode we buffer
  // the chosen files in memory and flush them after the registration POST
  // returns the new vehicleId.
  const [bufferedExteriorImages, setBufferedExteriorImages] = useState<ExteriorImageBufferEntry[]>([]);

  const prefillFromExisting = (v: RegisteredVehicle) => {
    setHardwareType((v.hardwareType as 'LTE_R1' | 'SMART5' | 'UNKNOWN') ?? 'UNKNOWN');
    setOrganizationId(v.organizationId);
    setStation(v.station);
    setVehicleType(v.vehicleType || 'SEDAN');
    setFuelType(v.fuelType || 'Gasoline');
    setLicensePlate(v.licensePlate);
    setOperationalStatus(v.operationalStatus || 'Active');
    setNotes(v.notes);
    setDrivetrain(v.drivetrain || '');
    setCurbWeight(v.curbWeight);
    setIdleRpm(v.idleRpm);
    setMaxRpm(v.maxRpm);
    setBrakeForceDistribution(v.brakeForceDistribution || '');
    setFrontToRearWeightDistribution(v.frontToRearWeightDistribution || '');
    setBatteryType(v.batteryType);
    setBatteryAmpere(v.batteryAmpere);
    setBatteryVolt(v.batteryVolt);
    setLvBatteryChemistry(v.lvBatteryChemistry ?? '');
    setHvBatteryCapacityKwh(v.hvBatteryCapacityKwh);
    setHvBatteryPresent(v.hvBatteryPresent ?? '');
    setHvBatteryChemistry(v.hvBatteryChemistry ?? '');
    setHvBatteryCellFormat(v.hvBatteryCellFormat ?? '');
    setHvBatteryGrossCapacityKwh(v.hvBatteryGrossCapacityKwh ?? '');
    setHvBatteryUsableCapacityKwh(v.hvBatteryUsableCapacityKwh ?? '');
    setHvBatteryNominalVoltage(v.hvBatteryNominalVoltage ?? '');
    setHvBatteryArchitecture(v.hvBatteryArchitecture ?? '');
    setHvBatteryThermalManagement(v.hvBatteryThermalManagement ?? '');
    setHvBatteryWarrantyYears(v.hvBatteryWarrantyYears ?? '');
    setHvBatteryWarrantyKm(v.hvBatteryWarrantyKm ?? '');
    setAcOnboardChargerKw(v.acOnboardChargerKw ?? '');
    setDcFastChargeMaxKw(v.dcFastChargeMaxKw ?? '');
    setTankCapacityLiters(v.tankCapacityLiters ?? '');
    setEngineDisplacementCc(v.engineDisplacementCc ?? '');
    setCylinderCount(v.cylinderCount ?? '');
    setBrakeFrontRotorDiameter(v.brakeFrontRotorDiameter);
    setBrakeFrontRotorWidth(v.brakeFrontRotorWidth);
    setBrakeFrontPadThickness(v.brakeFrontPadThickness);
    setBrakeBackRotorDiameter(v.brakeBackRotorDiameter);
    setBrakeBackRotorWidth(v.brakeBackRotorWidth);
    setBrakeBackPadThickness(v.brakeBackPadThickness);
    setTireFrontDimension(v.tireFrontDimension);
    setTireFrontBrandModel(v.tireFrontBrandModel);
    setTireFrontSeason(v.tireFrontSeason || 'All Season');
    setTireFrontDot(v.tireFrontDot);
    setTireFrontLoadIndex(v.tireFrontLoadIndex);
    setTireFrontSpeedIndex(v.tireFrontSpeedIndex);
    setTireBackDimension(v.tireBackDimension);
    setTireBackBrandModel(v.tireBackBrandModel);
    setTireBackSeason(v.tireBackSeason || 'All Season');
    setTireBackDot(v.tireBackDot);
    setTireBackLoadIndex(v.tireBackLoadIndex);
    setTireBackSpeedIndex(v.tireBackSpeedIndex);
    setTreadDepthFL(v.treadDepthFL);
    setTreadDepthFR(v.treadDepthFR);
    setTreadDepthBL(v.treadDepthBL);
    setTreadDepthBR(v.treadDepthBR);
    setServiceIntervals(v.serviceIntervals);
    setServiceIntervalManufacturerKm(v.serviceIntervalManufacturerKm);
    setServiceIntervalManufacturerMonths(v.serviceIntervalManufacturerMonths);
    setOilChangeIntervalKm(v.oilChangeIntervalKm);
    setOilChangeIntervalMonths(v.oilChangeIntervalMonths);
    const toDateVal = (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
    };
    setLastTuev(toDateVal(v.lastTuev));
    setLastBokraft(toDateVal(v.lastBokraft));
    setLastInspection(toDateVal(v.lastInspection));
    setLastOilChange(toDateVal(v.lastOilChange));
    setLastBrakePadChange(toDateVal(v.lastBrakePadChange));
    setLastBrakeRotorChange(toDateVal(v.lastBrakeRotorChange));
  };

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode) {
      prefillFromExisting(existingVehicle);
      setAiLoading(false);
      return;
    }
    setOrganizationId('');
    setStation('');
    setVehicleType('SEDAN');
    setFuelType(dimoVehicle ? inferDefaultFuelType(dimoVehicle) : 'Gasoline');
    setLicensePlate('');
    setOperationalStatus('Active');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode ? existingVehicle?.id : dimoVehicle?.id]);

  const aiAbortRef = useRef<AbortController | null>(null);
  const aiGenerationRef = useRef(0);

  const applySpecs = (specs: Record<string, string | number | null>) => {
    const str = (v: string | number | null | undefined) => (v != null ? String(v) : '');
    const maybeSet = (setter: (v: string) => void, v: string | number | null | undefined) => { if (v != null) setter(str(v)); };
    // LV battery — support both new lvBattery* names and legacy names
    setBatteryType(str(specs.lvBatteryType ?? specs.batteryType));
    setBatteryAmpere(str(specs.lvBatteryAmpere ?? specs.batteryAmpere));
    setBatteryVolt(str(specs.lvBatteryVolt ?? specs.batteryVolt));
    maybeSet(setLvBatteryChemistry, specs.lvBatteryChemistry);
    // HV battery
    maybeSet(setHvBatteryPresent, specs.hvBatteryPresent != null ? String(specs.hvBatteryPresent) : null);
    maybeSet(setHvBatteryChemistry, specs.hvBatteryChemistry);
    maybeSet(setHvBatteryCellFormat, specs.hvBatteryCellFormat);
    maybeSet(setHvBatteryGrossCapacityKwh, specs.hvBatteryGrossCapacityKwh);
    maybeSet(setHvBatteryUsableCapacityKwh, specs.hvBatteryUsableCapacityKwh);
    maybeSet(setHvBatteryNominalVoltage, specs.hvBatteryNominalVoltage);
    maybeSet(setHvBatteryArchitecture, specs.hvBatteryArchitecture);
    maybeSet(setHvBatteryThermalManagement, specs.hvBatteryThermalManagement);
    maybeSet(setHvBatteryWarrantyYears, specs.hvBatteryWarrantyYears);
    maybeSet(setHvBatteryWarrantyKm, specs.hvBatteryWarrantyKm);
    maybeSet(setAcOnboardChargerKw, specs.acOnboardChargerKw);
    maybeSet(setDcFastChargeMaxKw, specs.dcFastChargeMaxKw);
    // Usable kWh → legacy hvBatteryCapacityKwh field
    const usableKwh = specs.hvBatteryUsableCapacityKwh ?? specs.hvBatteryCapacityKwh;
    if (usableKwh != null) setHvBatteryCapacityKwh(str(usableKwh));
    // Fuel tank
    maybeSet(setTankCapacityLiters, specs.tankCapacityLiters ?? specs.fuelTankCapacityLiters);
    // Engine
    maybeSet(setEngineDisplacementCc, specs.engineDisplacementCc);
    maybeSet(setCylinderCount, specs.cylinderCount);
    setBrakeFrontRotorDiameter(str(specs.frontRotorDiameterMm ?? specs.brakeFrontRotorDiameter));
    setBrakeFrontRotorWidth(str(specs.frontRotorWidthMm ?? specs.brakeFrontRotorWidth));
    setBrakeFrontPadThickness(str(specs.frontPadThicknessMm ?? specs.brakeFrontPadThickness));
    setBrakeBackRotorDiameter(str(specs.rearRotorDiameterMm ?? specs.brakeBackRotorDiameter));
    setBrakeBackRotorWidth(str(specs.rearRotorWidthMm ?? specs.brakeBackRotorWidth));
    setBrakeBackPadThickness(str(specs.rearPadThicknessMm ?? specs.brakeBackPadThickness));
    setIdleRpm(str(specs.idleRpm));
    setMaxRpm(str(specs.maxRpm));
    setCurbWeight(str(specs.curbWeightKg ?? specs.curbWeight));
    setDrivetrain(str(specs.drivetrain));
    setBrakeForceDistribution(str(specs.brakeForceDistribution));
    setFrontToRearWeightDistribution(str(specs.frontToRearWeightDistribution));
    const svcKm = str(specs.manufacturerServiceIntervalKm);
    const svcMo = str(specs.manufacturerServiceIntervalMonths);
    setServiceIntervalManufacturerKm(svcKm);
    setServiceIntervalManufacturerMonths(svcMo);
    const oilKm = str(specs.oilchangeIntervalKm);
    const oilMo = str(specs.oilchangeIntervalMonths);
    setOilChangeIntervalKm(oilKm);
    setOilChangeIntervalMonths(oilMo);
    const parts: string[] = [];
    if (svcKm || svcMo) parts.push(`Service: ${[svcKm && `${svcKm} km`, svcMo && `${svcMo} months`].filter(Boolean).join(' / ')}`);
    if (oilKm || oilMo) parts.push(`Oil: ${[oilKm && `${oilKm} km`, oilMo && `${oilMo} months`].filter(Boolean).join(' / ')}`);
    setServiceIntervals(parts.join('; ') || str(specs.serviceIntervals));
  };

  const handleFetchAi = () => {
    if (aiAbortRef.current) aiAbortRef.current.abort();
    const gen = ++aiGenerationRef.current;

    setAiLoading(true);
    setAiDegraded(false);
    setAiSteps([]);
    setAiErrorDetail('');
    setAiLiveStep('Verbindung zum KI-Agent...');

    const streamParams: Record<string, string | undefined> = {
      vin: vehicleIdentity.vin || undefined,
      make: vehicleIdentity.make || undefined,
      model: vehicleIdentity.model || undefined,
      year: vehicleIdentity.year ? String(vehicleIdentity.year) : undefined,
      fuelType: fuelType || undefined,
      powertrainType: dimoVehicle?.powertrainType ?? undefined,
    };
    if (dimoVehicle?.id) streamParams.dimoVehicleId = dimoVehicle.id;
    if (dimoVehicle?.tokenId != null) streamParams.tokenId = String(dimoVehicle.tokenId);

    const isStale = () => gen !== aiGenerationRef.current;

    const controller = streamAiSpecs(
      streamParams,
      (evt: AiSpecsStreamEvent) => {
        if (isStale()) return;
        switch (evt.event) {
          case 'step':
            setAiSteps(prev => {
              const existing = prev.findIndex(s => s.step === evt.data.step);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = evt.data;
                return next;
              }
              return [...prev, evt.data];
            });
            if (evt.data.status === 'working') {
              setAiLiveStep(evt.data.step + (evt.data.detail ? ` — ${evt.data.detail}` : ''));
            }
            break;
          case 'progress':
            setAiLiveStep(evt.data.content || 'Verarbeitung...');
            break;
          case 'result': {
            if (evt.data.success && !evt.data.degraded && evt.data.specs) {
              applySpecs(evt.data.specs);
            } else {
              setAiDegraded(true);
              const key = getAiWorkerKey(vehicleIdentity.make, vehicleIdentity.model);
              const local = aiWorkerData[key];
              if (local) applySpecs(local as unknown as Record<string, string | number | null>);
            }
            setAiLoading(false);
            break;
          }
          case 'error': {
            setAiDegraded(true);
            setAiErrorDetail(evt.data.message || 'Unbekannter Fehler');
            const key = getAiWorkerKey(vehicleIdentity.make, vehicleIdentity.model);
            const local = aiWorkerData[key];
            if (local) applySpecs(local as unknown as Record<string, string | number | null>);
            setAiLoading(false);
            break;
          }
        }
      },
      () => {
        if (!isStale()) setAiLoading(false);
      },
    );

    aiAbortRef.current = controller;
  };

  // Auto-start AI stream for new registrations with a known DIMO vehicle
  useEffect(() => {
    if (!isOpen || isEditMode || !dimoVehicle) {
      if (!isEditMode && !dimoVehicle) setAiLoading(false);
      return;
    }
    handleFetchAi();
    return () => { aiAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode, dimoVehicle?.id]);

  // Cleanup AI tire spec countdown on unmount
  useEffect(() => {
    return () => {
      if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
      tireAiAbortRef.current?.abort();
    };
  }, []);

  // Check HM Health availability when modal opens with a known VIN
  useEffect(() => {
    const vin = vehicleIdentity.vin?.trim();
    if (!isOpen || !vin) { setHmAvailability(null); return; }
    setHmAvailabilityLoading(true);
    api.highMobility.checkAvailability(vin)
      .then(res => {
        setHmAvailability(res);
        if (res.isLinked) setHmActivated(true);
      })
      .catch(() => setHmAvailability(null))
      .finally(() => setHmAvailabilityLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, vehicleIdentity.vin]);

  const tireAiCanFetch = !!(
    tireFrontBrandModel.trim() &&
    tireFrontDimension.trim() &&
    tireFrontLoadIndex.trim() &&
    tireFrontSpeedIndex.trim() &&
    vehicleIdentity.year
  );

  const handleFetchTireAi = useCallback(() => {
    if (tireAiAbortRef.current) tireAiAbortRef.current.abort();
    if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);

    setTireAiLoading(true);
    setTireAiResult(null);
    setTireAiError('');
    setTireAiSteps([]);
    setTireAiCountdown(60);
    setTireAiResultExpanded(false);

    const interval = setInterval(() => {
      setTireAiCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    tireAiCountdownRef.current = interval;

    const brandParts = tireFrontBrandModel.trim().split(/\s+/);
    const brand = brandParts[0] || '';
    const model = brandParts.slice(1).join(' ') || '';

    const controller = streamAiTireSpecs(
      {
        brand,
        model,
        year: String(vehicleIdentity.year || ''),
        tireSize: tireFrontDimension.trim(),
        loadIndex: tireFrontLoadIndex.trim(),
        speedIndex: tireFrontSpeedIndex.trim(),
      },
      (evt: AiTireSpecsStreamEvent) => {
        switch (evt.event) {
          case 'step':
            setTireAiSteps(prev => {
              const idx = prev.findIndex(s => s.step === evt.data.step);
              if (idx >= 0) { const n = [...prev]; n[idx] = evt.data; return n; }
              return [...prev, evt.data];
            });
            break;
          case 'progress':
            break;
          case 'result': {
            if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
            setTireAiCountdown(0);
            if (evt.data.success && evt.data.specs) {
              setTireAiResult(evt.data.specs);
              setTireAiResultExpanded(true);
            } else {
              setTireAiError('AI Tire Spec konnte nicht abgerufen werden.');
            }
            setTireAiLoading(false);
            break;
          }
          case 'error': {
            if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
            setTireAiCountdown(0);
            setTireAiError(evt.data.message || 'Unbekannter Fehler');
            setTireAiLoading(false);
            break;
          }
        }
      },
      () => {
        if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
        setTireAiLoading(false);
      },
    );

    tireAiAbortRef.current = controller;
  }, [tireFrontBrandModel, tireFrontDimension, tireFrontLoadIndex, tireFrontSpeedIndex, vehicleIdentity.year]);

  const toggleSection = (s: string) => setExpandedSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  if (!isOpen) return null;

  const inputClass = `w-full px-3 py-2 rounded-xl border text-sm transition-colors outline-none ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50 text-gray-200 focus:border-indigo-500/50 placeholder:text-gray-600' : 'bg-gray-50 border-gray-200/50 text-gray-700 focus:border-indigo-300 placeholder:text-gray-400'}`;
  const labelClass = `block text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`;
  const aiTag = <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ml-1 ${isDarkMode ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><Sparkles className="w-2.5 h-2.5" />AI</span>;
  const sectionHeader = (id: string, num: string, title: string, icon?: React.ReactNode) => (
    <button onClick={() => toggleSection(id)} className={`w-full flex items-center gap-3 py-3 px-1 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50'}`}>
      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${isDarkMode ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>{num}</span>
      {icon}
      <span className={`text-sm font-semibold flex-1 text-left ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{title}</span>
      {expandedSections.includes(id) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
    </button>
  );

  const orgName = organizations.find(o => o.id === organizationId)?.company_name || '';

  const buildVehicle = (): RegisteredVehicle => ({
    id: isEditMode ? existingVehicle.id : generateId('rv'),
    vehicleName: `${vehicleIdentity.make} ${vehicleIdentity.model}`,
    vin: vehicleIdentity.vin,
    make: vehicleIdentity.make,
    model: vehicleIdentity.model,
    year: vehicleIdentity.year,
    organizationId,
    organizationName: orgName,
    station,
    status: isEditMode ? existingVehicle.status : 'Available' as const,
    health: isEditMode ? existingVehicle.health : 'Good' as const,
    lastSignal: isEditMode ? existingVehicle.lastSignal : (dimoVehicle?.lastSignal ?? ''),
    online: isEditMode ? existingVehicle.online : (dimoVehicle?.connectionStatus === 'Connected' || false),
    fuelType, mileage: vehicleIdentity.odometer, licensePlate, vehicleType, operationalStatus, notes,
    batteryType, batteryAmpere, batteryVolt, lvBatteryChemistry,
    hvBatteryCapacityKwh, hvBatteryPresent, hvBatteryChemistry, hvBatteryCellFormat,
    hvBatteryGrossCapacityKwh, hvBatteryUsableCapacityKwh, hvBatteryNominalVoltage,
    hvBatteryArchitecture, hvBatteryThermalManagement,
    hvBatteryWarrantyYears, hvBatteryWarrantyKm,
    acOnboardChargerKw, dcFastChargeMaxKw,
    tankCapacityLiters,
    engineDisplacementCc, cylinderCount,
    tireFrontDimension, tireFrontBrandModel, tireFrontSeason, tireFrontDot, tireFrontLoadIndex, tireFrontSpeedIndex,
    tireBackDimension, tireBackBrandModel, tireBackSeason, tireBackDot, tireBackLoadIndex, tireBackSpeedIndex,
    treadDepthFL, treadDepthFR, treadDepthBL, treadDepthBR, tireCondition,
    aiTireSpec: tireAiResult || undefined,
    brakeFrontRotorDiameter, brakeFrontRotorWidth, brakeFrontPadThickness,
    brakeBackRotorDiameter, brakeBackRotorWidth, brakeBackPadThickness,
    idleRpm, maxRpm, drivetrain, brakeForceDistribution, frontToRearWeightDistribution,
    curbWeight, serviceIntervals,
    serviceIntervalManufacturerKm, serviceIntervalManufacturerMonths,
    oilChangeIntervalKm, oilChangeIntervalMonths,
    lastTuev, lastBokraft, lastInspection, lastOilChange, lastBrakePadChange, lastBrakeRotorChange,
    hardwareType,
  });

  const handleSubmit = async () => {
    if (!organizationId || submitting) return;
    setSubmitting(true);
    const rv = buildVehicle();
    try {
      if (isEditMode && onUpdate) {
        await Promise.resolve(onUpdate(rv));
      } else {
        await Promise.resolve(onRegister(rv));
        // V4.7.50 — flush buffered exterior photos (best-effort) once we
        // know the new vehicleId. We use the locally-generated id from
        // `buildVehicle()`; if the parent persisted under a different id
        // this will silently no-op for failed uploads, which the user can
        // re-do later from PlatformVehiclesView → Exterior Photos.
        if (bufferedExteriorImages.length > 0 && rv.id) {
          await flushBufferedExteriorImages(rv.id, bufferedExteriorImages);
        }
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleHmSignal = (id: string) => setHmSignals(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAllHmSignals = (on: boolean) => setHmSignals(Object.fromEntries(HIGH_MOBILITY_SIGNALS.map(s => [s.id, on])));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-start justify-center z-[100] pt-6 pb-6 overflow-y-auto">
      <div className={`w-full max-w-3xl mx-4 rounded-xl shadow-2xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>

        {/* ── Header ── */}
        <div className={`flex items-center justify-between px-8 py-5 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            {isEditMode && <Pencil className={`w-5 h-5 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-500'}`} />}
            <div>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {isEditMode ? 'Edit Registered Vehicle' : 'Register Vehicle'}
              </h2>
              <p className={`text-sm mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {vehicleIdentity.make} {vehicleIdentity.model} {vehicleIdentity.year}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><X className="w-5 h-5" /></button>
        </div>

        {/* ── AI Agent — prominent status panel + Fetch AI button ── */}
        <div className={`px-8 py-4 border-b ${
          aiLoading
            ? (isDarkMode ? 'bg-purple-950/40 border-purple-800/40' : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200/40')
            : aiDegraded
              ? (isDarkMode ? 'bg-amber-950/30 border-amber-800/30' : 'bg-gradient-to-r from-amber-50/80 to-orange-50/60 border-amber-200/40')
              : !aiLoading && aiSteps.length > 0
                ? (isDarkMode ? 'bg-emerald-950/30 border-emerald-800/30' : 'bg-gradient-to-r from-emerald-50/80 to-green-50/60 border-emerald-200/40')
                : (isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50' : 'bg-gradient-to-r from-purple-50/60 to-indigo-50/60 border-purple-200/30')
        }`}>

          {/* ── Row 1: Status badge + button ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Animated status indicator */}
              <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                aiLoading
                  ? (isDarkMode ? 'bg-purple-500/20' : 'bg-purple-100')
                  : aiDegraded
                    ? (isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100')
                    : aiSteps.length > 0
                      ? (isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100')
                      : (isDarkMode ? 'bg-neutral-700/60' : 'bg-gray-100')
              }`}>
                {aiLoading && (
                  <span className="absolute inset-0 rounded-xl animate-ping opacity-30 bg-purple-500" />
                )}
                {aiLoading
                  ? <Loader2 className="w-4.5 h-4.5 text-purple-500 animate-spin" />
                  : aiDegraded
                    ? <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                    : aiSteps.length > 0
                      ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                      : <Bot className="w-4.5 h-4.5 text-purple-500" />
                }
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>DIMO AI Agent</span>
                  {/* Status pill */}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    aiLoading
                      ? (isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700')
                      : aiDegraded
                        ? (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
                        : aiSteps.length > 0
                          ? (isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                          : (isDarkMode ? 'bg-neutral-700/60 text-gray-500' : 'bg-gray-200/80 text-gray-500')
                  }`}>
                    {aiLoading && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-500" /></span>}
                    {!aiLoading && aiDegraded && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    {!aiLoading && !aiDegraded && aiSteps.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {!aiLoading && !aiDegraded && aiSteps.length === 0 && <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />}
                    {aiLoading ? 'Arbeitet' : aiDegraded ? 'Fehler' : aiSteps.length > 0 ? 'Fertig' : 'Bereit'}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  {aiLoading
                    ? 'Der KI-Agent ruft Fahrzeugspezifikationen ab…'
                    : aiDegraded
                      ? 'Die KI-Anreicherung konnte nicht abgeschlossen werden.'
                      : aiSteps.length > 0
                        ? 'Fahrzeugdaten wurden erfolgreich geladen.'
                        : 'Fahrzeugdaten per KI-Agent automatisch ausfüllen.'}
                </p>
              </div>
            </div>

            {/* Fetch AI button */}
            <button
              onClick={handleFetchAi}
              disabled={aiLoading || (!vehicleIdentity.vin && !vehicleIdentity.make)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                aiLoading || (!vehicleIdentity.vin && !vehicleIdentity.make)
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
              } ${isDarkMode ? 'bg-purple-600/80 text-purple-100 hover:bg-purple-600' : 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-sm'}`}
            >
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {aiLoading ? 'AI lädt…' : aiSteps.length > 0 || aiDegraded ? 'Erneut abrufen' : 'Fetch AI Specs'}
            </button>
          </div>

          {/* ── Progress bar ── */}
          {(aiLoading || (!aiLoading && !aiDegraded && aiSteps.length > 0)) && (() => {
            const totalSteps = 4;
            const doneSteps = aiSteps.filter(s => s.status === 'done').length;
            const pct = aiLoading
              ? Math.max(8, Math.min(92, Math.round((doneSteps / totalSteps) * 85) + (aiSteps.some(s => s.status === 'working') ? 12 : 5)))
              : 100;
            const barColor = !aiLoading ? (isDarkMode ? 'bg-emerald-500' : 'bg-emerald-500') : (isDarkMode ? 'bg-purple-500/80' : 'bg-purple-500');
            const trackColor = !aiLoading ? (isDarkMode ? 'bg-emerald-900/30' : 'bg-emerald-100') : (isDarkMode ? 'bg-purple-900/40' : 'bg-purple-100');
            return (
              <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${trackColor}`}>
                <div className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            );
          })()}

          {/* ── Live activity feed (while loading) ── */}
          {aiLoading && aiLiveStep && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-purple-900/20 border border-purple-800/30' : 'bg-white/60 border border-purple-200/40'}`}>
              <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin shrink-0" />
              <span className={`text-xs font-medium truncate ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>{aiLiveStep}</span>
            </div>
          )}

          {/* ── Pipeline steps (visible when steps exist) ── */}
          {aiSteps.length > 0 && (
            <div className={`mt-3 rounded-xl border overflow-hidden ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700/40' : 'bg-white/50 border-gray-200/40'}`}>
              {aiSteps.map((s, i) => (
                <div key={i} className={`flex items-center gap-2.5 px-3 py-1.5 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-700/30' : 'border-t border-gray-100') : ''}`}>
                  {s.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  {s.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  {s.status === 'skipped' && <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  {s.status === 'working' && <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin shrink-0" />}
                  <span className={`text-xs font-medium flex-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{s.step}</span>
                  {s.detail && <span className={`text-[10px] shrink-0 ${s.status === 'error' ? 'text-red-500' : isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{s.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Error detail (when degraded / failed) ── */}
          {!aiLoading && aiDegraded && (
            <div className={`mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-xl ${isDarkMode ? 'bg-amber-900/20 border border-amber-800/30' : 'bg-amber-50/80 border border-amber-200/40'}`}>
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className={`text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                  KI-Anreicherung nicht verfügbar — Formular soweit möglich mit lokalen Daten vorausgefüllt.
                </p>
                {aiErrorDetail && (
                  <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-amber-500/60' : 'text-amber-600/60'}`}>{aiErrorDetail}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Success summary (when completed) ── */}
          {!aiLoading && !aiDegraded && aiSteps.length > 0 && (
            <div className={`mt-3 flex items-center gap-2.5 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50/80 border border-emerald-200/40'}`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className={`text-xs font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                Alle Felder mit {aiTag} wurden automatisch ausgefüllt. Du kannst die Werte manuell anpassen.
              </span>
            </div>
          )}
        </div>

        <div className="px-8 py-5 space-y-1 max-h-[72vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

          {/* ═══════════════════════════════════════════════
              SECTION 0 — Vehicle Identity (read-only)
             ═══════════════════════════════════════════════ */}
          <div className={`p-4 rounded-2xl border mb-4 ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700/40' : 'bg-gray-50/80 border-gray-200/40'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${isDarkMode ? 'bg-neutral-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>ID</span>
              <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Vehicle Identity</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${isDarkMode ? 'bg-neutral-700/60 text-gray-400' : 'bg-gray-200/80 text-gray-500'}`}>
                {isEditMode ? 'From Registration' : 'From DIMO'}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div><label className={labelClass}>VIN</label><input value={vehicleIdentity.vin} readOnly className={`${inputClass} opacity-60 cursor-not-allowed font-mono text-xs`} /></div>
              <div><label className={labelClass}>Make</label><input value={vehicleIdentity.make} readOnly className={`${inputClass} opacity-60 cursor-not-allowed`} /></div>
              <div><label className={labelClass}>Model</label><input value={vehicleIdentity.model} readOnly className={`${inputClass} opacity-60 cursor-not-allowed`} /></div>
              <div><label className={labelClass}>Year</label><input value={vehicleIdentity.year} readOnly className={`${inputClass} opacity-60 cursor-not-allowed`} /></div>
              <div><label className={labelClass}>Odometer</label><input value={`${(vehicleIdentity.odometer ?? 0).toLocaleString()} km`} readOnly className={`${inputClass} opacity-60 cursor-not-allowed`} /></div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
              SECTION 1 — Assignment & Operations
             ═══════════════════════════════════════════════ */}
          {sectionHeader('assignment', '1', 'Assignment & Operations')}
          {expandedSections.includes('assignment') && (
            <div className="grid grid-cols-2 gap-3 pl-1 pb-3">
              <div>
                <label className={labelClass}>Organization *</label>
                <select value={organizationId} onChange={e => setOrganizationId(e.target.value)} className={inputClass} disabled={isEditMode}>
                  <option value="">Select…</option>
                  {organizations.filter(o => o.status === 'Active' || o.status === 'Trial').map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Station</label><input value={station} onChange={e => setStation(e.target.value)} placeholder="e.g. Berlin Hbf" className={inputClass} /></div>
              <div><label className={labelClass}>License Plate</label><input value={licensePlate} onChange={e => setLicensePlate(e.target.value)} placeholder="e.g. B AB 1234" className={inputClass} /></div>
              <div>
                <label className={labelClass}>Fuel Type</label>
                <select value={fuelType} onChange={e => setFuelType(e.target.value)} className={inputClass}>
                  <option value="Electric">Electric</option><option value="Gasoline">Gasoline</option><option value="Diesel">Diesel</option>
                  <option value="Hybrid">Hybrid</option><option value="Plugin Hybrid">Plugin Hybrid</option><option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Vehicle Type</label>
                <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className={inputClass}>
                  <option value="SEDAN">Sedan</option><option value="SUV">SUV</option><option value="HATCHBACK">Hatchback</option>
                  <option value="WAGON">Wagon</option><option value="VAN">Van</option><option value="TRUCK">Truck</option>
                  <option value="COUPE">Sports / Coupé</option><option value="MINIVAN">Minivan</option><option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Operational Status</label>
                <select value={operationalStatus} onChange={e => setOperationalStatus(e.target.value)} className={inputClass}>
                  <option>Active</option><option>Inactive</option><option>Pending Setup</option>
                </select>
              </div>
              <div className="col-span-2"><label className={labelClass}>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="Optional notes…" /></div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 2 — Technical Vehicle Data
             ═══════════════════════════════════════════════ */}
          {sectionHeader('technical', '2', 'Technical Vehicle Data')}
          {expandedSections.includes('technical') && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pl-1 pb-3">
              <div>
                <label className={labelClass}>Drivetrain {aiTag}</label>
                <select value={drivetrain} onChange={e => setDrivetrain(e.target.value)} className={inputClass}>
                  <option value="">Unknown</option><option value="FWD">FWD</option><option value="RWD">RWD</option><option value="AWD">AWD</option><option value="4WD">4WD</option>
                </select>
              </div>
              <div><label className={labelClass}>Curb Weight (kg) {aiTag}</label><input value={curbWeight} onChange={e => setCurbWeight(e.target.value)} className={inputClass} placeholder="e.g. 1500" /></div>
              <div><label className={labelClass}>Tank Capacity (L)</label><input type="number" value={tankCapacityLiters} onChange={e => setTankCapacityLiters(e.target.value)} className={inputClass} placeholder="e.g. 54" /></div>
              <div><label className={labelClass}>Engine Displacement (cc) {aiTag}</label><input value={engineDisplacementCc} onChange={e => setEngineDisplacementCc(e.target.value)} className={inputClass} placeholder="e.g. 1998" /></div>
              <div><label className={labelClass}>Cylinder Count {aiTag}</label><input value={cylinderCount} onChange={e => setCylinderCount(e.target.value)} className={inputClass} placeholder="e.g. 4" /></div>
              <div><label className={labelClass}>Idle RPM {aiTag}</label><input value={idleRpm} onChange={e => setIdleRpm(e.target.value)} className={inputClass} placeholder="e.g. 750" /></div>
              <div><label className={labelClass}>Max RPM {aiTag}</label><input value={maxRpm} onChange={e => setMaxRpm(e.target.value)} className={inputClass} placeholder="e.g. 6500" /></div>
              <div><label className={labelClass}>Brake Force Dist. {aiTag}</label><input value={brakeForceDistribution} onChange={e => setBrakeForceDistribution(e.target.value)} className={inputClass} placeholder="e.g. 60/40 or 60" /></div>
              <div><label className={labelClass}>Weight Dist. (F/R) {aiTag}</label><input value={frontToRearWeightDistribution} onChange={e => setFrontToRearWeightDistribution(e.target.value)} className={inputClass} placeholder="e.g. 55/45" /></div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 3 — Battery (LV + HV)
             ═══════════════════════════════════════════════ */}
          {sectionHeader('battery', '3', 'Battery System')}
          {expandedSections.includes('battery') && (
            <div className="space-y-4 pl-1 pb-3">

              {/* LV Battery subsection */}
              <div>
                <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${isDarkMode ? 'bg-neutral-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>12V LV</span>
                  Low Voltage Auxiliary Battery
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div><label className={labelClass}>Type {aiTag}</label><input value={batteryType} onChange={e => setBatteryType(e.target.value)} className={inputClass} placeholder="e.g. AGM, EFB" /></div>
                  <div><label className={labelClass}>Chemistry {aiTag}</label><input value={lvBatteryChemistry} onChange={e => setLvBatteryChemistry(e.target.value)} className={inputClass} placeholder="e.g. Lead-Acid" /></div>
                  <div><label className={labelClass}>Capacity (Ah) {aiTag}</label><input value={batteryAmpere} onChange={e => setBatteryAmpere(e.target.value)} className={inputClass} placeholder="e.g. 70" /></div>
                  <div><label className={labelClass}>Voltage (V) {aiTag}</label><input value={batteryVolt} onChange={e => setBatteryVolt(e.target.value)} className={inputClass} placeholder="e.g. 12" /></div>
                </div>
              </div>

              {/* HV Battery subsection */}
              <div>
                <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    fuelType === 'Electric' || fuelType === 'Plugin Hybrid' || fuelType === 'Hybrid'
                      ? (isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                      : (isDarkMode ? 'bg-neutral-700 text-gray-500' : 'bg-gray-200 text-gray-400')
                  }`}>HV</span>
                  High Voltage Traction Battery
                  {!(fuelType === 'Electric' || fuelType === 'Plugin Hybrid' || fuelType === 'Hybrid') && (
                    <span className={`text-[9px] font-normal ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>— EV / PHEV / HEV only</span>
                  )}
                  {hvBatteryPresent === 'true' && <span className={`text-[9px] font-semibold ml-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>● Present</span>}
                  {hvBatteryPresent === 'false' && <span className={`text-[9px] font-semibold ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>● Not present</span>}
                </p>
                {(() => {
                  const isEv = fuelType === 'Electric' || fuelType === 'Plugin Hybrid' || fuelType === 'Hybrid';
                  const cls = `${inputClass} ${!isEv ? 'opacity-40 cursor-not-allowed' : ''}`;
                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div><label className={labelClass}>Usable Capacity (kWh) {aiTag}</label><input value={hvBatteryUsableCapacityKwh || hvBatteryCapacityKwh} onChange={e => { setHvBatteryUsableCapacityKwh(e.target.value); setHvBatteryCapacityKwh(e.target.value); }} disabled={!isEv} placeholder={isEv ? 'e.g. 75' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Gross Capacity (kWh) {aiTag}</label><input value={hvBatteryGrossCapacityKwh} onChange={e => setHvBatteryGrossCapacityKwh(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 82' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Nominal Voltage (V) {aiTag}</label><input value={hvBatteryNominalVoltage} onChange={e => setHvBatteryNominalVoltage(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 400' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Chemistry {aiTag}</label><input value={hvBatteryChemistry} onChange={e => setHvBatteryChemistry(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. NMC, LFP' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Cell Format {aiTag}</label><input value={hvBatteryCellFormat} onChange={e => setHvBatteryCellFormat(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. prismatic' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Architecture {aiTag}</label><input value={hvBatteryArchitecture} onChange={e => setHvBatteryArchitecture(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 400V, 800V' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Thermal Management {aiTag}</label><input value={hvBatteryThermalManagement} onChange={e => setHvBatteryThermalManagement(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. liquid-cooled' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>AC Charger (kW) {aiTag}</label><input value={acOnboardChargerKw} onChange={e => setAcOnboardChargerKw(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 11' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>DC Fast Charge (kW) {aiTag}</label><input value={dcFastChargeMaxKw} onChange={e => setDcFastChargeMaxKw(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 150' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Warranty (years) {aiTag}</label><input value={hvBatteryWarrantyYears} onChange={e => setHvBatteryWarrantyYears(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 8' : 'N/A'} className={cls} /></div>
                      <div><label className={labelClass}>Warranty (km) {aiTag}</label><input value={hvBatteryWarrantyKm} onChange={e => setHvBatteryWarrantyKm(e.target.value)} disabled={!isEv} placeholder={isEv ? 'e.g. 160000' : 'N/A'} className={cls} /></div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 4 — Brakes
             ═══════════════════════════════════════════════ */}
          {sectionHeader('brakes', '4', 'Brakes')}
          {expandedSections.includes('brakes') && (
            <div className="space-y-3 pl-1 pb-3">
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Front Axle</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>Rotor Ø (mm) {aiTag}</label><input value={brakeFrontRotorDiameter} onChange={e => setBrakeFrontRotorDiameter(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Rotor Width (mm) {aiTag}</label><input value={brakeFrontRotorWidth} onChange={e => setBrakeFrontRotorWidth(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Pad Thickness (mm) {aiTag}</label><input value={brakeFrontPadThickness} onChange={e => setBrakeFrontPadThickness(e.target.value)} className={inputClass} /></div>
              </div>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rear Axle</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>Rotor Ø (mm) {aiTag}</label><input value={brakeBackRotorDiameter} onChange={e => setBrakeBackRotorDiameter(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Rotor Width (mm) {aiTag}</label><input value={brakeBackRotorWidth} onChange={e => setBrakeBackRotorWidth(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Pad Thickness (mm) {aiTag}</label><input value={brakeBackPadThickness} onChange={e => setBrakeBackPadThickness(e.target.value)} className={inputClass} /></div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 5 — Tires & Tread
             ═══════════════════════════════════════════════ */}
          {sectionHeader('tires', '5', 'Tires & Tread Depth')}
          {expandedSections.includes('tires') && (
            <div className="space-y-4 pl-1 pb-3">
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Front Axle</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Dimension</label><input value={tireFrontDimension} onChange={e => setTireFrontDimension(e.target.value)} className={inputClass} placeholder="235/45 R19" /></div>
                <div><label className={labelClass}>Brand & Model</label><input value={tireFrontBrandModel} onChange={e => setTireFrontBrandModel(e.target.value)} className={inputClass} placeholder="Pirelli P Zero" /></div>
                <div>
                  <label className={labelClass}>Season</label>
                  <select value={tireFrontSeason} onChange={e => setTireFrontSeason(e.target.value)} className={inputClass}><option>Summer</option><option>Winter</option><option>All Season</option></select>
                </div>
                <div><label className={labelClass}>DOT <span className="font-normal opacity-60">(KWYY)</span></label><input value={tireFrontDot} onChange={e => setTireFrontDot(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className={inputClass} placeholder="2524" maxLength={4} /></div>
                <div><label className={labelClass}>Load Index</label><input value={tireFrontLoadIndex} onChange={e => setTireFrontLoadIndex(e.target.value)} className={inputClass} placeholder="94" /></div>
                <div><label className={labelClass}>Speed Index</label><input value={tireFrontSpeedIndex} onChange={e => setTireFrontSpeedIndex(e.target.value)} className={inputClass} placeholder="V" /></div>
              </div>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rear Axle</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Dimension</label><input value={tireBackDimension} onChange={e => setTireBackDimension(e.target.value)} className={inputClass} placeholder="235/45 R19" /></div>
                <div><label className={labelClass}>Brand & Model</label><input value={tireBackBrandModel} onChange={e => setTireBackBrandModel(e.target.value)} className={inputClass} placeholder="Pirelli P Zero" /></div>
                <div>
                  <label className={labelClass}>Season</label>
                  <select value={tireBackSeason} onChange={e => setTireBackSeason(e.target.value)} className={inputClass}><option>Summer</option><option>Winter</option><option>All Season</option></select>
                </div>
                <div><label className={labelClass}>DOT <span className="font-normal opacity-60">(KWYY)</span></label><input value={tireBackDot} onChange={e => setTireBackDot(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className={inputClass} placeholder="2524" maxLength={4} /></div>
                <div><label className={labelClass}>Load Index</label><input value={tireBackLoadIndex} onChange={e => setTireBackLoadIndex(e.target.value)} className={inputClass} placeholder="94" /></div>
                <div><label className={labelClass}>Speed Index</label><input value={tireBackSpeedIndex} onChange={e => setTireBackSpeedIndex(e.target.value)} className={inputClass} placeholder="V" /></div>
              </div>

              {/* ── AI Tire Spec Agent ── */}
              <div className={`rounded-2xl border p-4 ${
                tireAiLoading
                  ? (isDarkMode ? 'bg-cyan-950/30 border-cyan-800/40' : 'bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-200/40')
                  : tireAiResult
                    ? (isDarkMode ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-gradient-to-r from-emerald-50/80 to-green-50/60 border-emerald-200/40')
                    : tireAiError
                      ? (isDarkMode ? 'bg-red-950/20 border-red-800/30' : 'bg-red-50/80 border-red-200/40')
                      : (isDarkMode ? 'bg-neutral-800/30 border-neutral-700/40' : 'bg-gray-50/60 border-gray-200/40')
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Search className={`w-4 h-4 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>AI Tire Spec Agent</span>
                    {tireAiResult && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>Fertig</span>
                    )}
                    {tireAiLoading && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>Arbeitet…</span>
                    )}
                  </div>
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={handleFetchTireAi}
                      disabled={tireAiLoading || !tireAiCanFetch}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        tireAiLoading || !tireAiCanFetch
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
                      } ${isDarkMode ? 'bg-cyan-600/80 text-cyan-100 hover:bg-cyan-600' : 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm'}`}
                    >
                      {tireAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      {tireAiLoading ? 'Lädt…' : tireAiResult ? 'Erneut abrufen' : 'Fetch AI Tire Spec'}
                    </button>
                    {!tireAiCanFetch && !tireAiLoading && (
                      <div className={`absolute right-0 top-full mt-1 z-50 w-56 px-3 py-2 rounded-lg text-[10px] font-medium shadow-lg border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>
                        Bitte Brand & Model, Dimension, Load Index, Speed Index und Year ausfüllen.
                      </div>
                    )}
                  </div>
                </div>

                {tireAiLoading && (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-cyan-900/20 border border-cyan-800/30' : 'bg-white/60 border border-cyan-200/40'}`}>
                      <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin shrink-0" />
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                        {tireAiCountdown > 0 ? `Geschätzte Zeit: ${tireAiCountdown}s` : 'Dauert etwas länger als erwartet…'}
                      </span>
                    </div>
                    {tireAiSteps.length > 0 && (
                      <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-neutral-800/20 border-neutral-700/30' : 'bg-white/40 border-gray-200/40'}`}>
                        {tireAiSteps.map((s, i) => (
                          <div key={i} className={`flex items-center gap-2 px-3 py-1 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-700/20' : 'border-t border-gray-100') : ''}`}>
                            {s.status === 'done' && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                            {s.status === 'error' && <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                            {s.status === 'working' && <Loader2 className="w-3 h-3 text-cyan-500 animate-spin shrink-0" />}
                            <span className={`text-[11px] flex-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{s.step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tireAiError && !tireAiLoading && (
                  <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50/80 border border-red-200/40'}`}>
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className={`text-xs ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{tireAiError}</span>
                  </div>
                )}

                {tireAiResult && !tireAiLoading && (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50/80 border border-emerald-200/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className={`text-xs font-medium flex-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        AI Tire Spec erfolgreich abgerufen
                        {tireAiResult.confidenceScore != null && (
                          <> · Confidence: <strong>{typeof tireAiResult.confidenceScore === 'number' && tireAiResult.confidenceScore <= 1 ? `${Math.round((tireAiResult.confidenceScore as number) * 100)}%` : `${tireAiResult.confidenceScore}`}</strong></>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTireAiResultExpanded(p => !p)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${isDarkMode ? 'bg-neutral-800/40 hover:bg-neutral-700/40 text-gray-300' : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-700'}`}
                    >
                      <span>AI Tire Spec Ergebnis {tireAiResultExpanded ? 'ausblenden' : 'anzeigen'}</span>
                      {tireAiResultExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {tireAiResultExpanded && (
                      <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-neutral-800/20 border-neutral-700/30' : 'bg-white/60 border-gray-200/40'}`}>
                        <div className="max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(tireAiResult).map(([key, val]) => (
                                <tr key={key} className={`${isDarkMode ? 'border-b border-neutral-700/20' : 'border-b border-gray-100'}`}>
                                  <td className={`px-3 py-1.5 font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{key}</td>
                                  <td className={`px-3 py-1.5 font-mono ${
                                    val === null ? (isDarkMode ? 'text-gray-600' : 'text-gray-400') : (isDarkMode ? 'text-gray-200' : 'text-gray-800')
                                  }`}>{val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setTireAiResult(null); setTireAiResultExpanded(false); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-neutral-700/50 text-gray-400 hover:bg-neutral-700' : 'bg-gray-200/80 text-gray-600 hover:bg-gray-300'}`}
                      >Verwerfen</button>
                    </div>
                  </div>
                )}

                {!tireAiLoading && !tireAiResult && !tireAiError && (
                  <p className={`text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Ruft Reifenspezifikationen per KI ab: Profiltiefe, Sensitivitäten, EU-Label, Verschleißparameter u.v.m.
                  </p>
                )}
              </div>

              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tire Condition</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTireCondition(tireCondition === 'NEW_INSTALLED' ? '' : 'NEW_INSTALLED')} className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${tireCondition === 'NEW_INSTALLED' ? (isDarkMode ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-blue-400 bg-blue-50 text-blue-700') : (isDarkMode ? 'border-neutral-700 text-gray-500' : 'border-gray-200 text-gray-400')}`}>Newly Installed</button>
                <button type="button" onClick={() => setTireCondition(tireCondition === 'ALREADY_MOUNTED' ? '' : 'ALREADY_MOUNTED')} className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${tireCondition === 'ALREADY_MOUNTED' ? (isDarkMode ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-amber-400 bg-amber-50 text-amber-700') : (isDarkMode ? 'border-neutral-700 text-gray-500' : 'border-gray-200 text-gray-400')}`}>Already Mounted (Used)</button>
              </div>
              {tireCondition === 'ALREADY_MOUNTED' && (
                <p className={`text-[10px] ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>For used tires, please enter current per-wheel tread depths below for accurate wear tracking.</p>
              )}
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tread Depth (mm){tireCondition === 'ALREADY_MOUNTED' ? ' — recommended' : ''}</p>
              <div className="grid grid-cols-4 gap-3">
                <div><label className={labelClass}>FL</label><input value={treadDepthFL} onChange={e => setTreadDepthFL(e.target.value)} className={inputClass} placeholder="6.5" /></div>
                <div><label className={labelClass}>FR</label><input value={treadDepthFR} onChange={e => setTreadDepthFR(e.target.value)} className={inputClass} placeholder="6.5" /></div>
                <div><label className={labelClass}>RL</label><input value={treadDepthBL} onChange={e => setTreadDepthBL(e.target.value)} className={inputClass} placeholder="6.5" /></div>
                <div><label className={labelClass}>RR</label><input value={treadDepthBR} onChange={e => setTreadDepthBR(e.target.value)} className={inputClass} placeholder="6.5" /></div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 6 — Service & Maintenance Baselines
             ═══════════════════════════════════════════════ */}
          {sectionHeader('service', '6', 'Service & Maintenance Baselines')}
          {expandedSections.includes('service') && (
            <div className="space-y-3 pl-1 pb-3">
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manufacturer Service Interval</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Interval (km) {aiTag}</label><input type="number" value={serviceIntervalManufacturerKm} onChange={e => setServiceIntervalManufacturerKm(e.target.value)} placeholder="e.g. 30000" className={inputClass} /></div>
                <div><label className={labelClass}>Interval (months) {aiTag}</label><input type="number" value={serviceIntervalManufacturerMonths} onChange={e => setServiceIntervalManufacturerMonths(e.target.value)} placeholder="e.g. 24" className={inputClass} /></div>
              </div>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Oil Change Interval</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Interval (km) {aiTag}</label><input type="number" value={oilChangeIntervalKm} onChange={e => setOilChangeIntervalKm(e.target.value)} placeholder="e.g. 15000" className={inputClass} /></div>
                <div><label className={labelClass}>Interval (months) {aiTag}</label><input type="number" value={oilChangeIntervalMonths} onChange={e => setOilChangeIntervalMonths(e.target.value)} placeholder="e.g. 12" className={inputClass} /></div>
              </div>
              {serviceIntervals && (
                <div className={`text-xs rounded-lg px-3 py-2 ${isDarkMode ? 'bg-neutral-800/40 text-gray-400' : 'bg-gray-100/80 text-gray-500'}`}>
                  Summary: {serviceIntervals}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 7 — Service History
             ═══════════════════════════════════════════════ */}
          {sectionHeader('history', '7', 'Service History')}
          {expandedSections.includes('history') && (
            <div className="grid grid-cols-2 gap-3 pl-1 pb-3">
              <div><label className={labelClass}>Last TÜV</label><input type="date" value={lastTuev} onChange={e => setLastTuev(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last BOKraft</label><input type="date" value={lastBokraft} onChange={e => setLastBokraft(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Inspection</label><input type="date" value={lastInspection} onChange={e => setLastInspection(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Oil Change</label><input type="date" value={lastOilChange} onChange={e => setLastOilChange(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Brake Pad Change</label><input type="date" value={lastBrakePadChange} onChange={e => setLastBrakePadChange(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Brake Rotor Change</label><input type="date" value={lastBrakeRotorChange} onChange={e => setLastBrakeRotorChange(e.target.value)} className={inputClass} /></div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 8 — Exterior Photos (Damage Map)
             ═══════════════════════════════════════════════ */}
          {sectionHeader('exterior', '8', 'Exterior Photos (Damage Map)', <Camera className={`w-3.5 h-3.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />)}
          {expandedSections.includes('exterior') && (
            <div className="pl-1 pb-3">
              <ExteriorImagesEditor
                isDarkMode={isDarkMode}
                vehicleId={isEditMode ? existingVehicle.id : null}
                vehicleMake={vehicleIdentity.make}
                vehicleModel={vehicleIdentity.model}
                title="Five canonical views"
                subtitle="Upload one photo per view (front, left, right, rear, roof). They drive the Rental damage map carousel."
                onBufferedChange={setBufferedExteriorImages}
              />
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 9 — High Mobility Data
             ═══════════════════════════════════════════════ */}
          {sectionHeader('hm', '9', 'High Mobility Data')}
          {expandedSections.includes('hm') && (
            <div className="pl-1 pb-3 space-y-3">
              {/* Loading state */}
              {hmAvailabilityLoading && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-neutral-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking HM Health availability for this VIN…
                </div>
              )}

              {/* No VIN available */}
              {!hmAvailabilityLoading && !vehicleIdentity.vin && (
                <p className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  VIN required to check High Mobility Health availability.
                </p>
              )}

              {/* HM not available for this VIN */}
              {!hmAvailabilityLoading && hmAvailability && !hmAvailability.available && (
                <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800/60 border-neutral-700/40 text-neutral-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  <Radio className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-40" />
                  <div>
                    <div className="font-medium">High Mobility Health not available</div>
                    <div className="mt-0.5 opacity-70">
                      {hmAvailability.clearanceStatus
                        ? `VIN found in HM system (status: ${hmAvailability.clearanceStatus}) — approval pending.`
                        : 'No approved HM Health record found for this VIN. Add the vehicle in Master Admin → High Mobility.'}
                    </div>
                  </div>
                </div>
              )}

              {/* HM available — already linked (active) */}
              {!hmAvailabilityLoading && hmAvailability?.available && (hmActivated || hmAvailability.isLinked) && (
                <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">High Mobility Health — Active</div>
                    <div className="mt-0.5 opacity-80">
                      OEM informational health signals are active for this vehicle.
                      DIMO telematics remain the primary operational source.
                    </div>
                  </div>
                </div>
              )}

              {/* HM available — approved, not yet linked, can activate */}
              {!hmAvailabilityLoading && hmAvailability?.available && !hmActivated && !hmAvailability.isLinked && (
                <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-blue-900/20 border-blue-800/40' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <Shield className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      <div className="flex-1">
                        <div className={`text-xs font-semibold ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                          High Mobility Health available — Approved
                        </div>
                        <div className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-blue-400/70' : 'text-blue-600/70'}`}>
                          This VIN has an approved HM Health clearance. Activating adds OEM informational signals
                          (tire pressure, service info) without affecting DIMO telematics or health calculations.
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={`px-3 py-2 border-t flex items-center gap-2 ${isDarkMode ? 'border-blue-800/40' : 'border-blue-200'}`}>
                    {isEditMode && existingVehicle?.id ? (
                      <button
                        type="button"
                        disabled={hmActivating}
                        onClick={async () => {
                          if (!hmAvailability?.hmVehicleId || !existingVehicle?.id) return;
                          setHmActivating(true);
                          try {
                            await api.highMobility.activateHealth(existingVehicle.id, hmAvailability.hmVehicleId);
                            setHmActivated(true);
                          } catch {
                            // toast shown by parent
                          } finally {
                            setHmActivating(false);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {hmActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                        Activate High Mobility Health
                      </button>
                    ) : (
                      <div className={`text-[11px] flex items-center gap-1.5 ${isDarkMode ? 'text-blue-400/70' : 'text-blue-600/60'}`}>
                        <Radio className="w-3 h-3" />
                        Activation available after vehicle is registered — use Master Admin → High Mobility.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No API result yet and VIN present */}
              {!hmAvailabilityLoading && !hmAvailability && vehicleIdentity.vin && (
                <p className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  Could not check HM availability (backend unreachable or not configured).
                </p>
              )}
            </div>
          )}
          {/* ═══════════════════════════════════════════════
               SECTION 10 — Hardware Type (V3)
               ═══════════════════════════════════════════════ */}
          {sectionHeader('hardware', '10', 'Hardware Type (V3)')}
          {expandedSections.includes('hardware') && (
            <div className="pl-1 pb-3 space-y-3">
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Determines how Driving Events are sourced for this vehicle.<br />
                <span className="font-medium">LTE_R1</span> — Driving Events from DIMO Telemetry API Events (native harsh-event signals).<br />
                <span className="font-medium">SMART5</span> — Driving Events reconstructed from HF time-series (local analysis).<br />
                <span className="font-medium">Unknown</span> — Falls back to SMART5 behaviour (safe default for unclassified vehicles).
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['LTE_R1', 'SMART5', 'UNKNOWN'] as const).map((hw) => (
                  <button
                    key={hw}
                    type="button"
                    onClick={() => setHardwareType(hw)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      hardwareType === hw
                        ? isDarkMode
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                          : 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : isDarkMode
                          ? 'bg-neutral-800/40 border-neutral-700 text-gray-400 hover:border-neutral-500'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {hw === 'UNKNOWN' ? 'Unknown' : hw}
                  </button>
                ))}
              </div>
              {hardwareType === 'LTE_R1' && (
                <div className={`rounded-xl px-3 py-2 text-xs ${isDarkMode ? 'bg-indigo-900/20 text-indigo-300 border border-indigo-800/30' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                  LTE_R1 selected: Driving Events (harsh braking, acceleration, cornering) will be sourced from DIMO Telemetry API Events. Abuse detection remains HF-based.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className={`flex items-center justify-between px-8 py-5 border-t ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
          <div className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            {isEditMode ? 'Editing registered vehicle' : 'Creating new registered vehicle'}{organizationId ? ` · ${orgName}` : ''}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${isDarkMode ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'}`}>Cancel</button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!organizationId || submitting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${!organizationId || submitting ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'} bg-gradient-to-br from-indigo-500 to-indigo-600 text-white`}
            >
              <Save className="w-4 h-4" />
              {submitting ? (isEditMode ? 'Saving…' : 'Registering…') : (isEditMode ? 'Save Changes' : 'Register Vehicle')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
