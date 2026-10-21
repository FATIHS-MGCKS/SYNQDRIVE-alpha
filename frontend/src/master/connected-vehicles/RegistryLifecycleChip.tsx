import { StatusChip } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { normalizeRegistryLifecycle } from './registry-lifecycle.utils';
import type { VehicleOperationalRowDto } from './types';

const LIFECYCLE_LABEL_KEYS: Record<'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED' | 'UNKNOWN', TranslationKey> = {
  ACTIVE: 'master.cv.registryLifecycle.active',
  OFFBOARDED: 'master.cv.registryLifecycle.offboarded',
  ARCHIVED: 'master.cv.registryLifecycle.archived',
  UNKNOWN: 'master.cv.registryLifecycle.unknown',
};

const LIFECYCLE_TONES: Record<'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED' | 'UNKNOWN', 'success' | 'warning' | 'neutral' | 'critical'> = {
  ACTIVE: 'success',
  OFFBOARDED: 'warning',
  ARCHIVED: 'neutral',
  UNKNOWN: 'neutral',
};

export function RegistryLifecycleChip({
  lifecycle,
  compact,
}: {
  lifecycle: VehicleOperationalRowDto['registryLifecycle'];
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const normalized = normalizeRegistryLifecycle(lifecycle);
  return (
    <StatusChip tone={LIFECYCLE_TONES[normalized]} dot className={compact ? 'text-xs' : undefined}>
      {t(LIFECYCLE_LABEL_KEYS[normalized])}
    </StatusChip>
  );
}
