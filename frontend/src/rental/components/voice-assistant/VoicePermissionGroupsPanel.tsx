import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { cn } from '../../../components/ui/utils';
import { Icon } from '../ui/Icon';
import type { VoiceAssistantData, VoiceAssistantUpdatePayload } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import type { VoiceToolPermissionsMap } from './voice-assistant-permissions.ops';
import {
  VOICE_PERMISSION_GROUP_MODE_OPTIONS,
  VOICE_PERMISSION_GROUPS,
  defaultOnboardingGroupModes,
  groupModesFromPermissions,
  permissionsFromGroupModes,
  permissionsPatchFromGroupModes,
  summarizeEnabledMcpTools,
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

function GroupModeOptions({
  groupId,
  groupModes,
  onSelect,
  t,
}: {
  groupId: VoicePermissionGroupId;
  groupModes: Record<VoicePermissionGroupId, VoicePermissionGroupMode>;
  onSelect: (mode: VoicePermissionGroupMode) => void;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const group = VOICE_PERMISSION_GROUPS.find(g => g.id === groupId)!;

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        {t(group.descriptionKey as 'voice.permissions.group.answerInformationDesc')}
      </p>
      <p className="text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">{t('voice.permissions.example')}:</span>{' '}
        {t(group.exampleKey as 'voice.permissions.group.answerInformationExample')}
      </p>
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-900 dark:text-amber-100">
        {t(group.riskKey as 'voice.permissions.group.answerInformationRisk')}
      </p>
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label={t(group.titleKey as 'voice.permissions.group.answerInformation')}
      >
        {VOICE_PERMISSION_GROUP_MODE_OPTIONS.map(option => {
          const active = groupModes[groupId] === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors',
                active
                  ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/40'
                  : 'border-border/40 hover:bg-muted/20',
              )}
            >
              <span className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <input
                  type="radio"
                  name={`voice-perm-${groupId}`}
                  checked={active}
                  onChange={() => onSelect(option.value)}
                  className="h-4 w-4"
                />
                {t(option.labelKey as 'voice.permissions.mode.notAllowed')}
              </span>
              <span className="pl-6 text-[10px] text-muted-foreground">
                {t(option.descriptionKey as 'voice.permissions.mode.notAllowedDesc')}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
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

  const enabledTools = useMemo(
    () => summarizeEnabledMcpTools(effectivePermissions),
    [effectivePermissions],
  );

  const handleGroupMode = (groupId: VoicePermissionGroupId, mode: VoicePermissionGroupMode) => {
    const patch = permissionsPatchFromGroupModes(effectivePermissions, groupId, mode);
    onModeChange(patch);
  };

  const resetToSafeDefaults = () => {
    onModeChange(permissionsFromGroupModes(defaultOnboardingGroupModes(), effectivePermissions));
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'surface-premium rounded-2xl border border-border/40 shadow-[var(--shadow-1)]',
          compact ? 'p-4' : 'p-5',
        )}
      >
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
              <Icon
                name={saving ? 'loader-2' : 'save'}
                className={cn('h-3.5 w-3.5', saving && 'animate-spin')}
              />
              {saving ? t('voice.common.saving') : t('voice.common.save')}
            </button>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-border/35 bg-muted/10 p-3">
          <p className="text-[11px] font-bold text-foreground">{t('voice.permissions.impactTitle')}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t('voice.permissions.impactDescription')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {enabledTools.length === 0 ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                {t('voice.permissions.noToolsEnabled')}
              </span>
            ) : (
              enabledTools.map(tool => (
                <span
                  key={tool}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                >
                  {tool}
                </span>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={resetToSafeDefaults}
            disabled={saving}
            className="mt-3 text-[11px] font-semibold text-[color:var(--brand)] hover:underline disabled:opacity-60"
          >
            {t('voice.permissions.resetSafeDefaults')}
          </button>
        </div>

        <div className="mt-4 md:hidden">
          <Accordion type="multiple" defaultValue={['answer_information']} className="space-y-2">
            {VOICE_PERMISSION_GROUPS.map(group => (
              <AccordionItem
                key={group.id}
                value={group.id}
                className="rounded-xl border border-border/35 bg-muted/10 px-3"
              >
                <AccordionTrigger className="py-3 text-[11px] font-bold hover:no-underline">
                  {t(group.titleKey as 'voice.permissions.group.answerInformation')}
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <GroupModeOptions
                    groupId={group.id}
                    groupModes={groupModes}
                    onSelect={mode => handleGroupMode(group.id, mode)}
                    t={t}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="mt-4 hidden space-y-3 md:block">
          {VOICE_PERMISSION_GROUPS.map(group => (
            <fieldset
              key={group.id}
              className="rounded-xl border border-border/35 bg-muted/10 p-3"
            >
              <legend className="px-1 text-[11px] font-bold text-foreground">
                {t(group.titleKey as 'voice.permissions.group.answerInformation')}
              </legend>
              <GroupModeOptions
                groupId={group.id}
                groupModes={groupModes}
                onSelect={mode => handleGroupMode(group.id, mode)}
                t={t}
              />
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
