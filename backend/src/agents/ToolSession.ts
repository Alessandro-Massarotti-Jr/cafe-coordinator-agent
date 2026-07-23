export type ToolUsage = {
  name: string;
  args: Record<string, unknown>;
  at: number;
};

export class ToolSession {
  private readonly usages: ToolUsage[] = [];

  constructor(public readonly sessionId: string = "anonymous") {}

  public record(name: string, args: Record<string, unknown>): void {
    this.usages.push({ name, args, at: Date.now() });
  }

  public used(name: string): boolean {
    return this.usages.some((usage) => usage.name === name);
  }

  public usedWith(
    name: string,
    predicate: (args: Record<string, unknown>) => boolean,
  ): boolean {
    return this.usages.some(
      (usage) => usage.name === name && predicate(usage.args),
    );
  }

  public history(): ToolUsage[] {
    return [...this.usages];
  }
}
