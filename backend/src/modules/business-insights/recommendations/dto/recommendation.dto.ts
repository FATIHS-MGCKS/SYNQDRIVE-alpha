import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RecommendationCategory,
  RecommendationConfidence,
  RecommendationSourceType,
  RecommendationStatus,
} from '@shared/recommendations/recommendation-domain.types';

export class RecommendationMoneyDto {
  @IsInt()
  amountMinor!: number;

  @IsString()
  currency!: string;
}

export class RecommendationAffectedEntityDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateRecommendationDto {
  @IsEnum([
    'DASHBOARD_INSIGHT',
    'EVALUATIONS_INSIGHT',
    'EVALUATIONS_RISK',
    'MISUSE_CASE',
    'MANUAL',
  ])
  sourceType!: RecommendationSourceType;

  @IsString()
  sourceId!: string;

  @IsEnum([
    'MAINTENANCE',
    'SAFETY',
    'COMPLIANCE',
    'COST_OPTIMIZATION',
    'FLEET_UTILIZATION',
    'CUSTOMER_EXPERIENCE',
    'OPERATIONAL',
    'OTHER',
  ])
  category!: RecommendationCategory;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsString()
  rationale!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationMoneyDto)
  expectedBenefit?: RecommendationMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationMoneyDto)
  estimatedCost?: RecommendationMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationMoneyDto)
  expectedNetBenefit?: RecommendationMoneyDto | null;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])
  confidence!: RecommendationConfidence;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationAffectedEntityDto)
  affectedEntities?: RecommendationAffectedEntityDto[];

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  calculationVersion?: string;
}

export class UpdateRecommendationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  rationale?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationMoneyDto)
  expectedBenefit?: RecommendationMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationMoneyDto)
  estimatedCost?: RecommendationMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationMoneyDto)
  expectedNetBenefit?: RecommendationMoneyDto | null;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])
  confidence?: RecommendationConfidence;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationAffectedEntityDto)
  affectedEntities?: RecommendationAffectedEntityDto[];

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class TransitionRecommendationStatusDto {
  @IsEnum([
    'NEW',
    'REVIEWED',
    'ACCEPTED',
    'REJECTED',
    'PLANNED',
    'IN_PROGRESS',
    'IMPLEMENTED',
    'MEASURING_IMPACT',
    'COMPLETED',
    'CANCELLED',
  ])
  status!: RecommendationStatus;
}

export class ListRecommendationsQueryDto {
  @IsOptional()
  @IsEnum([
    'NEW',
    'REVIEWED',
    'ACCEPTED',
    'REJECTED',
    'PLANNED',
    'IN_PROGRESS',
    'IMPLEMENTED',
    'MEASURING_IMPACT',
    'COMPLETED',
    'CANCELLED',
  ])
  status?: RecommendationStatus;

  @IsOptional()
  @IsEnum([
    'DASHBOARD_INSIGHT',
    'EVALUATIONS_INSIGHT',
    'EVALUATIONS_RISK',
    'MISUSE_CASE',
    'MANUAL',
  ])
  sourceType?: RecommendationSourceType;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
