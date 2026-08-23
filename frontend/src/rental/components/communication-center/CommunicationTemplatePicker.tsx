import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationSendableTemplate } from '../../../lib/communication/hooks/useCommunicationSendableTemplates';

interface CommunicationTemplatePickerProps {
  templates: CommunicationSendableTemplate[];
  loading?: boolean;
  sending?: boolean;
  initialTemplateId?: string;
  initialVariables?: Record<string, string>;
  onSend: (input: { templateId: string; variables: Record<string, string> }) => void;
}

export function CommunicationTemplatePicker({
  templates,
  loading,
  sending,
  initialTemplateId,
  initialVariables,
  onSend,
}: CommunicationTemplatePickerProps) {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialTemplateId) {
      setSelectedId(initialTemplateId);
      setVariables(initialVariables ?? {});
    }
  }, [initialTemplateId, initialVariables]);

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? null,
    [selectedId, templates],
  );

  const variableKeys = useMemo(() => {
    if (!selected?.variableSchema || typeof selected.variableSchema !== 'object') return [];
    return Object.keys(selected.variableSchema);
  }, [selected]);

  if (loading) {
    return (
      <p className="mb-2 text-[12px] text-muted-foreground" data-testid="communication-template-loading">
        {t('communication.template.loading')}
      </p>
    );
  }

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 space-y-2 rounded-lg border border-border/40 bg-muted/20 p-2.5" data-testid="communication-template-picker">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
        <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="communication-template-select">
          {t('communication.template.choose')}
        </label>
        <select
          id="communication-template-select"
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setVariables({});
          }}
          className="min-w-0 flex-1 rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
        >
          <option value="">{t('communication.template.selectPlaceholder')}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.language})
            </option>
          ))}
        </select>
      </div>

      {selected && variableKeys.length > 0 ? (
        <div className="space-y-1.5">
          {variableKeys.map((key) => (
            <label key={key} className="block text-[11px]">
              <span className="mb-0.5 block font-medium text-muted-foreground">
                {t('communication.template.variable', { name: key })}
              </span>
              <input
                type="text"
                value={variables[key] ?? ''}
                onChange={(event) =>
                  setVariables((current) => ({ ...current, [key]: event.target.value }))
                }
                className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
              />
            </label>
          ))}
        </div>
      ) : null}

      {selected ? (
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={sending}
          onClick={() => onSend({ templateId: selected.id, variables })}
          data-testid="communication-template-send"
        >
          {sending ? t('communication.composer.sending') : t('communication.template.send')}
        </Button>
      ) : null}
    </div>
  );
}
