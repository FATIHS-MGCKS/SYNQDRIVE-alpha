export interface DocumentExtractionMetadataOptionDto {
  value: string;
  labelKey: string;
}

export interface DocumentExtractionMetadataDto {
  documentTypes: DocumentExtractionMetadataOptionDto[];
  classificationOptions: DocumentExtractionMetadataOptionDto[];
  mimeTypes: string[];
  extensions: string[];
  maxUploadBytes: number;
  maxUploadMb: number;
  statuses: DocumentExtractionMetadataOptionDto[];
  stages: DocumentExtractionMetadataOptionDto[];
  errorPhases: DocumentExtractionMetadataOptionDto[];
  uploadDuplicateStatuses: DocumentExtractionMetadataOptionDto[];
}
