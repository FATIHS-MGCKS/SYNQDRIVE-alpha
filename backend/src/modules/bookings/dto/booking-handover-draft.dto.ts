import { IsEnum, IsIn, IsISO8601, IsObject, IsOptional } from 'class-validator';
import type { HandoverKind } from '../handover.types';

export class UpsertHandoverDraftDto {
  @IsEnum(['PICKUP', 'RETURN'])
  kind!: HandoverKind;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class GetHandoverDraftQueryDto {
  @IsIn(['PICKUP', 'RETURN'])
  kind!: HandoverKind;
}
