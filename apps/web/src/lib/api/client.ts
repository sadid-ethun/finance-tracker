import type { paths } from "@finance-tracker/shared/api-types";

/**
 * Typed client for the FastAPI service.
 *
 * Always goes through /api/proxy, which attaches the JWT — callers never handle
 * tokens. `paths` is generated from the API's OpenAPI schema, and CI fails if
 * the committed types drift from the backend (PLAN.md section 19).
 */

export type ApiPaths = paths;

/** The RFC 9457 body every API error returns (PLAN.md section 16). */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  request_id?: string | null;
  errors?: unknown[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: ProblemDetails | null;

  constructor(status: number, problem: ProblemDetails | null, fallback: string) {
    super(problem?.detail ?? fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = problem?.code ?? "UNKNOWN";
    this.problem = problem;
  }
}

const BASE = "/api/proxy/api/v1";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    let problem: ProblemDetails | null = null;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      // Non-JSON error (proxy failure, gateway page) — fall through.
    }
    throw new ApiError(response.status, problem, response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** Shorthand for a typed GET on a known path. */
export type MeResponse =
  paths["/api/v1/me"]["get"]["responses"][200]["content"]["application/json"];

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me");
}
