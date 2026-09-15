/** Internal capability for the reviewed, fixed-SQL history readers, not a SQL firewall. */
export type PatientCoreReadStatement = Pick<D1PreparedStatement, "first" | "all"> & {
  bind(...values: unknown[]): PatientCoreReadStatement;
};

export type PatientCoreReadDatabase = {
  prepare(query: string): PatientCoreReadStatement;
};

/** Request-owned queue: even Promise.all readers execute against one ordered session. */
export function createPatientCoreReadSession(database: Pick<D1Database, "withSession">) {
  const session = database.withSession("first-primary");
  let tail = Promise.resolve();
  let failed = false;
  let failure: unknown;
  let closed = false;

  function execute<T>(operation: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error("PATIENT_CORE_READ_SESSION_CLOSED"));
    const result = tail.then(() => {
      if (failed) throw failure;
      return operation();
    });
    // Handle the queue's rejection without swallowing the caller's original error.
    tail = result.then(() => undefined, (error: unknown) => {
      failed = true;
      failure = error;
    });
    return result;
  }

  function statement(query: string, values?: unknown[]): PatientCoreReadStatement {
    const prepare = () => {
      const prepared = session.prepare(query);
      return values ? prepared.bind(...values) : prepared;
    };
    return {
      bind: (...bound) => statement(query, bound),
      first: <T = Record<string, unknown>>(column?: string) => execute(() =>
        column === undefined ? prepare().first<T>() : prepare().first<T>(column)),
      all: <T = Record<string, unknown>>() => execute(() => prepare().all<T>()),
    };
  }

  return {
    database: { prepare: (query: string) => statement(query) } satisfies PatientCoreReadDatabase,
    async finish() {
      closed = true;
      await tail;
      if (failed) throw failure;
      return session.getBookmark();
    },
  };
}
