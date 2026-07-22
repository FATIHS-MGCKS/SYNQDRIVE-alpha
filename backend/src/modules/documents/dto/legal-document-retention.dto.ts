import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import type { LegalDocumentRetentionClassPolicyMap } from '../retention/legal-document-retention.types';

export class RunLegalDocumentRetentionDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class UpsertLegalDocumentRetentionPolicyDto {
  @IsObject()
  classPolicies!: LegalDocumentRetentionClassPolicyMap;
}
