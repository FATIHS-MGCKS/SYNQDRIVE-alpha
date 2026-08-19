import { Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CreateDataAuthorizationPayload } from '../../../../lib/api';
import {
  getDataCategoryOptions,
  getPurposeOptions,
  getScopeOptions,
  getSourceTypeOptions,
} from './data-authorization.constants';
import { useLanguage } from '../../../i18n/LanguageContext';

interface DataAuthorizationCreateDialogProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateDataAuthorizationPayload) => void;
}

export function DataAuthorizationCreateDialog({
  open,
  loading,
  onClose,
  onSubmit,
}: DataAuthorizationCreateDialogProps) {
  const { t, locale } = useLanguage();
  const sourceTypeOptions = getSourceTypeOptions(locale);
  const scopeOptions = getScopeOptions(locale);
  const purposeOptions = getPurposeOptions(locale);
  const dataCategoryOptions = getDataCategoryOptions(locale);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('PARTNER_ACCESS');
  const [processorName, setProcessorName] = useState('');
  const [moduleOrigin, setModuleOrigin] = useState('Partner');
  const [purposes, setPurposes] = useState<string[]>(['PARTNER_SERVICE']);
  const [scope, setScope] = useState('ORGANIZATION');
  const [destination, setDestination] = useState('SynqDrive Platform');
  const [dataCategories, setDataCategories] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      purposes.length > 0 &&
      dataCategories.length > 0 &&
      destination.trim().length > 0,
    [title, purposes, dataCategories, destination],
  );

  const toggleCategory = (value: string) => {
    setDataCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  };

  const togglePurpose = (value: string) => {
    setPurposes((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      requestingEntity: title.trim(),
      sourceType,
      processorType: sourceType === 'PARTNER_ACCESS' ? 'EXTERNAL_PARTNER' : 'SYNQDRIVE',
      processorName: processorName.trim() || undefined,
      moduleOrigin,
      purposes,
      scope,
      dataCategories,
      destination: destination.trim(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
      accessPattern: 'ONGOING',
    });
  };

  if (!open) return null;

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:ring-2 focus:ring-[var(--brand-soft)]';

  return (
    <div
      className="overlay-scrim fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border surface-premium shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-popover">
          <div>
            <h3 className="text-base font-bold text-foreground">{t('settings.dataAuth.create.title')}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t('settings.dataAuth.create.subtitle')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.titleLabel')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={t('settings.dataAuth.create.titlePlaceholder')} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.processor')}</label>
              <input value={processorName} onChange={(e) => setProcessorName(e.target.value)} className={inputClass} placeholder={t('settings.dataAuth.create.processorPlaceholder')} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.description')}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.source')}</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={inputClass}>
                {sourceTypeOptions.filter((o) => o.value !== 'all').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.module')}</label>
              <input value={moduleOrigin} onChange={(e) => setModuleOrigin(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.scope')}</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass}>
                {scopeOptions.filter((o) => o.value !== 'all' && o.value !== 'CONNECTED_VEHICLES').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.purposes')}</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {purposeOptions.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePurpose(p.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    purposes.includes(p.value)
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:border-[var(--brand)]/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.categories')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {dataCategoryOptions.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => toggleCategory(cat.value)}
                  className={`px-2.5 py-2 rounded-lg text-[11px] font-medium border text-left transition-colors ${
                    dataCategories.includes(cat.value)
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:border-[var(--brand)]/40'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.destination')}</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.expiresAt')}</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('settings.dataAuth.create.notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t border-border surface-premium">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-medium border border-border hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
            className="sq-3d-btn sq-3d-btn--primary px-5 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('settings.dataAuth.create.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
