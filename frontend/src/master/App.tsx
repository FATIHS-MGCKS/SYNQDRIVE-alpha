import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import type { MasterView } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { RightSidebar } from './components/RightSidebar';
import { MasterDashboardView } from './components/MasterDashboardView';
import { OrganizationsView } from './components/OrganizationsView';
import { OrganizationDetailView } from './components/OrganizationDetailView';
import { PlatformUsersView } from './components/PlatformUsersView';
import { PlatformVehiclesView } from './components/PlatformVehiclesView';
import { SubscriptionsView } from './components/SubscriptionsView';
import { ActivityLogView } from './components/ActivityLogView';
import { SupportView } from './components/SupportView';
import { PlatformSettingsView } from './components/PlatformSettingsView';
import { ProspectsView } from './components/ProspectsView';
import { FleetConnectionView } from './components/FleetConnectionView';
import { PartsAccessoriesAdminView } from './components/PartsAccessoriesAdminView';
import { InsurancesAdminView } from './components/InsurancesAdminView';
import { VoiceAssistantAdminView } from './components/VoiceAssistantAdminView';
import { ArchitekturView } from './components/ArchitekturView';
import { ChangesView } from './components/ChangesView';
import { HealthTrackingView } from './components/HealthTrackingView';
import { TripDetectionLogicView } from './components/TripDetectionLogicView';
import { PerformanceLogicView } from './components/PerformanceLogicView';
import VehicleLogbookView from './components/VehicleLogbookView';
import { HighMobilityDataView } from './components/HighMobilityDataView';
import { HighMobilityCompatibilityView } from './components/HighMobilityCompatibilityView';
import { Toaster, toast } from 'sonner';
import type { Organization, PlatformUser, RegisteredVehicle, DimoVehicle } from './data/platform-data';
import { api } from '../lib/api';
import { AppShell } from '../components/shell';

function mapApiOrg(o: any): Organization {
  return {
    id: o.id,
    company_name: o.company_name ?? o.companyName ?? '',
    business_type: o.business_type ?? o.businessType ?? 'Other',
    city: o.city ?? '',
    country: o.country ?? '',
    fleet_size: o.fleet_size ?? o.vehicles?.length ?? 0,
    created_at: o.created_at ?? o.createdAt ?? '',
    status: (o.status ?? 'Active') as any,
    plan: (o.plan ?? 'Starter') as any,
    mrr: o.mrr ?? 0,
    users: o.users ?? 0,
    contactEmail: o.contactEmail ?? o.email ?? '',
    lastActive: o.lastActive ?? '',
    products: o.products ?? [],
    integrations: o.integrations ?? [],
    invoices: o.invoices ?? [],
  };
}

function mapApiUser(u: any): PlatformUser {
  return {
    id: u.id,
    name: u.name ?? '',
    email: u.email ?? '',
    role: (u.role ?? 'Worker') as any,
    organizationId: u.organizationId ?? u.organization_id ?? '',
    organizationName: u.organizationName ?? u.organization_name ?? '',
    status: (u.status ?? 'Active') as any,
    lastActive: u.lastActive ?? u.last_login ?? '',
    created_at: u.created_at ?? u.createdAt ?? '',
    avatar: u.avatar ?? (u.name ?? '').slice(0, 2).toUpperCase(),
    last_login: u.last_login ?? u.lastLogin ?? '',
  };
}

function mapApiRegisteredVehicle(v: any): RegisteredVehicle {
  return {
    id: v.id,
    vehicleName: v.vehicleName ?? v.name ?? `${v.make ?? ''} ${v.model ?? ''}`.trim(),
    vin: v.vin ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    year: v.year ?? 0,
    organizationId: v.organizationId ?? v.organization_id ?? '',
    organizationName: v.organizationName ?? v.organization?.companyName ?? '',
    station: v.station ?? v.stationName ?? '',
    status: (v.status ?? 'Available') as any,
    health: (v.health ?? 'Good') as any,
    lastSignal: v.lastSignal ?? v.last_signal ?? '',
    online: v.online ?? false,
    fuelType: v.fuelType ?? v.fuel_type ?? '',
    mileage: v.mileage ?? v.mileageKm ?? v.mileage_km ?? v.odometer ?? 0,
    licensePlate: v.licensePlate ?? v.license_plate ?? '',
    vehicleType: v.vehicleType ?? '',
    operationalStatus: v.operationalStatus ?? '',
    notes: v.notes ?? '',
    batteryType: v.batteryType ?? '',
    batteryAmpere: v.batteryAmpere ?? '',
    batteryVolt: v.batteryVolt ?? '',
    hvBatteryCapacityKwh: v.hvBatteryCapacityKwh != null ? String(v.hvBatteryCapacityKwh) : '',
    tankCapacityLiters: v.tankCapacityLiters != null ? String(v.tankCapacityLiters) : '',
    tireFrontDimension: v.tireFrontDimension ?? '',
    tireFrontBrandModel: v.tireFrontBrandModel ?? '',
    tireFrontSeason: v.tireFrontSeason ?? '',
    tireFrontDot: v.tireFrontDot ?? '',
    tireFrontLoadIndex: v.tireFrontLoadIndex ?? '',
    tireFrontSpeedIndex: v.tireFrontSpeedIndex ?? '',
    tireBackDimension: v.tireBackDimension ?? '',
    tireBackBrandModel: v.tireBackBrandModel ?? '',
    tireBackSeason: v.tireBackSeason ?? '',
    tireBackDot: v.tireBackDot ?? '',
    tireBackLoadIndex: v.tireBackLoadIndex ?? '',
    tireBackSpeedIndex: v.tireBackSpeedIndex ?? '',
    treadDepthFL: v.treadDepthFL ?? '',
    treadDepthFR: v.treadDepthFR ?? '',
    treadDepthBL: v.treadDepthBL ?? '',
    treadDepthBR: v.treadDepthBR ?? '',
    brakeFrontRotorDiameter: v.brakeFrontRotorDiameter ?? '',
    brakeFrontRotorWidth: v.brakeFrontRotorWidth ?? '',
    brakeFrontPadThickness: v.brakeFrontPadThickness ?? '',
    brakeBackRotorDiameter: v.brakeBackRotorDiameter ?? '',
    brakeBackRotorWidth: v.brakeBackRotorWidth ?? '',
    brakeBackPadThickness: v.brakeBackPadThickness ?? '',
    idleRpm: v.idleRpm ?? '',
    maxRpm: v.maxRpm ?? '',
    drivetrain: v.drivetrain ?? v.driveType ?? '',
    brakeForceDistribution: v.brakeForceDistribution ?? '',
    frontToRearWeightDistribution: v.frontToRearWeightDistribution ?? '',
    curbWeight: v.curbWeight ?? '',
    serviceIntervals: v.serviceIntervals ?? '',
    serviceIntervalManufacturerKm: v.serviceIntervalManufacturerKm ?? '',
    serviceIntervalManufacturerMonths: v.serviceIntervalManufacturerMonths ?? '',
    oilChangeIntervalKm: v.oilChangeIntervalKm ?? '',
    oilChangeIntervalMonths: v.oilChangeIntervalMonths ?? '',
    lastTuev: v.lastTuev ?? '',
    lastBokraft: v.lastBokraft ?? '',
    lastInspection: v.lastInspection ?? '',
    lastOilChange: v.lastOilChange ?? '',
    lastBrakePadChange: v.lastBrakePadChange ?? '',
    lastBrakeRotorChange: v.lastBrakeRotorChange ?? '',
    // Interpreted telemetry fields
    signalAgeMs: typeof v.signalAgeMs === 'number' ? v.signalAgeMs : undefined,
    isFresh: typeof v.isFresh === 'boolean' ? v.isFresh : undefined,
    onlineStatus: (['ONLINE', 'STANDBY', 'OFFLINE'].includes(v.onlineStatus) ? v.onlineStatus : undefined) as RegisteredVehicle['onlineStatus'],
    displayState: (['MOVING', 'IDLE', 'PARKED'].includes(v.displayState) ? v.displayState : undefined) as RegisteredVehicle['displayState'],
    displayIgnition: (['ON', 'OFF', 'UNKNOWN'].includes(v.displayIgnition) ? v.displayIgnition : undefined) as RegisteredVehicle['displayIgnition'],
    isLiveTracking: typeof v.isLiveTracking === 'boolean' ? v.isLiveTracking : undefined,
    hardwareType: (['LTE_R1', 'SMART5', 'UNKNOWN'].includes(v.hardwareType)
      ? v.hardwareType
      : 'UNKNOWN') as RegisteredVehicle['hardwareType'],
  };
}

function mapApiDimoVehicle(v: any): DimoVehicle {
  return {
    id: v.id,
    tokenId: v.tokenId ?? null,
    vin: v.vin ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    year: v.year ?? 0,
    odometer: v.odometer ?? 0,
    battery: v.battery ?? null,
    fuelLevel: v.fuelLevel ?? null,
    powertrainType: v.powertrainType ?? null,
    lastSignal: typeof v.lastSignal === 'string' ? v.lastSignal : (v.lastSignal ? new Date(v.lastSignal).toLocaleString() : ''),
    connectionStatus: (v.connectionStatus ?? 'Disconnected') as 'Connected' | 'Disconnected',
  };
}

const BUSINESS_TYPE_LABEL_TO_ENUM: Record<string, string> = {
  'Car Rental': 'RENTAL', 'Fleet Management': 'FLEET', 'Car Sharing': 'RENTAL',
  'Taxi Service': 'TAXI', 'Logistics': 'LOGISTICS', 'Mobility Services': 'OTHER',
  Rental: 'RENTAL', Fleet: 'FLEET', Taxi: 'TAXI', Other: 'OTHER',
};
const STATUS_LABEL_TO_ENUM: Record<string, string> = {
  Active: 'ACTIVE', Trial: 'PENDING', Suspended: 'SUSPENDED', Churned: 'ARCHIVED',
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentView, setCurrentView] = useState<MasterView>('dashboard');
  const [settingsTab, setSettingsTab] = useState<string>('general');

  // Centralized data state - empty by default, loaded from API
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [registeredVehicles, setRegisteredVehicles] = useState<RegisteredVehicle[]>([]);
  const [dimoVehicles, setDimoVehicles] = useState<DimoVehicle[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const load = async () => {
      setDataLoading(true);
      try {
        const [orgRes, usersRes, vehiclesRes, dimoRes, statsRes] = await Promise.all([
          api.organizations.list().catch(() => ({ data: [], meta: { total: 0 } })),
          api.users.listAll().catch(() => []),
          api.vehicles.listAll().catch(() => ({ data: [] })),
          api.dimo.nonRegistered().catch(() => []),
          api.dimo.stats().catch(() => ({ connected: 0, total: 0 })),
        ]);
        setOrganizations((orgRes.data || []).map(mapApiOrg));
        setUsers(Array.isArray(usersRes) ? usersRes.map(mapApiUser) : []);
        setRegisteredVehicles((vehiclesRes.data || []).map(mapApiRegisteredVehicle));
        setDimoVehicles(Array.isArray(dimoRes) ? dimoRes.map(mapApiDimoVehicle) : []);
        const stats = statsRes as { connected?: number; total?: number };
        setDimoConnected((stats.total ?? 0) > 0 || (stats.connected ?? 0) > 0);
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setDataLoading(false);
      }
    };
    load();
  }, []);

  // Connection states (DIMO from API)
  const [dimoConnected, setDimoConnected] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(true);

  // Organization detail
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  const reloadFromApi = async () => {
    try {
      const [orgRes, usersRes, vehiclesRes, dimoRes] = await Promise.all([
        api.organizations.list().catch(() => ({ data: [], meta: { total: 0 } })),
        api.users.listAll().catch(() => []),
        api.vehicles.listAll().catch(() => ({ data: [] })),
        api.dimo.nonRegistered().catch(() => []),
      ]);
      setOrganizations((orgRes.data || []).map(mapApiOrg));
      setUsers(Array.isArray(usersRes) ? usersRes.map(mapApiUser) : []);
      setRegisteredVehicles((vehiclesRes.data || []).map(mapApiRegisteredVehicle));
      setDimoVehicles(Array.isArray(dimoRes) ? dimoRes.map(mapApiDimoVehicle) : []);
    } catch { /* keep current state */ }
  };

  // ============ ORGANIZATION CRUD ============
  const handleAddOrg = async (org: Organization, adminData?: { name: string; email: string; password: string } | null) => {
    try {
      const businessTypeEnum = BUSINESS_TYPE_LABEL_TO_ENUM[org.business_type] ?? org.business_type;
      const statusEnum = STATUS_LABEL_TO_ENUM[org.status] ?? org.status;

      const createdOrg = await api.organizations.create({
        companyName: org.company_name,
        businessType: businessTypeEnum,
        email: org.contactEmail,
        city: org.city,
        country: org.country,
        status: statusEnum,
      });

      if (adminData && createdOrg?.id) {
        await api.organizations.createAdmin(createdOrg.id, adminData);
        toast.success(`Organization "${org.company_name}" and Org Admin "${adminData.name}" created`);
      } else {
        toast.success(`Organization "${org.company_name}" created`);
      }
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create organization');
      throw e;
    }
  };
  const handleUpdateOrg = async (org: Organization) => {
    try {
      const businessTypeEnum = BUSINESS_TYPE_LABEL_TO_ENUM[org.business_type] ?? org.business_type;
      const statusEnum = STATUS_LABEL_TO_ENUM[org.status] ?? org.status;
      await api.organizations.update(org.id, {
        companyName: org.company_name,
        businessType: businessTypeEnum,
        city: org.city,
        country: org.country,
        email: org.contactEmail,
        status: statusEnum,
      });
      if (selectedOrg?.id === org.id) setSelectedOrg(org);
      toast.success(`Organization "${org.company_name}" updated`);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update organization');
    }
  };
  const handleDeleteOrg = async (id: string) => {
    const org = organizations.find(o => o.id === id);
    try {
      await api.organizations.delete(id);
      toast.success(`Organization "${org?.company_name}" deleted`);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete organization');
    }
  };

  // ============ USER CRUD ============
  const handleAddUser = async (user: PlatformUser) => {
    try {
      const orgId = user.organizationId;
      await api.users.create({
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: orgId || undefined,
      });
      toast.success(`User "${user.name}" created`);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create user');
    }
  };
  const handleUpdateUser = async (user: PlatformUser) => {
    try {
      await api.users.update(user.id, {
        name: user.name,
        email: user.email,
        role: user.role,
      });
      toast.success(`User "${user.name}" updated`);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update user');
    }
  };
  const handleDeleteUser = async (id: string) => {
    try {
      await api.users.delete(id);
      toast.success('User deleted');
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete user');
    }
  };

  // ============ DIMO SYNC (fetch from DIMO API) ============
  const handleSyncFromDimo = async () => {
    try {
      const res = await api.dimo.sync();
      toast.success(res?.message ?? `${res?.synced ?? 0} vehicles synced from DIMO`);
      const dimoRes = await api.dimo.nonRegistered();
      setDimoVehicles(Array.isArray(dimoRes) ? dimoRes.map(mapApiDimoVehicle) : []);
    } catch (e: any) {
      toast.error(e?.message || 'DIMO sync failed');
    }
  };

  // ============ DIMO REFRESH SNAPSHOT (single vehicle) ============
  const handleRefreshSnapshot = async (id: string): Promise<DimoVehicle> => {
    const res = await api.dimo.refreshSnapshot(id);
    const mapped = mapApiDimoVehicle(res);
    setDimoVehicles(prev => prev.map(v => v.id === id ? mapped : v));
    return mapped;
  };

  // ============ VEHICLE REGISTRATION ============
  const parseOptFloat = (s: string | undefined): number | undefined => {
    if (!s?.trim()) return undefined;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const parseOptInt = (s: string | undefined): number | undefined => {
    if (!s?.trim()) return undefined;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const driveTypeToApi = (label: string): string | undefined => {
    const m: Record<string, string> = { FWD: 'FWD', RWD: 'RWD', AWD: 'AWD', '4WD': 'FOUR_WD', FOUR_WD: 'FOUR_WD' };
    const upper = (label || '').toUpperCase().trim();
    return m[upper] || undefined;
  };
  const parseWeightDist = (s: string | undefined): number | undefined => {
    if (!s?.trim()) return undefined;
    const m = s.match(/^(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : undefined;
  };

  const fuelLabelToApi = (label: string): string => {
    const m: Record<string, string> = {
      Electric: 'ELECTRIC',
      Gasoline: 'GASOLINE',
      Diesel: 'DIESEL',
      Hybrid: 'HYBRID',
      'Plugin Hybrid': 'PLUGIN_HYBRID',
      Other: 'OTHER',
    };
    return m[label] ?? 'OTHER';
  };

  const handleRegisterVehicle = async (vehicle: RegisteredVehicle, dimoId: string) => {
    try {
      const mileageKm = Math.min(
        2147483647,
        Math.max(0, Math.round(Number(vehicle.mileage) || 0)),
      );
      await api.vehicles.registerFromDimo(vehicle.organizationId, {
        dimoVehicleId: dimoId,
        extraData: {
          vehicleName: vehicle.vehicleName?.trim() || undefined,
          licensePlate: vehicle.licensePlate?.trim() || undefined,
          notes: vehicle.notes?.trim() || undefined,
          mileageKm: mileageKm > 0 ? mileageKm : undefined,
          fuelType: fuelLabelToApi(vehicle.fuelType),
          vehicleType: vehicle.vehicleType || undefined,
          hardwareType: vehicle.hardwareType ?? 'UNKNOWN',
          curbWeightKg: parseOptFloat(vehicle.curbWeight),
          idleRpm: parseOptInt(vehicle.idleRpm),
          maxRpm: parseOptInt(vehicle.maxRpm),
          driveType: driveTypeToApi(vehicle.drivetrain) || undefined,
          brakeForceFrontPercent: parseOptFloat(vehicle.brakeForceDistribution),
          frontWeightDistributionPct: parseWeightDist(vehicle.frontToRearWeightDistribution),
          oilChangeIntervalKm: parseOptInt(vehicle.oilChangeIntervalKm),
          oilChangeIntervalMonths: parseOptInt(vehicle.oilChangeIntervalMonths),
          hvBatteryCapacityKwh: parseOptFloat(vehicle.hvBatteryCapacityKwh),
          tankCapacityLiters: parseOptFloat(vehicle.tankCapacityLiters),
          serviceIntervalManufacturerKm: parseOptInt(vehicle.serviceIntervalManufacturerKm),
          serviceIntervalManufacturerMonths: parseOptInt(vehicle.serviceIntervalManufacturerMonths),
          ...(vehicle.lastOilChange ? { lastOilChangeDate: new Date(vehicle.lastOilChange).toISOString() } : {}),
          ...(vehicle.lastInspection ? { lastServiceDate: new Date(vehicle.lastInspection).toISOString() } : {}),
          ...(vehicle.lastTuev ? {
            lastTuvDate: new Date(vehicle.lastTuev).toISOString(),
            nextTuvDate: new Date(new Date(vehicle.lastTuev).setFullYear(new Date(vehicle.lastTuev).getFullYear() + 2)).toISOString(),
          } : {}),
          ...(vehicle.lastBokraft ? {
            lastBokraftDate: new Date(vehicle.lastBokraft).toISOString(),
            nextBokraftDate: new Date(new Date(vehicle.lastBokraft).setFullYear(new Date(vehicle.lastBokraft).getFullYear() + 1)).toISOString(),
          } : {}),
        },
        manualSpecs: {
          battery: {
            batteryType: vehicle.batteryType?.trim() || undefined,
            batteryAmpere: parseOptFloat(vehicle.batteryAmpere),
            batteryVolt: parseOptFloat(vehicle.batteryVolt),
          },
          brakes: {
            frontRotorDiameter: parseOptFloat(vehicle.brakeFrontRotorDiameter),
            frontRotorWidth: parseOptFloat(vehicle.brakeFrontRotorWidth),
            frontPadThickness: parseOptFloat(vehicle.brakeFrontPadThickness),
            rearRotorDiameter: parseOptFloat(vehicle.brakeBackRotorDiameter),
            rearRotorWidth: parseOptFloat(vehicle.brakeBackRotorWidth),
            rearPadThickness: parseOptFloat(vehicle.brakeBackPadThickness),
          },
          tires: {
            frontDimension: vehicle.tireFrontDimension?.trim() || undefined,
            rearDimension: vehicle.tireBackDimension?.trim() || undefined,
            brandModelFront: vehicle.tireFrontBrandModel?.trim() || undefined,
            brandModelRear: vehicle.tireBackBrandModel?.trim() || undefined,
            tireSeason: vehicle.tireFrontSeason || undefined,
            loadIndexFront: vehicle.tireFrontLoadIndex?.trim() || undefined,
            speedIndexFront: vehicle.tireFrontSpeedIndex?.trim() || undefined,
            loadIndexRear: vehicle.tireBackLoadIndex?.trim() || undefined,
            speedIndexRear: vehicle.tireBackSpeedIndex?.trim() || undefined,
            dotCodeFront: vehicle.tireFrontDot?.trim() || undefined,
            dotCodeRear: vehicle.tireBackDot?.trim() || undefined,
            tireCondition: vehicle.tireCondition || undefined,
            treadFL: parseOptFloat(vehicle.treadDepthFL),
            treadFR: parseOptFloat(vehicle.treadDepthFR),
            treadBL: parseOptFloat(vehicle.treadDepthBL),
            treadBR: parseOptFloat(vehicle.treadDepthBR),
            aiTireSpec: vehicle.aiTireSpec || undefined,
          },
        },
      });
      toast.success(`Vehicle "${vehicle.vehicleName}" registered to ${vehicle.organizationName}`);
      // Reload vehicles from API
      const [vehiclesRes, dimoRes] = await Promise.all([
        api.vehicles.listAll(),
        api.dimo.nonRegistered(),
      ]);
      setRegisteredVehicles((vehiclesRes.data || []).map(mapApiRegisteredVehicle));
      setDimoVehicles(Array.isArray(dimoRes) ? dimoRes.map(mapApiDimoVehicle) : []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to register vehicle');
      throw e;
    }
  };

  const handleUpdateVehicle = async (vehicle: RegisteredVehicle) => {
    try {
      const mileageKm = Math.min(2147483647, Math.max(0, Math.round(Number(vehicle.mileage) || 0)));
      await api.vehicles.update(vehicle.organizationId, vehicle.id, {
        licensePlate: vehicle.licensePlate?.trim() || null,
        notes: vehicle.notes?.trim() || null,
        fuelType: fuelLabelToApi(vehicle.fuelType),
        vehicleType: vehicle.vehicleType || undefined,
        hardwareType: vehicle.hardwareType ?? 'UNKNOWN',
        mileageKm: mileageKm > 0 ? mileageKm : undefined,
        curbWeightKg: parseOptFloat(vehicle.curbWeight),
        idleRpm: parseOptInt(vehicle.idleRpm),
        maxRpm: parseOptInt(vehicle.maxRpm),
        driveType: driveTypeToApi(vehicle.drivetrain) || undefined,
        brakeForceFrontPercent: parseOptFloat(vehicle.brakeForceDistribution),
        frontWeightDistributionPct: parseWeightDist(vehicle.frontToRearWeightDistribution),
        oilChangeIntervalKm: parseOptInt(vehicle.oilChangeIntervalKm),
        oilChangeIntervalMonths: parseOptInt(vehicle.oilChangeIntervalMonths),
        tankCapacityLiters: parseOptFloat(vehicle.tankCapacityLiters),
        serviceIntervalManufacturerKm: parseOptInt(vehicle.serviceIntervalManufacturerKm),
        serviceIntervalManufacturerMonths: parseOptInt(vehicle.serviceIntervalManufacturerMonths),
        ...(vehicle.lastOilChange ? { lastOilChangeDate: new Date(vehicle.lastOilChange).toISOString() } : {}),
        ...(vehicle.lastInspection ? { lastServiceDate: new Date(vehicle.lastInspection).toISOString() } : {}),
        ...(vehicle.lastTuev ? {
          lastTuvDate: new Date(vehicle.lastTuev).toISOString(),
          nextTuvDate: new Date(new Date(vehicle.lastTuev).setFullYear(new Date(vehicle.lastTuev).getFullYear() + 2)).toISOString(),
        } : {}),
        ...(vehicle.lastBokraft ? {
          lastBokraftDate: new Date(vehicle.lastBokraft).toISOString(),
          nextBokraftDate: new Date(new Date(vehicle.lastBokraft).setFullYear(new Date(vehicle.lastBokraft).getFullYear() + 1)).toISOString(),
        } : {}),
      });

      const hasTireData =
        vehicle.tireFrontDimension || vehicle.tireBackDimension ||
        vehicle.tireFrontBrandModel || vehicle.tireBackBrandModel ||
        vehicle.treadDepthFL || vehicle.treadDepthFR ||
        vehicle.treadDepthBL || vehicle.treadDepthBR;
      if (hasTireData) {
        await api.vehicles.upsertTires(vehicle.organizationId, vehicle.id, {
          frontDimension: vehicle.tireFrontDimension?.trim() || undefined,
          rearDimension: vehicle.tireBackDimension?.trim() || undefined,
          brandModelFront: vehicle.tireFrontBrandModel?.trim() || undefined,
          brandModelRear: vehicle.tireBackBrandModel?.trim() || undefined,
          tireSeason: vehicle.tireFrontSeason || undefined,
          loadIndexFront: vehicle.tireFrontLoadIndex?.trim() || undefined,
          speedIndexFront: vehicle.tireFrontSpeedIndex?.trim() || undefined,
          loadIndexRear: vehicle.tireBackLoadIndex?.trim() || undefined,
          speedIndexRear: vehicle.tireBackSpeedIndex?.trim() || undefined,
          dotCodeFront: vehicle.tireFrontDot?.trim() || undefined,
          dotCodeRear: vehicle.tireBackDot?.trim() || undefined,
          treadFL: parseOptFloat(vehicle.treadDepthFL),
          treadFR: parseOptFloat(vehicle.treadDepthFR),
          treadBL: parseOptFloat(vehicle.treadDepthBL),
          treadBR: parseOptFloat(vehicle.treadDepthBR),
        });
      }

      toast.success('Vehicle updated successfully');
      const vehiclesRes = await api.vehicles.listAll();
      setRegisteredVehicles((vehiclesRes.data || []).map(mapApiRegisteredVehicle));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update vehicle');
      throw e;
    }
  };

  const handleDeregisterVehicle = async (vehicleId: string) => {
    try {
      await api.vehicles.deregister(vehicleId);
      toast.success('Vehicle deregistered successfully');
      const [vehiclesRes, dimoRes] = await Promise.all([
        api.vehicles.listAll(),
        api.dimo.nonRegistered(),
      ]);
      setRegisteredVehicles((vehiclesRes.data || []).map(mapApiRegisteredVehicle));
      setDimoVehicles(Array.isArray(dimoRes) ? dimoRes.map(mapApiDimoVehicle) : []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to deregister vehicle');
      throw e;
    }
  };

  // ============ CONNECTIONS ============
  const handleDimoToggle = () => {
    setDimoConnected(prev => !prev);
  };
  const handleStripeToggle = () => {
    setStripeConnected(prev => {
      toast.success(prev ? 'Stripe disconnected' : 'Stripe connected');
      return !prev;
    });
  };

  // Helper: get org users/vehicles
  const getOrgUsers = (orgId: string) => users.filter(u => u.organizationId === orgId);
  const getOrgVehicles = (orgId: string) => registeredVehicles.filter(v => v.organizationId === orgId);

  return (
    <AppShell
      variant="master"
      sidebar={(
      <Sidebar
        isDarkMode={isDarkMode}
        currentView={currentView}
        onViewChange={(view) => { setCurrentView(view); setSelectedOrg(null); }}
        settingsTab={settingsTab}
        onSettingsTabChange={setSettingsTab}
      />
      )}
      rightPanel={(
      <RightSidebar isDarkMode={isDarkMode} onViewChange={(view) => { setCurrentView(view as MasterView); }} />
      )}
    >
      <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />

            <TopBar
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
            />

            {/* DASHBOARD */}
            {currentView === 'dashboard' && (
              <MasterDashboardView isDarkMode={isDarkMode} onViewChange={(view) => { setCurrentView(view as MasterView); setSelectedOrg(null); }} />
            )}

            {/* ORGANIZATIONS */}
            {currentView === 'organizations' && !selectedOrg && (
              <OrganizationsView
                isDarkMode={isDarkMode}
                organizations={organizations}
                onSelectOrg={setSelectedOrg}
                onAddOrg={handleAddOrg}
                onUpdateOrg={handleUpdateOrg}
                onDeleteOrg={handleDeleteOrg}
              />
            )}
            {currentView === 'organizations' && selectedOrg && (
              <OrganizationDetailView
                org={selectedOrg}
                orgUsers={getOrgUsers(selectedOrg.id)}
                orgVehicles={getOrgVehicles(selectedOrg.id)}
                onBack={() => setSelectedOrg(null)}
                onUpdateOrg={handleUpdateOrg}
              />
            )}

            {/* USERS */}
            {currentView === 'users' && (
              <PlatformUsersView
                isDarkMode={isDarkMode}
                users={users}
                organizations={organizations}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {/* VEHICLES */}
            {currentView === 'vehicles' && (
              <PlatformVehiclesView
                isDarkMode={isDarkMode}
                registeredVehicles={registeredVehicles}
                dimoVehicles={dimoVehicles}
                organizations={organizations}
                dimoConnected={dimoConnected}
                onRegisterVehicle={handleRegisterVehicle}
                onUpdateVehicle={handleUpdateVehicle}
                onDeregisterVehicle={handleDeregisterVehicle}
                onSyncFromDimo={handleSyncFromDimo}
                onRefreshSnapshot={handleRefreshSnapshot}
                loading={dataLoading}
              />
            )}

            {/* SUBSCRIPTIONS */}
            {currentView === 'subscriptions' && (
              <SubscriptionsView isDarkMode={isDarkMode} />
            )}

            {/* ACTIVITY LOG */}
            {currentView === 'activity-log' && (
              <ActivityLogView isDarkMode={isDarkMode} />
            )}

            {/* SUPPORT */}
            {currentView === 'support' && (
              <SupportView
                organizations={organizations.map((o) => ({ id: o.id, name: o.company_name }))}
                onNavigateToOrg={(orgId) => {
                  const org = organizations.find((o) => o.id === orgId);
                  if (org) {
                    setSelectedOrg(org);
                    setCurrentView('organizations');
                  }
                }}
              />
            )}

            {/* SETTINGS */}
            {currentView === 'settings' && (
              <PlatformSettingsView
                isDarkMode={isDarkMode}
                activeTab={settingsTab}
                onTabChange={setSettingsTab}
                dimoConnected={dimoConnected}
                onDimoToggle={handleDimoToggle}
                stripeConnected={stripeConnected}
                onStripeToggle={handleStripeToggle}
              />
            )}

            {/* PROSPECTS */}
            {currentView === 'prospects' && (
              <ProspectsView />
            )}

            {/* FLEET CONNECTION */}
            {currentView === 'fleet-connection' && (
              <FleetConnectionView />
            )}

            {/* PARTS & ACCESSORIES */}
            {currentView === 'parts-accessories' && (
              <PartsAccessoriesAdminView />
            )}

            {/* INSURANCES */}
            {currentView === 'insurances' && (
              <InsurancesAdminView />
            )}

            {/* VOICE ASSISTANT */}
            {currentView === 'voice-assistant' && (
              <VoiceAssistantAdminView />
            )}

            {/* ARCHITEKTUR */}
            {currentView === 'architektur' && (
              <ArchitekturView isDarkMode={isDarkMode} />
            )}

            {/* CHANGES */}
            {currentView === 'changes' && (
              <ChangesView isDarkMode={isDarkMode} />
            )}

            {/* HEALTH TRACKING */}
            {currentView === 'health-tracking' && (
              <HealthTrackingView isDarkMode={isDarkMode} />
            )}

            {/* TRIP DETECTION LOGIC */}
            {currentView === 'trip-detection-logic' && (
              <TripDetectionLogicView isDarkMode={isDarkMode} />
            )}

            {/* PERFORMANCE LOGIC */}
            {currentView === 'performance-logic' && (
              <PerformanceLogicView isDarkMode={isDarkMode} />
            )}

            {/* VEHICLE LOGBOOK */}
            {currentView === 'vehicle-logbook' && (
              <VehicleLogbookView isDarkMode={isDarkMode} />
            )}

            {currentView === 'high-mobility' && (
              <HighMobilityDataView />
            )}

            {currentView === 'hm-compatibility' && (
              <HighMobilityCompatibilityView isDarkMode={isDarkMode} />
            )}

    </AppShell>
  );
}