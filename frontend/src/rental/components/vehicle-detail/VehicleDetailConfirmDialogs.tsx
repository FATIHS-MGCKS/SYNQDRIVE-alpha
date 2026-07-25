import { Icon } from '../ui/Icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { useLanguage } from '../../i18n/LanguageContext';

interface VehicleDetailConfirmDialogsProps {
  showCleaningWarning: boolean;
  onCleaningOpenChange: (open: boolean) => void;
  cleaningStatusBusy: boolean;
  onConfirmCleaningChange: () => void;
  showStatusWarning: boolean;
  onStatusOpenChange: (open: boolean) => void;
  pendingStatus: 'Manual Block' | 'Maintenance' | null;
  onConfirmStatusChange: () => void;
  showStationWarning: boolean;
  onStationOpenChange: (open: boolean) => void;
  currentStation: string;
  pendingStation: string | null;
  onConfirmStationChange: () => void;
}

export function VehicleDetailConfirmDialogs({
  showCleaningWarning,
  onCleaningOpenChange,
  cleaningStatusBusy,
  onConfirmCleaningChange,
  showStatusWarning,
  onStatusOpenChange,
  pendingStatus,
  onConfirmStatusChange,
  showStationWarning,
  onStationOpenChange,
  currentStation,
  pendingStation,
  onConfirmStationChange,
}: VehicleDetailConfirmDialogsProps) {
  const { t } = useLanguage();

  return (
    <>
      <AlertDialog open={showCleaningWarning} onOpenChange={onCleaningOpenChange}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sq-tone-watch">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="font-display">
                {t('vehicleDetail.cleaningModal.title')}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {t('vehicleDetail.cleaningModal.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleaningStatusBusy}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={cleaningStatusBusy}
              onClick={onConfirmCleaningChange}
              className="bg-[color:var(--status-watch)] hover:opacity-90"
            >
              {cleaningStatusBusy
                ? t('vehicleDetail.cleaningModal.confirmBusy')
                : t('vehicleDetail.cleaningModal.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showStatusWarning}
        onOpenChange={(open) => {
          onStatusOpenChange(open);
          if (!open) {
            // pendingStatus cleared by parent on cancel via onOpenChange(false)
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  pendingStatus === 'Manual Block' ? 'sq-tone-critical' : 'sq-tone-warning'
                }`}
              >
                {pendingStatus === 'Manual Block' ? (
                  <Icon name="x-circle" className="h-5 w-5" />
                ) : (
                  <Icon name="wrench" className="h-5 w-5" />
                )}
              </div>
              <AlertDialogTitle className="font-display">
                {t('vehicleDetail.statusModal.title')}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {pendingStatus === 'Manual Block'
                ? t('vehicleDetail.statusModal.manualBlock')
                : t('vehicleDetail.statusModal.maintenance')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmStatusChange}
              className={
                pendingStatus === 'Manual Block'
                  ? 'bg-[color:var(--status-critical)] hover:opacity-90'
                  : 'bg-[color:var(--status-warning)] hover:opacity-90'
              }
            >
              {t('vehicleDetail.statusModal.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showStationWarning} onOpenChange={onStationOpenChange}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sq-tone-brand">
                <Icon name="map-pin" className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="font-display">
                {t('vehicleDetail.stationModal.title')}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {t('vehicleDetail.stationModal.description', {
                from: currentStation,
                to: pendingStation ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmStationChange}
              className="bg-brand text-brand-foreground hover:bg-[color:var(--brand-hover)]"
            >
              {t('vehicleDetail.stationModal.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
