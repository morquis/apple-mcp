type CleanupFn = () => Promise<void>;

export class CleanupTracker {
  private stack: CleanupFn[] = [];

  track(fn: CleanupFn): void {
    this.stack.push(fn);
  }

  async runAll(): Promise<void> {
    while (this.stack.length > 0) {
      const fn = this.stack.pop()!;
      try {
        await fn();
      } catch (error) {
        console.error(
          "[cleanup]",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}
