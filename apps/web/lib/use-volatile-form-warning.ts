"use client";

import { useEffect, useRef } from "react";
import { publicOfflineNavigationEnabled } from "./public-offline-navigation";

// Only transient clinical inputs, never persisted or transmitted by this hook.
export function useVolatileFormWarning(inputs: unknown) {
  const snapshot = JSON.stringify(inputs);
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;
  useEffect(() => {
    if (!publicOfflineNavigationEnabled || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
