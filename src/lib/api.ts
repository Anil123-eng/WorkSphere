
const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not configured");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
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
    throw new ApiError(
      data.message || "API request failed",
      response.status,
      data
    );
  }

  return data as T;
}

export interface SessionResponse {
  success: boolean;
  data: {
    userId: number;
    organizationId: number;
    role: string;
  };
}

export interface Project {
  id: number | string;
  name: string;
  description: string;
  status: string;
}

export interface Task {
  id: number | string;
  project_id: number | string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "completed";
  version: number;
  due_date: string | null;
}

export interface TaskActivity {
  id: number | string;
  activity_type: string;
  task_version: number;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown>;
  created_at: string;
}

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface RotatedTokensResponse {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

export async function getSession(token: string) {
  return apiRequest<SessionResponse>("/api/auth/session", {}, token);
}

export async function refreshTokens(refreshToken: string) {
  const response = await apiRequest<RotatedTokensResponse>(
    "/api/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }
  );
  return response.data;
}

export async function revokeSession(refreshToken: string) {
  return apiRequest("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
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
  return apiRequest<{ success: boolean; data: Project[] }>(
    "/api/projects?limit=100",
    {},
    token
  );
}

export async function createProject(
  token: string,
  name: string,
  description: string
) {
  return apiRequest<{ success: boolean; data: Project }>(
    "/api/projects",
    {
      method: "POST",
      body: JSON.stringify({ name, description }),
    },
    token
  );
}

export async function createTask(
  token: string,
  projectId: number | string,
  title: string,
  description: string
) {
  return apiRequest<{ success: boolean; data: Task }>(
    "/api/tasks",
    {
      method: "POST",
      body: JSON.stringify({ projectId: Number(projectId), title, description }),
    },
    token
  );
}

export async function getTask(token: string, taskId: string) {
  return apiRequest<{ success: boolean; data: Task }>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    {},
    token
  );
}

export async function updateTaskStatus(
  token: string,
  taskId: string,
  status: Task["status"],
  expectedVersion: number
) {
  return apiRequest<{ success: boolean; data: Task }>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, expectedVersion }),
    },
    token
  );
}

export async function getTaskActivities(
  token: string,
  taskId: string,
  page: number
) {
  return apiRequest<{
    success: boolean;
    data: TaskActivity[];
    pagination: PageInfo;
  }>(
    `/api/tasks/${encodeURIComponent(taskId)}/activities?page=${page}&limit=10`,
    {},
    token
  );
}
