"use client";

import type { PatientIdentityCapabilities } from "@glymize/contracts";
import { useEffect, useState } from "react";

import { getPatientIdentityCapabilities } from "../../lib/patient-identity-client";
import { getRuntimeV3Capabilities } from "../../lib/runtime-v3-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import PatientIdentityPortal from "./patient-identity-portal";
import PortalClient from "./portal-client";
import styles from "./patient-portal-entry.module.css";

export default function PatientPortalEntry() {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [identity, setIdentity] = useState<PatientIdentityCapabilities | null>(null);
  const [legacyEnabled, setLegacyEnabled] = useState(false);
  const [multiPracticePatientEnabled, setMultiPracticePatientEnabled] = useState(false);
  const [legacySelected, setLegacySelected] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getPatientIdentityCapabilities(),
      getRuntimeV3Capabilities(),
    ]).then(([patientResult, runtimeResult]) => {
      if (!active) return;
      if (patientResult.status === "fulfilled") setIdentity(patientResult.value);
      if (runtimeResult.status === "fulfilled") {
        setLegacyEnabled(runtimeResult.value.patientPortal);
        setMultiPracticePatientEnabled(runtimeResult.value.multiPracticePatient);
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  if (!ready) {
    return <div className={styles.state}>{fa ? "در حال بررسی مسیر امن ورود…" : "Checking the secure sign-in path…"}</div>;
  }

  if (legacySelected && legacyEnabled) {
    return (
      <div>
        {identity?.patientIdentityV2 ? (
          <button className={styles.switchBack} type="button" onClick={() => setLegacySelected(false)}>
            {fa ? "بازگشت به حساب سراسری" : "Back to global account"}
          </button>
        ) : null}
        <PortalClient />
      </div>
    );
  }

  if (identity?.patientIdentityV2) {
    return (
      <PatientIdentityPortal
        capabilities={identity}
        legacyPortalEnabled={legacyEnabled}
        multiPracticePatientEnabled={multiPracticePatientEnabled}
        onUseLegacy={() => setLegacySelected(true)}
      />
    );
  }

  if (legacyEnabled) return <PortalClient />;

  return (
    <div className={styles.state} role="status">
      <strong>{fa ? "ورود بیمار در حال حاضر فعال نیست" : "Patient sign-in is not currently enabled"}</strong>
      <span>{fa ? "هیچ capability فعالی از سرور اعلام نشده است." : "The server did not advertise an active patient sign-in capability."}</span>
    </div>
  );
}
