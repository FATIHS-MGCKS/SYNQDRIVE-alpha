import { Injectable } from '@nestjs/common';
import type { DocumentActionExecutor } from './document-action-executor.interface';
import { DocumentActionTechnicalError, DOCUMENT_ACTION_ERROR_CODES } from './document-action.errors';

@Injectable()
export class DocumentActionExecutorRegistry {
  private readonly executors = new Map<string, DocumentActionExecutor>();

  register(executor: DocumentActionExecutor): void {
    if (this.executors.has(executor.actionType)) {
      throw new Error(`Duplicate document action executor for ${executor.actionType}`);
    }
    this.executors.set(executor.actionType, executor);
  }

  get(actionType: string): DocumentActionExecutor {
    const executor = this.executors.get(actionType);
    if (!executor) {
      throw new DocumentActionTechnicalError(
        DOCUMENT_ACTION_ERROR_CODES.EXECUTOR_NOT_FOUND,
        `No executor registered for action type ${actionType}`,
      );
    }
    return executor;
  }

  has(actionType: string): boolean {
    return this.executors.has(actionType);
  }

  listActionTypes(): string[] {
    return Array.from(this.executors.keys()).sort();
  }
}
