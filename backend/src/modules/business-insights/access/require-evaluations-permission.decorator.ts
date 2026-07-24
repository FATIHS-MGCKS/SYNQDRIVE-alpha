import { SetMetadata } from '@nestjs/common';
import type { EvaluationsPermissionAction } from './evaluations-permission.constants';

export const EVALUATIONS_PERMISSION_KEY = 'required_evaluations_permission';

export const RequireEvaluationsPermission = (action: EvaluationsPermissionAction) =>
  SetMetadata(EVALUATIONS_PERMISSION_KEY, action);
