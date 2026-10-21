export class VsiApdsP5b2Phase2ManifestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VsiApdsP5b2Phase2ManifestError';
  }
}
