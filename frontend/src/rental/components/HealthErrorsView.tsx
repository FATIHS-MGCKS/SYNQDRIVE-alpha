import { CheckCircle, AlertTriangle, Battery, Wrench, Calendar, Disc, Circle as TireIcon, Download, FileText, Bell, Share2, Settings, ChevronRight, Sparkles, X, Plus, Search, PenTool, ShieldAlert, CircleDot, ChevronLeft, Clock, Thermometer, BatteryCharging, RefreshCw, Loader2, Upload, Ruler, Gauge, Zap, Snowflake, Sun, Wind, Activity, ClipboardList, Bot, Droplets, AlertOctagon, DiscAlbum } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XAxis, YAxis, ResponsiveContainer, Tooltip, Line, LineChart, ReferenceArea } from 'recharts';
import { api, streamAiTireSpecs, type AgentStep, type AiTireSpecsStreamEvent, type HealthSummaryResponse, type TireWearAnalysis, type ServiceInfoStatus, type BatteryHealthSummary, type BrakeStatus, type BrakeHealthSummary as BrakeHealthSummaryType, type BrakeHealthDetail, type BrakeAlert, type TripProfile, type TireHealthSummaryResponse, type TireHealthDetailResponse, type TireAlert, type VehicleComplaint } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { EuromasterServiceRequestModal } from './euromaster/EuromasterServiceRequestModal';
import { useEuromasterIntegration } from './euromaster/useEuromasterIntegration';

interface HealthErrorsViewProps {
  isDarkMode: boolean;
  vehicleId?: string;
  fuelType?: string;
}


export function HealthErrorsView({ isDarkMode, vehicleId, fuelType }: HealthErrorsViewProps) {
  const isEv = fuelType === 'Electric' || fuelType === 'PHEV';
  const { orgId } = useRentalOrg();
  const [showErrorCodes, setShowErrorCodes] = useState(false);
  const [showBattery, setShowBattery] = useState(false);
  const [showService, setShowService] = useState(false);
  const [showBrakes, setShowBrakes] = useState(false);
  const [showTires, setShowTires] = useState(false);
  const [showHvBattery, setShowHvBattery] = useState(false);
  const [showComplaintsModal, setShowComplaintsModal] = useState(false);
  const [complaints, setComplaints] = useState<VehicleComplaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ description: '', urgency: 'MEDIUM', region: '' });
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [batteryChartTab, setBatteryChartTab] = useState<'woche' | 'monat'>('woche');
  const [showEuromasterTireModal, setShowEuromasterTireModal] = useState(false);
  const emState = useEuromasterIntegration();
  const [isModalAnimating, setIsModalAnimating] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [expandedErrorIndex, setExpandedErrorIndex] = useState<number | null>(null);

  const [healthSummary, setHealthSummary] = useState<HealthSummaryResponse | null>(null);
  const [aiHealthCare, setAiHealthCare] = useState<import('../../lib/api').AiHealthCareResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [dtcList, setDtcList] = useState<any[]>([]);
  const [activeDtcCount, setActiveDtcCount] = useState(0);
  const [activeDtcList, setActiveDtcList] = useState<any[]>([]);
  const [lastDtcChecked, setLastDtcChecked] = useState<string | null>(null);
  const [dtcSummary, setDtcSummary] = useState<any>(null);
  const [dtcDetail, setDtcDetail] = useState<any>(null);
  const [dtcDetailLoading, setDtcDetailLoading] = useState(false);
  const [batteryLatest, setBatteryLatest] = useState<any>(null);
  const [batteryTrend, setBatteryTrend] = useState<any[]>([]);
  const [batterySummary, setBatterySummary] = useState<BatteryHealthSummary | null>(null);
  const [brakesData, setBrakesData] = useState<any>(null);
  const [brakeStatus, setBrakeStatus] = useState<BrakeStatus | null>(null);
  const [brakeHealthSummary, setBrakeHealthSummary] = useState<BrakeHealthSummaryType | null>(null);
  const [brakeHealthDetail, setBrakeHealthDetail] = useState<BrakeHealthDetail | null>(null);
  const [showBrakeEntry, setShowBrakeEntry] = useState(false);
  const [brakeEntryMode, setBrakeEntryMode] = useState<'manual' | 'upload' | null>(null);
  const [brakeForm, setBrakeForm] = useState({ date: '', odometerKm: '', workshopName: '', notes: '', frontPadMm: '', rearPadMm: '', frontRotorWidthMm: '', rearRotorWidthMm: '' });
  const [submittingBrake, setSubmittingBrake] = useState(false);
  const [tripProfile, setTripProfile] = useState<TripProfile | null>(null);
  const [tiresData, setTiresData] = useState<any>(null);
  const [tireWear, setTireWear] = useState<TireWearAnalysis | null>(null);
  const [tireHealth, setTireHealth] = useState<TireHealthSummaryResponse | null>(null);
  const [tireDetail, setTireDetail] = useState<TireHealthDetailResponse | null>(null);
  const [tireDetailLoading, setTireDetailLoading] = useState(false);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [measurementMode, setMeasurementMode] = useState<'manual' | 'upload' | null>(null);
  const [manualMeasurement, setManualMeasurement] = useState({ fl: '', fr: '', rl: '', rr: '', odometer: '', workshop: '' });
  const [submittingMeasurement, setSubmittingMeasurement] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [rotationTemplate, setRotationTemplate] = useState('front_to_rear');
  const [rotationOdometer, setRotationOdometer] = useState('');
  const [rotationNotes, setRotationNotes] = useState('');
  const [submittingRotation, setSubmittingRotation] = useState(false);
  const [showTireChange, setShowTireChange] = useState(false);
  const [tireModalTab, setTireModalTab] = useState<'overview' | 'history' | 'factors'>('overview');
  const [showEditSetup, setShowEditSetup] = useState(false);
  const [editSetupForm, setEditSetupForm] = useState({ frontDimension: '', rearDimension: '', brandModelFront: '', brandModelRear: '', tireSeason: '', treadFL: '', treadFR: '', treadBL: '', treadBR: '', tireCondition: '' as '' | 'NEW_INSTALLED' | 'ALREADY_MOUNTED', loadIndex: '', speedIndex: '' });
  const [submittingEditSetup, setSubmittingEditSetup] = useState(false);

  // ── AI Tire Spec fetch state ──
  const [aiTireLoading, setAiTireLoading] = useState(false);
  const [aiTireSteps, setAiTireSteps] = useState<AgentStep[]>([]);
  const [aiTireLiveStep, setAiTireLiveStep] = useState('');
  const [aiTireResult, setAiTireResult] = useState<Record<string, unknown> | null>(null);
  const [aiTireError, setAiTireError] = useState('');
  const [aiTireDegraded, setAiTireDegraded] = useState(false);
  const [aiTireCountdown, setAiTireCountdown] = useState(0);
  const [aiTireApplying, setAiTireApplying] = useState(false);
  const aiTireAbortRef = useRef<AbortController | null>(null);
  const aiTireCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [vehicleYear, setVehicleYear] = useState<number | null>(null);

  const [serviceInfo, setServiceInfo] = useState<ServiceInfoStatus | null>(null);
  const [hmTirePressure, setHmTirePressure] = useState<import('../../lib/api').HmTirePressureSignals | null>(null);

  const [hvBatteryStatus, setHvBatteryStatus] = useState<any>(null);

  useEffect(() => {
    if (!vehicleId) return;
    setHealthLoading(true);
    api.vehicleIntelligence.healthSummary(vehicleId).then(setHealthSummary).catch(() => null).finally(() => setHealthLoading(false));
    api.vehicleIntelligence.aiHealthCare(vehicleId).then(setAiHealthCare).catch(() => null);
    api.vehicleIntelligence.dtc(vehicleId).then(d => setDtcList(Array.isArray(d) ? d : [])).catch(() => []);
    api.vehicleIntelligence.dtcActive(vehicleId).then(d => {
      const list = Array.isArray(d) ? d : [];
      setActiveDtcList(list);
      setActiveDtcCount(list.length);
    }).catch(() => { setActiveDtcList([]); setActiveDtcCount(0); });
    api.vehicleIntelligence.dtcStats(vehicleId).then((s: any) => {
      if (s?.lastChecked) setLastDtcChecked(s.lastChecked);
    }).catch(() => null);
    api.vehicleIntelligence.dtcSummary(vehicleId).then(setDtcSummary).catch(() => null);
    api.vehicleIntelligence.batteryHealthLatest(vehicleId).then(setBatteryLatest).catch(() => null);
    api.vehicleIntelligence.batteryHealthTrend(vehicleId, 7).then(d => setBatteryTrend(Array.isArray(d) ? d : [])).catch(() => []);
    api.vehicleIntelligence.batteryHealthSummary(vehicleId).then(setBatterySummary).catch(() => null);
    api.vehicleIntelligence.brakes(vehicleId).then(setBrakesData).catch(() => null);
    api.vehicleIntelligence.brakeStatus(vehicleId).then(setBrakeStatus).catch(() => null);
    api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeHealthSummary).catch(() => null);
    api.vehicleIntelligence.tires(vehicleId).then(setTiresData).catch(() => null);
    api.vehicleIntelligence.tireWearAnalysis(vehicleId).then(setTireWear).catch(() => null);
    api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTireHealth).catch(() => null);
    api.vehicleIntelligence.serviceInfoStatus(vehicleId).then(setServiceInfo).catch(() => null);
    api.vehicleIntelligence.hmVehicleHealth(vehicleId).then(d => {
      if (d?.tirePressure) setHmTirePressure(d.tirePressure);
    }).catch(() => null);
    api.vehicleIntelligence.tripProfile(vehicleId).then(setTripProfile).catch(() => null);
    if (isEv) {
      api.vehicleIntelligence.hvBatteryStatus(vehicleId).then(setHvBatteryStatus).catch(() => null);
    }
    api.vehicles.get(vehicleId).then((v: any) => {
      if (v?.year) setVehicleYear(v.year);
    }).catch(() => null);
  }, [vehicleId, isEv]);

  useEffect(() => {
    if (!vehicleId || !orgId) {
      setComplaints([]);
      return;
    }
    setComplaintsLoading(true);
    api.vehicles
      .listComplaints(orgId, vehicleId)
      .then(setComplaints)
      .catch(() => setComplaints([]))
      .finally(() => setComplaintsLoading(false));
  }, [vehicleId, orgId]);

  // Load DTC detail lazily when the Error Codes modal opens
  useEffect(() => {
    if (!showErrorCodes || !vehicleId) return;
    setDtcDetailLoading(true);
    api.vehicleIntelligence.dtcDetail(vehicleId)
      .then(setDtcDetail)
      .catch(() => null)
      .finally(() => setDtcDetailLoading(false));
  }, [showErrorCodes, vehicleId]);

  const refreshHealth = () => {
    if (!vehicleId) return;
    setHealthLoading(true);
    api.vehicleIntelligence.healthSummary(vehicleId).then(setHealthSummary).catch(() => null).finally(() => setHealthLoading(false));
    api.vehicleIntelligence.aiHealthCare(vehicleId).then(setAiHealthCare).catch(() => null);
  };

  const refreshTireWear = useCallback(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.tireWearAnalysis(vehicleId).then(setTireWear).catch(() => null);
    api.vehicleIntelligence.tires(vehicleId).then(setTiresData).catch(() => null);
    api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTireHealth).catch(() => null);
    if (tireDetail) {
      api.vehicleIntelligence.tireHealthDetail(vehicleId).then(setTireDetail).catch(() => null);
    }
  }, [vehicleId, tireDetail]);

  const loadTireDetail = useCallback(() => {
    if (!vehicleId) return;
    setTireDetailLoading(true);
    api.vehicleIntelligence.tireHealthDetail(vehicleId)
      .then(setTireDetail)
      .catch(() => null)
      .finally(() => setTireDetailLoading(false));
  }, [vehicleId]);

  const handleRotateTires = async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    setSubmittingRotation(true);
    try {
      await api.vehicleIntelligence.rotateTires(vehicleId, {
        template: rotationTemplate,
        odometerKm: rotationOdometer ? parseFloat(rotationOdometer) : undefined,
        notes: rotationNotes || undefined,
      });
      setShowRotation(false);
      setRotationTemplate('front_to_rear');
      setRotationOdometer('');
      setRotationNotes('');
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to rotate tires. Please try again.');
    }
    setSubmittingRotation(false);
  };

  const submitComplaint = useCallback(async () => {
    if (!vehicleId || !orgId || !complaintForm.description.trim()) return;
    setSubmittingComplaint(true);
    try {
      await api.vehicles.createComplaint(orgId, vehicleId, {
        description: complaintForm.description.trim(),
        urgency: complaintForm.urgency,
        region: complaintForm.region.trim() || null,
      });
      const list = await api.vehicles.listComplaints(orgId, vehicleId);
      setComplaints(list);
      setComplaintForm({ description: '', urgency: 'MEDIUM', region: '' });
    } catch {
      /* keep form */
    }
    setSubmittingComplaint(false);
  }, [vehicleId, orgId, complaintForm]);

  const [tireActionError, setTireActionError] = useState<string | null>(null);

  const handleSubmitMeasurement = async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    const setups = Array.isArray(tiresData) ? tiresData : [];
    const activeSetup = setups.find((s: any) => !s.removedAt) ?? setups[0];
    if (!activeSetup) {
      setTireActionError('No active tire setup found. Please add tire information first.');
      return;
    }
    const hasAnyValue = manualMeasurement.fl || manualMeasurement.fr || manualMeasurement.rl || manualMeasurement.rr;
    if (!hasAnyValue) {
      setTireActionError('Please enter at least one tread depth value.');
      return;
    }
    setSubmittingMeasurement(true);
    try {
      await api.vehicleIntelligence.tireCalibrationMeasurement(vehicleId, activeSetup.id, {
        frontLeftMm: manualMeasurement.fl ? parseFloat(manualMeasurement.fl) : undefined,
        frontRightMm: manualMeasurement.fr ? parseFloat(manualMeasurement.fr) : undefined,
        rearLeftMm: manualMeasurement.rl ? parseFloat(manualMeasurement.rl) : undefined,
        rearRightMm: manualMeasurement.rr ? parseFloat(manualMeasurement.rr) : undefined,
        odometerAtMeasurement: manualMeasurement.odometer ? parseFloat(manualMeasurement.odometer) : undefined,
        source: 'manual',
        workshopName: manualMeasurement.workshop || undefined,
      });
      setShowMeasurement(false);
      setMeasurementMode(null);
      setManualMeasurement({ fl: '', fr: '', rl: '', rr: '', odometer: '', workshop: '' });
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to save measurement. Please try again.');
    }
    setSubmittingMeasurement(false);
  };

  const handleOpenEditSetup = useCallback(() => {
    const setups = Array.isArray(tiresData) ? tiresData : [];
    const active = setups.find((s: any) => !s.removedAt) ?? setups[0];
    setEditSetupForm({
      frontDimension: active?.frontDimension ?? '',
      rearDimension: active?.rearDimension ?? '',
      brandModelFront: active?.brandModelFront ?? '',
      brandModelRear: active?.brandModelRear ?? '',
      tireSeason: active?.tireSeason ?? '',
      treadFL: '', treadFR: '', treadBL: '', treadBR: '',
      tireCondition: active?.tireCondition === 'NEW_INSTALLED' ? 'NEW_INSTALLED' : active?.tireCondition === 'ALREADY_MOUNTED' ? 'ALREADY_MOUNTED' : '',
      loadIndex: active?.loadIndex ?? '',
      speedIndex: active?.speedIndex ?? '',
    });
    handleDiscardAiTireSpec();
    setShowEditSetup(true);
  }, [tiresData]);

  const handleSaveEditSetup = async () => {
    if (!vehicleId || !orgId) return;
    setTireActionError(null);
    setSubmittingEditSetup(true);
    try {
      const parseOpt = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };
      await api.vehicles.upsertTires(orgId, vehicleId, {
        frontDimension: editSetupForm.frontDimension.trim() || undefined,
        rearDimension: editSetupForm.rearDimension.trim() || undefined,
        brandModelFront: editSetupForm.brandModelFront.trim() || undefined,
        brandModelRear: editSetupForm.brandModelRear.trim() || undefined,
        tireSeason: editSetupForm.tireSeason || undefined,
        treadFL: parseOpt(editSetupForm.treadFL),
        treadFR: parseOpt(editSetupForm.treadFR),
        treadBL: parseOpt(editSetupForm.treadBL),
        treadBR: parseOpt(editSetupForm.treadBR),
      });
      setShowEditSetup(false);
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to save tire setup. Please try again.');
    }
    setSubmittingEditSetup(false);
  };

  // ── AI Tire Spec fetch logic ────────────────────────────────────────────────

  const aiTireSpecFieldsReady = Boolean(
    editSetupForm.brandModelFront.trim() &&
    editSetupForm.frontDimension.trim() &&
    editSetupForm.loadIndex.trim() &&
    editSetupForm.speedIndex.trim() &&
    vehicleYear,
  );

  const handleFetchAiTireSpec = useCallback(() => {
    if (!aiTireSpecFieldsReady) return;

    // Abort previous
    if (aiTireAbortRef.current) aiTireAbortRef.current.abort();
    if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);

    // Reset state
    setAiTireLoading(true);
    setAiTireSteps([]);
    setAiTireLiveStep('');
    setAiTireResult(null);
    setAiTireError('');
    setAiTireDegraded(false);
    setAiTireCountdown(30);

    // Start countdown
    aiTireCountdownRef.current = setInterval(() => {
      setAiTireCountdown(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    // Parse brand/model from combined field
    const parts = editSetupForm.brandModelFront.trim().split(/\s+/);
    const brand = parts[0] || '';
    const model = parts.slice(1).join(' ') || '';

    const controller = streamAiTireSpecs(
      {
        brand,
        model,
        year: vehicleYear ? String(vehicleYear) : undefined,
        tireSize: editSetupForm.frontDimension.trim(),
        loadIndex: editSetupForm.loadIndex.trim(),
        speedIndex: editSetupForm.speedIndex.trim(),
      },
      (evt: AiTireSpecsStreamEvent) => {
        if (evt.event === 'step') {
          setAiTireSteps(prev => {
            const existing = prev.findIndex(s => s.step === evt.data.step);
            if (existing >= 0) {
              const copy = [...prev];
              copy[existing] = evt.data;
              return copy;
            }
            return [...prev, evt.data];
          });
          if (evt.data.status === 'working') setAiTireLiveStep(evt.data.step);
        } else if (evt.event === 'progress') {
          if (evt.data.content) setAiTireLiveStep(evt.data.content);
        } else if (evt.event === 'result') {
          if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
          setAiTireCountdown(0);
          if (evt.data.degraded) {
            setAiTireDegraded(true);
          }
          setAiTireResult(evt.data.specs);
          setAiTireLoading(false);
        } else if (evt.event === 'error') {
          if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
          setAiTireCountdown(0);
          setAiTireError(evt.data.message || 'AI Tire Spec fetch failed');
          setAiTireLoading(false);
        }
      },
      () => {
        if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
        setAiTireLoading(false);
      },
    );
    aiTireAbortRef.current = controller;
  }, [aiTireSpecFieldsReady, editSetupForm.brandModelFront, editSetupForm.frontDimension, editSetupForm.loadIndex, editSetupForm.speedIndex, vehicleYear]);

  const handleApplyAiTireSpec = async () => {
    if (!vehicleId || !aiTireResult) return;
    setAiTireApplying(true);
    try {
      await api.vehicleIntelligence.applyAiTireSpec(vehicleId, { aiTireSpec: aiTireResult });
      setAiTireResult(null);
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to apply AI tire spec');
    }
    setAiTireApplying(false);
  };

  const handleDiscardAiTireSpec = () => {
    setAiTireResult(null);
    setAiTireError('');
    setAiTireDegraded(false);
    setAiTireSteps([]);
    setAiTireLiveStep('');
  };

  const refreshBrakeStatus = useCallback(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.brakeStatus(vehicleId).then(setBrakeStatus).catch(() => null);
    api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeHealthSummary).catch(() => null);
  }, [vehicleId]);

  const handleLogBrakeChange = async () => {
    if (!vehicleId || !brakeForm.date) return;
    setSubmittingBrake(true);
    try {
      await api.vehicleIntelligence.createServiceEvent(vehicleId, {
        eventType: 'BRAKE_SERVICE',
        eventDate: new Date(brakeForm.date).toISOString(),
        odometerKm: brakeForm.odometerKm ? parseInt(brakeForm.odometerKm, 10) : undefined,
        workshopName: brakeForm.workshopName || undefined,
        notes: brakeForm.notes || undefined,
      });
      await api.vehicleIntelligence.brakeHealthInitialize(vehicleId, {
        serviceDate: new Date(brakeForm.date).toISOString(),
        odometerKm: brakeForm.odometerKm ? parseInt(brakeForm.odometerKm, 10) : undefined,
        frontPadMm: brakeForm.frontPadMm ? parseFloat(brakeForm.frontPadMm) : undefined,
        rearPadMm: brakeForm.rearPadMm ? parseFloat(brakeForm.rearPadMm) : undefined,
        frontRotorWidthMm: brakeForm.frontRotorWidthMm ? parseFloat(brakeForm.frontRotorWidthMm) : undefined,
        rearRotorWidthMm: brakeForm.rearRotorWidthMm ? parseFloat(brakeForm.rearRotorWidthMm) : undefined,
      }).catch(() => null);
      setShowBrakeEntry(false);
      setBrakeEntryMode(null);
      setBrakeForm({ date: '', odometerKm: '', workshopName: '', notes: '', frontPadMm: '', rearPadMm: '', frontRotorWidthMm: '', rearRotorWidthMm: '' });
      refreshBrakeStatus();
    } catch { /* error */ }
    setSubmittingBrake(false);
  };

  const openModal = (setter: (v: boolean) => void) => {
    setter(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsModalAnimating(true);
      });
    });
  };

  const closeModal = (setter: (v: boolean) => void) => {
    setIsModalAnimating(false);
    setIsModalClosing(true);
    setTimeout(() => {
      setter(false);
      setIsModalClosing(false);
    }, 400);
  };

  const anyModalOpen = showErrorCodes || showBattery || showService || showBrakes || showTires || showHvBattery || showComplaintsModal;

  const formatRelativeTime = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const errorCodesHistory = dtcList.length > 0
    ? dtcList.map((d: any) => {
        const ts = d.firstSeenAt ?? d.lastSeenAt ?? d.createdAt;
        return {
          date: ts ? new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—',
          code: d.dtcCode ?? d.code ?? '',
          time: ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
          severity: ((d.severity ?? 'WARNING').toLowerCase() === 'warning' ? 'medium' : (d.severity ?? 'medium').toLowerCase()) as 'low' | 'medium' | 'high' | 'critical',
          system: d.description ?? d.dtcCode ?? '',
          description: d.description ?? `DTC ${d.dtcCode ?? ''}`,
          mileage: '—',
          resolution: d.clearedAt ? 'Cleared' : '—',
          resolvedDate: d.clearedAt ? new Date(d.clearedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—',
          technician: '—',
          workshop: '—',
          isActive: d.isActive ?? false,
          lastSeenAt: d.lastSeenAt,
        };
      })
    : [];

  const bSummary = batterySummary;
  const lvPubState = bSummary?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const lvIsCalibrating = lvPubState === 'INITIAL_CALIBRATION';
  const lvIsStabilizing = lvPubState === 'STABILIZING';
  const voltageDisplay = bSummary?.currentState.voltageV?.toFixed(2) ?? batteryLatest?.voltageV?.toFixed(2) ?? '—';
  const capacityPct = lvIsCalibrating ? null : (bSummary?.currentState.publishedSohPct ?? bSummary?.currentState.sohPercent ?? batteryLatest?.sohPercent ?? null);
  const batteryCondition = bSummary?.condition ?? 'good';
  const batteryConditionColor = batteryCondition === 'calibrating' ? 'bg-blue-500' : batteryCondition === 'good' ? 'bg-green-500' : batteryCondition === 'watch' ? 'bg-amber-500' : 'bg-red-500';
  const batteryConditionGlow = batteryCondition === 'calibrating' ? 'shadow-[0_0_8px_rgba(59,130,246,0.6)]' : batteryCondition === 'good' ? 'shadow-[0_0_8px_rgba(34,197,94,0.6)]' : batteryCondition === 'watch' ? 'shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'shadow-[0_0_8px_rgba(239,68,68,0.6)]';
  const batteryLastCheckedAgo = (() => {
    const lc = bSummary?.currentState.lastChecked;
    if (!lc) return null;
    const ms = Date.now() - new Date(lc).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)} h ago`;
    return `${Math.floor(ms / 86400000)} d ago`;
  })();
  const batteryChartData = batteryTrend.length > 0
    ? batteryTrend.map((d: any, i: number) => ({
        day: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i % 7],
        volt: d.voltageV ?? 0,
        time: d.recordedAt ? new Date(d.recordedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
      }))
    : [];

  const hs = aiHealthCare ?? healthSummary;

  const cardClass = 'bg-card border border-border rounded-lg shadow-xs p-4';

  return (
    <div className="relative">
      <div
        className="grid grid-cols-[1.4fr_0.85fr_0.85fr_0.85fr] gap-3 transition-all duration-500 ease-out origin-center"
        style={{
          transform: isModalAnimating ? 'scale(0.92)' : 'scale(1)',
          filter: isModalAnimating ? 'blur(12px)' : 'blur(0px)',
          opacity: isModalAnimating ? 0.4 : 1,
          pointerEvents: (anyModalOpen || isModalClosing) ? 'none' : 'auto',
        }}
      >
        {/* ─── AI Health Care – col 1, spans 2 rows ─── */}
        <div className={`${cardClass} row-span-2 flex flex-col`}>
            <div className="flex items-center gap-3 mb-3">
            <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">AI Health Care</h3>
            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${isDarkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>Powered by AI</span>
            <button onClick={refreshHealth} className={`p-1 rounded-full transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              {healthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
            {/* Overall Status */}
            <div className={`p-4 rounded-xl ${(hs?.overallStatus?.level ?? 'good') === 'good' ? isDarkMode ? 'bg-green-500/10' : 'bg-green-50' : (hs?.overallStatus?.level ?? 'good') === 'watch' ? isDarkMode ? 'bg-yellow-500/10' : 'bg-yellow-50' : isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex items-center justify-center w-4 h-4">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-25 animate-ping"></span>
                  <div className="relative w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <span className={`font-semibold text-sm ${isDarkMode ? 'text-green-300' : 'text-green-800'}`}>
                  {hs?.overallStatus?.title ?? 'Overall Status: Excellent'}
                </span>
              </div>
              <p className={`text-xs ml-6 leading-relaxed ${isDarkMode ? 'text-green-200/70' : 'text-green-700/80'}`}>
                {hs?.overallStatus?.shortSummary ?? 'No AI health analysis available yet.'}
              </p>
            </div>

            {/* Predictive Maintenance */}
            <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`font-semibold text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-800'}`}>Predictive Maintenance</span>
              </div>
              <p className={`text-xs mb-3 leading-relaxed ${isDarkMode ? 'text-blue-200/70' : 'text-blue-700/80'}`}>
                {hs?.futureOutlook?.summary ?? 'Predictive data will appear once more vehicle data is available.'}
              </p>
              <ul className={`space-y-2 text-xs ${isDarkMode ? 'text-blue-200/70' : 'text-blue-700/80'}`}>
                {(hs?.futureOutlook?.items ?? []).map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${isDarkMode ? 'bg-blue-400' : 'bg-blue-600'}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Attention Required */}
            <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={`w-4 h-4 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                <span className={`font-semibold text-sm ${isDarkMode ? 'text-orange-300' : 'text-orange-800'}`}>Attention Required</span>
              </div>
              <p className={`text-xs mb-3 leading-relaxed ${isDarkMode ? 'text-orange-200/70' : 'text-orange-800/80'}`}>
                {hs?.watchpoints?.[0] ?? 'No watchpoints identified yet.'}
              </p>
              <button className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${isDarkMode ? 'border border-orange-500/30 text-orange-300 hover:bg-orange-500/10' : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-100'}`}>
                Schedule Service
              </button>
            </div>

            {/* HM Vehicle Health Indicators */}
            {aiHealthCare?.hmHealthActive && (
              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-purple-500/5 border-purple-500/15' : 'bg-purple-50/60 border-purple-100'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">HM</span>
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-800'}`}>Live Vehicle Health</span>
                  {aiHealthCare.lastHmUpdate && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {(() => {
                        const ms = Date.now() - new Date(aiHealthCare.lastHmUpdate!).getTime();
                        const h = Math.floor(ms / 3600000);
                        return `vor ${h < 1 ? '<1h' : `${h}h`}`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {/* Oil Level */}
                  {(() => {
                    const oil = aiHealthCare.hmIndicators?.oilLevel;
                    const isLow = oil?.status === 'LOW';
                    const hasData = oil != null;
                    return (
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isLow ? (isDarkMode ? 'bg-amber-500/20' : 'bg-amber-50') : (isDarkMode ? 'bg-muted' : 'bg-gray-100')}`}>
                          <Droplets className={`w-4 h-4 ${isLow ? 'text-amber-500' : hasData ? (isDarkMode ? 'text-gray-400' : 'text-gray-500') : 'text-gray-300 dark:text-gray-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-muted-foreground">Oil Level</p>
                          {hasData ? (
                            <>
                              <div className="w-full h-1.5 rounded-full bg-muted mt-0.5 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${oil!.status === 'LOW' ? 'bg-amber-500 w-[25%]' : oil!.status === 'HIGH' ? 'bg-blue-500 w-full' : 'bg-green-500 w-[70%]'}`} />
                              </div>
                              <p className={`text-[10px] mt-0.5 ${isLow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{oil!.status === 'LOW' ? 'Niedrig' : oil!.status === 'OK' ? 'OK' : oil!.status === 'HIGH' ? 'Hoch' : 'Unbekannt'}</p>
                            </>
                          ) : <p className="text-[10px] text-muted-foreground/50">keine Daten</p>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Limp Mode */}
                  {(() => {
                    const limpMode = aiHealthCare.hmIndicators?.limpMode;
                    const active = limpMode?.active === true;
                    return (
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? (isDarkMode ? 'bg-amber-500/20' : 'bg-amber-50') : (isDarkMode ? 'bg-muted' : 'bg-gray-100')}`}>
                          <AlertOctagon className={`w-4 h-4 ${active ? 'text-amber-500' : limpMode != null ? (isDarkMode ? 'text-gray-400' : 'text-gray-500') : 'text-gray-300 dark:text-gray-600'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-semibold text-muted-foreground">Limp Mode</p>
                          <p className={`text-[10px] ${active ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                            {limpMode != null ? (active ? 'Aktiv — Werkstatt aufsuchen' : 'Inaktiv') : 'keine Daten'}
                          </p>
                        </div>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-amber-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      </div>
                    );
                  })()}

                  {/* Brake Lining Pre-Warning */}
                  {(() => {
                    const brake = aiHealthCare.hmIndicators?.brakeLiningPreWarning;
                    const active = brake?.active === true;
                    return (
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? (isDarkMode ? 'bg-amber-500/20' : 'bg-amber-50') : (isDarkMode ? 'bg-muted' : 'bg-gray-100')}`}>
                          <DiscAlbum className={`w-4 h-4 ${active ? 'text-amber-500' : brake != null ? (isDarkMode ? 'text-gray-400' : 'text-gray-500') : 'text-gray-300 dark:text-gray-600'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-semibold text-muted-foreground">Bremsbelag Vorwarnung</p>
                          <p className={`text-[10px] ${active ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                            {brake != null ? (active ? 'Warnung aktiv' : 'Kein Warnung') : 'keine Daten'}
                          </p>
                        </div>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-amber-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      </div>
                    );
                  })()}

                  {/* Tire Pressure Warning */}
                  {(() => {
                    const tire = aiHealthCare.hmIndicators?.tirePressureWarning;
                    const active = tire?.active === true;
                    return (
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? (isDarkMode ? 'bg-amber-500/20' : 'bg-amber-50') : (isDarkMode ? 'bg-muted' : 'bg-gray-100')}`}>
                          <Gauge className={`w-4 h-4 ${active ? 'text-amber-500' : tire != null ? (isDarkMode ? 'text-gray-400' : 'text-gray-500') : 'text-gray-300 dark:text-gray-600'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-semibold text-muted-foreground">Reifendruck Warnung</p>
                          <p className={`text-[10px] ${active ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                            {tire != null ? (active ? 'Druckwarnung aktiv' : 'OK') : 'keine Daten'}
                          </p>
                        </div>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-amber-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ─── Error Codes card ─── */}
        {(() => {
          const s = dtcSummary;
          const dtcStatus = s?.status ?? (activeDtcCount > 0 ? 'active_faults' : lastDtcChecked ? 'clean' : 'unavailable');
          const isStale = s?.isStale ?? false;
          const faultCount = s?.activeFaultCount ?? (dtcStatus === 'active_faults' ? activeDtcCount : 0);
          const checkedAt = s?.lastCheckedAt ?? lastDtcChecked;
          return (
            <div onClick={() => openModal(setShowErrorCodes)} className={`${cardClass} flex flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-semibold text-foreground">Error Codes</h3>
                <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center min-h-[100px]">
                {dtcStatus === 'unavailable' && (
                  <>
                    <span className={`text-3xl mb-1 text-muted-foreground/60`}>—</span>
                    <p className={`text-xs text-center text-muted-foreground`}>Noch nicht geprüft</p>
                  </>
                )}
                {dtcStatus === 'stale' && (
                  <>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${isDarkMode ? 'bg-amber-500/15' : 'bg-amber-50'}`}>
                      <AlertTriangle className={`w-4 h-4 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                    </div>
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Daten veraltet / Abruf fehlgeschlagen</p>
                  </>
                )}
                {(dtcStatus === 'clean' || dtcStatus === 'active_faults') && (
                  <>
                    <div className={`text-7xl font-bold tracking-tighter ${faultCount > 0 ? 'text-red-500' : isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{faultCount}</div>
                    {faultCount === 0 && <p className={`text-xs mt-1 ${isDarkMode ? 'text-green-400/70' : 'text-green-600/70'}`}>Keine Fehlercodes erkannt</p>}
                    {faultCount > 0 && <p className={`text-xs mt-1 ${isDarkMode ? 'text-red-400/70' : 'text-red-600/70'}`}>{faultCount} Fehlercode{faultCount > 1 ? 's' : ''} erkannt</p>}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isStale && <AlertTriangle className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-amber-500' : 'text-amber-400'}`} />}
                <p className={`text-xs ${isStale ? (isDarkMode ? 'text-amber-500' : 'text-amber-400') : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>
                  {checkedAt ? formatRelativeTime(checkedAt) : '—'}
                </p>
              </div>
            </div>
          );
        })()}

        {/* ─── Battery card (12V) — SOH bar + current voltage ─── */}
        <div onClick={() => openModal(setShowBattery)} className={`${cardClass} flex flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}>
          <style>{`@keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }`}</style>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold text-foreground">Battery</h3>
            <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            {lvIsCalibrating ? (
              <>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    Initial calibration in progress
                  </span>
                  <span className="inline-flex">
                    {[0, 1, 2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${isDarkMode ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}
                  </span>
                </div>
                <p className={`text-[10px] text-muted-foreground`}>
                  Collecting rest and start-cycle measurements
                </p>
                {voltageDisplay !== '—' && (
                  <p className={`text-[10px] mt-1 text-muted-foreground/70`}>
                    Current Voltage: <span className={`font-semibold text-foreground/80`}>{voltageDisplay} V</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={`text-sm font-bold tracking-tight text-foreground`}>
                    {capacityPct != null ? `${lvIsStabilizing ? '~' : ''}${Math.round(capacityPct)}% SOH` : '—'}
                  </span>
                  {lvIsStabilizing && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${isDarkMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>Estimated</span>
                  )}
                </div>
                {capacityPct != null && (
                  <div className={`w-full h-1.5 rounded-full overflow-hidden mb-2 bg-muted`}>
                    <div className={`h-full rounded-full transition-all ${lvIsStabilizing ? (isDarkMode ? 'bg-amber-500/60' : 'bg-amber-400') : batteryConditionColor}`} style={{ width: `${Math.round(capacityPct)}%` }} />
                  </div>
                )}
                <p className={`text-[10px] text-muted-foreground`}>
                  Current Voltage: <span className={`font-semibold text-foreground`}>{voltageDisplay}</span>
                  {voltageDisplay !== '—' ? ' V' : ''}
                </p>
                <p className={`text-[10px] mt-1.5 capitalize font-medium ${
                  lvIsStabilizing ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') :
                  batteryCondition === 'good' ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                  batteryCondition === 'watch' ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') :
                  (isDarkMode ? 'text-red-400' : 'text-red-600')
                }`}>{lvIsStabilizing ? 'Stabilizing' : batteryCondition === 'good' ? 'Healthy' : batteryCondition === 'watch' ? 'Monitor' : 'Attention needed'}</p>
              </>
            )}
          </div>
          {batteryLastCheckedAgo && <p className={`text-[10px] mt-2 text-muted-foreground/70`}>{batteryLastCheckedAgo}</p>}
        </div>

        {/* ─── Service Info card ─── */}
        {(() => {
          const si = serviceInfo;
          const pct = si?.serviceRemainingPercent ?? null;
          const barColor = pct == null ? 'bg-gray-400' : pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500';
          const nextParts = [si?.serviceRemainingKm != null ? `${si.serviceRemainingKm.toLocaleString()} km` : null, si?.serviceRemainingMonths != null ? `${si.serviceRemainingMonths} mo` : null].filter(Boolean);
          const nextStr = nextParts.length > 0 ? nextParts.join(' · ') : '—';
          const hasBok = si?.bokraftValidTill != null;
          const bokM = si?.bokraftRemainingMonths;
          const bokDate = hasBok ? new Date(si!.bokraftValidTill!).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
          const bokColor =
            !hasBok || bokM == null
              ? isDarkMode ? 'text-gray-500' : 'text-gray-400'
              : bokM <= 1
                ? isDarkMode ? 'text-red-400' : 'text-red-600'
                : bokM <= 2
                  ? isDarkMode ? 'text-amber-400' : 'text-amber-600'
                  : 'text-foreground';
          return (
            <div onClick={() => openModal(setShowService)} className={`${cardClass} flex flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">Service Info</h3>
                  {si?.hmServiceSource && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400">HM</span>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
              </div>
              {pct != null && (
                <div className={`w-full h-1.5 rounded-full overflow-hidden mb-2 bg-muted`}>
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="flex flex-col justify-between flex-1 gap-2">
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Next service</p>
                  <p className={`text-xs font-bold text-foreground`}>{nextStr}</p>
                  {si?.hmServiceSource && si.hmLastUpdatedAt && (
                    <p className="text-[10px] mt-0.5 text-purple-500 dark:text-purple-400">
                      via HM · {(() => {
                        const ms = Date.now() - new Date(si.hmLastUpdatedAt).getTime();
                        const h = Math.floor(ms / 3600000);
                        return h < 1 ? 'gerade eben' : `vor ${h}h`;
                      })()}
                    </p>
                  )}
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Next BOKraft</p>
                  <p className={`text-xs font-bold ${bokColor}`}>{hasBok ? bokDate : '—'}</p>
                  {!hasBok && (
                    <p className={`text-[10px] mt-0.5 text-muted-foreground/70`}>No tracking</p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── Brakes Quick View — pad health % + lifetime km ─── */}
        {(() => {
          const bhs = brakeHealthSummary;
          const v2 = bhs?.isInitialized === true;
          const padPct = bhs?.pads?.healthPercent ?? 0;
          const lifeKm = bhs?.pads?.estimatedLifetimeKm ?? null;
          const barC = padPct >= 60 ? 'bg-green-500' : padPct >= 30 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <div onClick={() => { openModal(setShowBrakes); if (vehicleId) api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null); }} className={`${cardClass} flex flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${!v2 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-foreground">Brake Health</h3>
                <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
              </div>
              {v2 ? (
                <div className="flex-1 flex flex-col justify-center py-1">
                  <div className={`text-sm font-bold mb-1 text-foreground`}>{padPct}%</div>
                  <div className={`w-full h-1.5 rounded-full overflow-hidden mb-1.5 bg-muted`}>
                    <div className={`h-full rounded-full ${barC}`} style={{ width: `${Math.min(padPct, 100)}%` }} />
                  </div>
                  <p className={`text-[10px] text-muted-foreground`}>
                    Estimated Lifetime in {lifeKm != null ? `${Math.floor(lifeKm).toLocaleString('de-DE')} km` : '—'}
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center py-2">
                  <p className={`text-xs font-medium text-muted-foreground`}>No active Tracking</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── Tires — health % + estimated lifetime km ─── */}
        {(() => {
          const th = tireHealth;
          const hasTireData = (th != null && th.overallPercent != null) || (tireWear != null && tireWear.overallPercent != null);
          const pct = th?.overallPercent ?? tireWear?.overallPercent ?? null;
          const remKm = th?.overallRemainingKm ?? tireWear?.estimatedRemainingKm ?? null;
          const barColor = pct != null ? (pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500') : 'bg-gray-300';
          const conf = th?.confidenceLabel ?? null;
          const hasAlerts = (th?.alerts?.length ?? 0) > 0;
          const setups = Array.isArray(tiresData) ? tiresData : [];
          const activeSetup = setups.find((s: any) => !s.removedAt) ?? setups[0] ?? null;
          return (
            <div onClick={() => { setTireActionError(null); openModal(setShowTires); loadTireDetail(); }} className={`${cardClass} cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${!hasTireData ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">Tires</h3>
                  {hasTireData && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-purple-600 text-white">ML</span>}
                  {hasAlerts && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
              </div>
              {hasTireData && pct != null ? (
                <div className="flex-1 flex flex-col justify-center py-1">
                  <div className={`text-sm font-bold mb-1 text-foreground`}>{pct}%</div>
                  <div className={`w-full h-1.5 rounded-full overflow-hidden mb-1.5 bg-muted`}>
                    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`text-[10px] text-muted-foreground`}>
                    Estimated Lifetime in {remKm != null ? `${Math.floor(remKm).toLocaleString('de-DE')} km` : '—'}
                  </p>
                  {conf && conf !== 'High' && (
                    <p className={`text-[9px] mt-1 flex items-center gap-1 ${isDarkMode ? 'text-amber-500/70' : 'text-amber-600/70'}`}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Estimate quality: {conf}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center py-2">
                  {activeSetup && (
                    <p className={`text-[10px] mb-1 text-muted-foreground`}>{activeSetup.brandModelFront ?? activeSetup.frontDimension ?? 'Setup'}</p>
                  )}
                  <p className={`text-xs font-medium ${isDarkMode ? 'text-amber-500' : 'text-amber-600'}`}>No active Tracking</p>
                  <p className={`text-[10px] mt-0.5 text-muted-foreground`}>please provide Tire Information</p>
                </div>
              )}
              {/* HM Tire Pressure indicator */}
              {hmTirePressure && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold ${
                      hmTirePressure.overallStatus === 'OK' ? 'text-green-600 dark:text-green-400' :
                      hmTirePressure.overallStatus === 'ISSUE' ? 'text-amber-600 dark:text-amber-400' :
                      'text-muted-foreground'
                    }`}>
                      {hmTirePressure.overallStatus === 'OK' ? '✓ Tire pressure OK' :
                       hmTirePressure.overallStatus === 'ISSUE' ? '⚠ Tire pressure issue detected' :
                       'No recent tire pressure data'}
                    </span>
                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400">HM</span>
                  </div>
                  {hmTirePressure.lastUpdatedAt && (
                    <p className="text-[9px] mt-0.5 text-muted-foreground/70">
                      {(() => {
                        const ms = Date.now() - new Date(hmTirePressure.lastUpdatedAt!).getTime();
                        const h = Math.floor(ms / 3600000);
                        return h < 1 ? 'gerade eben' : `vor ${h}h`;
                      })()}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── HV Battery (EV/PHEV) or Complaint List (ICE) ─── */}
        {isEv ? (() => {
          const hvPubState = hvBatteryStatus?.publicationState ?? 'INITIAL_CALIBRATION';
          const hvCalibrating = hvPubState === 'INITIAL_CALIBRATION';
          const hvStabilizing = hvPubState === 'STABILIZING';
          const soh = hvCalibrating ? null : (hvBatteryStatus?.publishedSohPercent ?? hvBatteryStatus?.sohPercent ?? null);
          const interp = hvBatteryStatus?.sohInterpretation;
          const barColor = soh == null ? 'bg-gray-400' : soh >= 80 ? 'bg-green-500' : soh >= 60 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <div onClick={() => openModal(setShowHvBattery)} className={`${cardClass} cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-foreground">HV Battery</h3>
                <div className="flex items-center gap-1">
                  <Zap className={`w-3.5 h-3.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-500'}`} />
                  <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center py-2">
                {hvCalibrating ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Initial calibration in progress</span>
                      <span className="inline-flex">
                        {[0, 1, 2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${isDarkMode ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}
                      </span>
                    </div>
                    <p className={`text-[10px] text-muted-foreground`}>Collecting charge and discharge data</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-sm font-bold tracking-tight text-foreground`}>{soh != null ? `${hvStabilizing ? '~' : ''}${soh}% SOH` : '—'}</span>
                      {hvStabilizing && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${isDarkMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>Estimated</span>
                      )}
                    </div>
                    <div className={`w-full h-1.5 rounded-full overflow-hidden mb-2 bg-muted`}>
                      <div className={`h-full ${hvStabilizing ? (isDarkMode ? 'bg-amber-500/60' : 'bg-amber-400') : barColor} rounded-full transition-all`} style={{ width: `${soh ?? 0}%` }} />
                    </div>
                    <p className={`text-xs text-muted-foreground`}>{hvStabilizing ? 'Estimated SOH · Stabilizing' : (interp?.label ?? '—')}</p>
                  </>
                )}
                {hvBatteryStatus?.currentSocPercent != null && (
                  <p className={`text-[10px] mt-1 text-muted-foreground/70`}>Current SoC: {hvBatteryStatus.currentSocPercent}%</p>
                )}
              </div>
            </div>
          );
        })() : (() => {
          const activeComplaints = complaints.filter((c) => c.status === 'ACTIVE').length;
          return (
            <div onClick={() => openModal(setShowComplaintsModal)} className={`${cardClass} flex flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-foreground">Complaint List</h3>
                <ChevronRight className={`w-4 h-4 text-muted-foreground`} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center min-h-[100px]">
                {complaintsLoading ? (
                  <Loader2 className={`w-6 h-6 animate-spin text-muted-foreground`} />
                ) : (
                  <>
                    <div className={`text-5xl font-bold tracking-tighter ${activeComplaints > 0 ? 'text-amber-500' : isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{activeComplaints}</div>
                    <p className={`text-xs mt-1 text-center text-muted-foreground`}>
                      {activeComplaints === 0 ? 'No active Feedbacks' : 'Active complaints'}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <ClipboardList className={`w-3.5 h-3.5 text-muted-foreground`} />
                <p className={`text-[10px] text-muted-foreground`}>Technical issues & observations</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
         ═══════════════════════════════════════════════════════════════ */}

      {/* ─── Error Codes Modal ─── */}
      {showErrorCodes && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowErrorCodes)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl rounded-xl p-5 shadow-lg transition-all duration-500 ease-out max-h-[85vh] overflow-y-auto bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowErrorCodes)} className={`absolute top-6 right-6 p-1.5 rounded-full transition-colors ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}><X className="w-5 h-5" /></button>

            {/* Modal header */}
            <div className="mb-4">
              <h2 className="text-base font-semibold mb-1 text-foreground">Error Codes</h2>
              {(() => {
                const d = dtcDetail;
                const s = dtcSummary;
                const cs = d?.currentFaults?.status ?? s?.status;
                if (!cs || cs === 'unavailable') return (
                  <p className={`text-sm text-muted-foreground`}>No DTC check has been performed yet</p>
                );
                if (cs === 'stale') return (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                    <p className={`text-sm ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>DTC status outdated — last successful check {formatRelativeTime(d?.monitoring?.lastSuccessfulCheckAt ?? s?.lastSuccessfulCheckAt)}</p>
                  </div>
                );
                const count = d?.currentFaults?.activeFaults?.length ?? s?.activeFaultCount ?? 0;
                if (count > 0) return (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{count} active fault code{count > 1 ? 's' : ''} detected</p>
                    {d?.monitoring?.lastSuccessfulCheckAt && <span className={`ml-auto text-xs text-muted-foreground/70`}>Last check {formatRelativeTime(d.monitoring.lastSuccessfulCheckAt)}</span>}
                  </div>
                );
                return (
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`w-4 h-4 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                    <p className={`text-sm ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>No active fault codes</p>
                    {d?.monitoring?.lastSuccessfulCheckAt && <span className={`ml-auto text-xs text-muted-foreground/70`}>Last check {formatRelativeTime(d.monitoring.lastSuccessfulCheckAt)}</span>}
                  </div>
                );
              })()}
            </div>

            {dtcDetailLoading && (
              <div className={`flex items-center gap-3 py-6 justify-center text-muted-foreground`}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading diagnostic data…</span>
              </div>
            )}

            {!dtcDetailLoading && (() => {
              const d = dtcDetail;
              const sevCls = (sev: string) => ({
                high: isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-600',
                medium: isDarkMode ? 'bg-yellow-500/15 text-yellow-400' : 'bg-yellow-100 text-yellow-700',
                low: isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-600',
              }[sev] ?? (isDarkMode ? 'bg-neutral-700 text-gray-400' : 'bg-gray-100 text-gray-500'));

              return (
                <>
                  {/* ── Section A: Current Fault Status ───────────────── */}
                  <div className="mb-5">
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground`}>A — Current Fault Status</h3>

                    {(!d || d.currentFaults.status === 'unavailable') && (
                      <div className={`flex items-center gap-3 p-4 rounded-lg border bg-muted border-border`}>
                        <Clock className={`w-5 h-5 shrink-0 text-muted-foreground/60`} />
                        <div>
                          <p className={`text-sm font-medium text-muted-foreground`}>No DTC data available</p>
                          <p className={`text-xs text-muted-foreground/70`}>The first DTC poll runs every 3 hours — no check has been performed yet</p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'stale' && (
                      <div className={`flex items-center gap-3 p-4 rounded-lg border ${isDarkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200/60'}`}>
                        <AlertTriangle className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                        <div>
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>Current DTC status is outdated</p>
                          <p className={`text-xs ${isDarkMode ? 'text-amber-400/70' : 'text-amber-600/70'}`}>The displayed DTC state may not reflect the actual vehicle condition. Wait for the next successful check.</p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'clean' && (
                      <div className={`flex items-center gap-3 p-4 rounded-lg border ${isDarkMode ? 'bg-green-500/5 border-green-500/15' : 'bg-green-50 border-green-200/60'}`}>
                        <CheckCircle className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                        <div>
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-green-300' : 'text-green-800'}`}>No Active Fault Codes</p>
                          <p className={`text-xs ${isDarkMode ? 'text-green-400/60' : 'text-green-700/60'}`}>Vehicle diagnostics are clear as of the last successful check</p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'active_faults' && d.currentFaults.activeFaults.length > 0 && (
                      <div className="space-y-2">
                        {d.currentFaults.activeFaults.map((dtc: any, i: number) => (
                          <div key={dtc.id ?? i} className={`p-4 rounded-lg border ${isDarkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200/60'}`}>
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'}`}>{dtc.code}</span>
                              <span className={`text-xs flex-1 font-medium text-foreground`}>{dtc.label}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${sevCls(dtc.severity)}`}>{dtc.severity}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 ml-5">
                              <div>
                                <p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70`}>Category</p>
                                <p className={`text-xs text-foreground/80`}>{dtc.category}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70`}>First Seen</p>
                                <p className={`text-xs text-foreground/80`}>{dtc.firstSeenAt ? new Date(dtc.firstSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70`}>Last Seen</p>
                                <p className={`text-xs text-foreground/80`}>{dtc.lastSeenAt ? new Date(dtc.lastSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Section B: Historical Fault Codes ─────────────── */}
                  <div className="mb-5">
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground`}>B — Historical Fault Codes</h3>

                    {(!d || d.history.length === 0) ? (
                      <p className={`text-sm text-muted-foreground/70`}>No historical DTC records yet</p>
                    ) : (
                      <div className={`rounded-lg border overflow-hidden border-border`}>
                        {/* Table header */}
                        <div className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground`}>
                          <span>Code</span>
                          <span>Label</span>
                          <span>Category</span>
                          <span>First Seen</span>
                          <span>Last Seen</span>
                          <span>Status</span>
                        </div>
                        {/* Table rows */}
                        {d.history.map((item: any, idx: number) => (
                          <div key={item.id ?? idx} className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center text-xs border-t border-border hover:bg-muted/50 transition-colors`}>
                            <span className={`font-bold font-mono text-[11px] ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{item.code}</span>
                            <span className={`truncate text-foreground/80`}>{item.label}</span>
                            <span className={`text-[10px] text-muted-foreground`}>{item.category}</span>
                            <span className={`text-[10px] tabular-nums text-muted-foreground`}>{item.firstSeenAt ? new Date(item.firstSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                            <span className={`text-[10px] tabular-nums text-muted-foreground`}>{item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.isActive ? (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-600') : item.clearedAt ? (isDarkMode ? 'bg-green-500/15 text-green-400' : 'bg-green-100 text-green-600') : (isDarkMode ? 'bg-neutral-700 text-gray-400' : 'bg-gray-100 text-gray-500')}`}>
                              {item.isActive ? 'Active' : item.clearedAt ? 'Cleared' : 'Historical'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Section C: DTC Monitoring Information ─────────── */}
                  <div>
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground`}>C — DTC Monitoring</h3>
                    <div className={`rounded-lg border p-5 bg-muted border-border`}>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        {[
                          { label: 'Poll Interval', value: `Every ${d?.monitoring?.pollIntervalHours ?? 3} hours` },
                          { label: 'Stale Threshold', value: `${d?.monitoring?.staleThresholdHours ?? 6} hours` },
                          { label: 'Signal Source', value: d?.monitoring?.signalSource ?? 'obdDTCList' },
                          { label: 'Last Poll Attempt', value: d?.monitoring?.lastCheckedAt ? formatRelativeTime(d.monitoring.lastCheckedAt) : '—' },
                          { label: 'Last Successful Check', value: d?.monitoring?.lastSuccessfulCheckAt ? formatRelativeTime(d.monitoring.lastSuccessfulCheckAt) : '—' },
                          { label: 'Poll Status', value: d?.monitoring?.pollStatus ?? '—' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className={`text-[10px] uppercase tracking-wider mb-1 text-muted-foreground/70`}>{label}</p>
                            <p className={`text-xs font-medium text-foreground/80`}>{value}</p>
                          </div>
                        ))}
                      </div>
                      {d?.monitoring?.pollError && (
                        <div className={`mt-4 pt-4 border-t border-border`}>
                          <p className={`text-[10px] uppercase tracking-wider mb-1 text-muted-foreground/70`}>Last Error</p>
                          <p className={`text-xs font-mono ${isDarkMode ? 'text-red-400/80' : 'text-red-600/80'}`}>{d.monitoring.pollError}</p>
                        </div>
                      )}
                      <div className={`mt-4 pt-4 border-t border-border`}>
                        <div className="flex items-center gap-2">
                          {d?.monitoring?.isStale
                            ? <AlertTriangle className={`w-3.5 h-3.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                            : <CheckCircle className={`w-3.5 h-3.5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />}
                          <p className={`text-xs ${d?.monitoring?.isStale ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : (isDarkMode ? 'text-green-400' : 'text-green-600')}`}>
                            {d?.monitoring?.isStale
                              ? 'Monitoring data is stale — no fresh DTC check available'
                              : 'Monitoring is active — data is within the freshness window'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Complaint List Modal ─── */}
      {showComplaintsModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowComplaintsModal)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`}
            style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}
          >
            <button type="button" onClick={() => closeModal(setShowComplaintsModal)} className={`absolute top-5 right-5 p-1.5 rounded-full transition-colors z-10 ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}><X className="w-5 h-5" /></button>
            <div className="mb-4">
              <h2 className="text-base font-semibold mb-1 text-foreground">Complaint List</h2>
              <p className={`text-xs text-muted-foreground`}>Driver / staff technical observations (return protocol, inspections)</p>
            </div>

            <div className={`rounded-lg p-4 mb-4 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Manual entry</p>
              <textarea
                value={complaintForm.description}
                onChange={(e) => setComplaintForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the issue…"
                rows={3}
                className={`w-full rounded-xl px-3 py-2 text-sm border outline-none mb-2 ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  value={complaintForm.region}
                  onChange={(e) => setComplaintForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Affected region (e.g. front axle)"
                  className={`rounded-xl px-3 py-2 text-xs border outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-white border-gray-200'}`}
                />
                <select
                  value={complaintForm.urgency}
                  onChange={(e) => setComplaintForm((f) => ({ ...f, urgency: e.target.value }))}
                  className={`rounded-xl px-3 py-2 text-xs border outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-gray-200'}`}
                >
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={submittingComplaint || !complaintForm.description.trim() || !orgId}
                onClick={() => void submitComplaint()}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${isDarkMode ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'} disabled:opacity-50`}
              >
                {submittingComplaint ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Save complaint'}
              </button>
            </div>

            <h3 className={`text-sm font-semibold mb-3 text-foreground`}>Active</h3>
            <div className="space-y-2 mb-4">
              {complaints.filter((c) => c.status === 'ACTIVE').length === 0 ? (
                <p className={`text-sm text-muted-foreground`}>No active Feedbacks</p>
              ) : (
                complaints.filter((c) => c.status === 'ACTIVE').map((c) => (
                  <div key={c.id} className={`rounded-xl p-3 border bg-muted border-border`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{c.urgency}</span>
                      <span className={`text-[10px] text-muted-foreground`}>{new Date(c.createdAt).toLocaleString('de-DE')}</span>
                    </div>
                    <p className={`text-sm text-foreground`}>{c.description}</p>
                    {c.region && <p className={`text-xs mt-1 text-muted-foreground`}>Region: {c.region}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {c.createdByUserId && <span className={`text-[10px] text-muted-foreground/70`}>By: {c.createdByUserId}</span>}
                      <span className={`text-[10px] text-muted-foreground/70`}>Source: {c.source}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h3 className={`text-sm font-semibold mb-3 text-foreground`}>History</h3>
            <div className="space-y-2">
              {complaints.filter((c) => c.status === 'RESOLVED').length === 0 ? (
                <p className={`text-sm text-muted-foreground`}>No resolved entries yet</p>
              ) : (
                complaints.filter((c) => c.status === 'RESOLVED').map((c) => (
                  <div key={c.id} className={`rounded-xl p-3 border opacity-80 bg-muted border-border`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase text-muted-foreground`}>{c.urgency}</span>
                      <span className={`text-[10px] text-muted-foreground`}>{new Date(c.createdAt).toLocaleString('de-DE')}</span>
                    </div>
                    <p className={`text-sm text-foreground/80`}>{c.description}</p>
                    {c.region && <p className={`text-xs mt-1 text-muted-foreground`}>Region: {c.region}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {c.createdByUserId && <span className={`text-[10px] text-muted-foreground/70`}>By: {c.createdByUserId}</span>}
                      {c.resolvedAt && <span className={`text-[10px] ${isDarkMode ? 'text-green-600' : 'text-green-500'}`}>Resolved: {new Date(c.resolvedAt).toLocaleDateString('de-DE')}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Battery Modal ─── */}
      {showBattery && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowBattery)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowBattery)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}><X className="w-5 h-5" /></button>

            {/* Header + condition badge */}
            <div className="flex items-center gap-3 mb-5">
              <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Battery Health</h2>
              {lvIsCalibrating ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">Calibrating</span>
              ) : lvIsStabilizing ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Estimated · Stabilizing</span>
              ) : (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  batteryCondition === 'good' ? 'bg-green-100 text-green-700' : batteryCondition === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>{batteryCondition === 'good' ? 'Healthy' : batteryCondition === 'watch' ? 'Monitor' : 'Attention'}</span>
              )}
              {!lvIsCalibrating && bSummary?.trendDirection && bSummary.trendDirection !== 'unknown' && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  bSummary.trendDirection === 'stable' ? (isDarkMode ? 'bg-neutral-700 text-gray-300' : 'bg-gray-100 text-gray-600') :
                  bSummary.trendDirection === 'improving' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>{bSummary.trendDirection === 'stable' ? 'Stable' : bSummary.trendDirection === 'improving' ? 'Improving' : 'Declining'}</span>
              )}
              {/* Maturity info in detail view */}
              {bSummary?.currentState?.maturityConfidence && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                  Confidence: {bSummary.currentState.maturityConfidence}
                </span>
              )}
            </div>

            {/* Current state cards */}
            <div className="flex gap-3 mb-5">
              <div className={`flex-1 rounded-lg px-4 py-3 ${isDarkMode ? 'bg-indigo-500/15' : 'bg-indigo-50'}`}>
                <div className="flex items-center gap-1.5 mb-1"><BatteryCharging className={`w-3 h-3 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-500'}`} /><span className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-indigo-300' : 'text-indigo-500'}`}>Voltage</span></div>
                <div className="flex items-baseline gap-1"><span className={`text-sm font-bold text-foreground`}>{voltageDisplay}</span><span className={`text-xs text-muted-foreground`}>V</span></div>
              </div>
              <div className={`flex-1 rounded-lg px-4 py-3 bg-muted`}>
                <div className="flex items-center gap-1.5 mb-1"><Clock className={`w-3 h-3 text-muted-foreground`} /><span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Last Check</span></div>
                <div className="flex items-baseline gap-1"><span className={`text-sm font-bold text-foreground`}>{batteryLastCheckedAgo || '—'}</span></div>
              </div>
              <div className={`flex-1 rounded-lg px-4 py-3 ${bSummary?.currentState.temperatureC != null && bSummary.currentState.temperatureC < 5 ? (isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50') : isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                <div className="flex items-center gap-1.5 mb-1"><Thermometer className={`w-3 h-3 ${bSummary?.currentState.temperatureC != null && bSummary.currentState.temperatureC < 5 ? (isDarkMode ? 'text-blue-400' : 'text-blue-500') : (isDarkMode ? 'text-gray-400' : 'text-gray-500')}`} /><span className={`text-[10px] uppercase tracking-wider font-semibold ${bSummary?.currentState.temperatureC != null && bSummary.currentState.temperatureC < 5 ? (isDarkMode ? 'text-blue-300' : 'text-blue-500') : (isDarkMode ? 'text-gray-400' : 'text-gray-500')}`}>Temperature</span></div>
                <div className="flex items-baseline gap-1"><span className={`text-sm font-bold text-foreground`}>{bSummary?.currentState.temperatureC != null ? `${bSummary.currentState.temperatureC}°C` : '—'}</span></div>
              </div>
            </div>

            {/* SOH gauge */}
            {(() => {
              const soh = capacityPct;
              if (lvIsCalibrating) {
                return (
                  <div className={`rounded-lg px-5 py-4 mb-5 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-blue-300' : 'text-blue-500'}`}>State of Health (SOH)</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Calibrating</span>
                        <span className="inline-flex">{[0,1,2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${isDarkMode ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}</span>
                      </div>
                    </div>
                    <p className={`text-[10px] ${isDarkMode ? 'text-blue-400/60' : 'text-blue-500/60'}`}>Collecting rest and start-cycle measurements for accurate SOH estimation</p>
                  </div>
                );
              }
              const barCol = soh == null ? 'bg-gray-400' : soh >= 70 ? 'bg-green-500' : soh >= 50 ? 'bg-amber-500' : 'bg-red-500';
              const bgCol = lvIsStabilizing ? (isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50') : soh == null ? (isDarkMode ? 'bg-neutral-800/60' : 'bg-gray-100') : soh >= 70 ? (isDarkMode ? 'bg-green-500/10' : 'bg-green-50') : soh >= 50 ? (isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50') : (isDarkMode ? 'bg-red-500/10' : 'bg-red-50');
              return (
                <div className={`rounded-lg px-5 py-4 mb-5 ${bgCol}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>{lvIsStabilizing ? 'Estimated SOH' : 'State of Health (SOH)'}</p>
                    <span className={`text-sm font-bold tracking-tight text-foreground`}>{soh != null ? `${lvIsStabilizing ? '~' : ''}${Math.round(soh)}%` : 'Unavailable'}</span>
                  </div>
                  {soh != null && (
                    <div className={`w-full h-2 rounded-full overflow-hidden bg-muted`}>
                      <div className={`h-full rounded-full transition-all ${lvIsStabilizing ? (isDarkMode ? 'bg-amber-500/60' : 'bg-amber-400') : barCol}`} style={{ width: `${Math.round(soh)}%` }} />
                    </div>
                  )}
                  {lvIsStabilizing && <p className={`text-[9px] mt-1.5 ${isDarkMode ? 'text-amber-400/60' : 'text-amber-600/60'}`}>Value is stabilizing — may refine over the next few days</p>}
                </div>
              );
            })()}

            {/* Voltage Trend Chart */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <div className="flex justify-center mb-4">
                <div className={`inline-flex rounded-full p-0.5 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}>
                  <button onClick={() => setBatteryChartTab('woche')} className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${batteryChartTab === 'woche' ? isDarkMode ? 'bg-neutral-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm' : isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Week</button>
                  <button onClick={() => setBatteryChartTab('monat')} className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${batteryChartTab === 'monat' ? isDarkMode ? 'bg-neutral-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm' : isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Month</button>
                </div>
              </div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-center text-muted-foreground`}>Voltage Trend</p>
              <div className="mt-1">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={batteryChartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                    <ReferenceArea y1={14} y2={18} fill="#ef4444" fillOpacity={0.15} />
                    <ReferenceArea y1={13} y2={14} fill="#f59e0b" fillOpacity={0.15} />
                    <ReferenceArea y1={11} y2={13} fill="#22c55e" fillOpacity={0.2} />
                    <ReferenceArea y1={9} y2={11} fill="#f59e0b" fillOpacity={0.15} />
                    <ReferenceArea y1={6} y2={9} fill="#ef4444" fillOpacity={0.15} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} />
                    <YAxis domain={[6, 18]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: isDarkMode ? '#6b7280' : '#9ca3af' }} label={{ value: 'Volt', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 9, fill: isDarkMode ? '#6b7280' : '#9ca3af' } }} />
                    <Tooltip cursor={{ stroke: isDarkMode ? '#4b5563' : '#d1d5db', strokeWidth: 1, strokeDasharray: '4 4' }} content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        const v = d.volt;
                        const st = v >= 11 && v <= 13 ? 'Good' : v >= 9 && v <= 14 ? 'Warning' : 'Critical';
                        const sc = st === 'Good' ? 'text-green-500' : st === 'Warning' ? 'text-amber-500' : 'text-red-500';
                        const sb = st === 'Good' ? isDarkMode ? 'bg-green-500/15' : 'bg-green-100' : st === 'Warning' ? isDarkMode ? 'bg-amber-500/15' : 'bg-amber-100' : isDarkMode ? 'bg-red-500/15' : 'bg-red-100';
                        return (<div className="rounded-lg px-3 py-2.5 shadow-lg border border-border bg-popover text-popover-foreground"><div className="flex items-center gap-2 mb-1.5"><span className={`text-xs font-semibold text-foreground`}>{d.day}</span><span className={`text-[10px] text-muted-foreground`}>{d.time}</span></div><div className="flex items-baseline gap-1.5"><span className={`text-sm font-bold text-foreground`}>{v.toFixed(1)}</span><span className={`text-[10px] text-muted-foreground`}>V</span></div><div className={`mt-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${sb} ${sc}`}>{st}</div></div>);
                      }
                      return null;
                    }} />
                    <Line type="monotone" dataKey="volt" stroke={isDarkMode ? '#e5e7eb' : '#374151'} strokeWidth={2.5} dot={{ r: 4, fill: isDarkMode ? '#e5e7eb' : '#fff', stroke: isDarkMode ? '#9ca3af' : '#374151', strokeWidth: 2 }} activeDot={{ r: 6, fill: isDarkMode ? '#818cf8' : '#6366f1', stroke: isDarkMode ? '#e5e7eb' : '#fff', strokeWidth: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Good (11–13V)</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Warning</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Critical</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Watchpoints */}
              {bSummary && bSummary.watchpoints.length > 0 && (
                <div className={`rounded-lg p-5 ${isDarkMode ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-amber-50 border border-amber-200/60'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Watchpoints</p>
                  <div className="space-y-2">
                    {bSummary.watchpoints.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                        <p className={`text-xs leading-relaxed text-foreground/80`}>{w}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {bSummary && bSummary.recommendations.length > 0 && (
                <div className={`rounded-lg p-5 ${isDarkMode ? 'bg-blue-500/5 border border-blue-500/20' : 'bg-blue-50 border border-blue-200/60'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Recommendations</p>
                  <div className="space-y-2">
                    {bSummary.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle className={`w-3 h-3 mt-0.5 shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                        <p className={`text-xs leading-relaxed text-foreground/80`}>{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Factory Specification */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Specification</p>
              <div className={`divide-y divide-border`}>
                {[
                  { label: 'Battery Type', value: bSummary?.specs?.batteryType || '—' },
                  { label: 'Capacity', value: bSummary?.specs?.batteryAmpere ? `${bSummary.specs.batteryAmpere} Ah` : '—' },
                  { label: 'Nominal Voltage', value: bSummary?.specs?.batteryVolt ? `${bSummary.specs.batteryVolt} V` : '—' },
                  { label: 'Data Source', value: bSummary?.specs?.sourceType ? bSummary.specs.sourceType.toLowerCase() : '—' },
                ].map((spec) => (
                  <div key={spec.label} className="flex items-center justify-between py-2">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{spec.label}</span>
                    <span className={`text-xs font-semibold capitalize text-foreground`}>{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Readings */}
            {(bSummary?.currentState.restingVoltage != null || bSummary?.currentState.crankingVoltage != null || bSummary?.currentState.chargingVoltage != null) && (
              <div className={`rounded-lg p-5 mb-5 bg-muted`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Detailed Readings</p>
                <div className={`divide-y divide-border`}>
                  {[
                    bSummary?.currentState.restingVoltage != null ? { l: 'Resting Voltage', v: `${bSummary.currentState.restingVoltage} V` } : null,
                    bSummary?.currentState.crankingVoltage != null ? { l: 'Cranking Voltage', v: `${bSummary.currentState.crankingVoltage} V` } : null,
                    bSummary?.currentState.chargingVoltage != null ? { l: 'Charging Voltage', v: `${bSummary.currentState.chargingVoltage} V` } : null,
                  ].filter(Boolean).map((r: any) => (
                    <div key={r.l} className="flex items-center justify-between py-2">
                      <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{r.l}</span>
                      <span className={`text-xs font-semibold text-foreground`}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Battery History */}
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>History</p>
              {bSummary && bSummary.history.length > 0 ? (
                <div className="space-y-2">
                  {bSummary.history.slice(0, 15).map((h) => (
                    <div key={h.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${h.type === 'service' ? 'bg-blue-100' : 'bg-indigo-100'}`}>
                        {h.type === 'service' ? <Wrench className="w-3 h-3 text-blue-600" /> : <Activity className="w-3 h-3 text-indigo-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold text-foreground`}>
                          {h.type === 'service' ? 'Battery Service' : 'Measurement'}
                          {h.voltage != null && <span className={`ml-2 font-normal text-muted-foreground`}>{h.voltage.toFixed(1)} V</span>}
                          {h.soh != null && <span className={`ml-2 font-normal text-muted-foreground`}>SOH {Math.round(h.soh)}%</span>}
                        </p>
                        {h.workshopName && <p className={`text-[10px] text-muted-foreground`}>{h.workshopName}</p>}
                        {h.notes && <p className={`text-[10px] text-muted-foreground`}>{h.notes}</p>}
                      </div>
                      <span className={`text-[10px] shrink-0 text-muted-foreground/70`}>{new Date(h.date).toLocaleDateString('de-DE')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-xs text-muted-foreground/70`}>No battery history available yet</p>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ─── Service Modal ─── */}
      {showService && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowService)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowService)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}><X className="w-5 h-5" /></button>
            <h2 className={`text-sm font-semibold tracking-tight mb-5 text-foreground`}>Service Info</h2>

            {/* Next Service */}
            <div className={`rounded-lg p-5 mb-5 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <p className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>Next Service Due In</p>
              <p className={`text-sm font-bold mb-1 text-foreground`}>
                {[serviceInfo?.serviceRemainingKm != null ? `${serviceInfo.serviceRemainingKm.toLocaleString()} km` : null, serviceInfo?.serviceRemainingMonths != null ? `${serviceInfo.serviceRemainingMonths} months` : null].filter(Boolean).join(' or ') || '—'}
              </p>
              <p className={`text-xs mb-3 text-muted-foreground`}>whichever comes first</p>
              {serviceInfo?.serviceRemainingPercent != null && (
                <div className={`w-full h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-700' : 'bg-blue-200'}`}>
                  <div className={`h-full rounded-full transition-all ${serviceInfo.serviceRemainingPercent >= 50 ? 'bg-green-500' : serviceInfo.serviceRemainingPercent >= 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${serviceInfo.serviceRemainingPercent}%` }} />
                </div>
              )}
            </div>

            {/* Manufacturer Interval */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-4 text-muted-foreground`}>Manufacturer Interval</p>
              <div className={`divide-y divide-border`}>
                {[
                  { l: 'Interval (km)', v: serviceInfo?.intervalKm ? `every ${serviceInfo.intervalKm.toLocaleString()} km` : '—' },
                  { l: 'Interval (months)', v: serviceInfo?.intervalMonths ? `every ${serviceInfo.intervalMonths} months` : '—' },
                ].map(s => (
                  <div key={s.l} className="flex items-center justify-between py-2.5"><span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{s.l}</span><span className={`text-xs font-semibold text-foreground`}>{s.v}</span></div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Service History */}
              <div>
                <h3 className={`text-sm font-semibold mb-4 text-foreground`}>Service History</h3>
                {serviceInfo && serviceInfo.serviceHistory.length > 0 ? (
                  <div className="space-y-4">
                    {serviceInfo.serviceHistory.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="shrink-0 min-w-0">
                          <p className={`text-sm font-semibold text-foreground`}>{item.eventType.replace(/_/g, ' ')}</p>
                          <p className={`text-xs text-muted-foreground`}>{new Date(item.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' })}</p>
                        </div>
                        {item.odometerKm != null && <div className="shrink-0 text-right"><p className={`text-xs text-muted-foreground`}>{item.odometerKm.toLocaleString()} km</p></div>}
                        {item.workshopName && <p className={`text-[10px] shrink-0 text-muted-foreground`}>{item.workshopName}</p>}
                        <span className="ml-auto px-3 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 shrink-0">Completed</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-xs text-muted-foreground/70`}>No service records yet</p>
                )}
              </div>

              {/* TÜV + BOKraft */}
              <div className="space-y-3">
                {/* TÜV */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 text-foreground`}>TÜV</h3>
                  <div className={`rounded-lg p-4 mb-4 border bg-muted border-border`}>
                    <div className="flex items-center gap-3">
                      <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Valid till</p><p className={`text-sm font-bold text-foreground`}>{serviceInfo?.tuvValidTill ? new Date(serviceInfo.tuvValidTill).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'}</p></div>
                      <div className="ml-auto text-right"><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Remaining</p><p className={`text-sm font-bold ${serviceInfo?.tuvRemainingMonths != null && serviceInfo.tuvRemainingMonths <= 3 ? 'text-red-500' : serviceInfo?.tuvRemainingMonths != null && serviceInfo.tuvRemainingMonths <= 6 ? 'text-orange-500' : isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{serviceInfo?.tuvRemainingMonths != null ? `${serviceInfo.tuvRemainingMonths} Months` : '—'}</p></div>
                    </div>
                  </div>
                  {serviceInfo && serviceInfo.tuvHistory.length > 0 && (
                    <>
                      <p className={`text-xs font-semibold mb-2 text-muted-foreground`}>History</p>
                      <div className="space-y-2">
                        {serviceInfo.tuvHistory.map((item) => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0"><p className={`text-xs font-semibold text-foreground`}>TÜV &bull; {new Date(item.date).toLocaleDateString('de-DE')}</p>{item.notes && <p className={`text-[10px] text-muted-foreground`}>{item.notes}</p>}</div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 shrink-0">Passed</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* BOKraft */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 text-foreground`}>BOKraft</h3>
                  <div className={`rounded-lg p-4 mb-4 border bg-muted border-border`}>
                    <div className="flex items-center gap-3">
                      <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Valid till</p><p className={`text-sm font-bold text-foreground`}>{serviceInfo?.bokraftValidTill ? new Date(serviceInfo.bokraftValidTill).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'}</p></div>
                      <div className="ml-auto text-right"><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Remaining</p><p className={`text-sm font-bold ${serviceInfo?.bokraftRemainingMonths != null && serviceInfo.bokraftRemainingMonths <= 2 ? 'text-red-500' : serviceInfo?.bokraftRemainingMonths != null && serviceInfo.bokraftRemainingMonths <= 4 ? 'text-orange-500' : isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{serviceInfo?.bokraftRemainingMonths != null ? `${serviceInfo.bokraftRemainingMonths} Months` : '—'}</p></div>
                    </div>
                  </div>
                  {serviceInfo && serviceInfo.bokraftHistory.length > 0 && (
                    <>
                      <p className={`text-xs font-semibold mb-2 text-muted-foreground`}>History</p>
                      <div className="space-y-2">
                        {serviceInfo.bokraftHistory.map((item) => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0"><p className={`text-xs font-semibold text-foreground`}>BOKraft &bull; {new Date(item.date).toLocaleDateString('de-DE')}</p>{item.notes && <p className={`text-[10px] text-muted-foreground`}>{item.notes}</p>}</div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 shrink-0">Passed</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Brakes Modal V2 ─── */}
      {showBrakes && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!showBrakeEntry) closeModal(setShowBrakes); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowBrakes)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}><X className="w-5 h-5" /></button>

            {(() => {
              const bhs = brakeHealthSummary;
              const bhd = brakeHealthDetail;
              const bs = brakeStatus;
              const v2 = bhs?.isInitialized === true;
              const d = isDarkMode;
              const cardBg = 'bg-muted';
              const hSec = 'text-xs font-bold uppercase tracking-wider mb-3 text-muted-foreground';
              const lbl = 'text-[10px] uppercase tracking-wider font-semibold text-muted-foreground';
              const val = 'text-sm font-bold text-foreground';
              const sub = 'text-[10px] text-muted-foreground';

              const mkBar = (pct: number) => {
                const c = pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';
                return <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1.5 ${d ? 'bg-neutral-700' : 'bg-gray-100'}`}><div className={`h-full rounded-full transition-all ${c}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>;
              };

              const statusBadgeCls = v2
                ? (bhs?.status === 'healthy' ? (d ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700')
                  : bhs?.status === 'attention' ? (d ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700')
                  : (d ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700'))
                : '';
              const statusLabel = v2 ? (bhs?.status === 'healthy' ? 'Healthy' : bhs?.status === 'attention' ? 'Attention' : 'Critical') : '';

              const axleCard = (label: string, est: BrakeAxleEstimate | null | undefined) => {
                if (!est) return null;
                const pct = est.healthPct ?? 0;
                const statusColor = pct >= 60 ? (d ? 'text-green-400' : 'text-green-600') : pct >= 30 ? (d ? 'text-amber-400' : 'text-amber-600') : (d ? 'text-red-400' : 'text-red-600');
                return (
                  <div className={`rounded-xl p-4 ${cardBg}`}>
                    <p className={`${lbl} mb-2`}>{label}</p>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={`text-xl font-bold text-foreground`}>{Math.round(pct)}%</span>
                      {est.estimatedMm != null && <span className={sub}>{est.estimatedMm} mm</span>}
                    </div>
                    {mkBar(pct)}
                    <div className="flex items-center justify-between mt-2">
                      <span className={sub}>~{(est.remainingKm ?? 0).toLocaleString('de-DE')} km left</span>
                      <span className={`text-[10px] font-semibold capitalize ${statusColor}`}>{pct >= 60 ? 'Good' : pct >= 30 ? 'Watch' : 'Replace'}</span>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* ── A) Header ── */}
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Brake Health</h2>
                    {v2 && <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeCls}`}>{statusLabel}</span>}
                    {v2 && bhs?.confidence && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        bhs.confidence.label === 'High' ? (d ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600')
                        : bhs.confidence.label === 'Medium' ? (d ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600')
                        : (d ? 'bg-gray-500/10 text-gray-400' : 'bg-gray-100 text-gray-500')
                      }`}>{bhs.confidence.label} confidence ({bhs.confidence.score})</span>
                    )}
                  </div>
                  <p className={`text-[10px] mb-4 text-muted-foreground/70`}>{v2 ? 'Anchor-based achsweise (front/rear) wear model powered by Driving Impact Engine V1' : 'Brake wear estimation starts after a documented brake service'}</p>

                  {/* ── NOT INITIALIZED STATE ── */}
                  {!v2 && (
                    <>
                      <div className={`rounded-xl p-4 mb-4 border ${d ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/50 border-amber-200/60'}`}>
                        <h3 className={`text-sm font-bold mb-2 ${d ? 'text-amber-300' : 'text-amber-800'}`}>Brake tracking not initialized</h3>
                        <p className={`text-xs leading-relaxed mb-3 ${d ? 'text-amber-400/80' : 'text-amber-700'}`}>
                          Brake wear estimation starts after a documented brake service or confirmed workshop report. Without a known starting pad/disc thickness, no reliable estimation is possible. Pre-anchor driving data is being collected but will NOT be used retroactively — tracking starts clean from the service anchor odometer.
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('manual'); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${d ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}><Plus className="w-3.5 h-3.5" /> Add Brake Service</button>
                          <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('upload'); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${d ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}><Upload className="w-3.5 h-3.5" /> AI Upload Report</button>
                        </div>
                      </div>
                      <p className={`text-[10px] mb-4 text-muted-foreground/70`}>Driving and braking behavior is already being collected via the Driving Impact Engine and will be available once brake tracking is initialized.</p>
                    </>
                  )}

                  {/* ── INITIALIZED: B) Axle Health Visualization ── */}
                  {v2 && (
                    <div className="mb-4">
                      <h3 className={hSec}>Axle Health</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {axleCard('Brake Pads — Front', bhd?.frontPads)}
                        {axleCard('Brake Pads — Rear', bhd?.rearPads)}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {axleCard('Brake Discs — Front', bhd?.frontDiscs)}
                        {axleCard('Brake Discs — Rear', bhd?.rearDiscs)}
                      </div>
                      {bhd?.distanceSinceAnchorKm != null && (
                        <p className={`text-[10px] mt-2 text-muted-foreground/70`}>{bhd.distanceSinceAnchorKm.toLocaleString('de-DE')} km since anchor service</p>
                      )}
                    </div>
                  )}

                  {/* ── INITIALIZED: Alerts ── */}
                  {v2 && bhd?.alerts && bhd.alerts.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {bhd.alerts.map((a, i) => (
                        <div key={i} className={`rounded-lg px-4 py-2.5 flex items-start gap-2 ${
                          a.severity === 'critical' ? (d ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200')
                          : a.severity === 'warning' ? (d ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200')
                          : (d ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200')
                        }`}>
                          {a.severity === 'critical' ? <ShieldAlert className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${d ? 'text-red-400' : 'text-red-600'}`} /> : <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.severity === 'warning' ? (d ? 'text-amber-400' : 'text-amber-600') : (d ? 'text-blue-400' : 'text-blue-600')}`} />}
                          <span className={`text-xs ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── C) Brake System Information ── */}
                  {(bs?.specs || bhd?.brakeBiasInfo) && (
                    <div className="mb-4">
                      <h3 className={hSec}>Brake System Information</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded-xl p-4 ${cardBg}`}>
                          <p className={`${lbl} mb-2.5`}>Front Axle</p>
                          <div className="space-y-2">
                            {[
                              { l: 'Rotor Diameter', v: bs?.specs?.frontRotorDiameter },
                              { l: 'Rotor Width (NEW)', v: bs?.specs?.frontRotorWidth },
                              { l: 'Pad Thickness', v: bs?.specs?.frontPadThickness },
                            ].map(r => (
                              <div key={r.l} className="flex items-center justify-between">
                                <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                                <span className={val}>{r.v != null ? `${r.v} mm` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={`rounded-xl p-4 ${cardBg}`}>
                          <p className={`${lbl} mb-2.5`}>Rear Axle</p>
                          <div className="space-y-2">
                            {[
                              { l: 'Rotor Diameter', v: bs?.specs?.rearRotorDiameter },
                              { l: 'Rotor Width (NEW)', v: bs?.specs?.rearRotorWidth },
                              { l: 'Pad Thickness', v: bs?.specs?.rearPadThickness },
                            ].map(r => (
                              <div key={r.l} className="flex items-center justify-between">
                                <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                                <span className={val}>{r.v != null ? `${r.v} mm` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {bhd?.brakeBiasInfo && (
                        <div className={`rounded-xl p-3 mt-3 ${cardBg}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs text-muted-foreground`}>Brake Force Distribution</span>
                            <span className={val}>{bhd.brakeBiasInfo.front}% / {bhd.brakeBiasInfo.rear}%</span>
                          </div>
                          <p className={`text-[9px] mt-1 text-muted-foreground/70`}>{bhd.brakeBiasInfo.source}{bhd.brakeBiasInfo.source.includes('EBD') ? ' — actual distribution is managed by the vehicle EBD system; this is used as a modeling fallback' : ''}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── D) Brake History ── */}
                  <div className="mb-4">
                    <h3 className={hSec}>Brake History</h3>
                    {(bhd?.history ?? bs?.history ?? []).length > 0 ? (
                      <div className={`rounded-xl overflow-hidden ${d ? 'bg-neutral-800/40' : 'bg-white'}`}>
                        {(bhd?.history ?? bs?.history ?? []).map((item: any, i: number, arr: any[]) => (
                          <div key={item.id} className={`flex items-center px-4 py-3 ${i < arr.length - 1 ? d ? 'border-b border-neutral-700/50' : 'border-b border-gray-100' : ''}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center mr-3 shrink-0 ${d ? 'bg-green-500/10' : 'bg-green-50'}`}>
                              <Wrench className={`w-3 h-3 ${d ? 'text-green-400' : 'text-green-600'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold text-foreground`}>Brake Service</p>
                              <p className={`text-[10px] text-muted-foreground`}>{new Date(item.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}{item.workshopName ? ` · ${item.workshopName}` : ''}</p>
                              {item.notes && <p className={`text-[9px] mt-0.5 ${d ? 'text-gray-600' : 'text-gray-300'}`}>{item.notes}</p>}
                            </div>
                            {item.odometerKm != null && <span className={`text-[10px] font-medium mr-2 text-muted-foreground`}>{item.odometerKm.toLocaleString('de-DE')} km</span>}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${d ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'}`}>Serviced</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`rounded-xl p-5 text-center ${d ? 'bg-neutral-800/40' : 'bg-white'}`}>
                        <p className={`text-xs text-muted-foreground`}>No brake service events recorded yet.</p>
                      </div>
                    )}
                  </div>

                  {/* ── E) Actions ── */}
                  <div className="mb-4">
                    <h3 className={hSec}>Actions</h3>
                    {!showBrakeEntry && (
                      <div className="flex gap-2 mb-3">
                        <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('manual'); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${d ? 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}><Plus className="w-3 h-3" /> Add Brake Service</button>
                        <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('upload'); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${d ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}><Upload className="w-3 h-3" /> AI Upload Report</button>
                      </div>
                    )}
                    {showBrakeEntry && brakeEntryMode === 'manual' && (
                      <div className={`rounded-xl p-4 ${cardBg}`}>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div><label className={`block ${lbl} mb-1`}>Date *</label><input type="date" value={brakeForm.date} onChange={e => setBrakeForm(p => ({ ...p, date: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Odometer (km)</label><input type="number" value={brakeForm.odometerKm} onChange={e => setBrakeForm(p => ({ ...p, odometerKm: e.target.value }))} placeholder="Current mileage" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Workshop</label><input type="text" value={brakeForm.workshopName} onChange={e => setBrakeForm(p => ({ ...p, workshopName: e.target.value }))} placeholder="Optional" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Notes</label><input type="text" value={brakeForm.notes} onChange={e => setBrakeForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Front pads + discs" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                        </div>
                        <p className={`${lbl} mt-2 mb-2`}>New Component Specs (optional — enables V2 tracking)</p>
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          <div><label className={`block ${lbl} mb-1`}>Front Pad mm</label><input type="number" step="0.1" value={brakeForm.frontPadMm} onChange={e => setBrakeForm(p => ({ ...p, frontPadMm: e.target.value }))} placeholder="12" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Rear Pad mm</label><input type="number" step="0.1" value={brakeForm.rearPadMm} onChange={e => setBrakeForm(p => ({ ...p, rearPadMm: e.target.value }))} placeholder="10" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Front Rotor W mm</label><input type="number" step="0.1" value={brakeForm.frontRotorWidthMm} onChange={e => setBrakeForm(p => ({ ...p, frontRotorWidthMm: e.target.value }))} placeholder="28" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Rear Rotor W mm</label><input type="number" step="0.1" value={brakeForm.rearRotorWidthMm} onChange={e => setBrakeForm(p => ({ ...p, rearRotorWidthMm: e.target.value }))} placeholder="22" className={`w-full px-3 py-2 rounded-lg text-xs border ${d ? 'bg-neutral-900 border-neutral-700 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} /></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={handleLogBrakeChange} disabled={submittingBrake || !brakeForm.date} className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">{submittingBrake ? 'Saving...' : 'Save Brake Service'}</button>
                          <button onClick={() => { setShowBrakeEntry(false); setBrakeEntryMode(null); }} className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {showBrakeEntry && brakeEntryMode === 'upload' && (
                      <div className={`rounded-xl p-5 text-center ${cardBg}`}>
                        <Upload className={`w-6 h-6 mx-auto mb-2 ${d ? 'text-blue-400' : 'text-blue-500'}`} />
                        <p className={`text-xs font-semibold mb-1 text-foreground`}>Upload Brake Service Document</p>
                        <p className={`text-[10px] mb-3 text-muted-foreground`}>Go to the AI Upload page to upload a brake service invoice or workshop report. Extracted data will be reviewed and confirmed before being applied.</p>
                        <button onClick={() => { setShowBrakeEntry(false); setBrakeEntryMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>Close</button>
                      </div>
                    )}
                  </div>

                  {/* ── F) Estimate Quality ── */}
                  {v2 && bhd && (
                    <div className="mb-2">
                      <h3 className={hSec}>Estimate Quality</h3>
                      <div className={`rounded-xl p-4 ${cardBg}`}>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className={lbl}>Confidence</p>
                            <p className={`text-lg font-bold mt-1 text-foreground`}>{bhs?.confidence?.score ?? 0}<span className={`text-xs font-normal text-muted-foreground`}>/100</span></p>
                          </div>
                          <div>
                            <p className={lbl}>DI Engine</p>
                            <p className={`text-xs font-semibold mt-1.5 ${bhd.drivingImpactAvailable ? (d ? 'text-green-400' : 'text-green-600') : (d ? 'text-gray-500' : 'text-gray-400')}`}>{bhd.drivingImpactAvailable ? 'Connected' : 'No data'}</p>
                          </div>
                          <div>
                            <p className={lbl}>Model</p>
                            <p className={`text-xs font-semibold mt-1.5 ${d ? 'text-gray-400' : 'text-gray-600'}`}>Anchor-based V2</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Tires Modal ─── */}
      {showTires && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!showMeasurement && !showRotation && !showTireChange && !showEditSetup) closeModal(setShowTires); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowTires)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}><X className="w-5 h-5" /></button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Tire Health</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-purple-600 text-white">ML</span>
              {tireDetail?.factors.regressionActive && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDarkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-700'}`}>Regression</span>}
              {tireDetail?.factors.isStaggered && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>Staggered</span>}
              {tireDetail && tireDetail.factors.regenBrakingFactorFront < 1 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'}`}><Zap className="w-3 h-3 inline -mt-0.5 mr-0.5" />Regen{tireDetail.factors.driveType ? ` (${tireDetail.factors.driveType})` : ''}</span>}
              {tireDetail?.factors.calibrationCount > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDarkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>{tireDetail.factors.calibrationCount}× calibrated</span>}
            </div>

            {/* Estimate Quality Badge */}
            {(() => {
              const conf = tireDetail?.summary ?? tireHealth;
              if (!conf) return null;
              const score = conf.confidenceScore ?? 0;
              const label = conf.confidenceLabel ?? 'Low';
              const bg = label === 'High' ? (isDarkMode ? 'bg-green-500/10 border-green-800/30' : 'bg-green-50 border-green-200') : label === 'Medium' ? (isDarkMode ? 'bg-amber-500/10 border-amber-800/30' : 'bg-amber-50 border-amber-200') : (isDarkMode ? 'bg-red-500/10 border-red-800/30' : 'bg-red-50 border-red-200');
              const tc = label === 'High' ? (isDarkMode ? 'text-green-400' : 'text-green-700') : label === 'Medium' ? (isDarkMode ? 'text-amber-400' : 'text-amber-700') : (isDarkMode ? 'text-red-400' : 'text-red-700');
              return (
                <div className={`rounded-xl p-3 mb-5 border ${bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className={`w-4 h-4 ${tc}`} />
                      <span className={`text-xs font-semibold ${tc}`}>Estimate Quality: {label} ({score}%)</span>
                    </div>
                    {label !== 'High' && <span className={`text-[10px] text-muted-foreground`}>Manual measurement improves accuracy</span>}
                  </div>
                  <p className={`text-[10px] mt-1 text-muted-foreground`}>This is a modeled estimate based on tread baseline, mileage, trip profile, and driving behavior.</p>
                </div>
              );
            })()}

            {/* HM Tire Pressure Section */}
            {hmTirePressure && (
              <div className={`rounded-xl p-4 mb-5 border ${isDarkMode ? 'bg-purple-500/5 border-purple-500/15' : 'bg-purple-50/60 border-purple-100'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">HM</span>
                  <h4 className="text-xs font-semibold text-foreground">Live Tire Pressure</h4>
                  {hmTirePressure.lastUpdatedAt && (
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {(() => {
                        const ms = Date.now() - new Date(hmTirePressure.lastUpdatedAt!).getTime();
                        const h = Math.floor(ms / 3600000);
                        return `aktualisiert vor ${h < 1 ? '<1h' : `${h}h`}`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Vorne Links', pressure: hmTirePressure.frontLeft, status: hmTirePressure.statusFrontLeft },
                    { label: 'Vorne Rechts', pressure: hmTirePressure.frontRight, status: hmTirePressure.statusFrontRight },
                    { label: 'Hinten Links', pressure: hmTirePressure.rearLeft, status: hmTirePressure.statusRearLeft },
                    { label: 'Hinten Rechts', pressure: hmTirePressure.rearRight, status: hmTirePressure.statusRearRight },
                  ].map(({ label, pressure, status }) => {
                    const isIssue = status && (status.toLowerCase().includes('low') || status.toLowerCase().includes('warn') || status === 'ALERT');
                    return (
                      <div key={label} className={`rounded-lg p-2.5 border ${isIssue ? (isDarkMode ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-200 bg-amber-50') : (isDarkMode ? 'border-border bg-muted/30' : 'border-border bg-white/50')}`}>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">{label}</p>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-sm font-bold ${isIssue ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                            {pressure != null ? pressure.toFixed(1) : '—'}
                          </span>
                          {pressure != null && <span className="text-[10px] text-muted-foreground">{hmTirePressure.unit}</span>}
                        </div>
                        {isIssue && <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">{status}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alerts */}
            {(tireDetail?.alerts ?? tireHealth?.alerts ?? []).filter((a: TireAlert) => a.severity !== 'info').length > 0 && (
              <div className="space-y-2 mb-5">
                {(tireDetail?.alerts ?? tireHealth?.alerts ?? []).filter((a: TireAlert) => a.severity !== 'info').map((alert: TireAlert, i: number) => (
                  <div key={i} className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${alert.severity === 'critical' ? (isDarkMode ? 'bg-red-500/10 border border-red-800/30' : 'bg-red-50 border border-red-200') : (isDarkMode ? 'bg-amber-500/10 border border-amber-800/30' : 'bg-amber-50 border border-amber-200')}`}>
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    <span className={`text-xs ${alert.severity === 'critical' ? (isDarkMode ? 'text-red-300' : 'text-red-700') : (isDarkMode ? 'text-amber-300' : 'text-amber-700')}`}>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Euromaster Tire Service CTA */}
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 mb-5 ${isDarkMode ? 'bg-red-500/5 border border-red-500/10' : 'bg-red-50/50 border border-red-100'}`}>
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-red-500" />
                <span className={`text-xs font-medium text-foreground/80`}>Need tire service?</span>
              </div>
              <button
                onClick={() => setShowEuromasterTireModal(true)}
                disabled={!emState.canCreateCase}
                className={`px-3 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
                  emState.canCreateCase
                    ? 'text-white bg-red-600 hover:bg-red-700 cursor-pointer'
                    : isDarkMode ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {emState.canCreateCase ? 'Plan with Euromaster →' : 'Euromaster (setup required)'}
              </button>
            </div>

            {/* Tab navigation */}
            <div className={`flex gap-1 mb-5 p-1 rounded-xl ${isDarkMode ? 'bg-neutral-800/60' : 'bg-gray-100'}`}>
              {(['overview', 'history', 'factors'] as const).map(tab => (
                <button key={tab} onClick={() => setTireModalTab(tab)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tireModalTab === tab ? (isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')}`}>
                  {tab === 'overview' ? 'Overview' : tab === 'history' ? 'Rotation History' : 'Wear Factors'}
                </button>
              ))}
            </div>

            {tireDetailLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}

            {/* ── OVERVIEW TAB ── */}
            {tireModalTab === 'overview' && !tireDetailLoading && (
              <>
                {/* Tire Setup Info */}
                {(() => {
                  const setups = Array.isArray(tiresData) ? tiresData : [];
                  const active = setups.find((s: any) => !s.removedAt) ?? setups[0];
                  const hasIncomplete = active && (!active.brandModelFront || !active.frontDimension || !active.tireSeason);
                  if (!active) return (
                    <div className={`rounded-lg p-4 text-center mb-5 border-2 border-dashed ${isDarkMode ? 'bg-neutral-800/40 border-amber-500/20' : 'bg-amber-50/50 border-amber-200'}`}>
                      <TireIcon className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-amber-500/60' : 'text-amber-400'}`} />
                      <p className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>No active Tracking</p>
                      <p className={`text-xs text-muted-foreground`}>please provide Tire Information</p>
                      <button onClick={handleOpenEditSetup} className={`mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isDarkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                        <PenTool className="w-3 h-3 inline -mt-0.5 mr-1" />Add Tire Setup
                      </button>
                    </div>
                  );
                  return (
                    <div className={`rounded-lg p-4 mb-5 bg-muted`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <TireIcon className={`w-4 h-4 text-muted-foreground`} />
                          <h3 className={`text-xs font-bold uppercase tracking-wider text-muted-foreground`}>Active Set</h3>
                          {active.tireSeason && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>{active.tireSeason.replace('_', ' ')}</span>}
                          {tireHealth?.totalKmOnSet ? <span className={`text-[10px] text-muted-foreground`}>{Math.round(tireHealth.totalKmOnSet).toLocaleString('de-DE')} km on set</span> : null}
                          {hasIncomplete && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>Incomplete</span>}
                        </div>
                        <button onClick={handleOpenEditSetup} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${isDarkMode ? 'text-blue-400 hover:bg-blue-500/10' : 'text-blue-600 hover:bg-blue-50'}`}>
                          <PenTool className="w-3 h-3" />Edit
                        </button>
                      </div>
                      {!showEditSetup ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div><p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground`}>Front</p><p className={`text-xs font-semibold text-foreground`}>{active.brandModelFront || '—'}</p><p className={`text-[10px] text-muted-foreground`}>{active.frontDimension || '—'}</p></div>
                            <div><p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground`}>Rear</p><p className={`text-xs font-semibold text-foreground`}>{active.brandModelRear || active.brandModelFront || '—'}</p><p className={`text-[10px] text-muted-foreground`}>{active.rearDimension || active.frontDimension || '—'}</p></div>
                          </div>
                          {active.installedAt && <p className={`text-[10px] mt-2 text-muted-foreground/60`}>Installed {new Date(active.installedAt).toLocaleDateString('de-DE')}{active.installedOdometerKm ? ` at ${Math.round(active.installedOdometerKm).toLocaleString('de-DE')} km` : ''}</p>}
                        </>
                      ) : (
                        <div className="space-y-3 mt-1">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Front Brand / Model</label>
                              <input type="text" value={editSetupForm.brandModelFront} onChange={e => setEditSetupForm(p => ({ ...p, brandModelFront: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="e.g. Continental PremiumContact 6" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Rear Brand / Model</label>
                              <input type="text" value={editSetupForm.brandModelRear} onChange={e => setEditSetupForm(p => ({ ...p, brandModelRear: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="Same as front if identical" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Front Dimension</label>
                              <input type="text" value={editSetupForm.frontDimension} onChange={e => setEditSetupForm(p => ({ ...p, frontDimension: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="e.g. 225/45 R17" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Rear Dimension</label>
                              <input type="text" value={editSetupForm.rearDimension} onChange={e => setEditSetupForm(p => ({ ...p, rearDimension: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="Same as front if identical" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Load Index</label>
                              <input type="text" value={editSetupForm.loadIndex} onChange={e => setEditSetupForm(p => ({ ...p, loadIndex: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="e.g. 94" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Speed Index</label>
                              <input type="text" value={editSetupForm.speedIndex} onChange={e => setEditSetupForm(p => ({ ...p, speedIndex: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="e.g. V" />
                            </div>
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Season</label>
                            <div className="flex gap-2">
                              {[{ val: 'SUMMER', label: 'Summer', icon: Sun }, { val: 'WINTER', label: 'Winter', icon: Snowflake }, { val: 'ALL_SEASON', label: 'All Season', icon: Wind }].map(opt => (
                                <button key={opt.val} onClick={() => setEditSetupForm(p => ({ ...p, tireSeason: p.tireSeason === opt.val ? '' : opt.val }))} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${editSetupForm.tireSeason === opt.val ? (isDarkMode ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-blue-400 bg-blue-50 text-blue-700') : (isDarkMode ? 'border-neutral-700 text-gray-500 hover:border-neutral-600' : 'border-gray-200 text-gray-400 hover:border-gray-300')}`}>
                                  <opt.icon className="w-3.5 h-3.5" />{opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1.5 text-muted-foreground`}>Tire Condition</label>
                            <div className="flex gap-2">
                              {[{ val: 'NEW_INSTALLED' as const, label: 'Newly Installed' }, { val: 'ALREADY_MOUNTED' as const, label: 'Already Mounted (Used)' }].map(opt => (
                                <button key={opt.val} onClick={() => setEditSetupForm(p => ({ ...p, tireCondition: p.tireCondition === opt.val ? '' : opt.val }))} className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${editSetupForm.tireCondition === opt.val ? (isDarkMode ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-blue-400 bg-blue-50 text-blue-700') : (isDarkMode ? 'border-neutral-700 text-gray-500 hover:border-neutral-600' : 'border-gray-200 text-gray-400 hover:border-gray-300')}`}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {editSetupForm.tireCondition === 'ALREADY_MOUNTED' && (
                              <p className={`text-[9px] mt-1 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>Used tires: please enter current per-wheel tread depths below for accurate estimates.</p>
                            )}
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1.5 text-muted-foreground`}>Current Tread Depth (mm){editSetupForm.tireCondition === 'ALREADY_MOUNTED' ? ' — recommended' : ' — optional'}</label>
                            <div className="grid grid-cols-4 gap-2">
                              {[{ key: 'treadFL', label: 'FL' }, { key: 'treadFR', label: 'FR' }, { key: 'treadBL', label: 'RL' }, { key: 'treadBR', label: 'RR' }].map(f => (
                                <div key={f.key}>
                                  <span className={`text-[9px] font-semibold block mb-0.5 text-center text-muted-foreground/60`}>{f.label}</span>
                                  <input type="number" step="0.1" min="0" max="12" value={(editSetupForm as any)[f.key]} onChange={e => setEditSetupForm(p => ({ ...p, [f.key]: e.target.value }))} className={`w-full px-2 py-1.5 rounded-lg text-xs text-center font-medium border transition-colors outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'}`} placeholder="mm" />
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* ── AI Tire Spec Fetch ─────────────────────────────── */}
                          <div className={`rounded-xl p-3 border bg-muted border-border`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Bot className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-wider text-muted-foreground`}>AI Tire Intelligence</span>
                              </div>
                              {!aiTireLoading && !aiTireResult && (
                                <div className="relative group">
                                  <button
                                    onClick={handleFetchAiTireSpec}
                                    disabled={!aiTireSpecFieldsReady || aiTireLoading}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                                      aiTireSpecFieldsReady
                                        ? 'bg-purple-500 hover:bg-purple-600 text-white'
                                        : isDarkMode ? 'bg-neutral-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                                  >
                                    <Sparkles className="w-3 h-3" />Fetch AI Tire Spec
                                  </button>
                                  {!aiTireSpecFieldsReady && (
                                    <div className={`absolute bottom-full right-0 mb-1 px-2 py-1 rounded text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 ${isDarkMode ? 'bg-neutral-700 text-gray-300' : 'bg-gray-800 text-white'}`}>
                                      Fill Brand/Model, Dimension, Load &amp; Speed Index first
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Status: Loading with countdown */}
                            {aiTireLoading && (
                              <div className={`rounded-lg p-3 bg-muted`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                                    {aiTireCountdown > 0 ? 'Fetching AI Tire Spec...' : 'Taking longer than expected...'}
                                  </span>
                                </div>
                                {aiTireCountdown > 0 && (
                                  <p className={`text-[10px] mb-2 text-muted-foreground`}>Estimated time remaining: {aiTireCountdown}s</p>
                                )}
                                {aiTireCountdown === 0 && aiTireLoading && (
                                  <p className={`text-[10px] mb-2 ${isDarkMode ? 'text-amber-400/70' : 'text-amber-600'}`}>Still processing — please wait...</p>
                                )}
                                <div className={`w-full h-1.5 rounded-full overflow-hidden bg-muted`}>
                                  <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, aiTireCountdown > 0 ? ((30 - aiTireCountdown) / 30) * 90 : 95)}%` }} />
                                </div>
                                {aiTireLiveStep && <p className={`text-[9px] mt-1.5 text-muted-foreground/60`}>{aiTireLiveStep}</p>}
                                {aiTireSteps.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {aiTireSteps.map((s, i) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        {s.status === 'done' ? <CheckCircle className="w-3 h-3 text-green-500" /> : s.status === 'error' ? <AlertTriangle className="w-3 h-3 text-red-500" /> : <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
                                        <span className={`text-[9px] text-muted-foreground`}>{s.step}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Error state */}
                            {!aiTireLoading && aiTireError && (
                              <div className={`rounded-lg p-3 ${isDarkMode ? 'bg-red-500/10 border border-red-800/20' : 'bg-red-50 border border-red-200'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>Fetch failed</span>
                                </div>
                                <p className={`text-[10px] mb-2 ${isDarkMode ? 'text-red-400/70' : 'text-red-600'}`}>{aiTireError}</p>
                                <div className="flex gap-2">
                                  <button onClick={handleFetchAiTireSpec} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors">Retry</button>
                                  <button onClick={handleDiscardAiTireSpec} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'}`}>Dismiss</button>
                                </div>
                              </div>
                            )}

                            {/* Result preview */}
                            {!aiTireLoading && aiTireResult && (
                              <div className={`rounded-lg p-3 bg-muted border border-border`}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className={`w-3.5 h-3.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>AI Tire Spec Result</span>
                                  </div>
                                  {(() => {
                                    const conf = typeof aiTireResult.confidenceScore === 'number' ? aiTireResult.confidenceScore : null;
                                    if (conf == null) return null;
                                    const isLow = conf < 50;
                                    return (
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isLow ? (isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700') : (isDarkMode ? 'bg-green-500/15 text-green-400' : 'bg-green-50 text-green-700')}`}>
                                        {isLow ? 'Low Confidence' : 'Matched'} ({conf}%)
                                      </span>
                                    );
                                  })()}
                                </div>
                                {aiTireDegraded && (
                                  <p className={`text-[9px] mb-2 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>Partial result — some fields could not be determined.</p>
                                )}
                                {typeof aiTireResult.confidenceScore === 'number' && (aiTireResult.confidenceScore as number) < 50 && (
                                  <p className={`text-[9px] mb-2 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>Low confidence match — review carefully before applying.</p>
                                )}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  {[
                                    { key: 'matchedBrand', label: 'Brand' },
                                    { key: 'matchedModel', label: 'Model' },
                                    { key: 'matchedVariant', label: 'Variant' },
                                    { key: 'seasonType', label: 'Season' },
                                    { key: 'newTreadDepthMm', label: 'New Tread (mm)' },
                                    { key: 'recommendedReplacementDepthMm', label: 'Rec. Replace (mm)' },
                                    { key: 'operationalReplacementDepthMm', label: 'Op. Replace (mm)' },
                                    { key: 'intendedUse', label: 'Intended Use' },
                                    { key: 'aggressiveDrivingSensitivity', label: 'Aggr. Sensitivity' },
                                    { key: 'underinflationSensitivity', label: 'Underinfl. Sens.' },
                                    { key: 'heatSensitivity', label: 'Heat Sensitivity' },
                                    { key: 'confidenceScore', label: 'Confidence' },
                                  ].map(({ key, label }) => {
                                    const val = aiTireResult[key];
                                    return (
                                      <div key={key} className="flex justify-between py-0.5">
                                        <span className={`text-[9px] text-muted-foreground`}>{label}</span>
                                        <span className={`text-[9px] font-semibold text-foreground/80`}>{val != null ? String(val) : '—'}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {(aiTireResult.manufacturerSourceUrl || aiTireResult.labelSourceUrl) && (
                                  <div className={`mt-2 pt-2 border-t border-border`}>
                                    {aiTireResult.manufacturerSourceUrl && <a href={String(aiTireResult.manufacturerSourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500 hover:underline block truncate">Manufacturer source</a>}
                                    {aiTireResult.labelSourceUrl && <a href={String(aiTireResult.labelSourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500 hover:underline block truncate">Label source</a>}
                                  </div>
                                )}
                                <div className="flex gap-2 mt-3">
                                  <button onClick={handleApplyAiTireSpec} disabled={aiTireApplying} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50">
                                    {aiTireApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}Apply Spec
                                  </button>
                                  <button onClick={handleFetchAiTireSpec} disabled={aiTireLoading} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors">
                                    <RefreshCw className="w-3 h-3 inline -mt-0.5 mr-1" />Retry
                                  </button>
                                  <button onClick={handleDiscardAiTireSpec} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'}`}>Discard</button>
                                </div>
                              </div>
                            )}

                            {/* Idle hint when no action taken yet */}
                            {!aiTireLoading && !aiTireResult && !aiTireError && (
                              <p className={`text-[9px] text-muted-foreground/60`}>
                                Fetch model-specific tire intelligence for accurate wear modeling.
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button onClick={() => setShowEditSetup(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'}`}>Cancel</button>
                            <button onClick={handleSaveEditSetup} disabled={submittingEditSetup} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">
                              {submittingEditSetup && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save Setup
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Overall + Wheel Grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {/* Overall */}
                  {(() => {
                    const pct = tireDetail?.summary.overallPercent ?? tireWear?.overallPercent ?? null;
                    const remKm = tireDetail?.summary.overallRemainingKm ?? tireWear?.estimatedRemainingKm ?? null;
                    const barBg = pct != null ? (pct >= 50 ? (isDarkMode ? 'bg-green-500/10' : 'bg-green-50') : pct >= 25 ? (isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50') : (isDarkMode ? 'bg-red-500/10' : 'bg-red-50')) : (isDarkMode ? 'bg-neutral-800/60' : 'bg-gray-50');
                    const barFg = pct != null ? (pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500') : 'bg-gray-300';
                    return (
                      <div className={`rounded-lg p-4 ${barBg}`}>
                        {pct != null ? (<>
                          <p className={`text-2xl font-bold mb-1 text-foreground`}>{pct}%</p>
                          <div className={`w-full h-2 rounded-full overflow-hidden mb-2 bg-muted`}><div className={`h-full ${barFg} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div>
                          <p className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Estimated Tread Life</p>
                          {remKm != null && <p className={`text-[11px] text-muted-foreground`}>ca. {remKm.toLocaleString('de-DE')} km remaining</p>}
                          {tireDetail?.summary.wearRateMmPer1000km != null && <p className={`text-[10px] mt-1 text-muted-foreground/60`}>Wear: {tireDetail.summary.wearRateMmPer1000km.toFixed(2)} mm / 1000 km</p>}
                          {tireWear && <div className="mt-3 flex gap-3">
                            <div className="text-center flex-1"><p className={`text-lg font-bold text-foreground`}>{tireWear.frontPercent}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Front</p></div>
                            <div className={`w-px bg-muted`} />
                            <div className="text-center flex-1"><p className={`text-lg font-bold text-foreground`}>{tireWear.rearPercent}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Rear</p></div>
                          </div>}
                        </>) : (<div className="text-center py-3"><p className={`text-xs font-semibold text-muted-foreground`}>No wear analysis yet</p></div>)}
                      </div>
                    );
                  })()}

                  {/* Wheel position grid */}
                  <div className={`rounded-lg p-4 bg-muted`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Tread Depth per Wheel</p>
                    <div className="relative mx-auto" style={{ width: '240px', height: '150px' }}>
                      {(tireDetail?.wheels ?? [
                        { position: 'FL', treadMm: tireWear?.frontLeftMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                        { position: 'FR', treadMm: tireWear?.frontRightMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                        { position: 'RL', treadMm: tireWear?.rearLeftMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                        { position: 'RR', treadMm: tireWear?.rearRightMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                      ]).map((w: any) => {
                        const top = w.position.startsWith('F');
                        const left = w.position.endsWith('L');
                        const mm = w.treadMm;
                        const treadColor = mm >= 4 ? (isDarkMode ? 'text-green-400' : 'text-green-600') : mm >= 2.5 ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : (isDarkMode ? 'text-red-400' : 'text-red-600');
                        return (
                          <div key={w.position} className={`absolute flex flex-col items-center ${top ? 'top-0' : 'bottom-0'} ${left ? 'left-0' : 'right-0'}`}>
                            {top && <svg width="22" height="32" viewBox="0 0 24 36" fill="none"><rect x="2" y="2" width="20" height="32" rx="4" className={isDarkMode ? 'stroke-gray-500' : 'stroke-gray-400'} strokeWidth="1.5" /><line x1="6" y1="10" x2="18" y2="10" className={isDarkMode ? 'stroke-gray-600' : 'stroke-gray-300'} strokeWidth="1" /><line x1="6" y1="18" x2="18" y2="18" className={isDarkMode ? 'stroke-gray-600' : 'stroke-gray-300'} strokeWidth="1" /><line x1="6" y1="26" x2="18" y2="26" className={isDarkMode ? 'stroke-gray-600' : 'stroke-gray-300'} strokeWidth="1" /></svg>}
                            <p className={`text-sm font-bold ${treadColor}`}>{mm > 0 ? `${mm.toFixed(1)} mm` : '—'}</p>
                            <p className={`text-[9px] font-medium text-muted-foreground`}>{w.position}</p>
                            {w.wearPercent != null && <p className={`text-[8px] text-muted-foreground/60`}>{w.wearPercent}%</p>}
                            {!top && <svg width="22" height="32" viewBox="0 0 24 36" fill="none"><rect x="2" y="2" width="20" height="32" rx="4" className={isDarkMode ? 'stroke-gray-500' : 'stroke-gray-400'} strokeWidth="1.5" /><line x1="6" y1="10" x2="18" y2="10" className={isDarkMode ? 'stroke-gray-600' : 'stroke-gray-300'} strokeWidth="1" /><line x1="6" y1="18" x2="18" y2="18" className={isDarkMode ? 'stroke-gray-600' : 'stroke-gray-300'} strokeWidth="1" /><line x1="6" y1="26" x2="18" y2="26" className={isDarkMode ? 'stroke-gray-600' : 'stroke-gray-300'} strokeWidth="1" /></svg>}
                          </div>
                        );
                      })}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
                        <div className="flex gap-2">
                          <button onClick={() => setShowRotation(true)} className="px-3 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-semibold transition-colors">Rotate</button>
                          <button onClick={() => setShowTireChange(true)} className="px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold transition-colors">Change</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Usage Split */}
                {tireDetail && tireDetail.usageSplit && (tireDetail.usageSplit.city > 0 || tireDetail.usageSplit.highway > 0 || tireDetail.usageSplit.rural > 0) && (
                  <div className={`rounded-lg p-4 mb-5 bg-muted`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Usage Distribution</p>
                    <div className="flex gap-1 mb-3 h-2 rounded-full overflow-hidden">
                      {tireDetail.usageSplit.city > 0 && <div className={`${isDarkMode ? 'bg-amber-500' : 'bg-amber-400'} rounded-full`} style={{ width: `${tireDetail.usageSplit.city}%` }} />}
                      {tireDetail.usageSplit.highway > 0 && <div className={`${isDarkMode ? 'bg-blue-500' : 'bg-blue-400'} rounded-full`} style={{ width: `${tireDetail.usageSplit.highway}%` }} />}
                      {tireDetail.usageSplit.rural > 0 && <div className={`${isDarkMode ? 'bg-green-500' : 'bg-green-400'} rounded-full`} style={{ width: `${tireDetail.usageSplit.rural}%` }} />}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className={`text-sm font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{tireDetail.usageSplit.city}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>City</p></div>
                      <div><p className={`text-sm font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{tireDetail.usageSplit.highway}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Highway</p></div>
                      <div><p className={`text-sm font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{tireDetail.usageSplit.rural}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Rural</p></div>
                    </div>
                  </div>
                )}

                {/* Action Error Banner */}
                {tireActionError && (
                  <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-2 ${isDarkMode ? 'bg-red-500/10 border border-red-800/30' : 'bg-red-50 border border-red-200'}`}>
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className={`text-xs ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{tireActionError}</span>
                    <button onClick={() => setTireActionError(null)} className={`ml-auto p-0.5 rounded ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}><X className="w-3 h-3" /></button>
                  </div>
                )}

                {/* Actions: Measurement */}
                <div className={`rounded-lg p-5 mb-5 bg-muted`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Manual Measurement</h3>
                    {!showMeasurement && <button onClick={() => { setShowMeasurement(true); setMeasurementMode(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors"><Plus className="w-3.5 h-3.5" /> Record</button>}
                  </div>
                  {showMeasurement && !measurementMode && (
                    <div className="flex gap-3">
                      <button onClick={() => setMeasurementMode('manual')} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all hover:scale-[1.02] ${isDarkMode ? 'border-neutral-600 hover:border-blue-500/50 hover:bg-blue-500/5' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'}`}>
                        <Ruler className={`w-6 h-6 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} /><p className={`text-xs font-semibold text-foreground`}>Manual Entry</p><p className={`text-[10px] text-center text-muted-foreground`}>Enter measured tread values</p>
                      </button>
                      <button onClick={() => setMeasurementMode('upload')} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all hover:scale-[1.02] ${isDarkMode ? 'border-neutral-600 hover:border-purple-500/50 hover:bg-purple-500/5' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'}`}>
                        <Upload className={`w-6 h-6 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} /><p className={`text-xs font-semibold text-foreground`}>AI Upload</p><p className={`text-[10px] text-center text-muted-foreground`}>Upload checkup sheet</p>
                      </button>
                    </div>
                  )}
                  {showMeasurement && measurementMode === 'manual' && (
                    <div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {[{ key: 'fl', label: 'Front Left (mm)' }, { key: 'fr', label: 'Front Right (mm)' }, { key: 'rl', label: 'Rear Left (mm)' }, { key: 'rr', label: 'Rear Right (mm)' }].map(f => (
                          <div key={f.key}><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>{f.label}</label><input type="number" step="0.1" min="0" max="12" value={(manualMeasurement as any)[f.key]} onChange={e => setManualMeasurement(prev => ({ ...prev, [f.key]: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} placeholder="e.g. 5.2" /></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label><input type="number" value={manualMeasurement.odometer} onChange={e => setManualMeasurement(prev => ({ ...prev, odometer: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} placeholder="Current odometer" /></div>
                        <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Workshop</label><input type="text" value={manualMeasurement.workshop} onChange={e => setManualMeasurement(prev => ({ ...prev, workshop: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} placeholder="Workshop name (optional)" /></div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowMeasurement(false); setMeasurementMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'}`}>Cancel</button>
                        <button onClick={handleSubmitMeasurement} disabled={submittingMeasurement} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">{submittingMeasurement && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Confirm & Calibrate</button>
                      </div>
                    </div>
                  )}
                  {showMeasurement && measurementMode === 'upload' && (
                    <div className={`text-center py-6 border-2 border-dashed rounded-xl ${isDarkMode ? 'border-neutral-600' : 'border-gray-200'}`}>
                      <Upload className={`w-8 h-8 mx-auto mb-2 text-muted-foreground`} />
                      <p className={`text-xs font-semibold mb-1 text-foreground`}>Upload Workshop Document</p>
                      <p className={`text-[10px] mb-3 text-muted-foreground`}>AI will extract tread measurements</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => { setShowMeasurement(false); setMeasurementMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground`}>Cancel</button>
                        <label className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 hover:bg-purple-600 text-white cursor-pointer">Select File<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" /></label>
                      </div>
                    </div>
                  )}
                  {!showMeasurement && <p className={`text-[10px] text-muted-foreground/60`}>Manual measurement improves prediction accuracy through Bayesian calibration.</p>}
                </div>

                {/* Rotation Dialog */}
                {showRotation && (
                  <div className={`rounded-lg p-5 mb-5 border-2 ${isDarkMode ? 'bg-neutral-800/60 border-blue-500/30' : 'bg-white border-blue-200'}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Rotate Tires</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { val: 'front_to_rear', label: 'Front ↔ Rear', desc: 'Swap front and rear axles' },
                        { val: 'cross', label: 'Cross Rotation', desc: 'Diagonal swap pattern' },
                        { val: 'side_swap', label: 'Side Swap', desc: 'Left ↔ Right per axle' },
                        { val: 'full_rotation', label: 'Full Rotation', desc: 'Circular 4-position rotation' },
                      ].map(opt => (
                        <button key={opt.val} onClick={() => setRotationTemplate(opt.val)} className={`p-3 rounded-xl border-2 text-left transition-all ${rotationTemplate === opt.val ? (isDarkMode ? 'border-blue-500 bg-blue-500/10' : 'border-blue-400 bg-blue-50') : (isDarkMode ? 'border-neutral-700 hover:border-neutral-600' : 'border-gray-200 hover:border-gray-300')}`}>
                          <p className={`text-xs font-semibold text-foreground`}>{opt.label}</p>
                          <p className={`text-[10px] text-muted-foreground`}>{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label><input type="number" value={rotationOdometer} onChange={e => setRotationOdometer(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'} outline-none`} placeholder="Current odometer" /></div>
                      <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Notes</label><input type="text" value={rotationNotes} onChange={e => setRotationNotes(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'} outline-none`} placeholder="Optional notes" /></div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowRotation(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'}`}>Cancel</button>
                      <button onClick={handleRotateTires} disabled={submittingRotation} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1.5">{submittingRotation && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Confirm Rotation</button>
                    </div>
                  </div>
                )}

                {/* Tire Change Dialog */}
                {showTireChange && (
                  <div className={`rounded-lg p-5 mb-5 border-2 ${isDarkMode ? 'bg-neutral-800/60 border-red-500/30' : 'bg-white border-red-200'}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Tire Change</h3>
                    <p className={`text-xs mb-4 text-muted-foreground`}>Replace the full tire set. The current set will be marked as stored.</p>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowTireChange(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'}`}>Cancel</button>
                      <button onClick={async () => { if (!vehicleId) return; setTireActionError(null); try { await api.vehicleIntelligence.changeTires(vehicleId, { scope: 'full_set' }); setShowTireChange(false); refreshTireWear(); loadTireDetail(); } catch (err: any) { setTireActionError(err?.message || 'Failed to change tires.'); } }} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white">Confirm Full Change</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── ROTATION HISTORY TAB ── */}
            {tireModalTab === 'history' && !tireDetailLoading && (
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-5 text-muted-foreground`}>Tire Movement History</h3>
                {(tireDetail?.rotationHistory ?? []).length > 0 ? (
                  <div className="space-y-0">
                    {(tireDetail?.rotationHistory ?? []).map((entry: any, i: number) => (
                      <div key={entry.id} className="relative flex items-start gap-3 py-4">
                        {i < (tireDetail?.rotationHistory?.length ?? 0) - 1 && <div className={`absolute left-[9px] w-px bg-muted`} style={{ top: 'calc(50% + 4px)', height: '100%' }} />}
                        <div className="relative z-10 mt-1 shrink-0">
                          {entry.changeType === 'ROTATION' ? <RefreshCw className="w-[18px] h-[18px] text-blue-500" /> : entry.changeType === 'TIRE_CHANGE' ? <TireIcon className="w-[18px] h-[18px] text-red-500" /> : <Plus className="w-[18px] h-[18px] text-green-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold text-foreground`}>{new Date(entry.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' })}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${entry.changeType === 'ROTATION' ? (isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700') : entry.changeType === 'TIRE_CHANGE' ? (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700') : (isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700')}`}>{entry.changeType.replace('_', ' ')}</span>
                            {entry.odometerKm != null && <span className={`text-[10px] text-muted-foreground`}>{entry.odometerKm.toLocaleString()} km</span>}
                          </div>
                          {entry.rotationTemplate && <p className={`text-xs mt-0.5 text-muted-foreground`}>Pattern: {entry.rotationTemplate.replace(/_/g, ' ')}</p>}
                          {entry.notes && <p className={`text-[10px] mt-0.5 text-muted-foreground`}>{entry.notes}</p>}
                          {entry.createdBy && <p className={`text-[9px] mt-0.5 text-muted-foreground/60`}>by {entry.createdBy}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground/70`}>
                    <RefreshCw className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No rotation or change events recorded</p>
                    <p className="text-xs mt-1 opacity-60">Use the Rotate or Change actions to log tire movements</p>
                  </div>
                )}

                {/* Measurement History */}
                {(tireDetail?.measurements ?? []).length > 0 && (
                  <div className={`mt-6 pt-5 border-t border-border`}>
                    <h4 className={`text-xs font-semibold uppercase tracking-wider mb-4 text-muted-foreground`}>Measurement History</h4>
                    <div className="space-y-3">
                      {(tireDetail?.measurements ?? []).map((m: any) => (
                        <div key={m.id} className={`rounded-xl p-3 bg-muted`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Ruler className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                            <span className={`text-xs font-semibold text-foreground`}>{new Date(m.date).toLocaleDateString('de-DE')}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${isDarkMode ? 'bg-neutral-600 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>{m.source}</span>
                            {m.odometerKm != null && <span className={`text-[10px] text-muted-foreground`}>{m.odometerKm.toLocaleString()} km</span>}
                            {m.workshopName && <span className={`text-[10px] text-muted-foreground`}>{m.workshopName}</span>}
                          </div>
                          <div className="flex gap-3">
                            {m.values.map((v: any) => (
                              <span key={v.position} className={`text-xs text-foreground/80`}><span className="font-semibold">{v.position}</span>: {v.mm.toFixed(1)} mm</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── WEAR FACTORS TAB ── */}
            {tireModalTab === 'factors' && !tireDetailLoading && tireDetail && (
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 text-muted-foreground`}>Wear Factor Analysis</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  {[
                    { icon: Activity, label: 'Axle (Front)', val: tireDetail.factors.axleFactorFront, desc: (v: number) => v <= 1.0 ? 'Low load' : v <= 1.1 ? 'Normal' : 'High load', warn: (v: number) => v > 1.15 },
                    { icon: Activity, label: 'Axle (Rear)', val: tireDetail.factors.axleFactorRear, desc: (v: number) => v <= 1.0 ? 'Low load' : v <= 1.1 ? 'Normal' : 'High load', warn: (v: number) => v > 1.15 },
                    { icon: Wind, label: 'Usage Mix', val: tireDetail.factors.usageFactor, desc: (v: number) => v < 0.97 ? 'Highway-heavy' : v > 1.08 ? 'City-heavy' : 'Balanced', warn: (v: number) => v > 1.10 },
                    { icon: Gauge, label: 'Behavior', val: tireDetail.factors.behaviorFactor, desc: (v: number) => v <= 1.0 ? 'Smooth' : v <= 1.08 ? 'Normal' : 'Aggressive', warn: (v: number) => v > 1.10 },
                    { icon: Thermometer, label: 'Heat Stress', val: tireDetail.factors.temperatureFactor, desc: (v: number) => v <= 1.0 ? 'Optimal' : v <= 1.03 ? 'Mild' : 'Elevated', warn: (v: number) => v > 1.03 },
                    ...(tireDetail.factors.pressureFactorFront != null ? [{ icon: Gauge, label: 'Pressure (F)', val: tireDetail.factors.pressureFactorFront, desc: (v: number) => v <= 1.01 ? 'Normal' : v <= 1.06 ? 'Mild deviation' : 'Significant', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.pressureFactorRear != null ? [{ icon: Gauge, label: 'Pressure (R)', val: tireDetail.factors.pressureFactorRear, desc: (v: number) => v <= 1.01 ? 'Normal' : v <= 1.06 ? 'Mild deviation' : 'Significant', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.loadFactor != null ? [{ icon: Activity, label: 'Load', val: tireDetail.factors.loadFactor, desc: (v: number) => v <= 1.01 ? 'Normal weight' : v <= 1.06 ? 'Above avg' : 'Heavy', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.seasonMismatchFactor != null && tireDetail.factors.seasonMismatchFactor > 1.01 ? [{ icon: AlertTriangle, label: 'Season Match', val: tireDetail.factors.seasonMismatchFactor, desc: () => 'Mismatch detected', warn: () => true }] : []),
                    ...(tireDetail.factors.interactionPenaltyFront != null && tireDetail.factors.interactionPenaltyFront > 1.01 ? [{ icon: AlertTriangle, label: 'Multi-Stress', val: tireDetail.factors.interactionPenaltyFront, desc: () => 'Combined stressors', warn: () => true }] : []),
                    { icon: Zap, label: 'Regen Front', val: tireDetail.factors.regenBrakingFactorFront, desc: (v: number) => v < 0.85 ? 'Strong regen' : v < 1 ? 'Moderate regen' : 'No regen', warn: () => false },
                    { icon: Zap, label: 'Regen Rear', val: tireDetail.factors.regenBrakingFactorRear, desc: (v: number) => v < 0.85 ? 'Strong regen' : v < 1 ? 'Moderate regen' : 'No regen', warn: () => false },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${f.warn(f.val) ? (isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50') : (isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50')}`}>
                        <f.icon className={`w-4 h-4 ${f.warn(f.val) ? 'text-amber-500' : 'text-blue-500'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>{f.label}</p>
                        <p className={`text-sm font-bold text-foreground`}>{f.val.toFixed(2)}x</p>
                        <p className={`text-[10px] text-muted-foreground`}>{f.desc(f.val)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Staggered Life Adjustments */}
                {tireDetail.factors.isStaggered && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Staggered Setup Adjustments</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className={`text-[10px] text-muted-foreground`}>Front Life Adj.</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.staggeredLifeAdjustmentFront.toFixed(3)}x</p></div>
                      <div><p className={`text-[10px] text-muted-foreground`}>Rear Life Adj.</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.staggeredLifeAdjustmentRear.toFixed(3)}x</p></div>
                    </div>
                  </div>
                )}

                <div className={`mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3`}>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>k-Factor Front</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.kFactorFront.toFixed(3)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>k-Factor Rear</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.kFactorRear.toFixed(3)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Wear Rate</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.effectiveWearRate.front.toLocaleString()} / {tireDetail.effectiveWearRate.rear.toLocaleString()} km/mm</p></div>
                </div>

                {/* Regression & Calibration Status */}
                <div className={`mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3`}>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Model</p>
                    <p className={`text-xs font-bold ${tireDetail.factors.regressionActive ? (isDarkMode ? 'text-cyan-400' : 'text-cyan-600') : 'text-foreground'}`}>
                      {tireDetail.factors.regressionActive ? `Regression (R²: ${tireDetail.factors.regressionConfidence.toFixed(2)})` : 'Formula-based'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Calibrations</p>
                    <p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.calibrationCount}</p>
                  </div>
                  {tireDetail.factors.driveType && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Drivetrain</p>
                      <p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.driveType}</p>
                    </div>
                  )}
                  {tireDetail.factors.tireArchetype && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Tire Archetype</p>
                      <p className={`text-xs font-bold capitalize text-foreground`}>{(tireDetail.factors.tireArchetype as string).replace(/_/g, ' ')}</p>
                    </div>
                  )}
                </div>

                {/* Explainability / Source Transparency */}
                {tireDetail.explainability && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Data Sources & Intelligence</p>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Tread Source</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.currentTreadSource.replace(/_/g, ' ')}</p></div>
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Ref. New Tread</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.referenceNewTreadSource.replace(/_/g, ' ')}</p></div>
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Replace Threshold</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.replacementThresholdSource.replace(/_/g, ' ')}</p></div>
                    </div>
                    {tireDetail.explainability.topWearDrivers.length > 0 && (
                      <div className="mb-2"><p className={`text-[9px] uppercase text-muted-foreground/70`}>Top Wear Drivers</p><p className={`text-[10px] font-semibold capitalize ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{tireDetail.explainability.topWearDrivers.join(', ')}</p></div>
                    )}
                    {tireDetail.explainability.possibleCauseHints.length > 0 && (
                      <div className={`rounded-lg p-2.5 mt-2 ${isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                        {tireDetail.explainability.possibleCauseHints.map((h, i) => (
                          <p key={i} className={`text-[10px] ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>• {h}</p>
                        ))}
                      </div>
                    )}
                    {tireDetail.factors.tireSpecMatched && (
                      <p className={`text-[9px] mt-2 ${isDarkMode ? 'text-blue-400/70' : 'text-blue-600/70'}`}>AI Tire Spec matched — model-aware intelligence active (confidence: {tireDetail.explainability.tireSpecConfidence}%)</p>
                    )}
                  </div>
                )}

                {/* Confidence Dimensions */}
                {(tireDetail.summary.tireSpecConfidence != null || tireDetail.summary.dataCompletenessConfidence != null || tireDetail.summary.modelConfidence != null) && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Confidence Breakdown</p>
                    <div className="grid grid-cols-3 gap-3">
                      {tireDetail.summary.tireSpecConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Tire Spec</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${tireDetail.summary.tireSpecConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.tireSpecConfidence}%</p>
                        </div>
                      )}
                      {tireDetail.summary.dataCompletenessConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Data Quality</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${tireDetail.summary.dataCompletenessConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.dataCompletenessConfidence}%</p>
                        </div>
                      )}
                      {tireDetail.summary.modelConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Model</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${tireDetail.summary.modelConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.modelConfidence}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════ HV Battery Detail Modal (EV) ═══════════ */}
      {showHvBattery && isEv && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6" onClick={() => closeModal(setShowHvBattery)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div onClick={e => e.stopPropagation()} className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-lg border bg-card border-border`}>
            <div className={`sticky top-0 z-10 px-5 py-4 rounded-t-xl border-b bg-card border-border`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <BatteryCharging className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">HV Battery Health</h2>
                    <p className={`text-xs text-muted-foreground`}>Traction Battery Intelligence</p>
                  </div>
                </div>
                <button onClick={() => closeModal(setShowHvBattery)} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* SOH Overview */}
              <div className={`rounded-lg p-5 bg-muted`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-semibold text-foreground`}>State of Health</h3>
                  {hvBatteryStatus?.publicationState && (
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      hvBatteryStatus.publicationState === 'INITIAL_CALIBRATION' ? 'bg-blue-100 text-blue-700' :
                      hvBatteryStatus.publicationState === 'STABILIZING' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>{hvBatteryStatus.publicationState === 'INITIAL_CALIBRATION' ? 'Calibrating' : hvBatteryStatus.publicationState === 'STABILIZING' ? 'Stabilizing' : 'Stable'}</span>
                  )}
                </div>
                {hvBatteryStatus?.publicationState === 'INITIAL_CALIBRATION' ? (
                  <div className={`rounded-xl p-4 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Initial calibration in progress</span>
                      <span className="inline-flex">{[0,1,2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${isDarkMode ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}</span>
                    </div>
                    <p className={`text-[10px] ${isDarkMode ? 'text-blue-400/60' : 'text-blue-500/60'}`}>Collecting charge and discharge data for accurate battery health estimation</p>
                    {hvBatteryStatus.publicationMethod === 'degradation_model' && (
                      <p className={`text-[9px] mt-1 ${isDarkMode ? 'text-amber-400/50' : 'text-amber-500/50'}`}>Currently using model-based estimate only — needs measured data for reliable SOH</p>
                    )}
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="text-center">
                        <div className={`text-2xl font-black text-foreground`}>{hvBatteryStatus?.currentSocPercent != null ? `${hvBatteryStatus.currentSocPercent}%` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Current SoC</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-black text-foreground`}>{hvBatteryStatus?.estimatedRangeKm != null ? `${Math.round(hvBatteryStatus.estimatedRangeKm)}` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Est. Range (km)</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <div className={`text-3xl font-black ${
                          (hvBatteryStatus?.sohPercent ?? 0) >= 80 ? 'text-green-500' :
                          (hvBatteryStatus?.sohPercent ?? 0) >= 60 ? 'text-amber-500' : 'text-red-500'
                        }`}>{hvBatteryStatus?.sohPercent != null ? `${hvBatteryStatus.publicationState === 'STABILIZING' ? '~' : ''}${hvBatteryStatus.sohPercent}%` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>{hvBatteryStatus?.publicationState === 'STABILIZING' ? 'Estimated SOH' : 'SOH'}</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-3xl font-black text-foreground`}>{hvBatteryStatus?.currentSocPercent != null ? `${hvBatteryStatus.currentSocPercent}%` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Current SoC</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-3xl font-black text-foreground`}>{hvBatteryStatus?.estimatedRangeKm != null ? `${Math.round(hvBatteryStatus.estimatedRangeKm)}` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Est. Range (km)</p>
                      </div>
                    </div>
                    {/* Maturity / method info */}
                    {hvBatteryStatus?.publicationMethod && (
                      <div className={`flex items-center gap-3 mt-3 text-muted-foreground`}>
                        <span className="text-[10px]">Method: <strong className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{hvBatteryStatus.publicationMethod.replace(/_/g, ' ')}</strong></span>
                        {hvBatteryStatus.maturityConfidence && <span className="text-[10px]">Confidence: <strong className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{hvBatteryStatus.maturityConfidence}</strong></span>}
                        {hvBatteryStatus.validEstimateCount != null && <span className="text-[10px]">Estimates: <strong className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{hvBatteryStatus.validEstimateCount}</strong></span>}
                      </div>
                    )}
                  </>
                )}
                {hvBatteryStatus?.publicationState !== 'INITIAL_CALIBRATION' && hvBatteryStatus?.sohInterpretation && (
                  <div className={`mt-4 rounded-xl p-3 ${
                    hvBatteryStatus.sohInterpretation.color === 'green' ? (isDarkMode ? 'bg-green-500/10' : 'bg-green-50') :
                    hvBatteryStatus.sohInterpretation.color === 'amber' ? (isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50') :
                    hvBatteryStatus.sohInterpretation.color === 'orange' ? (isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50') :
                    hvBatteryStatus.sohInterpretation.color === 'red' ? (isDarkMode ? 'bg-red-500/10' : 'bg-red-50') :
                    (isDarkMode ? 'bg-neutral-800' : 'bg-gray-100')
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${
                        hvBatteryStatus.sohInterpretation.color === 'green' ? 'text-green-500' :
                        hvBatteryStatus.sohInterpretation.color === 'amber' ? 'text-amber-500' :
                        hvBatteryStatus.sohInterpretation.color === 'orange' ? 'text-orange-500' :
                        hvBatteryStatus.sohInterpretation.color === 'red' ? 'text-red-500' :
                        (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                      }`}>{hvBatteryStatus.sohInterpretation.label}</span>
                      <span className={`text-[10px] text-muted-foreground/70`}>via {hvBatteryStatus.sohMethod?.replace(/_/g, ' ')}</span>
                    </div>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{hvBatteryStatus.sohInterpretation.description}</p>
                  </div>
                )}
              </div>

              {/* Capacity */}
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-sm font-semibold mb-3 text-foreground`}>Battery Capacity</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>Nominal</p>
                    <p className={`text-lg font-bold text-foreground`}>{hvBatteryStatus?.nominalCapacityKwh != null ? `${hvBatteryStatus.nominalCapacityKwh} kWh` : '—'}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>Estimated Current</p>
                    <p className={`text-lg font-bold text-foreground`}>{hvBatteryStatus?.estimatedCurrentCapacityKwh != null ? `${hvBatteryStatus.estimatedCurrentCapacityKwh} kWh` : '—'}</p>
                  </div>
                </div>
              </div>

              {/* Charging Sessions */}
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-sm font-semibold mb-4 text-foreground`}>Charging Sessions</h3>
                {hvBatteryStatus?.chargingSessions?.length > 0 ? (
                  <div className="space-y-3">
                    {hvBatteryStatus.chargingSessions.map((s: any, i: number) => (
                      <div key={i} className={`rounded-xl p-3 bg-muted`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <BatteryCharging className={`w-3.5 h-3.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-500'}`} />
                            <span className={`text-xs font-semibold text-foreground`}>
                              {new Date(s.startTime).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className={`text-[10px] text-muted-foreground`}>
                              {new Date(s.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            {s.startSoc}% → {s.endSoc}%
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {s.energyChargedKwh != null && (
                            <div><p className={`text-[10px] text-muted-foreground/70`}>Energy</p><p className={`text-xs font-semibold text-foreground`}>{s.energyChargedKwh.toFixed(1)} kWh</p></div>
                          )}
                          {s.maxChargingPowerKw != null && (
                            <div><p className={`text-[10px] text-muted-foreground/70`}>Max Power</p><p className={`text-xs font-semibold text-foreground`}>{s.maxChargingPowerKw} kW</p></div>
                          )}
                          <div><p className={`text-[10px] text-muted-foreground/70`}>Duration</p><p className={`text-xs font-semibold text-foreground`}>{s.durationMinutes} min</p></div>
                          {s.rangeGainedKm != null && (
                            <div><p className={`text-[10px] text-muted-foreground/70`}>Range Gained</p><p className={`text-xs font-semibold text-foreground`}>+{s.rangeGainedKm} km</p></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center justify-center py-10 text-muted-foreground/70`}>
                    <BatteryCharging className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No charging sessions recorded</p>
                    <p className="text-xs mt-1 opacity-60">Charging data will appear as telemetry is collected</p>
                  </div>
                )}
              </div>

              {/* SOH Trend */}
              {hvBatteryStatus?.recentTrend?.length > 0 && (
                <div className={`rounded-lg p-5 bg-muted`}>
                  <h3 className={`text-sm font-semibold mb-4 text-foreground`}>SOH Trend</h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={hvBatteryStatus.recentTrend.map((t: any) => ({
                        date: new Date(t.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                        soh: t.sohPercent,
                        soc: t.socPercent,
                      }))}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke={isDarkMode ? '#555' : '#bbb'} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke={isDarkMode ? '#555' : '#bbb'} />
                        <Tooltip contentStyle={{ background: isDarkMode ? '#1c1c1c' : '#fff', border: 'none', borderRadius: 12, fontSize: 11 }} />
                        <Line type="monotone" dataKey="soh" stroke="#10b981" strokeWidth={2} dot={false} name="SOH %" />
                        <Line type="monotone" dataKey="soc" stroke="#6366f1" strokeWidth={1.5} dot={false} name="SoC %" strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Euromaster Tire Service Modal */}
      <EuromasterServiceRequestModal
        isDarkMode={isDarkMode}
        isOpen={showEuromasterTireModal}
        onClose={() => setShowEuromasterTireModal(false)}
        prefill={{
          vehicleId: vehicleId,
          serviceType: 'TIRE_SERVICE',
          notes: 'Tire service request from vehicle health view',
          context: 'tire-health',
        }}
      />
    </div>
  );
}
