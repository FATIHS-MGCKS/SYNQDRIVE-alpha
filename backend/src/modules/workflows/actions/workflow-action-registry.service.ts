import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { WORKFLOW_ACTION_HANDLERS } from './workflow-action-registry.constants';
import { WorkflowActionRegistryError } from './workflow-action-registry.types';
import type { WorkflowActionHandler } from './workflow-action-registry.types';

@Injectable()
export class WorkflowActionRegistryService implements OnModuleInit {
  private readonly byTypeVersion = new Map<string, Map<string, WorkflowActionHandler>>();
  private initialized = false;

  constructor(
    @Inject(WORKFLOW_ACTION_HANDLERS)
    private readonly handlers: WorkflowActionHandler[],
  ) {}

  onModuleInit(): void {
    if (this.initialized) return;
    for (const handler of this.handlers) {
      this.register(handler);
    }
    this.initialized = true;
  }

  /** Controlled registration — throws on duplicate type@version. */
  register(handler: WorkflowActionHandler): void {
    const { type, version } = handler.definition;
    if (!this.byTypeVersion.has(type)) {
      this.byTypeVersion.set(type, new Map());
    }
    const versions = this.byTypeVersion.get(type)!;
    if (versions.has(version)) {
      throw new WorkflowActionRegistryError(
        `Duplicate handler registration for ${type}@${version}`,
        'DUPLICATE_REGISTRATION',
      );
    }
    versions.set(version, handler);
  }

  has(type: string, version?: string): boolean {
    const versions = this.byTypeVersion.get(type);
    if (!versions) return false;
    if (version) return versions.has(version);
    return versions.size > 0;
  }

  listTypes(): string[] {
    return [...this.byTypeVersion.keys()].sort();
  }

  resolve(type: string, version?: string): WorkflowActionHandler {
    const versions = this.byTypeVersion.get(type);
    if (!versions || versions.size === 0) {
      throw new WorkflowActionRegistryError(`Unknown action type: ${type}`, 'UNKNOWN_ACTION');
    }
    if (version) {
      const exact = versions.get(version);
      if (!exact) {
        throw new WorkflowActionRegistryError(
          `Unknown action version: ${type}@${version}`,
          'UNKNOWN_ACTION',
        );
      }
      return exact;
    }
    const sorted = [...versions.entries()].sort(([a], [b]) => b.localeCompare(a));
    return sorted[0][1];
  }

  getDefinition(type: string, version?: string) {
    return this.resolve(type, version).definition;
  }
}
