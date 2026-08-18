import { useState } from 'react';
import { ArrowLeft, ChevronRight, UserPlus, X } from 'lucide-react';
import { AppDialog } from '../../components/patterns';
import { Button } from '../../components/ui/button';

const BUSINESS_TYPES = [
  { label: 'Vermietung', value: 'RENTAL' },
  { label: 'Flotte', value: 'FLEET' },
  { label: 'Taxi', value: 'TAXI' },
  { label: 'Logistik', value: 'LOGISTICS' },
  { label: 'Sonstiges', value: 'OTHER' },
];

interface OrganizationCreateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    payload: {
      companyName: string;
      shortCode?: string;
      businessType: string;
      city?: string;
      country?: string;
      email?: string;
      status?: string;
    },
    adminData?: { name: string; email: string; password: string } | null,
  ) => Promise<void>;
}

export function OrganizationCreateWizard({ open, onOpenChange, onSubmit }: OrganizationCreateWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formShortCode, setFormShortCode] = useState('');
  const [formType, setFormType] = useState('RENTAL');
  const [formCity, setFormCity] = useState('');
  const [formCountry, setFormCountry] = useState('Deutschland');
  const [formEmail, setFormEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [skipAdmin, setSkipAdmin] = useState(false);

  const reset = () => {
    setStep(1);
    setFormName('');
    setFormShortCode('');
    setFormType('RENTAL');
    setFormCity('');
    setFormCountry('Deutschland');
    setFormEmail('');
    setAdminName('');
    setAdminEmail('');
    setAdminPassword('');
    setSkipAdmin(false);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const adminData =
        !skipAdmin && adminName.trim() && adminEmail.trim() && adminPassword.trim()
          ? { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword.trim() }
          : null;
      await onSubmit(
        {
          companyName: formName.trim(),
          shortCode: formShortCode || undefined,
          businessType: formType,
          city: formCity || undefined,
          country: formCountry || undefined,
          email: formEmail || undefined,
          status: 'PENDING',
        },
        adminData,
      );
      close();
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border text-sm outline-none bg-muted border-border text-foreground focus:border-ring';
  const labelClass = 'block text-sm font-semibold mb-1 text-foreground';

  return (
    <AppDialog open={open} onOpenChange={(o) => { if (!o) close(); }} maxWidthClassName="sm:max-w-2xl" hideClose>
      <div className="surface-premium">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} className="p-2 rounded-lg hover:bg-muted">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold">
              {step === 1 ? 'Organisation anlegen' : 'Admin-Account'}
            </h2>
          </div>
          <button type="button" onClick={close} className="p-2 rounded-lg hover:bg-muted" aria-label="Schließen">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === 1 && (
            <>
              <div>
                <label className={labelClass}>Firmenname *</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Kürzel</label>
                  <input
                    value={formShortCode}
                    onChange={(e) =>
                      setFormShortCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Branche</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className={inputClass}>
                    {BUSINESS_TYPES.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Stadt</label>
                  <input value={formCity} onChange={(e) => setFormCity(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Land</label>
                  <input value={formCountry} onChange={(e) => setFormCountry(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Kontakt-E-Mail</label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className={inputClass} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Organisation: <strong>{formName}</strong>
              </p>
              <div>
                <label className={labelClass}>Admin Name</label>
                <input value={adminName} disabled={skipAdmin} onChange={(e) => setAdminName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Admin E-Mail</label>
                <input type="email" value={adminEmail} disabled={skipAdmin} onChange={(e) => setAdminEmail(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Temporäres Passwort</label>
                <input type="password" value={adminPassword} disabled={skipAdmin} onChange={(e) => setAdminPassword(e.target.value)} className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipAdmin} onChange={(e) => setSkipAdmin(e.target.checked)} />
                Admin später anlegen
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>Abbrechen</Button>
          {step === 1 ? (
            <Button type="button" className="flex-1" disabled={!formName.trim()} onClick={() => setStep(2)}>
              Weiter <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" className="flex-1 gap-2" disabled={saving} onClick={() => void handleCreate()}>
              <UserPlus className="w-4 h-4" />
              {saving ? 'Erstelle…' : 'Organisation erstellen'}
            </Button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
