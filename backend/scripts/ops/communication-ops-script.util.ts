export function reportOpsScriptFailure(error: unknown): void {
  const errorName =
    error instanceof Error && error.name
      ? error.name
      : 'UnknownError';

  console.error(
    JSON.stringify({
      status: 'failed',
      error: errorName,
    }),
  );
}
