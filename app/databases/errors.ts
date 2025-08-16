export class DBError extends Error {
    constructor(message: string, public meta?: Record<string, unknown>, public cause?: unknown) {
      super(message);
      this.name = "DBError";
    }
  }