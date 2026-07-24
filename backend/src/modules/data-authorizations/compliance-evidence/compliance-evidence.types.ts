import type { ComplianceEvidenceSectionType } from './compliance-evidence.constants';

export interface ComplianceEvidenceSection {
  sectionType: ComplianceEvidenceSectionType;
  recordCount: number;
  hasGap: boolean;
  gapReason?: string;
  immutableVersionRefs: Array<Record<string, string | number | null>>;
  summary: Record<string, unknown>;
}

export interface ComplianceEvidencePackage {
  generatedAt: string;
  recordVersion: string;
  gitCommit: string | null;
  buildVersion: string | null;
  provenanceLabel: string;
  includesRuntimeData: boolean;
  complianceClaimAllowed: boolean;
  gapCount: number;
  gaps: Array<{ sectionType: ComplianceEvidenceSectionType; reason: string }>;
  disclaimer: string;
  periodFrom: string | null;
  periodTo: string | null;
  sections: ComplianceEvidenceSection[];
}
