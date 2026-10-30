export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// The token lives only in React state; it is never stored or sent anywhere but this origin.
export async function api<T>(token: string, path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "omit",
  });
  const data = await res.json().catch(() => ({ error: "The server did not return valid JSON" }));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}
