import { Injectable } from '@nestjs/common';
import type { DenySwitchLocalEntry } from './deny-switch.types';
import { buildDenySwitchScopeKey } from './deny-switch.constants';

@Injectable()
export class DenySwitchLocalStore {
  private ready = false;
  private readonly entries = new Map<string, DenySwitchLocalEntry>();
  private readonly orgHighWater = new Map<string, bigint>();

  markReady(): void {
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  clear(): void {
    this.entries.clear();
    this.orgHighWater.clear();
    this.ready = false;
  }

  apply(entry: DenySwitchLocalEntry, options?: { allowDeactivate?: boolean }): boolean {
    const key = buildDenySwitchScopeKey(entry);
    const current = this.entries.get(key);
    if (current && entry.sequence < current.sequence) {
      return false;
    }
    if (current && entry.sequence === current.sequence && !entry.active && current.active) {
      if (!options?.allowDeactivate) return false;
    }
    if (!entry.active) {
      if (current && entry.sequence >= current.sequence) {
        this.entries.delete(key);
      }
      return true;
    }
    this.entries.set(key, entry);
    const orgSeq = this.orgHighWater.get(entry.organizationId) ?? 0n;
    if (entry.sequence > orgSeq) {
      this.orgHighWater.set(entry.organizationId, entry.sequence);
    }
    return true;
  }

  get(scopeKey: string): DenySwitchLocalEntry | undefined {
    return this.entries.get(scopeKey);
  }

  listForOrganization(organizationId: string): DenySwitchLocalEntry[] {
    return [...this.entries.values()].filter((e) => e.organizationId === organizationId);
  }

  allActive(): DenySwitchLocalEntry[] {
    return [...this.entries.values()].filter((e) => e.active);
  }

  size(): number {
    return this.entries.size;
  }
}
