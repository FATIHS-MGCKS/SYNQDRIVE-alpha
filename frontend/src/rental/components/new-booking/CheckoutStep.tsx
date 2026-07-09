import { CreditCard, Euro, FileText } from 'lucide-react';
import { buildMMY } from '../../lib/vehicleMmy';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import { amountLabel, formatEuroAmount } from './format';
import type { CheckoutStepProps } from './types';

export function CheckoutStep({
  selectedCustomer,
  selectedVehicle,
  paymentMethod,
  onPaymentMethodChange,
  discountPercent,
  onDiscountPercentChange,
  discountAmount,
  agbAccepted,
  privacyAccepted,
  onAgbAcceptedChange,
  onPrivacyAcceptedChange,
  invoiceGenerated,
  contractGenerated,
  generatingInvoice,
  generatingContract,
  onGenerateInvoice,
  onGenerateContract,
  quickViewDoc,
  onQuickViewDocChange,
  pickupDate,
  returnDate,
  pickupTime,
  returnTime,
  rentalDays,
  displayRentalDays,
  taxRatePercent,
  subtotal,
  extrasTotal,
  tax,
  grandTotal,
  depositAmount,
  totalFreeKm,
  dailyRateGross,
}: CheckoutStepProps) {
  return (
    <div className="space-y-4">
      {/* Box 1: Zahlungsmethode */}
      <BookingStepCard>
        <div className="p-4">
          <h2 className="text-lg mb-3 text-muted-foreground">Zahlungsmethode</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'card' as const, label: 'Kartenzahlung', icon: CreditCard, desc: 'Kredit-/Debitkarte' },
              { id: 'cash' as const, label: 'Barzahlung', icon: Euro, desc: 'Bei Abholung' },
              { id: 'invoice' as const, label: 'Rechnung', icon: FileText, desc: 'Firmenrechnung' },
            ].map((m) => {
              const isInvoiceDisabled = m.id === 'invoice' && selectedCustomer?.type !== 'Corporate';
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (!isInvoiceDisabled) onPaymentMethodChange(m.id);
                  }}
                  disabled={isInvoiceDisabled}
                  className={`p-3.5 rounded-lg border text-center transition-all ${isInvoiceDisabled ? 'bg-muted/20 border border-border opacity-40 cursor-not-allowed' : paymentMethod === m.id ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : 'bg-muted/40 border border-border hover:border-border'}`}
                >
                  <m.icon
                    className={`w-5 h-5 mx-auto mb-1.5 ${isInvoiceDisabled ? 'text-muted-foreground' : paymentMethod === m.id ? 'text-status-info' : 'text-muted-foreground'}`}
                  />
                  <p className="text-xs text-foreground">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                  {isInvoiceDisabled && (
                    <p className="text-xs mt-1 text-[color:var(--status-watch)]">Nur Firmenkunden</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </BookingStepCard>

      {/* Box 2: Rabatt */}
      <BookingStepCard>
        <div className="p-4">
          <h2 className="text-lg mb-3 text-muted-foreground">Rabatt</h2>
          <div className="flex gap-2 items-center flex-wrap">
            {[0, 5, 10, 15, 20].map((d) => (
              <button
                key={d}
                onClick={() => onDiscountPercentChange(d)}
                className={`px-3.5 py-1.5 rounded-lg border text-xs transition-all ${discountPercent === d && ![0, 5, 10, 15, 20].includes(discountPercent) ? '' : discountPercent === d ? 'sq-tone-success border border-border' : 'bg-muted/40 border border-border text-muted-foreground hover:border-border'}`}
              >
                {d}%
              </button>
            ))}
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs ${![0, 5, 10, 15, 20].includes(discountPercent) && discountPercent > 0 ? 'sq-tone-success border border-border' : 'bg-muted/40 border border-border'}`}
            >
              <input
                type="number"
                min={0}
                max={100}
                placeholder="Eigener"
                value={![0, 5, 10, 15, 20].includes(discountPercent) ? discountPercent : ''}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                  onDiscountPercentChange(val);
                }}
                className={`w-16 bg-transparent outline-none text-xs text-center ${'text-foreground placeholder:text-muted-foreground'}`}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          {discountPercent > 0 && (
            <p className="text-xs mt-2 text-[color:var(--status-positive)]">
              Ersparnis: € {discountAmount.toFixed(2)}
            </p>
          )}
        </div>
      </BookingStepCard>

      {/* Box 3: Dokumente */}
      <BookingStepCard>
        <div className="p-4">
          <h2 className="text-lg mb-3 text-muted-foreground">Dokumente</h2>
          <div className="space-y-3">
            {/* AGB */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-2.5">
                <Icon name="file-text" className="w-5 h-5 text-[color:var(--status-info)]" />
                <span className="text-xs text-foreground">Allgemeine Geschäftsbedingungen (AGB)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(`
                                  <html><head><title>AGB</title>
                                  <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px;margin-bottom:20px}h2{font-size:17px;margin-top:30px}p{line-height:1.6;font-size:14px}</style>
                                  </head><body>
                                  <h1>Allgemeine Gesch&auml;ftsbedingungen (AGB)</h1>
                                  <p>Stand: M&auml;rz 2026</p>
                                  <h2>1. Geltungsbereich</h2><p>Diese AGB gelten f&uuml;r alle Mietvertr&auml;ge &uuml;ber Fahrzeuge unserer Flotte.</p>
                                  <h2>2. Mietbedingungen</h2><p>Der Mieter verpflichtet sich, das Fahrzeug pfleglich zu behandeln und zum vereinbarten Zeitpunkt zur&uuml;ckzugeben.</p>
                                  <h2>3. Zahlungsbedingungen</h2><p>Die Miete ist bei Abholung f&auml;llig. Bei Firmenkunden kann auf Rechnung gezahlt werden.</p>
                                  </body></html>
                                `);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }}
                  title="Drucken"
                  className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Icon name="printer" className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const subject = encodeURIComponent('Allgemeine Geschäftsbedingungen – Flottenvermietung');
                    const body = encodeURIComponent(
                      'Sehr geehrte/r Kunde/in,\n\nanbei erhalten Sie unsere Allgemeinen Geschäftsbedingungen (AGB).\n\n' +
                        '1. Geltungsbereich: Diese AGB gelten für alle Mietverträge über Fahrzeuge unserer Flotte.\n' +
                        '2. Mietbedingungen: Der Mieter verpflichtet sich, das Fahrzeug pfleglich zu behandeln.\n' +
                        '3. Zahlungsbedingungen: Die Miete ist bei Abholung fällig.\n\n' +
                        'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team',
                    );
                    const email = selectedCustomer?.email || '';
                    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                  }}
                  title="Per E-Mail senden"
                  className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Icon name="send" className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Datenschutzerklärung */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-2.5">
                <Icon name="shield" className="w-5 h-5 text-[color:var(--status-ai)]" />
                <span className="text-xs text-foreground">Datenschutzerklärung</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(`
                                  <html><head><title>Datenschutzerkl&auml;rung</title>
                                  <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px;margin-bottom:20px}p{line-height:1.6;font-size:14px}</style>
                                  </head><body>
                                  <h1>Datenschutzerkl&auml;rung</h1>
                                  <p>Wir verarbeiten Ihre personenbezogenen Daten gem&auml;&szlig; DSGVO ausschlie&szlig;lich zur Durchf&uuml;hrung des Mietvertrags.</p>
                                  </body></html>
                                `);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }}
                  title="Drucken"
                  className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Icon name="printer" className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const subject = encodeURIComponent('Datenschutzerklärung – Flottenvermietung');
                    const body = encodeURIComponent(
                      'Sehr geehrte/r Kunde/in,\n\nanbei erhalten Sie unsere Datenschutzerklärung.\n\n' +
                        'Wir verarbeiten Ihre personenbezogenen Daten gemäß DSGVO ausschließlich zur Durchführung des Mietvertrags.\n\n' +
                        'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team',
                    );
                    const email = selectedCustomer?.email || '';
                    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                  }}
                  title="Per E-Mail senden"
                  className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Icon name="send" className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Rechnung */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-2.5">
                <Icon name="receipt" className="w-5 h-5 text-[color:var(--status-watch)]" />
                <div>
                  <span className="text-xs text-foreground">Rechnung</span>
                  {invoiceGenerated && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full sq-chip-success">Generiert</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!invoiceGenerated ? (
                  <button
                    onClick={onGenerateInvoice}
                    disabled={generatingInvoice}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${'sq-tone-watch border border-border hover:opacity-90'}`}
                  >
                    {generatingInvoice ? (
                      <Icon name="loader-2" className="w-3 h-3 animate-spin" />
                    ) : (
                      <Icon name="receipt" className="w-3 h-3" />
                    )}
                    {generatingInvoice ? 'Wird generiert...' : 'Generieren'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => onQuickViewDocChange('invoice')}
                      title="Vorschau"
                      className="p-1.5 rounded-md transition-all hover:bg-muted text-[color:var(--status-info)] hover:opacity-80"
                    >
                      <Icon name="eye" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(`
                                      <html><head><title>Rechnung</title>
                                      <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #eee}th{background:#f9f9f9}.total{font-size:18px;font-weight:600}</style>
                                      </head><body>
                                      <h1>Rechnung</h1>
                                      <p>Kunde: ${selectedCustomer?.name || '–'}</p>
                                      <p>Fahrzeug: ${selectedVehicle ? buildMMY(selectedVehicle) : '–'} (${selectedVehicle?.license || '–'})</p>
                                      <p>Zeitraum: ${pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} – ${returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'}</p>
                                      <table><tr><th>Position</th><th>Betrag</th></tr>
                                      <tr><td>${displayRentalDays}x Tagestarif</td><td>&euro; ${amountLabel(subtotal)}</td></tr>
                                      <tr><td>Pakete & Extras</td><td>&euro; ${amountLabel(extrasTotal)}</td></tr>
                                      ${discountPercent > 0 ? `<tr><td>Rabatt (${discountPercent}%)</td><td>-&euro; ${amountLabel(discountAmount)}</td></tr>` : ''}
                                      <tr><td>MwSt. (${taxRatePercent}%)</td><td>&euro; ${amountLabel(tax)}</td></tr>
                                      <tr><td class="total">Gesamt</td><td class="total">&euro; ${amountLabel(grandTotal)}</td></tr>
                                      </table></body></html>
                                    `);
                          printWindow.document.close();
                          printWindow.print();
                        }
                      }}
                      title="Drucken"
                      className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="printer" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const subject = encodeURIComponent(
                          `Rechnung – ${selectedVehicle ? buildMMY(selectedVehicle) : 'Fahrzeug'}`,
                        );
                        const body = encodeURIComponent(
                          `Sehr geehrte/r ${selectedCustomer?.name || 'Kunde/in'},\n\nanbei Ihre Rechnung.\n\n` +
                            `Fahrzeug: ${selectedVehicle ? buildMMY(selectedVehicle) : '–'} (${selectedVehicle?.license || '–'})\n` +
                            `Zeitraum: ${rentalDays} Tage\n` +
                            `Gesamt: € ${amountLabel(grandTotal)}\n\n` +
                            'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team',
                        );
                        const email = selectedCustomer?.email || '';
                        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                      }}
                      title="Per E-Mail senden"
                      className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="send" className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Mietvertrag */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-2.5">
                <Icon name="file-signature" className="w-5 h-5 text-[color:var(--status-positive)]" />
                <div>
                  <span className="text-xs text-foreground">Mietvertrag</span>
                  {contractGenerated && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full sq-chip-success">Generiert</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!contractGenerated ? (
                  <button
                    onClick={onGenerateContract}
                    disabled={generatingContract}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${'sq-tone-success border border-border hover:opacity-90'}`}
                  >
                    {generatingContract ? (
                      <Icon name="loader-2" className="w-3 h-3 animate-spin" />
                    ) : (
                      <Icon name="file-signature" className="w-3 h-3" />
                    )}
                    {generatingContract ? 'Wird generiert...' : 'Generieren'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => onQuickViewDocChange('contract')}
                      title="Vorschau"
                      className="p-1.5 rounded-md transition-all hover:bg-muted text-[color:var(--status-info)] hover:opacity-80"
                    >
                      <Icon name="eye" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(`
                                      <html><head><title>Mietvertrag</title>
                                      <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px}h2{font-size:16px;margin-top:24px}p{line-height:1.6;font-size:14px}.sig{margin-top:60px;display:flex;gap:80px}.sig div{border-top:1px solid #333;padding-top:8px;width:200px;font-size:13px}</style>
                                      </head><body>
                                      <h1>Mietvertrag</h1>
                                      <p><strong>Vermieter:</strong> Flottenmanagement GmbH</p>
                                      <p><strong>Mieter:</strong> ${selectedCustomer?.name || '–'}</p>
                                      <h2>Fahrzeug</h2>
                                      <p>${selectedVehicle ? buildMMY(selectedVehicle) : '–'} · ${selectedVehicle?.license || '–'}</p>
                                      <h2>Mietzeitraum</h2>
                                      <p>${pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} (${pickupTime}) – ${returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'} (${returnTime})</p>
                                      <h2>Kosten</h2>
                                      <p>Gesamt: &euro; ${amountLabel(grandTotal)} (inkl. MwSt.)</p>
                                      <p>Kaution: &euro; ${amountLabel(depositAmount)}</p>
                                      <p>Frei-Kilometer: ${totalFreeKm.toLocaleString('de-DE')} km</p>
                                      <div class="sig"><div>Vermieter</div><div>Mieter</div></div>
                                      </body></html>
                                    `);
                          printWindow.document.close();
                          printWindow.print();
                        }
                      }}
                      title="Drucken"
                      className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="printer" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const subject = encodeURIComponent(
                          `Mietvertrag – ${selectedVehicle ? buildMMY(selectedVehicle) : 'Fahrzeug'}`,
                        );
                        const body = encodeURIComponent(
                          `Sehr geehrte/r ${selectedCustomer?.name || 'Kunde/in'},\n\nanbei Ihr Mietvertrag.\n\n` +
                            `Fahrzeug: ${selectedVehicle ? buildMMY(selectedVehicle) : '–'} (${selectedVehicle?.license || '–'})\n` +
                            `Zeitraum: ${pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} – ${returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'}\n` +
                            `Gesamt: € ${amountLabel(grandTotal)}\n\n` +
                            'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team',
                        );
                        const email = selectedCustomer?.email || '';
                        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                      }}
                      title="Per E-Mail senden"
                      className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="send" className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </BookingStepCard>

      {/* Box 4: Bestätigungen */}
      <BookingStepCard>
        <div className="p-4">
          <h2 className="text-lg mb-3 text-muted-foreground">Bestätigungen</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agbAccepted}
                onChange={(e) => onAgbAcceptedChange(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-foreground">
                Kunde hat die <span className="text-status-info underline">Allgemeinen Geschäftsbedingungen (AGB)</span>{' '}
                und die Mietbedingungen erhalten.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => onPrivacyAcceptedChange(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-foreground">
                Kunde hat der <span className="text-status-info underline">Datenschutzerklärung</span> zugestimmt und wurde
                über die Verarbeitung seiner Daten informiert.
              </span>
            </label>
          </div>
        </div>
      </BookingStepCard>

      {/* Quick View Modal */}
      {quickViewDoc && (
        <div
          className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => onQuickViewDocChange(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg shadow-2xl ${'surface-premium border border-border'}`}
          >
            <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border surface-premium">
              <h3 className="text-base text-foreground">
                {quickViewDoc === 'invoice' ? 'Rechnung – Vorschau' : 'Mietvertrag – Vorschau'}
              </h3>
              <button
                onClick={() => onQuickViewDocChange(null)}
                className="p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {quickViewDoc === 'invoice' ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg mb-1 text-foreground">Rechnung</h2>
                    <p className="text-xs text-muted-foreground">Erstellt am {new Date().toLocaleDateString('de-DE')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-foreground">
                    <div>
                      <p className="text-xs mb-0.5 text-muted-foreground">Kunde</p>
                      <p>{selectedCustomer?.name || '–'}</p>
                      <p className="text-xs text-muted-foreground">{selectedCustomer?.email}</p>
                    </div>
                    <div>
                      <p className="text-xs mb-0.5 text-muted-foreground">Fahrzeug</p>
                      <p>{selectedVehicle ? buildMMY(selectedVehicle) : '–'}</p>
                      <p className="text-xs text-muted-foreground">{selectedVehicle?.license}</p>
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-2 border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {displayRentalDays}x Tagestarif ({formatEuroAmount(dailyRateGross)})
                      </span>
                      <span className="text-foreground">{formatEuroAmount(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Pakete & Extras</span>
                      <span className="text-foreground">{formatEuroAmount(extrasTotal)}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500">Rabatt ({discountPercent}%)</span>
                        <span className="text-green-500">-€ {amountLabel(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">MwSt. ({taxRatePercent}%)</span>
                      <span className="text-foreground">{formatEuroAmount(tax)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="text-foreground">Gesamt</span>
                      <span className="text-xs text-foreground">{formatEuroAmount(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg mb-1 text-foreground">Mietvertrag</h2>
                    <p className="text-xs text-muted-foreground">Erstellt am {new Date().toLocaleDateString('de-DE')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-foreground">
                    <div>
                      <p className="text-xs mb-0.5 text-muted-foreground">Vermieter</p>
                      <p>Flottenmanagement GmbH</p>
                    </div>
                    <div>
                      <p className="text-xs mb-0.5 text-muted-foreground">Mieter</p>
                      <p>{selectedCustomer?.name || '–'}</p>
                      <p className="text-xs text-muted-foreground">{selectedCustomer?.email}</p>
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-2 text-xs border-border text-foreground">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fahrzeug</span>
                      <span>
                        {selectedVehicle ? buildMMY(selectedVehicle) : '–'} · {selectedVehicle?.license || '–'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Zeitraum</span>
                      <span>
                        {pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} –{' '}
                        {returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Abhol-/Rückgabezeit</span>
                      <span>
                        {pickupTime} – {returnTime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frei-Kilometer</span>
                      <span>{totalFreeKm.toLocaleString('de-DE')} km</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span>Gesamtkosten</span>
                      <span className="text-xs text-foreground">{formatEuroAmount(grandTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kaution</span>
                      <span className="text-[color:var(--status-watch)]">{formatEuroAmount(depositAmount)}</span>
                    </div>
                  </div>
                  <div className="border-t pt-6 mt-6 flex gap-16 border-border">
                    <div className="flex-1">
                      <div className="border-t pt-2 text-xs border-border text-muted-foreground">Unterschrift Vermieter</div>
                    </div>
                    <div className="flex-1">
                      <div className="border-t pt-2 text-xs border-border text-muted-foreground">Unterschrift Mieter</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
