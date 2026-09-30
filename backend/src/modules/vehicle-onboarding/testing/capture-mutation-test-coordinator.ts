/** Test-only coordination hooks for deterministic capture vs seal race proofs. */

export type CaptureMutationTestCoordinator = {
  onMutationLockAcquired?: () => Promise<void>;
  beforeMutationCommit?: () => Promise<void>;
  onSealLockAcquired?: () => Promise<void>;
  beforeSealCommit?: () => Promise<void>;
};

let coordinator: CaptureMutationTestCoordinator | null = null;

export function setCaptureMutationTestCoordinator(
  next: CaptureMutationTestCoordinator | null,
): void {
  coordinator = next;
}

export function getCaptureMutationTestCoordinator(): CaptureMutationTestCoordinator | null {
  return coordinator;
}
