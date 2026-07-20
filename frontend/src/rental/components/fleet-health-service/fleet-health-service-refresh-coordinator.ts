let coordinatedRefreshDepth = 0;

export function runCoordinatedRefresh<T>(fn: () => Promise<T>): Promise<T> {
  coordinatedRefreshDepth += 1;
  return fn().finally(() => {
    coordinatedRefreshDepth = Math.max(0, coordinatedRefreshDepth - 1);
  });
}

export function isCoordinatedRefreshActive(): boolean {
  return coordinatedRefreshDepth > 0;
}

export function resetCoordinatedRefreshCoordinator(): void {
  coordinatedRefreshDepth = 0;
}
