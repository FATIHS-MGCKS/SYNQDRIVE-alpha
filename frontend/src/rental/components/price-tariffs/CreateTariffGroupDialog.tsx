import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { useLanguage } from '../../i18n/LanguageContext';
import type { PriceTariffCatalog, PriceTariffGroup } from '../../pricing/pricingTypes';
import {
  cloneVersionPayloadForNewGroup,
  buildTariffGroupRowView,
} from '../../pricing/tariff-catalog-metrics';
import { getTariffFormBaseline } from '../../pricing/pricingUtils';

export interface CreateTariffGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  catalog: PriceTariffCatalog | null;
  onCreated: (group: PriceTariffGroup) => void | Promise<void>;
}

const fieldClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

export function CreateTariffGroupDialog({
  open,
  onOpenChange,
  orgId,
  catalog,
  onCreated,
}: CreateTariffGroupDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [templateGroupId, setTemplateGroupId] = useState('');
  const [plannedValidFrom, setPlannedValidFrom] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const priceBook = catalog?.priceBook ?? null;
  const templateOptions = useMemo(() => {
    if (!catalog) return [];
    return catalog.groups.filter((g) => buildTariffGroupRowView(g, catalog).hasPublishedLive);
  }, [catalog]);

  const reset = () => {
    setName('');
    setDescription('');
    setCategory('');
    setTemplateGroupId('');
    setPlannedValidFrom('');
    setFormError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t('priceTariffs.create.errors.nameRequired'));
      return;
    }
    if (!priceBook) {
      setFormError(t('priceTariffs.create.errors.noPriceBook'));
      return;
    }

    setSubmitting(true);
    try {
      const created = (await api.pricing.createGroup(orgId, {
        name: trimmedName,
        description: description.trim() || undefined,
        category: category.trim() || trimmedName,
      })) as PriceTariffGroup;

      const templateGroup = templateOptions.find((g) => g.id === templateGroupId);
      if (templateGroup) {
        const baseline = getTariffFormBaseline(templateGroup);
        const payload = baseline ? cloneVersionPayloadForNewGroup(baseline) : null;
        if (payload) {
          await api.pricing.upsertVersion(orgId, created.id, payload);
        }
      }

      toast.success(t('priceTariffs.create.success'));
      handleOpenChange(false);
      await onCreated(created);
      if (plannedValidFrom.trim()) {
        toast.message(t('priceTariffs.create.validFromHintTitle'), {
          description: t('priceTariffs.create.validFromHint', {
            date: new Date(plannedValidFrom).toLocaleDateString(),
          }),
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('priceTariffs.create.errors.failed');
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('priceTariffs.create.title')}</DialogTitle>
          <DialogDescription>{t('priceTariffs.create.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs">
            <span className="font-semibold text-muted-foreground">{t('priceTariffs.create.name')} *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('priceTariffs.create.namePlaceholder')}
              className={fieldClass}
              autoFocus
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-muted-foreground">{t('priceTariffs.create.internalDescription')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t('priceTariffs.create.descriptionPlaceholder')}
              className={fieldClass}
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-muted-foreground">{t('priceTariffs.create.category')}</span>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('priceTariffs.create.categoryPlaceholder')}
              className={fieldClass}
            />
          </label>

          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs">
            <p className="font-semibold text-muted-foreground">{t('priceTariffs.create.priceBook')}</p>
            <p className="mt-1 text-foreground">
              {priceBook
                ? `${priceBook.name} · ${priceBook.currency}`
                : t('priceTariffs.create.noPriceBook')}
            </p>
          </div>

          <label className="block text-xs">
            <span className="font-semibold text-muted-foreground">{t('priceTariffs.create.template')}</span>
            <select
              value={templateGroupId}
              onChange={(e) => setTemplateGroupId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t('priceTariffs.create.templateNone')}</option>
              {templateOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">{t('priceTariffs.create.templateHint')}</p>
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-muted-foreground">{t('priceTariffs.create.plannedValidFrom')}</span>
            <input
              type="date"
              value={plannedValidFrom}
              onChange={(e) => setPlannedValidFrom(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{t('priceTariffs.create.plannedValidFromHint')}</p>
          </label>

          {formError ? (
            <p className="text-xs font-medium text-[color:var(--status-critical)]">{formError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('priceTariffs.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
