import { afterEach, expect, it, vi } from "vitest";
const lifecycle = vi.hoisted(() => ({ ref: { current: undefined as string | undefined }, cleanup: undefined as (() => void) | undefined }));
vi.mock("react", () => ({
  useRef: (value: string) => { lifecycle.ref.current ??= value; return lifecycle.ref; },
  useEffect: (effect: () => (() => void) | undefined) => { lifecycle.cleanup?.(); lifecycle.cleanup = effect(); },
}));
afterEach(() => { lifecycle.cleanup?.(); lifecycle.cleanup = undefined; lifecycle.ref.current = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

it("warns only for changed transient inputs in enabled builds, and cleans up", async () => {
  vi.stubEnv("NEXT_PUBLIC_OFFLINE_BUNDLE_ENABLED", "true");
  const add = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal("window", { addEventListener: add, removeEventListener: remove });
  const { useVolatileFormWarning } = await import("../lib/use-volatile-form-warning");
  useVolatileFormWarning({ value: "" });
  expect(add).not.toHaveBeenCalled();
  useVolatileFormWarning({ value: "synthetic" });
  const [eventName, warn] = add.mock.calls[0]!;
  expect(eventName).toBe("beforeunload");
  const event = { preventDefault: vi.fn(), returnValue: undefined as string | undefined };
  warn(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.returnValue).toBe("");
  useVolatileFormWarning({ value: "" });
  expect(remove).toHaveBeenCalledWith("beforeunload", warn);
});

it("does not alter normal builds", async () => {
  vi.stubEnv("NEXT_PUBLIC_OFFLINE_BUNDLE_ENABLED", "false");
  const add = vi.fn();
  vi.stubGlobal("window", { addEventListener: add });
  const { useVolatileFormWarning } = await import("../lib/use-volatile-form-warning");
  useVolatileFormWarning("initial");
  useVolatileFormWarning("changed");
  expect(add).not.toHaveBeenCalled();
});
