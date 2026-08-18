import type {
  IntegrationAuthenticationState,
  IntegrationConfigurationState,
  IntegrationEnvironment,
  IntegrationRuntimeHealth,
  IntegrationScope,
} from '../types';
import {
  authenticationLabel,
  configurationLabel,
  configurationTone,
  environmentLabel,
  environmentTone,
  runtimeHealthLabel,
  runtimeHealthTone,
  scopeLabel,
} from '../platform-integrations.utils';

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export function IntegrationScopeChip({ scope }: { scope: IntegrationScope }) {
  return <Chip label={scopeLabel(scope)} tone="sq-tone-neutral bg-muted/50 text-muted-foreground" />;
}

export function IntegrationEnvironmentChip({ environment }: { environment: IntegrationEnvironment }) {
  return <Chip label={environmentLabel(environment)} tone={environmentTone(environment)} />;
}

export function IntegrationConfigurationChip({ state }: { state: IntegrationConfigurationState }) {
  return <Chip label={configurationLabel(state)} tone={configurationTone(state)} />;
}

export function IntegrationRuntimeHealthChip({ state }: { state: IntegrationRuntimeHealth }) {
  return <Chip label={runtimeHealthLabel(state)} tone={runtimeHealthTone(state)} />;
}

export function IntegrationAuthenticationChip({ state }: { state: IntegrationAuthenticationState }) {
  const tone =
    state === 'valid' ? 'sq-tone-success' : state === 'failed' ? 'sq-tone-danger' : 'sq-tone-neutral';
  return <Chip label={authenticationLabel(state)} tone={tone} />;
}

export function IntegrationStatusRow({
  configuration,
  authentication,
  runtimeHealth,
  environment,
  compact = false,
}: {
  configuration: IntegrationConfigurationState;
  authentication: IntegrationAuthenticationState;
  runtimeHealth: IntegrationRuntimeHealth;
  environment: IntegrationEnvironment;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-2'}`}>
      <IntegrationConfigurationChip state={configuration} />
      <IntegrationRuntimeHealthChip state={runtimeHealth} />
      {!compact && <IntegrationAuthenticationChip state={authentication} />}
      {environment !== 'not_applicable' && <IntegrationEnvironmentChip environment={environment} />}
    </div>
  );
}
