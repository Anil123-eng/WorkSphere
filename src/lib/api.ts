
const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not configured");
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "API request failed");
  }

  return data as T;
}

export async function login(email: string, password: string) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  name: string,
  email: string,
  password: string,
  organizationName: string
) {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, organizationName }),
  });
}

export async function getProjects(token: string) {
  return apiRequest("/api/projects", {}, token);
}

export async function createProject(
  token: string,
  name: string,
  description: string
) {
  return apiRequest(
    "/api/projects",
    {
      method: "POST",
      body: JSON.stringify({ name, description }),
    },
    token
  );
}
