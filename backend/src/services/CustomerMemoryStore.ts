export type CustomerMemory = {
  customerId: string;
  notes: string[];
  updatedAt: number;
};

const DEFAULT_MAX_NOTES = 5;

export class CustomerMemoryStore {
  private readonly memories = new Map<string, CustomerMemory>();

  constructor(private readonly maxNotes: number = DEFAULT_MAX_NOTES) {}

  public remember(customerId: string, note: string): void {
    const trimmed = note.trim();
    if (!customerId || !trimmed) return;

    const existing = this.memories.get(customerId) ?? {
      customerId,
      notes: [],
      updatedAt: Date.now(),
    };

    existing.notes.push(trimmed);
    if (existing.notes.length > this.maxNotes) {
      existing.notes = existing.notes.slice(-this.maxNotes);
    }
    existing.updatedAt = Date.now();

    this.memories.set(customerId, existing);
  }

  public recall(customerId: string): string[] {
    return [...(this.memories.get(customerId)?.notes ?? [])];
  }

  public asContext(customerId: string): string | null {
    const notes = this.recall(customerId);
    if (notes.length === 0) return null;

    return [
      "# Memória de interações anteriores deste cliente",
      "Use apenas como contexto. Confirme com o cliente antes de agir sobre qualquer item abaixo.",
      ...notes.map((note, index) => `${index + 1}. ${note}`),
    ].join("\n");
  }

  public forget(customerId: string): void {
    this.memories.delete(customerId);
  }
}
