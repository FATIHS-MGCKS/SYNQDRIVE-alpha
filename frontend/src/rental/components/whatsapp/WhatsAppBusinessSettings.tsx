import { useState } from 'react';
import { ErrorState } from '../../../components/patterns/states';
import { Skeleton } from '../../../components/ui/skeleton';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { WhatsAppSettingsPanel } from './WhatsAppSettingsPanel';
import { WhatsAppSetupWizard } from './WhatsAppSetupWizard';
import { isSandboxEnvironment } from './whatsapp.ops';
import { useWhatsAppBusinessSettings } from './useWhatsAppBusinessSettings';

interface WhatsAppBusinessSettingsProps {
  enabled?: boolean;
}

export function WhatsAppBusinessSettings({ enabled = true }: WhatsAppBusinessSettingsProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const settings = useWhatsAppBusinessSettings({ orgId, enabled });
  const [simPhone, setSimPhone] = useState('+49 170 1234567');
  const [simName, setSimName] = useState('');
  const [simContent, setSimContent] = useState('');

  if (settings.loading) {
    return (
      <div className="space-y-3" data-testid="whatsapp-settings-loading">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (settings.error) {
    return (
      <ErrorState
        compact
        title={t('communication.settings.loadError')}
        error={t('communication.settings.whatsapp.loadError')}
        onRetry={() => void settings.reload()}
      />
    );
  }

  return (
    <div data-testid="whatsapp-business-settings">
      <WhatsAppSettingsPanel
        config={settings.config}
        saving={settings.saving}
        onSave={(patch) => void settings.saveConfig(patch)}
        onConnect={() => settings.setWizardOpen(true)}
        onDisconnect={() => void settings.disconnect()}
        onSimulate={() => settings.setSimModal(true)}
      />

      <WhatsAppSetupWizard
        open={settings.wizardOpen}
        saving={settings.saving}
        onClose={() => settings.setWizardOpen(false)}
        onComplete={(data) => void settings.connect(data)}
      />

      {settings.simModal && isSandboxEnvironment() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="surface-premium w-full max-w-md border border-border/40 p-4">
            <h3 className="text-sm font-semibold text-foreground">Simulate incoming message</h3>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                value={simPhone}
                onChange={(event) => setSimPhone(event.target.value)}
                placeholder="Phone"
              />
              <input
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                value={simName}
                onChange={(event) => setSimName(event.target.value)}
                placeholder="Name"
              />
              <textarea
                className="min-h-24 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
                value={simContent}
                onChange={(event) => setSimContent(event.target.value)}
                placeholder="Message"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs font-semibold"
                onClick={() => settings.setSimModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-xs font-semibold text-white"
                onClick={() =>
                  void settings.simulateIncoming({
                    contactPhone: simPhone.trim(),
                    contactName: simName.trim() || undefined,
                    content: simContent.trim(),
                  })
                }
              >
                Simulate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
