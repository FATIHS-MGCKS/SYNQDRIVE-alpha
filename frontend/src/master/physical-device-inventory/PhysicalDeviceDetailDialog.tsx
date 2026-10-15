import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import type {
  PhysicalDeviceDetailDto,
  PhysicalDeviceListItemDto,
} from '../../lib/physical-device-inventory.types';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';

type VehicleOption = { id: string; label: string; registryLifecycle?: string };

interface PhysicalDeviceDetailDialogProps {
  deviceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function PhysicalDeviceDetailDialog({
  deviceId,
  open,
  onOpenChange,
  onUpdated,
}: PhysicalDeviceDetailDialogProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PhysicalDeviceDetailDto | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [reconcileVehicleId, setReconcileVehicleId] = useState('');
  const [installVehicleId, setInstallVehicleId] = useState('');
  const [installConfirm, setInstallConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reviewerUserId = getStoredUser()?.id ?? '';

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.registryLifecycle === 'ACTIVE' || !v.registryLifecycle),
    [vehicles],
  );

  const loadDetail = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const [d, vehicleRes] = await Promise.all([
        api.admin.physicalDeviceInventory.getDevice(deviceId),
        api.vehicles.listAll({ limit: 300 }),
      ]);
      setDetail(d);
      const rows = (vehicleRes as { data?: unknown[] })?.data ?? vehicleRes;
      const list = Array.isArray(rows) ? rows : [];
      setVehicles(
        list.map((v) => {
          const row = v as Record<string, unknown>;
          return {
            id: String(row.id),
            label: `${row.licensePlate ?? row.vehicleName ?? row.id}`.trim(),
            registryLifecycle: row.registryLifecycle as string | undefined,
          };
        }),
      );
    } catch {
      toast.error(t('master.physicalDeviceInventory.intakeError'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, t]);

  useEffect(() => {
    if (open && deviceId) {
      void loadDetail();
    }
  }, [open, deviceId, loadDetail]);

  const handleVerify = async () => {
    if (!deviceId || !reconcileVehicleId || !reviewerUserId) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.verifyIdentity(deviceId, {
        attestationKind: 'PROVIDER_DIMO_SERIAL_RECONCILIATION',
        providerReconciliationVehicleId: reconcileVehicleId,
        reviewerUserId,
      });
      toast.success(t('master.physicalDeviceInventory.verifySuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.verifyError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleInstall = async () => {
    if (!deviceId || !installVehicleId || !installConfirm) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.installOnVehicle(deviceId, {
        vehicleId: installVehicleId,
        installConfirmation: true,
      });
      toast.success(t('master.physicalDeviceInventory.installSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.installError'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderSummary = (row: PhysicalDeviceListItemDto) => (
    <div className="grid gap-2 text-sm">
      <div>
        <span className="text-muted-foreground">{t('master.physicalDeviceInventory.col.serial')}: </span>
        {row.serialNumberMasked ?? '—'}
      </div>
      <div>
        <span className="text-muted-foreground">{t('master.physicalDeviceInventory.col.identity')}: </span>
        {t(`master.physicalDeviceInventory.identity.${row.identityStatus}`)}
      </div>
      <div>
        <span className="text-muted-foreground">{t('master.physicalDeviceInventory.currentVehicle')}: </span>
        {row.currentVehicleId ?? t('master.physicalDeviceInventory.noVehicle')}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('master.physicalDeviceInventory.detailTitle')}</DialogTitle>
        </DialogHeader>
        {loading || !detail ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {renderSummary(detail)}
            {detail.identityStatus === 'NEEDS_CLARIFICATION' && detail.modelCode === 'RUPTELA_R1' && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  {t('master.physicalDeviceInventory.verifyDescription')}
                </p>
                <Label>{t('master.physicalDeviceInventory.verifyReconcileVehicle')}</Label>
                <Select value={reconcileVehicleId} onValueChange={setReconcileVehicleId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={submitting || !reconcileVehicleId}
                  onClick={() => void handleVerify()}
                >
                  {t('master.physicalDeviceInventory.verifySubmit')}
                </Button>
              </div>
            )}
            {detail.installEligible && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.installTitle')}</p>
                <Label>{t('master.physicalDeviceInventory.installVehicle')}</Label>
                <Select value={installVehicleId} onValueChange={setInstallVehicleId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="install-confirm"
                    checked={installConfirm}
                    onCheckedChange={(v) => setInstallConfirm(v === true)}
                  />
                  <Label htmlFor="install-confirm" className="font-normal">
                    {t('master.physicalDeviceInventory.installConfirmLabel')}
                  </Label>
                </div>
                <Button
                  size="sm"
                  disabled={submitting || !installVehicleId || !installConfirm}
                  onClick={() => void handleInstall()}
                >
                  {t('master.physicalDeviceInventory.installSubmit')}
                </Button>
              </div>
            )}
            <div>
              <p className="font-medium text-sm mb-2">{t('master.physicalDeviceInventory.historyTitle')}</p>
              <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {detail.auditHistory.map((e) => (
                  <li key={e.id}>
                    {e.eventKind} — {new Date(e.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
