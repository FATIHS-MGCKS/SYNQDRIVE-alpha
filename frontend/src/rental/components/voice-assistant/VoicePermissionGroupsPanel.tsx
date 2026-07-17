import { useMemo } from 'react';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { Icon } from '../ui/Icon';
import type { VoiceAssistantData, VoiceAssistantUpdatePayload } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import type { VoiceToolPermissionsMap } from './voice-assistant-permissions.ops';
import {
  VOICE_PERMISSION_GROUP_MODE_OPTIONS,
  VOICE_PERMISSION_GROUPS,
  groupModesFromPermissions,
  permissionsPatchFromGroupModes,
  type VoicePermissionGroupId,
  type VoicePermissionGroupMode,
} from './voice-permission-groups.ops';

interface VoicePermissionGroupsPanelProps {
  assistant: VoiceAssistantData;
  draft: VoiceAssistantUpdatePayload;
  saving: boolean;
  hasDraft: boolean;
  onModeChange: (patch: Partial<VoiceToolPermissionsMap>) => void;
  onSave: () => void;
  compact?: boolean;
}

export function VoicePermissionGroupsPanel({
  assistant,
  draft,
  saving,
  hasDraft,
  onModeChange,
  onSave,
  compact = false,
}: VoicePermissionGroupsPanelProps) {
  const { t } = useLanguage();

  const effectivePermissions = useMemo((): VoiceToolPermissionsMap => {
    const base = assistant.toolPermissions;
    return draft.toolPermissions ? { ...base, ...draft.toolPermissions } : base;
  }, [assistant.toolPermissions, draft.toolPermissions]);

  const groupModes = useMemo(
    () => groupModesFromPermissions(effectivePermissions),
    [effectivePermissions],
  );

  const handleGroupMode = (groupId: VoicePermissionGroupId, mode: VoicePermissionGroupMode) => {
    const patch = permissionsPatchFromGroupModes(effectivePermissions, groupId, mode);
    onModeChange(patch);
  };

  return (
    <div className="space-y-4">
      <div className={cn('surface-premium rounded-2xl border border-border/40 shadow-[var(--shadow-1)]', compact ? 'p-4' : 'p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-[-0.02em] text-foreground">
              {t('voice.permissions.title')}
            </h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
              {t('voice.permissions.description')}
            </p>
          </div>
          {hasDraft && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="sq-press inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-3.5 py-1.5 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
            >
              <Icon name={saving ? 'loader-2' : 'save'} className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
              {saving ? t('voice.common.saving') : t('voice.common.save')}
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {VOICE_PERMISSION_GROUPS.map(group => (
            <fieldset
              key={group.id}
              className="rounded-xl border border-border/35 bg-muted/10 p-3"
            >
              <legend className="px-1 text-[11px] font-bold text-foreground">
                {t(group.titleKey as 'voice.permissions.group.information')}
              </legend>
              <p className="mb-3 px-1 text-[10px] text-muted-foreground">
                {t(group.descriptionKey as 'voice.permissions.group.informationDesc')}
              </p>
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label={t(group.titleKey as 'voice.permissions.group.information')}
              >
                {VOICE_PERMISSION_GROUP_MODE_OPTIONS.map(option => {
                  const active = groupModes[group.id] === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors',
                        active
                          ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/40'
                          : 'border-border/40 hover:bg-muted/20',
                      )}
                    >
                      <input
                        type="radio"
                        name={`voice-perm-${group.id}`}
                        checked={active}
                        onChange={() => handleGroupMode(group.id, option.value)}
                        className="mt-0.5"
                      />
                      <span className="text-[11px] font-semibold text-foreground">
                        {t(option.labelKey as 'voice.permissions.mode.notAllowed')}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {VOICE_PERMISSION_GROUP_MODE_OPTIONS.map(option => (
          <StatusChip key={option.value} tone="neutral" className="text-[9px]">
            {t(option.labelKey as 'voice.permissions.mode.notAllowed')}
          </StatusChip>
        ))}
      </div>
    </div>
  );
}
