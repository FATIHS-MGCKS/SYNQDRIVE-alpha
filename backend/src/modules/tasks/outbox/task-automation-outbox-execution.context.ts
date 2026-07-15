import { Injectable } from '@nestjs/common';

/** When true, automation services propagate errors for outbox worker retries. */
@Injectable()
export class TaskAutomationOutboxExecutionContext {
  fromOutbox = false;
}
