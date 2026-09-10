import type { PatientModuleHandoffIntent } from "@glymize/contracts/clinical-modules";
import { describe, expect, it, vi } from "vitest";
import { createType2HandoffReviewController, type Type2HandoffReviewState } from "../lib/type2-handoff-review-controller";
import type { Type2PatientCoreHandoffCandidate } from "../lib/type2-patient-core-handoff";

function fixture() {
  const scope = { patientId: "patient-1", practiceId: "practice-1" };
  let actor: { id: string; practiceId: string; status: "active" | "disabled" } | null = {
    id: "physician-1", practiceId: scope.practiceId, status: "active",
  };
  let intent: PatientModuleHandoffIntent | null = {
    schemaVersion: 1, moduleId: "diabetes-type-2", scope,
    sourceRevisionFingerprint: "source@1", sourceRevisions: [],
  };
  const candidate: Type2PatientCoreHandoffCandidate = {
    moduleId: "diabetes-type-2", scope, sourceRevisionFingerprint: "source@1",
    sourceRevisions: [], fields: [], requiredIssues: [], prefill: { factors: [], currentHba1c: 8 },
  };
  let state: Type2HandoffReviewState = { state: "idle", candidate: null, error: "" };
  const readCandidate = vi.fn(async (_intent: PatientModuleHandoffIntent, _signal: AbortSignal) => candidate);
  const controller = createType2HandoffReviewController({
    currentActor: () => actor,
    readIntent: () => intent,
    clearIntent: () => { intent = null; },
    readCandidate,
    publish: (next) => { state = next; },
  });
  return {
    controller, candidate, readCandidate, state: () => state,
    setActor: (next: typeof actor) => { actor = next; },
    clearIntent: () => { intent = null; },
    switchPatient: () => { intent = { ...intent!, scope: { ...scope, patientId: "patient-2" } }; },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}

describe("Type 2 handoff review lifecycle", () => {
  it("revalidates through a second authenticated read before applying exactly once", async () => {
    const f = fixture();
    const apply = vi.fn();
    await f.controller.start();
    expect(apply).not.toHaveBeenCalled();
    expect(await f.controller.confirm(apply)).toBe(true);
    expect(f.readCandidate).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledExactlyOnceWith(f.candidate);
    expect(await f.controller.confirm(apply)).toBe(false);
  });

  it("rejects actor changes even within the same practice", async () => {
    const f = fixture();
    await f.controller.start();
    f.setActor({ id: "physician-2", practiceId: "practice-1", status: "active" });
    const apply = vi.fn();
    expect(await f.controller.confirm(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(f.state().candidate).toBeNull();
  });

  it("invalidates an active review when the auth event represents an actor change", async () => {
    const f = fixture();
    await f.controller.start();
    f.setActor({ id: "physician-2", practiceId: "practice-1", status: "active" });
    f.controller.handleAuthChange();
    expect(f.state().state).toBe("invalid");
    expect(f.state().candidate).toBeNull();
  });

  it("keeps an active review across a same-actor token or profile refresh", async () => {
    const f = fixture();
    await f.controller.start();
    f.controller.handleAuthChange();
    expect(f.state().state).toBe("ready");
    expect(f.state().candidate).toBe(f.candidate);
  });

  it("ignores auth events when no handoff review is active", async () => {
    const f = fixture();
    f.clearIntent();
    await f.controller.start();
    f.controller.handleAuthChange();
    expect(f.state().state).toBe("idle");
  });

  it("drops an in-flight read after auth invalidation even if transport ignores abort", async () => {
    const f = fixture();
    const pending = deferred<Type2PatientCoreHandoffCandidate>();
    f.readCandidate.mockImplementationOnce(() => pending.promise);
    const loading = f.controller.start();
    f.controller.invalidate();
    pending.resolve(f.candidate);
    await loading;
    expect(f.state().state).toBe("invalid");
    expect(f.state().candidate).toBeNull();
    expect(f.readCandidate.mock.calls[0]![1].aborted).toBe(true);
  });

  it("detects a practice switch during loading without depending on an auth event", async () => {
    const f = fixture();
    const pending = deferred<Type2PatientCoreHandoffCandidate>();
    f.readCandidate.mockImplementationOnce(() => pending.promise);
    const loading = f.controller.start();
    f.setActor({ id: "physician-1", practiceId: "practice-2", status: "active" });
    pending.resolve(f.candidate);
    await loading;
    expect(f.state().state).toBe("invalid");
  });

  it("fails closed when source revisions change between preview and confirmation", async () => {
    const f = fixture();
    await f.controller.start();
    f.readCandidate.mockResolvedValueOnce({ ...f.candidate, sourceRevisionFingerprint: "source@2" });
    const apply = vi.fn();
    expect(await f.controller.confirm(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(f.state().error).toBe("PATIENT_MODULE_HANDOFF_SOURCE_CHANGED");
  });

  it("does not apply after server-side permission revocation", async () => {
    const f = fixture();
    await f.controller.start();
    f.readCandidate.mockRejectedValueOnce(new Error("permission_denied"));
    const apply = vi.fn();
    expect(await f.controller.confirm(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(f.state().candidate).toBeNull();
  });

  it("ignores a confirmation response after discard and prevents concurrent confirmation", async () => {
    const f = fixture();
    await f.controller.start();
    const pending = deferred<Type2PatientCoreHandoffCandidate>();
    f.readCandidate.mockImplementationOnce(() => pending.promise);
    const apply = vi.fn();
    const confirming = f.controller.confirm(apply);
    expect(f.state().state).toBe("confirming");
    expect(await f.controller.confirm(apply)).toBe(false);
    f.controller.discard();
    pending.resolve(f.candidate);
    expect(await confirming).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(f.state().state).toBe("idle");
  });

  it("rejects a replaced same-tab patient descriptor", async () => {
    const f = fixture();
    await f.controller.start();
    f.switchPatient();
    const apply = vi.fn();
    expect(await f.controller.confirm(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
