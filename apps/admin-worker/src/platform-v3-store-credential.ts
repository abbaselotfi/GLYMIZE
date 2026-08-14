import { createCredential } from "./platform-v3-credential";
import { v3db, v3now, type V3Env } from "./platform-v3-base";

export async function saveCredential(
  env: V3Env,
  userId: string,
  value: string,
  currentSessionId: string,
) {
  const credential = await createCredential(value);
  const now = v3now();
  const db = v3db(env);

  const updated = await db
    .prepare(
      `UPDATE runtime_users
       SET password_hash=?, password_salt=?, password_iterations=?, password_updated_at=?
       WHERE id=?`,
    )
    .bind(
      credential.hash,
      credential.salt,
      credential.iterations,
      now,
      userId,
    )
    .run();

  if (!updated.success) {
    throw new Error("credential_update_failed");
  }

  await db
    .prepare(
      `UPDATE refresh_tokens
       SET revoked_at=?
       WHERE user_id=? AND id<>? AND revoked_at IS NULL`,
    )
    .bind(now, userId, currentSessionId)
    .run();

  return { updatedAt: now };
}