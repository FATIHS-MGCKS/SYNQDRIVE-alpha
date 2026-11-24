import { Download, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';

interface ConnectedVehicleAddMenuProps {
  onImportDimo: () => void;
}

export function ConnectedVehicleAddMenu({ onImportDimo }: ConnectedVehicleAddMenuProps) {
  const { t } = useLanguage();

  return (
    <div data-testid="cv-add-vehicle-menu">
      <Button type="button" onClick={onImportDimo}>
        <Plus className="h-4 w-4 mr-2" aria-hidden />
        {t('master.cv.addVehicle.action')}
        <Download className="h-4 w-4 ml-2 opacity-70" aria-hidden />
      </Button>
    </div>
  );
}