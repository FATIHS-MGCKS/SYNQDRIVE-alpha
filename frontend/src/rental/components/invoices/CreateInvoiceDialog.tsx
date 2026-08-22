import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  CREATE_INVOICE_TEMPLATE_IDS,
  CREATE_INVOICE_TYPE_VALUES,
  CREATE_INVOICE_VAT_RATE,
  formatCreateInvoiceAmount,
  CREATE_INVOICE_ERROR_KEY,
  descCreateInvoiceType,
  labelCreateInvoiceTemplateName,
  labelCreateInvoiceTemplateDescription,
  labelCreateInvoiceType,
} from '../../lib/create-invoice-i18n';
import { Icon } from '../ui/Icon';
import { isOutgoing } from './invoiceFormatters';
import type { InvoiceLookupData, InvoiceLookupVehicle } from './hooks/useInvoices';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface CreateInvoiceDialogProps extends InvoiceThemeClasses {
  orgId: string;
  lookup: InvoiceLookupData;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
}

type CreateStep = 'type' | 'details' | 'items';

interface DraftLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

const CREATE_TYPE_ICONS = {
  OUTGOING_MANUAL: ArrowUpRight,
  INCOMING_VENDOR: ArrowDownLeft,
} as const;

const CREATE_TYPE_COLORS = {
  OUTGOING_MANUAL: 'blue',
  INCOMING_VENDOR: 'amber',
} as const;

export function CreateInvoiceDialog({
  isDarkMode,
  orgId,
  lookup,
  onClose,
  onCreated,
  card,
  tp,
  ts,
  inputCls,
}: CreateInvoiceDialogProps) {
  const { t, locale } = useLanguage();
  const { customers, vehicles, vendors } = lookup;
  const [step, setStep] = useState<CreateStep>('type');
  const [form, setForm] = useState({
    type: '' as string,
    title: '',
    description: '',
    vendorId: '',
    vendorName: '',
    customerId: '',
    vehicleId: '',
    totalCents: 0,
    subtotalCents: 0,
    taxCents: 0,
    currency: 'EUR',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    notes: '',
    templateId: '',
  });
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([
    { description: '', quantity: 1, unitPriceCents: 0, totalCents: 0 },
  ]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const r = new FileReader();
    r.onload = () => setImagePreview(r.result as string);
    r.readAsDataURL(f);
  };

  const updateLineItem = (idx: number, field: string, value: string | number) => {
    setLineItems((prev) => {
      const next = [...prev];
      if (field === 'description') next[idx].description = String(value);
      else if (field === 'quantity') next[idx].quantity = Number(value);
      else if (field === 'unitPriceCents') next[idx].unitPriceCents = Number(value);
      if (field === 'quantity' || field === 'unitPriceCents') {
        next[idx].totalCents = next[idx].quantity * next[idx].unitPriceCents;
      }
      return next;
    });
  };

  const addLineItem = () =>
    setLineItems((p) => [...p, { description: '', quantity: 1, unitPriceCents: 0, totalCents: 0 }]);
  const removeLineItem = (idx: number) => setLineItems((p) => p.filter((_, i) => i !== idx));

  const calcTotals = () => {
    const sub = lineItems.reduce((s, li) => s + li.totalCents, 0);
    const tax = Math.round(sub * (CREATE_INVOICE_VAT_RATE / 100));
    return { subtotalCents: sub, taxCents: tax, totalCents: sub + tax };
  };

  const handleSubmit = async () => {
    if (!form.title || !form.type) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const res = await api.invoices.uploadFile(orgId, imageFile);
        imageUrl = res.url;
      }
      const structuredLineItems = isOutgoing(form.type)
        ? lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPriceNetCents: li.unitPriceCents,
            taxRate: CREATE_INVOICE_VAT_RATE,
          }))
        : undefined;

      const inv = await api.invoices.create(orgId, {
        type: form.type,
        title: form.title,
        description: form.description,
        vendorId: form.vendorId || undefined,
        vendorName: form.vendorName || undefined,
        customerId: form.customerId || undefined,
        vehicleId: form.vehicleId || undefined,
        notes: form.notes,
        templateId: form.templateId || undefined,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
        currency: form.currency,
        lineItems: structuredLineItems,
        totalCents: isOutgoing(form.type) ? undefined : form.totalCents,
        imageUrl,
      });
      onCreated(inv);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t(CREATE_INVOICE_ERROR_KEY));
    } finally {
      setSaving(false);
    }
  };

  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;
  const isOut = isOutgoing(form.type);
  const borderStyle = { borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' };

  if (step === 'type') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
          <Icon name="chevron-left" className="w-4 h-4" /> {t('common.back')}
        </button>
        <div className={`${card} p-6`}>
          <h2 className={`text-base font-bold ${tp} mb-5`}>{t('invoices.create.typeStep.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CREATE_INVOICE_TYPE_VALUES.map((type) => {
              const IconComponent = CREATE_TYPE_ICONS[type];
              const color = CREATE_TYPE_COLORS[type];
              return (
                <button
                  key={type}
                  onClick={() => {
                    set('type', type);
                    setStep('details');
                  }}
                  className={`text-left p-4 rounded-xl border transition-all ${isDarkMode ? 'border-border/50 hover:border-border hover:bg-muted/40' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? `bg-${color}-500/15` : `bg-${color}-100/60`}`}
                    >
                      <IconComponent className={`w-4 h-4 text-${color}-500`} />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${tp}`}>{labelCreateInvoiceType(locale, type)}</p>
                      <p className={`text-[10px] ${ts}`}>{descCreateInvoiceType(locale, type)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t" style={borderStyle}>
            <h3 className={`text-xs font-bold ${tp} mb-3`}>{t('invoices.create.templates.section')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {CREATE_INVOICE_TEMPLATE_IDS.map((templateId) => (
                <button
                  key={templateId}
                  onClick={() => {
                    set('type', 'OUTGOING_MANUAL');
                    set('templateId', templateId);
                    setStep('details');
                  }}
                  className={`text-left p-3 rounded-xl border transition-all ${isDarkMode ? 'border-border/50 hover:border-border hover:bg-muted/40' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  <p className={`text-xs font-semibold ${tp}`}>
                    {labelCreateInvoiceTemplateName(locale, templateId)}
                  </p>
                  <p className={`text-[10px] ${ts}`}>
                    {labelCreateInvoiceTemplateDescription(locale, templateId)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button
        onClick={() => (step === 'items' ? setStep('details') : setStep('type'))}
        className={`flex items-center gap-1 text-xs font-medium ${ts}`}
      >
        <Icon name="chevron-left" className="w-4 h-4" /> {t('common.back')}
      </button>

      <div className={`${card} p-6`}>
        <div className="flex items-center gap-2 mb-5">
          <Icon name="receipt" className="w-5 h-5 text-brand" />
          <h2 className={`text-base font-bold ${tp}`}>
            {isOut ? t('invoices.create.title.outgoing') : t('invoices.create.title.incoming')}
          </h2>
          {form.templateId && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-brand-soft text-brand' : 'bg-status-info-soft text-status-info'} font-semibold`}
            >
              {labelCreateInvoiceTemplateName(locale, form.templateId)}
            </span>
          )}
        </div>

        {step === 'details' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('invoices.create.field.title')}</label>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className={inputCls}
                placeholder={t('invoices.create.placeholder.title')}
              />
            </div>
            {isOut ? (
              <div>
                <label className={labelCls}>{t('invoices.create.field.customer')}</label>
                <select
                  value={form.customerId}
                  onChange={(e) => set('customerId', e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t('invoices.create.select.choose')}</option>
                  {customers.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.firstName || c.name || '')} {String(c.lastName || '')}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls}>{t('invoices.create.field.vendor')}</label>
                <select
                  value={form.vendorId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const ven = vendors.find((v) => v.id === id);
                    setForm((p) => ({
                      ...p,
                      vendorId: id,
                      vendorName: ven ? ven.name : p.vendorName,
                    }));
                  }}
                  className={inputCls}
                >
                  <option value="">{t('invoices.create.select.manualVendor')}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                {!form.vendorId && (
                  <input
                    value={form.vendorName}
                    onChange={(e) => set('vendorName', e.target.value)}
                    className={`${inputCls} mt-2`}
                    placeholder={t('invoices.create.placeholder.vendorName')}
                  />
                )}
              </div>
            )}
            <div>
              <label className={labelCls}>{t('invoices.create.field.vehicle')}</label>
              <select
                value={form.vehicleId}
                onChange={(e) => set('vehicleId', e.target.value)}
                className={inputCls}
              >
                <option value="">{t('invoices.create.select.optional')}</option>
                {vehicles.map((v: InvoiceLookupVehicle) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} – {v.licensePlate || v.vin?.slice(-6)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('invoices.create.field.invoiceDate')}</label>
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => set('invoiceDate', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('invoices.create.field.dueDate')}</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                className={inputCls}
              />
            </div>
            {!isOut && (
              <div>
                <label className={labelCls}>{t('invoices.create.field.amountEur')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.totalCents ? (form.totalCents / 100).toFixed(2) : ''}
                  onChange={(e) =>
                    set('totalCents', Math.round(parseFloat(e.target.value || '0') * 100))
                  }
                  className={inputCls}
                  placeholder={t('invoices.create.placeholder.amount')}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('invoices.create.field.descriptionNotes')}</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
                placeholder={t('invoices.create.placeholder.description')}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('invoices.create.field.document')}</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleImage}
                className="hidden"
              />
              {imagePreview ? (
                <div className="relative inline-block">
                  <img
                    src={imagePreview}
                    alt={t('invoices.create.image.previewAlt')}
                    className="h-20 rounded-xl object-cover"
                  />
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                  >
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${isDarkMode ? 'border-border text-muted-foreground' : 'border-gray-300 text-gray-500'}`}
                >
                  <Icon name="image" className="w-4 h-4" /> {t('invoices.create.action.attachFile')}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'details' && isOut && (
          <div className="mt-5 pt-4 border-t" style={borderStyle}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-bold ${tp}`}>{t('invoices.create.lineItems.title')}</h3>
              <button onClick={addLineItem} className="text-[11px] font-medium text-brand">
                <Icon name="plus" className="w-3 h-3 inline mr-1" />
                {t('invoices.create.lineItems.add')}
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 items-center p-2 rounded-lg ${isDarkMode ? 'bg-muted/30' : 'bg-gray-50/50'}`}
                >
                  <input
                    value={li.description}
                    onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                    className={`${inputCls} flex-1 !py-2`}
                    placeholder={t('invoices.create.lineItems.descriptionPlaceholder')}
                  />
                  <input
                    type="number"
                    value={li.quantity}
                    onChange={(e) =>
                      updateLineItem(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                    }
                    className={`${inputCls} !w-16 !py-2 text-center`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={li.unitPriceCents ? (li.unitPriceCents / 100).toFixed(2) : ''}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        'unitPriceCents',
                        Math.round(parseFloat(e.target.value || '0') * 100),
                      )
                    }
                    className={`${inputCls} !w-24 !py-2`}
                    placeholder={t('invoices.create.lineItems.unitPricePlaceholder')}
                  />
                  <span className={`text-xs font-bold ${tp} w-20 text-right`}>
                    {formatCreateInvoiceAmount(locale, li.totalCents, form.currency)}
                  </span>
                  {lineItems.length > 1 && (
                    <button onClick={() => removeLineItem(idx)} className="text-red-500">
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t flex justify-end" style={borderStyle}>
              <div className="text-right space-y-1">
                <p className={`text-xs ${ts}`}>
                  {t('invoices.create.totals.net')}{' '}
                  <span className={`font-bold ${tp}`}>
                    {formatCreateInvoiceAmount(locale, calcTotals().subtotalCents, form.currency)}
                  </span>
                </p>
                <p className={`text-xs ${ts}`}>
                  {t('invoices.create.totals.vat', { rate: CREATE_INVOICE_VAT_RATE })}{' '}
                  <span className={`font-bold ${tp}`}>
                    {formatCreateInvoiceAmount(locale, calcTotals().taxCents, form.currency)}
                  </span>
                </p>
                <p className={`text-sm font-bold ${tp}`}>
                  {t('invoices.create.totals.gross')}{' '}
                  {formatCreateInvoiceAmount(locale, calcTotals().totalCents, form.currency)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={borderStyle}>
          <button onClick={onClose} className="sq-3d-btn sq-3d-btn--neutral px-4 py-2.5 text-xs font-semibold">
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title || (!isOut && !form.totalCents)}
            className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-5 py-2.5 text-xs font-semibold disabled:opacity-50"
          >
            {saving ? (
              <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Icon name="receipt" className="w-3.5 h-3.5" />
            )}{' '}
            {t('invoices.createInvoice')}
          </button>
        </div>
      </div>
    </div>
  );
}
