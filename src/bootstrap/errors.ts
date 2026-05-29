export class BootstrapError extends Error {
  constructor(message: string, readonly step?: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}
