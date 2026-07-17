import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AUTO_CLASSIFICATION_REQUEST, REQUEST_DOCUMENT_TYPES } from '../document-extraction.schemas';
import { DOCUMENT_UPLOAD_CONTEXT_TYPE_VALUES } from '../document-upload-context.types';

/** Multipart form fields for organization-scoped upload (vehicle optional). */
export class OrgUploadDocumentDto {
  @IsOptional()
  @IsString()
  @IsIn(REQUEST_DOCUMENT_TYPES as unknown as string[])
  requestedDocumentType?: string = AUTO_CLASSIFICATION_REQUEST;

  @IsOptional()
  @IsString()
  @IsIn(DOCUMENT_UPLOAD_CONTEXT_TYPE_VALUES as unknown as string[])
  optionalContextType?: string;

  @IsOptional()
  @IsUUID()
  optionalContextId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  reuploadReason?: string;

  @IsOptional()
  @IsString()
  relatedExtractionId?: string;

  @IsOptional()
  @IsString()
  invoiceNumberHint?: string;

  @IsOptional()
  @IsString()
  referenceNumberHint?: string;
}
