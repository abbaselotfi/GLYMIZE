export const runtimeApiUrl = (
  process.env.NEXT_PUBLIC_RUNTIME_API_URL ??
  process.env.NEXT_PUBLIC_ADMIN_API_URL ??
  ""
).replace(/\/$/, "");
