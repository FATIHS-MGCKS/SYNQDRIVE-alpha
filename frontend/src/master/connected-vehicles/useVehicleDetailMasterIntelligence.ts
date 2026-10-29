import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { MasterApdsOverviewDto } from '../intelligence/apds-master-intelligence-api.types';
import type { MasterVsiFleetOverviewDto } from '../intelligence/vsi-master-intelligence-api.types';
import { pickPrimaryProviderSourceLink } from '../intelligence/vehicle-detail-intelligence.utils';
import { resolvePhysicalDeviceIdForVehicle } from '../intelligence/resolve-vehicle-physical-device';
import type { PhysicalDeviceListItemDto } from '../../lib/physical-device-inventory.types';

export function useVehicleDetailMasterIntelligence(input: {
  enabled: boolean;
  organizationId: string | null;
  vehicleId: string | null;
}) {
  const { enabled, organizationId, vehicleId } = input;
  const [vsiOverview, setVsiOverview] = useState<MasterVsiFleetOverviewDto | null>(null);
  const [apdsOverview, setApdsOverview] = useState<MasterApdsOverviewDto | null>(null);
  const [physicalDevice, setPhysicalDevice] = useState<PhysicalDeviceListItemDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId || !vehicleId) {
      setVsiOverview(null);
      setApdsOverview(null);
      setPhysicalDevice(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vsiRes, deviceId] = await Promise.all([
        api.admin.masterIntelligenceVsi.overview(organizationId, vehicleId),
        resolvePhysicalDeviceIdForVehicle(organizationId, vehicleId),
      ]);
      setVsiOverview(vsiRes);
      const { linkId } = pickPrimaryProviderSourceLink(vsiRes.profiles, null);
      const apdsRes = await api.admin.masterIntelligenceApds.overview(
        organizationId,
        vehicleId,
        linkId,
      );
      setApdsOverview(apdsRes);

      if (deviceId) {
        try {
          const detail = await api.admin.physicalDeviceInventory.getDevice(deviceId);
          setPhysicalDevice(detail);
        } catch {
          setPhysicalDevice(null);
        }
      } else {
        setPhysicalDevice(null);
      }
    } catch (e) {
      setVsiOverview(null);
      setApdsOverview(null);
      setPhysicalDevice(null);
      setError(e instanceof Error ? e.message : 'Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  }, [organizationId, vehicleId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const primaryLink = useMemo(
    () => pickPrimaryProviderSourceLink(vsiOverview?.profiles ?? [], apdsOverview?.providerSourceLinkId ?? null),
    [vsiOverview, apdsOverview],
  );

  const primaryProfile = useMemo(() => {
    const profiles = vsiOverview?.profiles ?? [];
    if (!primaryLink.linkId) return null;
    return profiles.find((p) => p.providerSourceLinkId === primaryLink.linkId) ?? profiles[0] ?? null;
  }, [vsiOverview, primaryLink.linkId]);

  return {
    vsiOverview,
    apdsOverview,
    physicalDevice,
    primaryProfile,
    primaryLink,
    loading,
    error,
    refresh: load,
  };
}
