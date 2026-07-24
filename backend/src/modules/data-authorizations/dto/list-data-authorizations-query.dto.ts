import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  DATA_AUTHORIZATION_SCOPES,
  DATA_AUTHORIZATION_SOURCE_TYPES,
} from '../data-authorization.constants';

const LIST_STATUSES = ['PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED'] as const;
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

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

  @IsOptional()
  @IsIn([...RISK_LEVELS])
  riskLevel?: string;

  @IsOptional()
  @IsString()
  dataCategory?: string;

  /** When true, only effectively active authorizations expiring within 30 days. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  expiringSoon?: boolean;

  /** When true, revoked or effectively expired authorizations. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  revokedOrExpired?: boolean;

  /** When true, legacy authorizations with an in-progress revocation workflow. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  revocationInProgress?: boolean;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['createdAt', 'title', 'expiresAt'])
  sort?: 'createdAt' | 'title' | 'expiresAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
