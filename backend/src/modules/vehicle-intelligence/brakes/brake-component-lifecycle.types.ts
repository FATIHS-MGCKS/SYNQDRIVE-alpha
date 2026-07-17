import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationType,
  BrakeServiceKind,
} from '@prisma/client';
import type { BrakeLifecycleScopeToken } from './brake-component-lifecycle.scope';

export type BrakeComponentLifecycleOperation =
  | 'install'
  | 'replace'
  | 'remove'
  | 'register_measured'
  | 'register_documented'
  | 'correct';

export interface BrakeComponentLifecycleAuditEntry {
  at: string;
  action: string;
  componentType?: BrakeComponentInstallationType;
  installationId?: string;
  serviceEventId?: string;
  evidenceId?: string;
  details?: string;
}

export interface BrakeComponentLifecycleBaseInput {
  organizationId: string;
  vehicleId: string;
  serviceDate: Date | string;
  odometerKm?: number | null;
  scope?: BrakeLifecycleScopeToken[];
  idempotencyKey?: string;
  notes?: string;
  workshopName?: string;
  serviceKind?: BrakeServiceKind;
  allowOdometerReset?: boolean;
}

export interface BrakeComponentThicknessInput {
  frontPadMm?: number | null;
  rearPadMm?: number | null;
  frontDiscMm?: number | null;
  rearDiscMm?: number | null;
}

export interface InstallBrakeComponentCommand extends BrakeComponentLifecycleBaseInput {
  componentType: BrakeComponentInstallationType;
  anchorThicknessMm?: number | null;
  anchorSource?: BrakeComponentInstallationAnchorSource;
  nominalThicknessMm?: number | null;
}

export interface ReplaceBrakeComponentCommand extends BrakeComponentLifecycleBaseInput {
  scope: BrakeLifecycleScopeToken[];
  thickness?: BrakeComponentThicknessInput;
  anchorSource?: BrakeComponentInstallationAnchorSource;
  nominalThicknessMm?: number | null;
}

export interface RemoveBrakeComponentCommand extends BrakeComponentLifecycleBaseInput {
  componentType: BrakeComponentInstallationType;
}

export interface RegisterMeasuredBaselineCommand extends ReplaceBrakeComponentCommand {
  thickness: BrakeComponentThicknessInput;
}

export interface RegisterDocumentedReplacementCommand extends ReplaceBrakeComponentCommand {
  nominalThicknessMm?: number | null;
}

export interface CorrectBrakeInstallationCommand extends BrakeComponentLifecycleBaseInput {
  installationId: string;
  anchorThicknessMm?: number | null;
  installedOdometerKm?: number | null;
  anchorSource?: BrakeComponentInstallationAnchorSource;
}

export interface BrakeComponentLifecycleResult {
  operation: BrakeComponentLifecycleOperation;
  vehicleId: string;
  organizationId: string;
  components: BrakeComponentInstallationType[];
  serviceEventId: string | null;
  evidenceIds: string[];
  installationIds: string[];
  closedInstallationIds: string[];
  brakeHealthUpdated: boolean;
  recalculationScheduled: boolean;
  idempotentReplay: boolean;
  auditLog: BrakeComponentLifecycleAuditEntry[];
}

export interface ScopedComponentAnchor {
  componentType: BrakeComponentInstallationType;
  anchorThicknessMm: number | null;
  anchorSource: BrakeComponentInstallationAnchorSource;
  nominalThicknessMm?: number | null;
}
