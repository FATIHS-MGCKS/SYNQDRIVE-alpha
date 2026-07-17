import { IsObject, IsOptional, IsString } from 'class-validator';

export class ConfirmExtractionDto {
  /** Human-reviewed/edited field values to apply. Sanitised server-side. */
  @IsObject()
  confirmedData!: Record<string, unknown>;

  /** Client-seen action plan fingerprint — required for executor-based document types. */
  @IsOptional()
  @IsString()
  actionPlanFingerprint?: string;
}

/** Legacy client-supplied create body (kept for backward compatibility). */
export class CreateExtractionDto {
  documentType!: string;
  extractedData?: Record<string, unknown>;
  sourceFileName?: string;
  sourceFileUrl?: string;
}
