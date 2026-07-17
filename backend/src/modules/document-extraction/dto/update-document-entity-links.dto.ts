import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  DOCUMENT_ENTITY_LINK_OPERATIONS,
  DOCUMENT_ENTITY_LINK_TYPES,
  type DocumentEntityLinkOperationKind,
  type DocumentEntityLinkType,
} from '../document-entity-link.types';

export class DocumentEntityLinkOperationDto {
  @IsIn(DOCUMENT_ENTITY_LINK_OPERATIONS)
  operation!: DocumentEntityLinkOperationKind;

  @IsIn(DOCUMENT_ENTITY_LINK_TYPES)
  entityType!: DocumentEntityLinkType;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUUID()
  previousEntityId?: string;
}

export class UpdateDocumentEntityLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentEntityLinkOperationDto)
  operations!: DocumentEntityLinkOperationDto[];
}
