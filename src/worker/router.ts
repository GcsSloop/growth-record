import { apiError, json, notFound } from "./http";
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
    return notFound();
  }

  return apiError("asset_not_found", "Static asset fallback is handled by Cloudflare assets.", 404);
}
