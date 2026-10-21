/** Restore process.env after tests without writing the literal string "undefined". */
export function restoreProcessEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}
