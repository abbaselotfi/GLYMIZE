export class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#values.delete(key);
  }

  setItem(key: string, value: string) {
    this.#values.set(key, String(value));
  }
}

export function browserWindow() {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const events: Event[] = [];
  return {
    localStorage,
    sessionStorage,
    location: {
      hash: "",
      pathname: "/",
      search: "",
    },
    history: { replaceState: () => undefined },
    dispatchEvent: (event: Event) => {
      events.push(event);
      return true;
    },
    matchMedia: () => ({ matches: false }),
    events,
  };
}
