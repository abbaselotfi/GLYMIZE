function validIdentity(value: string): boolean {
  if (!value || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  try {
    // Reject unpaired UTF-16 surrogates rather than silently replacing identity.
    return decodeURIComponent(encodeURIComponent(value)) === value;
  } catch {
    return false;
  }
}

export function patientWorkspaceHref(patientId: string): string {
  if (!validIdentity(patientId)) throw new Error("PATIENT_ID_INVALID");
  return `/patients/?${new URLSearchParams({ patientId })}`;
}

export function parsePatientWorkspaceQuery(search: string): string | null {
  try {
    // URLSearchParams alone silently accepts malformed escapes/UTF-8.
    decodeURIComponent(search.replace(/\+/g, " "));
    const values = new URLSearchParams(search).getAll("patientId");
    return values.length === 1 && validIdentity(values[0]!) ? values[0]! : null;
  } catch {
    return null;
  }
}

export function legacyPatientWorkspaceHref(
  pathname: string,
  search: string,
  basePath = "",
): string | null {
  if (basePath && !/^\/[A-Za-z0-9_-]+$/.test(basePath)) return null;
  const prefix = `${basePath}/patients/`;
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length).replace(/\/$/, "");
  if (!segment || segment.includes("/") || search) return null;
  try {
    const id = decodeURIComponent(segment);
    if (id === "." || id === ".." || !validIdentity(id)) return null;
    return `${basePath}${patientWorkspaceHref(id)}`;
  } catch {
    return null;
  }
}
