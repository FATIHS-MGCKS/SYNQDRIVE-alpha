import { useMemo } from 'react';
import { DataCard } from '../../../components/patterns/data-card';
import { StatusChip } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import type { VoiceAssistantData, VoiceAssistantReadiness, VoiceConnectionStatus, VoiceOption } from '../../../lib/api';
import { BuilderField, builderInputCls, builderTextareaCls } from './BuilderField';
import { KnowledgeIntegrationHints } from './KnowledgeIntegrationHints';
import { VoiceSelectorField } from './VoiceSelectorField';
import {
  LANGUAGE_OPTIONS,
  RECOMMENDED_FORBIDDEN_RULES,
  VOICE_FIELD_LIMITS,
} from './voice-assistant-builder.constants';
import type { VoiceTextField } from './voice-assistant-builder.types';
import type { BuilderTextField } from './voice-assistant-builder.constants';
import {
  buildPromptPreviewSections,
  extractCustomForbiddenLines,
  isForbiddenRuleEnabled,
  toggleForbiddenRuleLine,
} from './voice-assistant-prompt.utils';
import { useVoiceKnowledgeLinks } from './useVoiceKnowledgeLinks';
import type { VoiceTab } from './voice-assistant.ops';

interface VoiceAssistantBuilderProps {
  orgId: string;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  voices: VoiceOption[];
  voicesLoading: boolean;
  voicesError: string | null;
  onLoadVoices: () => void;
  textField: (key: VoiceTextField) => string;
  setTextField: (key: VoiceTextField, value: string) => void;
  setVoiceSelection: (voiceId: string, voiceName: string) => void;
  hasDraft: boolean;
  saving: boolean;
  onSave: () => void;
  onNavigateTab: (tab: VoiceTab) => void;
}

function clampField(key: BuilderTextField, value: string): string {
  const max = VOICE_FIELD_LIMITS[key];
  return max ? value.slice(0, max) : value;
}

function CharTextarea({
  fieldKey,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  fieldKey: BuilderTextField;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const max = VOICE_FIELD_LIMITS[fieldKey];
  return (
    <textarea
      className={builderTextareaCls}
      rows={rows}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      onChange={e => onChange(clampField(fieldKey, e.target.value))}
    />
  );
}

export function VoiceAssistantBuilder({
  orgId,
  assistant,
  readiness,
  voices,
  voicesLoading,
  voicesError,
  onLoadVoices,
  textField,
  setTextField,
  setVoiceSelection,
  hasDraft,
  saving,
  onSave,
  onNavigateTab,
}: VoiceAssistantBuilderProps) {
  const { links } = useVoiceKnowledgeLinks(orgId, assistant);
  const elevenLabsOk = readiness?.checks.find(c => c.key === 'elevenlabs')?.ok;

  const previewFields = useMemo(
    () => ({
      name: textField('name'),
      role: textField('role'),
      language: textField('language'),
      personality: textField('personality'),
      greetingMessage: textField('greetingMessage'),
      companyContext: textField('companyContext'),
      businessRules: textField('businessRules'),
      forbiddenActions: textField('forbiddenActions'),
      knowledgeSnippets: textField('knowledgeSnippets'),
      systemPrompt: textField('systemPrompt'),
    }),
    [textField],
  );

  const { sections, hasManualOverride } = useMemo(
    () => buildPromptPreviewSections(previewFields, assistant),
    [previewFields, assistant],
  );

  const knownForbiddenLines = RECOMMENDED_FORBIDDEN_RULES.map(r => r.line);
  const customForbidden = extractCustomForbiddenLines(textField('forbiddenActions'), knownForbiddenLines);

  const setForbidden = (next: string) => setTextField('forbiddenActions', clampField('forbiddenActions', next));

  return (
    <div className="space-y-4">
      {/* Sticky unsaved bar */}
      {hasDraft && (
        <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--brand)]/25 surface-frosted px-4 py-2.5 shadow-[var(--shadow-1)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[color:var(--brand)] animate-pulse" />
            <span className="text-[11px] font-semibold text-foreground">Unsaved changes</span>
            <span className="text-[10px] text-muted-foreground">Save before activating or leaving this tab.</span>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="sq-press inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-3.5 py-1.5 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
          >
            <Icon name={saving ? 'loader-2' : 'save'} className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Identity */}
          <DataCard
            title="Identity"
            description="How callers experience your assistant — name, voice, and first impression."
            className="rounded-2xl shadow-[var(--shadow-1)]"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BuilderField
                label="Assistant name"
                help="Displayed in the command center and used when introducing the assistant."
                required
                charCount={{ current: textField('name').length, max: VOICE_FIELD_LIMITS.name }}
              >
                <input
                  className={builderInputCls}
                  value={textField('name')}
                  maxLength={VOICE_FIELD_LIMITS.name}
                  placeholder="e.g. SynqDrive Rental Assistant"
                  onChange={e => setTextField('name', clampField('name', e.target.value))}
                />
              </BuilderField>

              <BuilderField
                label="Role"
                help="What this assistant does — booking support, fleet inquiries, etc."
                charCount={{ current: textField('role').length, max: VOICE_FIELD_LIMITS.role }}
              >
                <input
                  className={builderInputCls}
                  value={textField('role')}
                  maxLength={VOICE_FIELD_LIMITS.role}
                  placeholder="Customer service & booking help"
                  onChange={e => setTextField('role', clampField('role', e.target.value))}
                />
              </BuilderField>

              <BuilderField label="Language" help="Primary conversation language for callers.">
                <select
                  className={builderInputCls}
                  value={textField('language')}
                  onChange={e => setTextField('language', e.target.value)}
                >
                  {LANGUAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </BuilderField>

              <VoiceSelectorField
                voiceId={textField('voiceId')}
                voiceName={textField('voiceName')}
                voices={voices}
                loading={voicesLoading}
                error={voicesError}
                elevenLabsOk={elevenLabsOk}
                connectionStatus={assistant.connectionStatus as VoiceConnectionStatus}
                onLoadVoices={onLoadVoices}
                onSelect={setVoiceSelection}
              />

              <BuilderField
                label="Personality & tone"
                help="Friendly, professional, concise — guides how the assistant speaks."
                className="md:col-span-2"
                charCount={{ current: textField('personality').length, max: VOICE_FIELD_LIMITS.personality }}
              >
                <input
                  className={builderInputCls}
                  value={textField('personality')}
                  maxLength={VOICE_FIELD_LIMITS.personality}
                  placeholder="Warm, professional, solution-oriented"
                  onChange={e => setTextField('personality', clampField('personality', e.target.value))}
                />
              </BuilderField>

              <BuilderField
                label="Greeting message"
                help="First thing callers hear when the conversation starts."
                className="md:col-span-2"
                charCount={{ current: textField('greetingMessage').length, max: VOICE_FIELD_LIMITS.greetingMessage }}
              >
                <input
                  className={builderInputCls}
                  value={textField('greetingMessage')}
                  maxLength={VOICE_FIELD_LIMITS.greetingMessage}
                  placeholder="Hello! Welcome to our rental team. How can I help you today?"
                  onChange={e => setTextField('greetingMessage', clampField('greetingMessage', e.target.value))}
                />
              </BuilderField>
            </div>
          </DataCard>

          {/* Company Knowledge */}
          <DataCard
            title="Company knowledge"
            description="Background information the assistant can reference. Live fleet data integrations are shown below."
            className="rounded-2xl shadow-[var(--shadow-1)]"
          >
            <BuilderField
              label="Company context"
              help="Describe your business, locations, services, and brand voice. This is the foundation for accurate answers."
              charCount={{ current: textField('companyContext').length, max: VOICE_FIELD_LIMITS.companyContext }}
            >
              <CharTextarea
                fieldKey="companyContext"
                value={textField('companyContext')}
                onChange={v => setTextField('companyContext', v)}
                rows={5}
                placeholder="We are a vehicle rental company operating in… Our services include short-term rentals, fleet management…"
              />
            </BuilderField>

            <div className="mt-4">
              <KnowledgeIntegrationHints
                title="Data integrations"
                description="These rental modules can enrich assistant knowledge when connected."
                items={[links.openingHours, links.stations, links.serviceArea]}
              />
            </div>
          </DataCard>

          {/* Rental Knowledge */}
          <KnowledgeIntegrationHints
            title="Rental knowledge"
            description="Pricing, categories, and booking rules from your rental configuration. Not yet auto-injected into prompts — prepare context manually until live sync is enabled."
            items={[
              links.vehicleCategories,
              links.priceTariffs,
              links.rentalRules,
              links.bookingPrerequisites,
            ]}
          />

          {/* Behavior Rules */}
          <DataCard
            title="Behavior rules"
            description="Policies the assistant must follow during every conversation."
            className="rounded-2xl shadow-[var(--shadow-1)]"
          >
            <BuilderField
              label="Business rules"
              help="Booking policies, handover procedures, ID requirements, mileage rules, etc."
              charCount={{ current: textField('businessRules').length, max: VOICE_FIELD_LIMITS.businessRules }}
            >
              <CharTextarea
                fieldKey="businessRules"
                value={textField('businessRules')}
                onChange={v => setTextField('businessRules', v)}
                rows={5}
                placeholder={'• Minimum rental age is 21 with a valid license\n• Returns must be at the agreed station\n• Extensions require staff approval'}
              />
            </BuilderField>

            <div className="mt-5 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-foreground">Forbidden actions</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Critical guardrails for rental operations. Recommended rules are pre-defined for fleet safety.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-[color:var(--status-critical)]/20 bg-[color:var(--status-critical)]/[0.03] p-3">
                {RECOMMENDED_FORBIDDEN_RULES.map(rule => {
                  const enabled = isForbiddenRuleEnabled(textField('forbiddenActions'), rule.line);
                  return (
                    <label
                      key={rule.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e =>
                          setForbidden(
                            toggleForbiddenRuleLine(textField('forbiddenActions'), rule.line, e.target.checked),
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-border text-[color:var(--brand)] focus:ring-[color:var(--brand)]/30"
                      />
                      <div>
                        <p className="text-[11px] font-semibold text-foreground">{rule.label}</p>
                        <p className="text-[10px] text-muted-foreground">{rule.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <BuilderField
                label="Additional forbidden actions"
                help="Custom rules specific to your organization."
                charCount={{ current: customForbidden.length, max: VOICE_FIELD_LIMITS.forbiddenActions }}
              >
                <CharTextarea
                  fieldKey="forbiddenActions"
                  value={customForbidden}
                  onChange={v => {
                    const recommended = RECOMMENDED_FORBIDDEN_RULES
                      .filter(r => isForbiddenRuleEnabled(textField('forbiddenActions'), r.line))
                      .map(r => r.line);
                    setForbidden([...recommended, v].filter(Boolean).join('\n'));
                  }}
                  rows={3}
                  placeholder="Any additional restrictions…"
                />
              </BuilderField>
            </div>

            <div className="mt-5 rounded-xl border border-border/50 bg-muted/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold text-foreground">Escalation behavior</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Handover triggers and fallback messages are configured in the Escalation tab.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('escalation')}
                  className="sq-press rounded-lg border border-border/60 bg-card px-3 py-1.5 text-[10px] font-semibold"
                >
                  Edit escalation
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { label: 'On human request', ok: assistant.escalateOnRequest },
                  { label: 'Low confidence', ok: assistant.escalateOnLowConf },
                  { label: 'Sensitive topics', ok: assistant.escalateOnSensitive },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2 text-[10px]">
                    <Icon
                      name={row.ok ? 'check-circle-2' : 'circle'}
                      className={cn('h-3.5 w-3.5', row.ok ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground')}
                    />
                    <span className="text-muted-foreground">{row.label}</span>
                  </div>
                ))}
              </dl>
            </div>
          </DataCard>

          {/* System Prompt */}
          <DataCard
            title="System prompt"
            description="Advanced: override the auto-assembled instructions sent to ElevenLabs. Leave empty to use generated content from the sections above."
            className="rounded-2xl shadow-[var(--shadow-1)]"
            actions={
              hasManualOverride ? (
                <StatusChip tone="watch" className="text-[9px]">Manual override active</StatusChip>
              ) : (
                <StatusChip tone="neutral" className="text-[9px]">Auto-generated</StatusChip>
              )
            }
          >
            <BuilderField
              label="Manual system prompt"
              help="Only edit if you need full control. When set, this is sent to the provider on activate."
              charCount={{ current: textField('systemPrompt').length, max: VOICE_FIELD_LIMITS.systemPrompt }}
            >
              <CharTextarea
                fieldKey="systemPrompt"
                value={textField('systemPrompt')}
                onChange={v => setTextField('systemPrompt', v)}
                rows={8}
                placeholder="Leave empty to auto-build from identity, company context, rules, and snippets…"
              />
            </BuilderField>
          </DataCard>

          {/* Knowledge Snippets */}
          <DataCard
            title="Knowledge snippets"
            description="Short FAQ blocks for frequent caller questions — parking, fuel policy, insurance, etc."
            className="rounded-2xl shadow-[var(--shadow-1)]"
          >
            <BuilderField
              label="FAQ & knowledge blocks"
              charCount={{ current: textField('knowledgeSnippets').length, max: VOICE_FIELD_LIMITS.knowledgeSnippets }}
            >
              <CharTextarea
                fieldKey="knowledgeSnippets"
                value={textField('knowledgeSnippets')}
                onChange={v => setTextField('knowledgeSnippets', v)}
                rows={6}
                placeholder={"Q: What documents do I need?\nA: Valid driver's license and credit card…\n\nQ: Is fuel included?\nA: Vehicles are provided with a full tank…"}
              />
            </BuilderField>
          </DataCard>
        </div>

        {/* Prompt Preview sidebar */}
        <aside className="space-y-4 xl:sticky xl:top-16 xl:self-start">
          <DataCard
            title="Prompt preview"
            description="Structured summary of what your assistant knows. Not the exact provider payload."
            className="rounded-2xl shadow-[var(--shadow-1)]"
            footer={
              hasManualOverride
                ? 'A manual system prompt override is active and takes precedence on activate.'
                : 'Empty sections will be flagged in readiness checks before activation.'
            }
          >
            <div className="space-y-3">
              {sections.map(section => (
                <div key={section.title} className="rounded-lg border border-border/40 bg-muted/10 p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </p>
                  {section.content ? (
                    <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[10px] leading-relaxed text-foreground/90">
                      {section.content}
                    </pre>
                  ) : (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-[color:var(--status-watch)]">
                      <Icon name="alert-circle" className="mt-0.5 h-3 w-3 shrink-0" />
                      {section.missing ?? 'Not configured'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </DataCard>

          {!hasDraft && (
            <p className="text-center text-[10px] text-muted-foreground">
              Changes are saved to your organization&apos;s voice assistant configuration.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
