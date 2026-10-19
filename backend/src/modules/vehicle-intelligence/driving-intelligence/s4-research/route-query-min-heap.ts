/**
 * Deterministic min-priority heap.
 * `compare(a, b) < 0` means `a` is strictly better (popped before `b`).
 */
export class RouteQueryMinHeap<T> {
  private readonly heap: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.heap.length;
  }

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private better(a: T, b: T): boolean {
    return this.compare(a, b) < 0;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.better(this.heap[i], this.heap[p])) break;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let best = i;
      const l = 2 * i + 1;
      const r = l + 1;
      if (l < n && this.better(this.heap[l], this.heap[best])) best = l;
      if (r < n && this.better(this.heap[r], this.heap[best])) best = r;
      if (best === i) break;
      [this.heap[i], this.heap[best]] = [this.heap[best], this.heap[i]];
      i = best;
    }
  }
}
