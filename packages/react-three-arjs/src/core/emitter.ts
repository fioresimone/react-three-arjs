type Listener<T> = (payload: T) => void;

/**
 * Minimal typed event emitter.
 *
 * AR.js mixed `THREE.EventDispatcher`, DOM `CustomEvent`s on `window` and
 * single-slot `on()` handlers. Everything here uses this one typed emitter,
 * scoped to the object that emits, so nothing leaks onto `window`.
 */
export class Emitter<Events extends Record<string, unknown>> {
  #listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Subscribes to an event. Returns a function that unsubscribes. */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    this.#listeners.get(type)?.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.#listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) (listener as Listener<Events[K]>)(payload);
  }

  protected removeAllListeners(): void {
    this.#listeners.clear();
  }
}
