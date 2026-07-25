import { Injectable } from '@nestjs/common';

/** Resolves provider secrets at execution time — never from action config. */
export interface WorkflowActionSecretsResolver {
  resolve(secretRef: string, organizationId: string): Promise<string | null>;
}

@Injectable()
export class WorkflowActionNoopSecretsResolver implements WorkflowActionSecretsResolver {
  async resolve(): Promise<string | null> {
    return null;
  }
}
