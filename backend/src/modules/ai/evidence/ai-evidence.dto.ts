import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  AI_EVIDENCE_AVAILABILITY,
  AI_EVIDENCE_CONFIDENCE,
  AI_EVIDENCE_FACT_KINDS,
  AI_EVIDENCE_FRESHNESS,
  AI_EVIDENCE_REASON_CODES,
  AI_EVIDENCE_SENSITIVITY,
  AI_EVIDENCE_SOURCES,
  AI_EVIDENCE_SOURCE_ENTITY_KINDS,
} from './ai-evidence.enums';
import type { AiEvidence, AiEvidenceValue } from './ai-evidence.types';
import { validateAiEvidence } from './ai-evidence.validation';

/** OpenAPI-safe value slot — primitives only at DTO boundary; nested objects validated downstream. */
export type AiEvidenceDtoValue = AiEvidenceValue;

export class AiEvidenceSourceEntityDto {
  @ApiProperty({ enum: AI_EVIDENCE_SOURCE_ENTITY_KINDS })
  @IsIn(AI_EVIDENCE_SOURCE_ENTITY_KINDS)
  kind!: (typeof AI_EVIDENCE_SOURCE_ENTITY_KINDS)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ description: 'Redacted human label — no raw PII' })
  @IsOptional()
  @IsString()
  label?: string;
}

/**
 * Serializable DTO for AI Evidence at API boundaries.
 * Structural validation via class-validator; semantic rules via {@link validateAiEvidenceDto}.
 */
export class AiEvidenceDto implements AiEvidence {
  @ApiProperty({ format: 'uuid', description: 'Organization tenant id — required' })
  @IsUUID('4')
  tenantId!: string;

  @ApiProperty({ format: 'uuid', description: 'Primary entity id the fact describes' })
  @IsUUID('4')
  entityId!: string;

  @ApiProperty({ enum: AI_EVIDENCE_SOURCES })
  @IsIn(AI_EVIDENCE_SOURCES)
  source!: (typeof AI_EVIDENCE_SOURCES)[number];

  @ApiProperty({ type: AiEvidenceSourceEntityDto })
  @ValidateNested()
  @Type(() => AiEvidenceSourceEntityDto)
  sourceEntity!: AiEvidenceSourceEntityDto;

  @ApiProperty({ enum: AI_EVIDENCE_FRESHNESS })
  @IsIn(AI_EVIDENCE_FRESHNESS)
  freshness!: (typeof AI_EVIDENCE_FRESHNESS)[number];

  @ApiProperty({ enum: AI_EVIDENCE_CONFIDENCE })
  @IsIn(AI_EVIDENCE_CONFIDENCE)
  confidence!: (typeof AI_EVIDENCE_CONFIDENCE)[number];

  @ApiProperty({ enum: AI_EVIDENCE_AVAILABILITY })
  @IsIn(AI_EVIDENCE_AVAILABILITY)
  availability!: (typeof AI_EVIDENCE_AVAILABILITY)[number];

  @ApiProperty({ enum: AI_EVIDENCE_REASON_CODES })
  @IsIn(AI_EVIDENCE_REASON_CODES)
  reasonCode!: (typeof AI_EVIDENCE_REASON_CODES)[number];

  @ApiProperty({ enum: AI_EVIDENCE_SENSITIVITY })
  @IsIn(AI_EVIDENCE_SENSITIVITY)
  sensitivity!: (typeof AI_EVIDENCE_SENSITIVITY)[number];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  warnings!: string[];

  @ApiProperty({
    description: 'JSON-serializable fact value; null when unavailable',
    nullable: true,
  })
  value!: AiEvidenceDtoValue;

  @ApiProperty({ enum: AI_EVIDENCE_FACT_KINDS })
  @IsIn(AI_EVIDENCE_FACT_KINDS)
  factKind!: (typeof AI_EVIDENCE_FACT_KINDS)[number];

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  observedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  calculatedAt!: string | null;
}

export class AiEvidenceBatchDto {
  @ApiProperty({ type: [AiEvidenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiEvidenceDto)
  @IsNotEmpty()
  items!: AiEvidenceDto[];
}

/** Maps DTO → domain type and runs semantic validation. */
export function validateAiEvidenceDto(
  dto: AiEvidenceDto,
  options?: { forLlm?: boolean },
): ReturnType<typeof validateAiEvidence> {
  const evidence: AiEvidence = {
    tenantId: dto.tenantId,
    entityId: dto.entityId,
    source: dto.source,
    sourceEntity: {
      kind: dto.sourceEntity.kind,
      id: dto.sourceEntity.id,
      label: dto.sourceEntity.label,
    },
    freshness: dto.freshness,
    confidence: dto.confidence,
    availability: dto.availability,
    reasonCode: dto.reasonCode,
    sensitivity: dto.sensitivity,
    warnings: dto.warnings,
    value: dto.value,
    factKind: dto.factKind,
    observedAt: dto.observedAt,
    calculatedAt: dto.calculatedAt,
  };
  return validateAiEvidence(evidence, options);
}
