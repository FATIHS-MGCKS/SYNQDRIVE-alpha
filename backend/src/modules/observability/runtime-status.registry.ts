export class RuntimeStatusRegistry {
  private static workersEnabled = false;
  private static policyEngineVersion: string | null = null;

  static setWorkersEnabled(enabled: boolean): void {
    this.workersEnabled = enabled;
  }

  static getWorkersEnabled(): boolean {
    return this.workersEnabled;
  }

  static setPolicyEngineVersion(version: string): void {
    this.policyEngineVersion = version;
  }

  static getPolicyEngineVersion(): string | null {
    return this.policyEngineVersion;
  }
}
