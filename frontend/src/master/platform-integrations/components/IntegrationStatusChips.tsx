import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
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

function toneFromClass(toneClass: string): StatusTone {
  if (toneClass.includes('success')) return 'success';
  if (toneClass.includes('danger')) return 'critical';
  if (toneClass.includes('warning')) return 'warning';
  if (toneClass.includes('info')) return 'info';
  return 'neutral';
}

export function IntegrationScopeChip({ scope }: { scope: IntegrationScope }) {
  return (
    <StatusChip tone="neutral" className="text-[11px]">
      {scopeLabel(scope)}
    </StatusChip>
  );
}

export function IntegrationEnvironmentChip({ environment }: { environment: IntegrationEnvironment }) {
  return (
    <StatusChip tone={toneFromClass(environmentTone(environment))} className="text-[11px]">
      {environmentLabel(environment)}
    </StatusChip>
  );
}

export function IntegrationConfigurationChip({ state }: { state: IntegrationConfigurationState }) {
  return (
    <StatusChip tone={toneFromClass(configurationTone(state))} className="text-[11px]">
      {configurationLabel(state)}
    </StatusChip>
  );
}

export function IntegrationRuntimeHealthChip({ state }: { state: IntegrationRuntimeHealth }) {
  return (
    <StatusChip tone={toneFromClass(runtimeHealthTone(state))} className="text-[11px]">
      {runtimeHealthLabel(state)}
    </StatusChip>
  );
}

export function IntegrationAuthenticationChip({ state }: { state: IntegrationAuthenticationState }) {
  const tone: StatusTone =
    state === 'valid' ? 'success' : state === 'failed' ? 'critical' : 'neutral';
  return (
    <StatusChip tone={tone} className="text-[11px]">
      {authenticationLabel(state)}
    </StatusChip>
  );
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
