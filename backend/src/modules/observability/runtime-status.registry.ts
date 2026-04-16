export class RuntimeStatusRegistry {
  private static workersEnabled = false;

  static setWorkersEnabled(enabled: boolean): void {
    this.workersEnabled = enabled;
  }

  static getWorkersEnabled(): boolean {
    return this.workersEnabled;
  }
}
