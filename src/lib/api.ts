const TOKEN_KEY = "quadrohe_token";

let memoryToken: string | null = null;

export function getToken() {
  return memoryToken ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  memoryToken = token;
  if (!token) localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Erro ${res.status}`,
    );
  }
  return data as T;
}
