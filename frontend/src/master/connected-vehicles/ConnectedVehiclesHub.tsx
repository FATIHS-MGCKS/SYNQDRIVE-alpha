import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { Organization } from '../data/platform-data';
import { MasterPageHeader } from '../shell';
import { ConnectedVehiclesOverviewView } from './ConnectedVehiclesOverviewView';
import { ConnectedVehiclesListView } from './ConnectedVehiclesListView';
import { ConnectedVehicleDetailDrawer } from './ConnectedVehicleDetailDrawer';
import { ConnectedVehicleImportWizard } from './ConnectedVehicleImportWizard';
import { useConnectedVehiclesOverview } from './useConnectedVehiclesOperational';
import type { CvSection, VehicleOperationalRowDto } from './types';
import { readCvLocation, syncCvSectionUrl } from './cv.utils';

interface ConnectedVehiclesHubProps {
  organizations: Organization[];
  onOpenOrganization?: (organizationId: string) => void;
  onOpenPlatformHealth?: () => void;
}

export function ConnectedVehiclesHub({
  organizations,
  onOpenOrganization,
  onOpenPlatformHealth,
}: ConnectedVehiclesHubProps) {
  const initial = useMemo(() => readCvLocation(window.location.search), []);
  const [section, setSection] = useState<CvSection>(initial.section);
  const [vehicleId, setVehicleId] = useState<string | null>(initial.vehicleId);
  const [dimoVehicleId, setDimoVehicleId] = useState<string | null>(initial.dimoVehicleId);
  const [listFilters, setListFilters] = useState<Record<string, string>>({});
  const overviewState = useConnectedVehiclesOverview();

  const navigateSection = useCallback((next: CvSection, replace = false) => {
    setSection(next);
    syncCvSectionUrl(next, { vehicleId: null, dimoVehicleId: null, replace });
    setVehicleId(null);
    setDimoVehicleId(null);
  }, []);

  const openVehicle = useCallback((rowOrId: VehicleOperationalRowDto | string | null, dimoId?: string | null) => {
    if (typeof rowOrId === 'string') {
      setVehicleId(rowOrId);
      setDimoVehicleId(null);
      syncCvSectionUrl('vehicles', { vehicleId: rowOrId });
      return;
    }
    if (rowOrId) {
      setVehicleId(rowOrId.vehicleId);
      setDimoVehicleId(rowOrId.vehicleId ? null : rowOrId.dimoVehicleId);
      syncCvSectionUrl('vehicles', {
        vehicleId: rowOrId.vehicleId,
        dimoVehicleId: rowOrId.vehicleId ? null : rowOrId.dimoVehicleId,
      });
      return;
    }
    setVehicleId(null);
    setDimoVehicleId(dimoId ?? null);
    syncCvSectionUrl('vehicles', { vehicleId: null, dimoVehicleId: dimoId ?? null });
  }, []);

  const closeDetail = useCallback(() => {
    setVehicleId(null);
    setDimoVehicleId(null);
    syncCvSectionUrl(section, { vehicleId: null, dimoVehicleId: null, replace: true });
  }, [section]);

  useEffect(() => {
    const onPop = () => {
      const loc = readCvLocation(window.location.search);
      setSection(loc.section);
      setVehicleId(loc.vehicleId);
      setDimoVehicleId(loc.dimoVehicleId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (initial.vehicleId || initial.dimoVehicleId) {
      setSection('vehicles');
    }
  }, [initial.vehicleId, initial.dimoVehicleId]);

  const handleDeregister = async (id: string, reason: string) => {
    await api.vehicles.deregister(id);
    toast.success('Registrierung aufgehoben', { description: reason });
    overviewState.refresh();
  };

  const tabs = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'vehicles', label: 'Fahrzeuge' },
    { id: 'import', label: 'Import' },
  ] as const;

  return (
    <div className="space-y-5" data-testid="connected-vehicles-hub">
      <MasterPageHeader
        title="Verbundene Fahrzeuge"
        description="Plattformweite Governance für Fahrzeug ↔ Organisation ↔ DIMO"
        tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
        activeTabId={section}
        onTabChange={(id) => navigateSection(id as CvSection)}
      />

      {section === 'overview' ? (
        <ConnectedVehiclesOverviewView
          overview={overviewState.overview}
          loading={overviewState.loading}
          error={overviewState.error}
          onRetry={overviewState.refresh}
          onGoVehicles={(filters) => {
            setListFilters(filters ?? {});
            navigateSection('vehicles');
          }}
          onOpenVehicle={(vid, did) => {
            if (vid) openVehicle(vid);
            else if (did) openVehicle(null, did);
          }}
          onGoPlatformHealth={() => onOpenPlatformHealth?.()}
        />
      ) : null}

      {section === 'vehicles' ? (
        <ConnectedVehiclesListView
          initialFilters={listFilters}
          onOpenVehicle={(row) => openVehicle(row)}
        />
      ) : null}

      {section === 'import' ? (
        <ConnectedVehicleImportWizard
          organizations={organizations}
          onImported={() => {
            overviewState.refresh();
            navigateSection('vehicles');
          }}
          onOpenVehicle={(id) => openVehicle(id)}
        />
      ) : null}

      <ConnectedVehicleDetailDrawer
        open={Boolean(vehicleId || dimoVehicleId)}
        vehicleId={vehicleId}
        dimoVehicleId={dimoVehicleId}
        onClose={closeDetail}
        onDeregister={handleDeregister}
        onOpenOrganization={onOpenOrganization}
      />
    </div>
  );
}
