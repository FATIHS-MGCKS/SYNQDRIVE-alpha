import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  isApplyDocumentType,
  SUPPORTED_DOCUMENT_TYPES,
} from '../document-extraction.schemas';

const APPLY_TYPES = [...SUPPORTED_DOCUMENT_TYPES];

export class SetDocumentTypeDto {
  @IsIn(APPLY_TYPES, {
    message: `documentType must be one of: ${APPLY_TYPES.join(', ')}`,
  })
  documentType!: string;

  /** When correcting type on READY_FOR_REVIEW, explicitly request re-extraction. */
  @IsOptional()
  @IsBoolean()
  reextract?: boolean;
}

export function assertApplyDocumentType(value: string) {
  if (!isApplyDocumentType(value)) {
    throw new Error(`Unsupported document type: ${value}`);
  }
  return value;
}
