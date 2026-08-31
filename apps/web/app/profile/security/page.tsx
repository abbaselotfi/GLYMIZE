"use client";

import { FormEvent, useState } from "react";
import { updateOwnPassword } from "../../../lib/runtime-v3-client";
import { useGlymizeLocale } from "../../components/use-glymize-locale";
import styles from "./security.module.css";

export default function ProfileSecurityPage() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const validLength =
    newPassword.length >= 10 &&
    newPassword.length <= 128;
  const matches = newPassword === confirmPassword;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!currentPassword || !validLength || !matches) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      await updateOwnPassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setMessage(
        fa
          ? "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627 \u0645\u0648\u0641\u0642\u06cc\u062a \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f. \u0646\u0634\u0633\u062a\u200c\u0647\u0627\u06cc \u062f\u06cc\u06af\u0631 \u062d\u0633\u0627\u0628 \u0628\u0631\u0627\u06cc \u0627\u0645\u0646\u06cc\u062a \u0628\u0633\u062a\u0647 \u0634\u062f\u0646\u062f."
          : "Password changed successfully. Other account sessions were revoked for security.",
      );
    } catch (reason) {
      const code =
        reason instanceof Error
          ? reason.message
          : "PASSWORD_UPDATE_FAILED";

      setError(
        code === "current_password_invalid"
          ? (
              fa
                ? "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06cc \u0635\u062d\u06cc\u062d \u0646\u06cc\u0633\u062a."
                : "Current password is incorrect."
            )
          : code === "password_policy"
            ? (
                fa
                  ? "\u0631\u0645\u0632 \u062c\u062f\u06cc\u062f \u0628\u0627\u06cc\u062f \u0628\u06cc\u0646 \u06f1\u06f0 \u062a\u0627 \u06f1\u06f2\u06f8 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631 \u0628\u0627\u0634\u062f."
                  : "The new password must be between 10 and 128 characters."
              )
            : code,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className={styles.page}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <section className={styles.hero}>
        <span>SECURITY</span>
        <h1>
          {fa
            ? "\u0627\u0645\u0646\u06cc\u062a \u0648 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631"
            : "Security & password"}
        </h1>
        <p>
          {fa
            ? "\u067e\u0632\u0634\u06a9 \u0648 \u062f\u0633\u062a\u06cc\u0627\u0631 \u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u0646\u062f \u0631\u0645\u0632 \u062d\u0633\u0627\u0628 \u062e\u0648\u062f \u0631\u0627 \u0627\u0632 \u0627\u06cc\u0646 \u0628\u062e\u0634 \u0628\u0647\u200c\u0635\u0648\u0631\u062a \u0627\u0645\u0646 \u062a\u063a\u06cc\u06cc\u0631 \u062f\u0647\u0646\u062f."
            : "Physicians and assistants can securely change their account password here."}
        </p>
      </section>

      <section className={styles.card}>
        <h2>
          {fa
            ? "\u062a\u063a\u06cc\u06cc\u0631 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631"
            : "Change password"}
        </h2>
        <p>
          {fa
            ? "\u0631\u0645\u0632 \u0641\u0639\u0644\u06cc \u0648 \u0631\u0645\u0632 \u062c\u062f\u06cc\u062f \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f. \u067e\u0633 \u0627\u0632 \u062a\u063a\u06cc\u06cc\u0631\u060c \u0646\u0634\u0633\u062a\u200c\u0647\u0627\u06cc \u062f\u06cc\u06af\u0631 \u0628\u0633\u062a\u0647 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f."
            : "Enter your current and new password. Other sessions are revoked after the change."}
        </p>

        <form
          className={styles.form}
          onSubmit={submit}
        >
          <label>
            <span>
              {fa
                ? "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06cc"
                : "Current password"}
            </span>
            <input
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) =>
                setCurrentPassword(event.target.value)
              }
            />
          </label>

          <label>
            <span>
              {fa
                ? "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062c\u062f\u06cc\u062f"
                : "New password"}
            </span>
            <input
              autoComplete="new-password"
              type="password"
              value={newPassword}
              onChange={(event) =>
                setNewPassword(event.target.value)
              }
            />
            <small>
              {fa
                ? "\u06f1\u06f0 \u062a\u0627 \u06f1\u06f2\u06f8 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631"
                : "10 to 128 characters"}
            </small>
          </label>

          <label>
            <span>
              {fa
                ? "\u062a\u06a9\u0631\u0627\u0631 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062c\u062f\u06cc\u062f"
                : "Confirm new password"}
            </span>
            <input
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
            />
          </label>

          {newPassword && !validLength && (
            <p className={styles.warning}>
              {fa
                ? "\u0637\u0648\u0644 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a."
                : "Password length is not valid."}
            </p>
          )}

          {confirmPassword && !matches && (
            <p className={styles.warning}>
              {fa
                ? "\u062a\u06a9\u0631\u0627\u0631 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u06cc\u06a9\u0633\u0627\u0646 \u0646\u06cc\u0633\u062a."
                : "Passwords do not match."}
            </p>
          )}

          {message && (
            <p className={styles.success}>{message}</p>
          )}

          {error && (
            <p className={styles.error}>{error}</p>
          )}

          <button
            disabled={
              busy ||
              !currentPassword ||
              !validLength ||
              !matches
            }
          >
            {busy
              ? (
                  fa
                    ? "\u062f\u0631 \u062d\u0627\u0644 \u0630\u062e\u06cc\u0631\u0647..."
                    : "Saving..."
                )
              : (
                  fa
                    ? "\u062a\u063a\u06cc\u06cc\u0631 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631"
                    : "Change password"
                )}
          </button>
        </form>
      </section>
    </main>
  );
}
