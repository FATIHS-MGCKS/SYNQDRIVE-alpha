import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  DATA_AUTHORIZATION_SCOPES,
  DATA_AUTHORIZATION_SOURCE_TYPES,
} from '../data-authorization.constants';

const LIST_STATUSES = ['PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED'] as const;

export class ListDataAuthorizationsQueryDto {
  @IsOptional()
  @IsIn([...LIST_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  moduleOrigin?: string;

  @IsOptional()
  @IsIn(DATA_AUTHORIZATION_SCOPES)
  scope?: string;

  @IsOptional()
  @IsIn(DATA_AUTHORIZATION_SOURCE_TYPES)
  sourceType?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
