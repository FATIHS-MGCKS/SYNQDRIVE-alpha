import { AsyncLocalStorage } from 'async_hooks';
import type { DimoRequestContext } from './dimo-provider-category.types';
import { DEFAULT_DIMO_REQUEST_CONTEXT } from './dimo-provider-category.types';

export interface ActiveDimoPermit {
  token: string;
  category: string;
}

const storage = new AsyncLocalStorage<{
  context: DimoRequestContext;
  permit?: ActiveDimoPermit;
}>();

export function runWithDimoRequestContext<T>(
  context: DimoRequestContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run({ context }, fn);
}

export function getDimoRequestContext(): DimoRequestContext {
  return storage.getStore()?.context ?? DEFAULT_DIMO_REQUEST_CONTEXT;
}

export function getActiveDimoPermit(): ActiveDimoPermit | undefined {
  return storage.getStore()?.permit;
}

export function setActiveDimoPermit(permit: ActiveDimoPermit | undefined): void {
  const store = storage.getStore();
  if (store) {
    store.permit = permit;
  }
}

export function isInsideDimoBudgetedCall(): boolean {
  return getActiveDimoPermit() !== undefined;
}
