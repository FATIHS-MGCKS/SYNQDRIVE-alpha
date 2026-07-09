import type { ComponentType } from 'react';
import { Car, CheckCircle, IdCard, Upload, User } from 'lucide-react';
import {
  EmptyState,
  SectionHeader,
  SkeletonCard,
  StatusChip,
} from '../../../components/patterns';
import { AddCustomerDocumentsStep } from '../add-customer/AddCustomerDocumentsStep';
import { AddCustomerVerificationPlanSection } from '../add-customer/AddCustomerVerificationPlanSection';
import { CustomerDetailModal } from '../CustomerDetailModal';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import { documentEligibilityLabelDe } from '../../lib/customer-verification';
import { formatStressScore, stressToneToStatusTone } from '../../lib/scoreFormat';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import type { CustomerStepProps } from './types';

export function CustomerStep({
  orgId,
  customerSearch,
  onCustomerSearchChange,
  customersLoading,
  customersError,
  filteredCustomers,
  selectedCustomer,
  onSelectCustomer,
  customerEligibility,
  customerDetailOpen,
  customerDetailTarget,
  onOpenCustomerDetail,
  onCloseCustomerDetail,
  mapToDetailCustomer,
  isAddCustomerOpen,
  onOpenAddCustomer,
  onCloseAddCustomer,
  addStep,
  onAddStepChange,
  newCustomer,
  onNewCustomerChange,
  verificationPlan,
  onVerificationPlanChange,
  pendingDocFiles,
  onPendingDocFileChange,
  formErrors,
  draftCustomerId,
  isEnsuringDraft,
  wizardEligibility,
  onRefreshWizardEligibility,
  onAddNextStep,
  onSubmitNewCustomer,
  isSavingCustomer,
}: CustomerStepProps) {
  return (
    <>
      <BookingStepCard>
        <div className="p-4 flex flex-col min-h-[calc(100vh-340px)]">
          <SectionHeader title="Kunde auswählen" className="mb-3" />
          {/* Search */}
          <div className="relative mb-3">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Name, E-Mail oder Telefonnummer suchen..."
              value={customerSearch}
              onChange={(e) => onCustomerSearchChange(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-lg border text-xs outline-none transition-all ${ 'bg-background border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]' }`}
            />
          </div>

          {/* Suggested / Search Results */}
          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            {customersLoading && (
              <SkeletonCard className="border-0 shadow-none" />
            )}
            {!customersLoading && customersError && (
              <div className="text-xs p-3 rounded-lg sq-tone-critical border border-border">
                {customersError}
              </div>
            )}
            {!customersLoading && !customersError && filteredCustomers.length === 0 && (
              <EmptyState
                compact
                icon={<Icon name="users" className="w-5 h-5" />}
                title="Keine Kunden gefunden"
                description="Lege einen neuen Kunden an."
              />
            )}
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCustomer(c)}
                className={`w-full min-w-0 max-w-full text-left p-4 rounded-lg border transition-all duration-200 flex items-start gap-3 group/card sm:items-center ${ selectedCustomer?.id === c.id ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : 'bg-muted/40 border border-border hover:surface-premium hover:border-border' }`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs shrink-0 ${ selectedCustomer?.id === c.id ? 'sq-tone-brand' : 'sq-chip-neutral' }`}>
                  {c.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs text-foreground">{c.name}</span>
                    {c.company && (
                      <StatusChip tone="ai" className="hidden shrink-0 text-[10px] sm:inline-flex">{c.company}</StatusChip>
                    )}
                    {c.licenseVerified && <Icon name="shield" className="w-3.5 h-3.5 shrink-0 text-green-500" />}
                  </div>
                  <div className="mt-1 flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"><Icon name="mail" className="w-3 h-3 shrink-0" />{c.email}</span>
                    <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"><Icon name="map-pin" className="w-3 h-3 shrink-0" />{c.city}</span>
                  </div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <div className="text-xs text-muted-foreground">{c.totalBookings} Buchungen</div>
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    {(() => {
                      const display = formatStressScore(c.drivingStressScore, {
                        level: c.stressLevel ?? undefined,
                      });
                      if (display.isMissing) {
                        return (
                          <span className="text-xs text-muted-foreground">{display.compact}</span>
                        );
                      }
                      return (
                        <StatusChip tone={stressToneToStatusTone(display.tone)} className="text-[9px]">
                          {display.label}
                        </StatusChip>
                      );
                    })()}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenCustomerDetail(c); }}
                  className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all opacity-0 group-hover/card:opacity-100 ${ 'hover:bg-muted text-muted-foreground hover:text-foreground' }`}
                  title="Kundendetails anzeigen"
                >
                  <Icon name="eye" className="w-5 h-5" />
                </button>
                {selectedCustomer?.id === c.id && (
                  <Icon name="check" className="w-5 h-5 text-status-info shrink-0" />
                )}
              </button>
            ))}
          </div>

          {selectedCustomer && customerEligibility && (
            <div className={`mt-3 p-3 rounded-lg border text-xs space-y-2 ${
              customerEligibility.blockingReasons.length > 0
                ? 'sq-tone-critical border-border'
                : customerEligibility.warnings.length > 0
                  ? 'sq-tone-warning border-border'
                  : 'sq-tone-success border-border'
            }`}>
              <div className="font-semibold text-foreground">
                Mietfreigabe:{' '}
                {customerEligibility.blockingReasons.length > 0
                  ? 'Blockiert'
                  : customerEligibility.warnings.length > 0
                    ? 'Warnung'
                    : 'Freigegeben'}
              </div>
              {customerEligibility.blockingReasons.map((r) => (
                <div key={r} className="text-muted-foreground">• {r}</div>
              ))}
              {customerEligibility.warnings.map((w) => (
                <div key={w} className="text-muted-foreground">⚠ {w}</div>
              ))}
              {customerEligibility.requiredActions.map((a) => (
                <div key={a} className="text-muted-foreground">→ {a}</div>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <CustomerVerificationPanel
              customerId={selectedCustomer.id}
              orgId={orgId ?? undefined}
              compact
            />
          )}

          {/* Add New Customer */}
          <button
            onClick={onOpenAddCustomer}
            className={`w-full mt-4 p-3 rounded-lg border-2 border-dashed text-xs flex items-center justify-center gap-2 transition-all ${ 'border-border text-muted-foreground hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]' }`}>
            <Icon name="plus" className="w-5 h-5" />
            Neuen Kunden anlegen
          </button>

          {/* Customer Detail Modal */}
          {customerDetailOpen && customerDetailTarget && (
            <CustomerDetailModal
              customer={mapToDetailCustomer(customerDetailTarget)}
              onClose={onCloseCustomerDetail}
            />
          )}
        </div>
      </BookingStepCard>

      {/* Add Customer Modal */}
      {isAddCustomerOpen && (() => {
        const addSteps = [
          { label: 'Persönliche Daten', icon: User },
          { label: 'ID & Führerschein', icon: IdCard },
          { label: 'Dokumente', icon: Upload },
          { label: 'Zusammenfassung', icon: CheckCircle },
        ];
        const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs outline-none transition-all ${
          'bg-background border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-glow)]'
        }`;
        const labelClass = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
        const sectionTitle = (icon: ComponentType<{ className?: string }>, title: string) => {
          const StepIcon = icon;
          return (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center sq-tone-info">
                <StepIcon className="w-5 h-5 text-status-info" />
              </div>
              <h3 className="text-base text-foreground">{title}</h3>
            </div>
          );
        };

        const SummaryRow = ({ label, value }: { label: string; value: string }) => (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-medium text-foreground">{value || '—'}</span>
          </div>
        );

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCloseAddCustomer}>
            <div className="absolute inset-0 overlay-scrim" />
            <div onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-[680px] max-h-[85vh] flex flex-col rounded-lg border shadow-2xl ${ 'surface-premium/90 border border-border' }`}>
              {/* Header */}
              <div className="flex items-center justify-between px-7 py-3 border-b shrink-0 border-border">
                <div>
                  <h2 className="text-lg text-foreground">Neuen Kunden anlegen</h2>
                  <p className="text-xs mt-0.5 text-muted-foreground">Alle Pflichtfelder ausfüllen & Dokumente hochladen</p>
                </div>
                <button onClick={onCloseAddCustomer}
                  className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${ 'hover:bg-muted text-muted-foreground' }`}>
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className="flex items-center gap-1 px-7 py-3 border-b shrink-0 border-border">
                {addSteps.map((s, i) => {
                  const StepIcon = s.icon;
                  const isActive = i === addStep;
                  const isDone = i < addStep;
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <button onClick={() => { if (isDone) onAddStepChange(i); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${ isActive ? 'sq-chip-info' : isDone ? 'text-[color:var(--status-positive)] cursor-pointer hover:bg-[color:var(--status-positive-soft)]' : 'text-muted-foreground' }`}>
                        {isDone ? <Icon name="check-circle" className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                      {i < addSteps.length - 1 && (
                        <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-emerald-400/40' : 'bg-muted'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-7 py-3">
                {addStep === 0 && (
                  <div className="space-y-4">
                    {sectionTitle(User, 'Persönliche Daten')}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Vorname *</label>
                        <input type="text" placeholder="Max" value={newCustomer.firstName}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, firstName: e.target.value })} className={inputClass} />
                        {formErrors.firstName && <p className="text-[11px] text-red-500 mt-1">{formErrors.firstName}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Nachname *</label>
                        <input type="text" placeholder="Mustermann" value={newCustomer.lastName}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, lastName: e.target.value })} className={inputClass} />
                        {formErrors.lastName && <p className="text-[11px] text-red-500 mt-1">{formErrors.lastName}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>E-Mail *</label>
                        <div className="relative">
                          <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input type="email" placeholder="max@beispiel.de" value={newCustomer.email}
                            onChange={(e) => onNewCustomerChange({ ...newCustomer, email: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.email && <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Telefon *</label>
                        <div className="relative">
                          <Icon name="phone" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input type="text" placeholder="+49 176 1234 5678" value={newCustomer.phone}
                            onChange={(e) => onNewCustomerChange({ ...newCustomer, phone: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.phone && <p className="text-[11px] text-red-500 mt-1">{formErrors.phone}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Straße</label>
                        <input type="text" placeholder="Musterstraße 1" value={newCustomer.street}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, street: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>PLZ</label>
                        <input type="text" placeholder="34117" value={newCustomer.zip}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, zip: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Stadt *</label>
                        <input type="text" placeholder="Kassel" value={newCustomer.city}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, city: e.target.value })} className={inputClass} />
                        {formErrors.city && <p className="text-[11px] text-red-500 mt-1">{formErrors.city}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Kundentyp</label>
                        <div className="flex gap-2">
                          {(['Individual', 'Corporate'] as const).map(t => (
                            <button key={t} onClick={() => onNewCustomerChange({ ...newCustomer, type: t })}
                              className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${ newCustomer.type === t ? 'bg-brand text-brand-foreground border-brand shadow-md' : 'surface-premium border border-border text-muted-foreground hover:border-border' }`}>
                              {t === 'Individual' ? 'Privat' : 'Firma'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {newCustomer.type === 'Corporate' && (
                        <div>
                          <label className={labelClass}>Firmenname *</label>
                          <input type="text" placeholder="Firma GmbH" value={newCustomer.company}
                            onChange={(e) => onNewCustomerChange({ ...newCustomer, company: e.target.value })} className={inputClass} />
                          {formErrors.company && <p className="text-[11px] text-red-500 mt-1">{formErrors.company}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {addStep === 1 && (
                  <div className="space-y-5">
                    {sectionTitle(Car, 'Führerschein')}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Führerscheinnr. *</label>
                        <input type="text" placeholder="B072RRE2I55" value={newCustomer.licenseNumber}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, licenseNumber: e.target.value })} className={inputClass} />
                        {formErrors.licenseNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseNumber}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Gültig bis *</label>
                        <input type="date" value={newCustomer.licenseExpiry}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, licenseExpiry: e.target.value })} className={inputClass} />
                        {formErrors.licenseExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseExpiry}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Klasse</label>
                        <select value={newCustomer.licenseClass}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, licenseClass: e.target.value })} className={inputClass}>
                          {['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C', 'CE', 'C1', 'C1E', 'D', 'DE'].map(cls => (
                            <option key={cls} value={cls}>{cls}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="h-px my-2 bg-muted" />

                    {sectionTitle(IdCard, 'Ausweisdokument (ID-Verifikation)')}
                    <div className="rounded-lg p-3.5 mb-3 sq-tone-watch border border-border">
                      <div className="flex items-start gap-2.5">
                        <Icon name="shield" className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-[color:var(--status-watch)]">
                          Zur Identitätsprüfung wird ein gültiger Personalausweis oder Reisepass benötigt. Die Daten werden gemäß DSGVO verarbeitet.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Dokumenttyp</label>
                        <select value={newCustomer.idType}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, idType: e.target.value as typeof newCustomer.idType })} className={inputClass}>
                          <option value="Personalausweis">Personalausweis</option>
                          <option value="Reisepass">Reisepass</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Ausweisnummer *</label>
                        <input type="text" placeholder="L01X00T47" value={newCustomer.idNumber}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, idNumber: e.target.value })} className={inputClass} />
                        {formErrors.idNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.idNumber}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Gültig bis *</label>
                        <input type="date" value={newCustomer.idExpiry}
                          onChange={(e) => onNewCustomerChange({ ...newCustomer, idExpiry: e.target.value })} className={inputClass} />
                        {formErrors.idExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.idExpiry}</p>}
                      </div>
                    </div>

                    <AddCustomerVerificationPlanSection
                      plan={verificationPlan}
                      onChange={onVerificationPlanChange}
                      sectionTitle={sectionTitle}
                      licensePickupWarning="Hinweis: Wenn Ihre Mietfreigabe den Führerschein bereits für die Buchungsbestätigung verlangt, blockiert „Beim Pickup prüfen“ die Bestätigung bis zur Prüfung."
                    />
                  </div>
                )}

                {addStep === 2 && (
                  <AddCustomerDocumentsStep
                    draftCustomerId={draftCustomerId}
                    isPreparingDraft={isEnsuringDraft}
                    orgId={orgId ?? undefined}
                    idType={newCustomer.idType}
                    pendingDocFiles={pendingDocFiles}
                    formErrors={formErrors}
                    onPendingFileChange={(type, file) => onPendingDocFileChange(type, file)}
                    onVerificationUpdated={() => void onRefreshWizardEligibility()}
                    sectionTitle={sectionTitle}
                  />
                )}

                {addStep === 3 && (
                  <div className="space-y-5">
                    {sectionTitle(CheckCircle, 'Zusammenfassung & Prüfung')}
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${ 'bg-muted/40 border border-border divide-border' }`}>
                      <SummaryRow label="Name" value={`${newCustomer.firstName} ${newCustomer.lastName}`} />
                      <SummaryRow label="E-Mail" value={newCustomer.email} />
                      <SummaryRow label="Telefon" value={newCustomer.phone} />
                      <SummaryRow label="Adresse" value={[newCustomer.street, `${newCustomer.zip} ${newCustomer.city}`].filter(Boolean).join(', ')} />
                      <SummaryRow label="Typ" value={newCustomer.type === 'Corporate' ? `Firma — ${newCustomer.company}` : 'Privatkunde'} />
                    </div>
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${ 'bg-muted/40 border border-border divide-border' }`}>
                      <SummaryRow label="Führerscheinnr." value={newCustomer.licenseNumber} />
                      <SummaryRow label="Klasse" value={newCustomer.licenseClass} />
                      <SummaryRow label="FS gültig bis" value={newCustomer.licenseExpiry} />
                      <SummaryRow label="Ausweistyp" value={newCustomer.idType} />
                      <SummaryRow label="Ausweisnr." value={newCustomer.idNumber} />
                      <SummaryRow label="Ausweis gültig bis" value={newCustomer.idExpiry} />
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">Ausweis (Didit)</span>
                        <span className="text-xs font-medium text-foreground">
                          {wizardEligibility
                            ? documentEligibilityLabelDe(wizardEligibility.idDocument)
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">Führerschein (Didit)</span>
                        <span className="text-xs font-medium text-foreground">
                          {wizardEligibility
                            ? documentEligibilityLabelDe(wizardEligibility.drivingLicense)
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className={`rounded-lg border p-4 ${ 'bg-muted/40 border border-border' }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Dokumente</span>
                        <div className="flex items-center gap-3">
                          {[
                            { label: 'Ausweis VS', ok: Boolean(pendingDocFiles.ID_FRONT) },
                            { label: 'Ausweis RS', ok: Boolean(pendingDocFiles.ID_BACK) },
                            { label: 'FS VS', ok: Boolean(pendingDocFiles.LICENSE_FRONT) },
                            { label: 'FS RS', ok: Boolean(pendingDocFiles.LICENSE_BACK) },
                          ].map(d => (
                            <span key={d.label} className={`inline-flex items-center gap-1 text-[11px] font-medium ${ d.ok ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground' }`}>
                              {d.ok ? <Icon name="check-circle" className="w-3 h-3" /> : <Icon name="x" className="w-3 h-3" />}
                              {d.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Notizen (optional)</label>
                      <textarea rows={2} placeholder="Zusätzliche Informationen zum Kunden..."
                        value={newCustomer.notes}
                        onChange={(e) => onNewCustomerChange({ ...newCustomer, notes: e.target.value })}
                        className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-7 py-3 border-t shrink-0 border-border">
                <button onClick={onCloseAddCustomer}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${ 'text-muted-foreground hover:text-foreground hover:bg-muted' }`}>
                  Abbrechen
                </button>
                <div className="flex items-center gap-2.5">
                  {addStep > 0 && (
                    <button onClick={() => onAddStepChange(addStep - 1)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${ 'surface-premium border border-border text-foreground hover:bg-muted' }`}>
                      <Icon name="chevron-left" className="w-3.5 h-3.5" />
                      Zurück
                    </button>
                  )}
                  {addStep < 3 ? (
                    <button
                      onClick={() => void onAddNextStep()}
                      disabled={isEnsuringDraft}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-primary-foreground text-xs font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                    >
                      {isEnsuringDraft ? (
                        <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Icon name="chevron-right" className="w-3.5 h-3.5" />
                      )}
                      {isEnsuringDraft ? 'Vorbereitet…' : 'Weiter'}
                    </button>
                  ) : (
                    <button onClick={onSubmitNewCustomer}
                      disabled={isSavingCustomer}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-primary-foreground text-xs font-semibold shadow-md transition-all ${isSavingCustomer ? 'bg-[color:var(--status-positive)]/50 cursor-not-allowed' : 'bg-[color:var(--status-positive)] hover:opacity-90 hover:shadow-lg'}`}>
                      <Icon name="check-circle" className="w-3.5 h-3.5" />
                      {isSavingCustomer ? 'Speichert…' : 'Kunden anlegen'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
