import { StatusChip } from '../../../../components/patterns';
import { EmptyState } from '../../../../components/patterns/states';
import { VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';

interface VoiceOrgPhoneNumbersTabProps {
  workspace: VoiceControlPlaneOrgWorkspace;
  onReconnect: (phoneNumberId: string) => void;
}

function statusTone(status: string): 'success' | 'warning' | 'critical' | 'neutral' {
  if (['ACTIVE', 'IMPORTED', 'ASSIGNED'].includes(status)) return 'success';
  if (['FAILED', 'BLOCKED'].includes(status)) return 'critical';
  return 'warning';
}

export function VoiceOrgPhoneNumbersTab({ workspace, onReconnect }: VoiceOrgPhoneNumbersTabProps) {
  const numbers = workspace.phoneNumbers;

  return (
    <div className="space-y-4" data-testid="voice-org-tab-phone-numbers">
      <VoiceSectionHeader
        title="Telefonnummern"
        description="Nur maskierte Nummern — keine vollständigen E.164-Werte."
      />

      {numbers.length === 0 ? (
        <EmptyState title="Keine Nummern" description="Für diese Organisation ist noch keine Nummer registriert." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {numbers.map(number => (
            <div key={number.id} className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm">{number.maskedPhoneNumber}</span>
                <StatusChip tone={statusTone(number.status)}>{number.status}</StatusChip>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="text-muted-foreground">Region</dt>
                  <dd>{number.region ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Regulatory</dt>
                  <dd>{number.regulatoryStatus ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ElevenLabs</dt>
                  <dd>
                    <StatusChip tone={number.elevenLabsAssigned ? 'success' : 'warning'}>
                      {number.elevenLabsAssigned ? 'Zugeordnet' : 'Offen'}
                    </StatusChip>
                  </dd>
                </div>
              </dl>
              {!number.elevenLabsAssigned && (
                <button
                  type="button"
                  onClick={() => onReconnect(number.id)}
                  className="text-xs font-semibold text-[color:var(--brand)]"
                >
                  Nummer erneut zuordnen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {workspace.providerAccounts.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold mb-2">Provider-Accounts</h4>
          <ul className="space-y-2 text-xs">
            {workspace.providerAccounts.map(account => (
              <li key={account.id} className="flex justify-between gap-2">
                <span>{account.provider}</span>
                <span className="font-mono text-muted-foreground">{account.maskedExternalRef ?? '—'}</span>
                <StatusChip tone={statusTone(account.status)}>{account.status}</StatusChip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
