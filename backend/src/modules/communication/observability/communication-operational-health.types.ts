import type {
  CommunicationHealthComponent,
  CommunicationHealthDiagnostic,
  CommunicationHealthState,
} from './communication-operational-health.constants';

export interface CommunicationHealthComponentSnapshot {
  state: CommunicationHealthState;
  diagnostics: CommunicationHealthDiagnostic[];
  checkedAt: string;
  signals: Record<string, number | string | boolean | null>;
}

export interface CommunicationOperationalHealthSnapshot {
  overall: CommunicationHealthState;
  checkedAt: string;
  cacheExpiresAt: string | null;
  components: Record<CommunicationHealthComponent, CommunicationHealthComponentSnapshot>;
}

export interface CommunicationOperationalHealthQueryOptions {
  organizationId?: string;
  now?: Date;
}
