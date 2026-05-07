import { findApiRoute } from "./api-routes";
import { apiError, json, notFound, notImplemented } from "./http";
import type { Env } from "./types";

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "growth-record",
      storage: Boolean(env.DB)
    });
  }

  if (url.pathname.startsWith("/api/")) {
    const route = findApiRoute(request.method, url.pathname);
    if (route) return notImplemented(route.name);
    return notFound();
  }

  return apiError("asset_not_found", "Static asset fallback is handled by Cloudflare assets.", 404);
}
