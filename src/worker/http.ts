import type { ApiErrorBody, ApiSuccessBody } from "./types";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

export function json<T>(data: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ data } satisfies ApiSuccessBody<T>), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init.headers
    }
  });
}

export function apiError(code: string, message: string, status = 400): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

export function notFound(): Response {
  return apiError("not_found", "The requested resource was not found.", 404);
}
