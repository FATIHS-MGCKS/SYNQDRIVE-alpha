import { ChevronDown, Download, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';

export type ConnectedVehicleAddAction = 'import_dimo' | 'manual';

interface ConnectedVehicleAddMenuProps {
  onAction: (action: ConnectedVehicleAddAction) => void;
}

export function ConnectedVehicleAddMenu({ onAction }: ConnectedVehicleAddMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" data-testid="cv-add-vehicle-menu">
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="h-4 w-4 mr-2" aria-hidden />
        {t('master.cv.addVehicle.action')}
        <ChevronDown className="h-4 w-4 ml-2 opacity-70" aria-hidden />
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label={t('master.cv.addVehicle.menuDismiss')}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 min-w-[16rem] rounded-xl border border-border bg-popover p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted/80"
              onClick={() => {
                setOpen(false);
                onAction('import_dimo');
              }}
            >
              <Download className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="font-medium text-foreground block">
                  {t('master.cv.addVehicle.importDimo')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('master.cv.addVehicle.importDimoHint')}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted/80"
              onClick={() => {
                setOpen(false);
                onAction('manual');
              }}
            >
              <Plus className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="font-medium text-foreground block">
                  {t('master.cv.addVehicle.manual')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('master.cv.addVehicle.manualHint')}
                </span>
              </span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
