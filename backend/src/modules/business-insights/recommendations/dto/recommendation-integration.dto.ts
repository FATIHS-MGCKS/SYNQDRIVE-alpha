import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { EvaluationsRecommendationIntegrationAction } from '@synq/evaluations-insights/evaluations-recommendation-integrations';

const EXECUTABLE_ACTIONS = [
  'CREATE_TASK',
  'CREATE_REMINDER',
  'OPEN_SERVICE_CASE',
  'START_WORKFLOW',
  'ASSIGN_OWNER',
] as const satisfies EvaluationsRecommendationIntegrationAction[];

export class ExecuteRecommendationIntegrationDto {
  @IsIn(EXECUTABLE_ACTIONS)
  action!: (typeof EXECUTABLE_ACTIONS)[number];

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}
