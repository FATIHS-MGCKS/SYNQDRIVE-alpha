/** Test-only coordination hooks for deterministic source-attach vs capture/seal races. */

export type SourceAdoptionMutationTestCoordinator = {
  onAttachLocksAcquired?: () => Promise<void>;
  beforeAttachCommit?: () => Promise<void>;
};

let coordinator: SourceAdoptionMutationTestCoordinator | null = null;

export function setSourceAdoptionMutationTestCoordinator(
  next: SourceAdoptionMutationTestCoordinator | null,
): void {
  coordinator = next;
}

export function getSourceAdoptionMutationTestCoordinator(): SourceAdoptionMutationTestCoordinator | null {
  return coordinator;
}
