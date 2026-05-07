import { findApiRoute } from "./api-routes";
import {
  handleAdminBootstrap,
  handleAdminResetPassword,
  handleAdminSetupPassword,
  handleCurrentUser,
  handlePasswordLogin,
  handlePhoneRegistration,
  handleRequestPhoneCode,
  handleSetCurrentUserPassword
} from "./auth";
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

  if (url.pathname === "/api/admin/bootstrap" && request.method === "GET") {
    return handleAdminBootstrap(env);
  }

  if (url.pathname === "/api/admin/setup-password" && request.method === "POST") {
    return handleAdminSetupPassword(request, env);
  }

  if (url.pathname === "/api/admin/reset-password" && request.method === "POST") {
    return handleAdminResetPassword(request, env);
  }

  if (url.pathname === "/api/auth/login-password" && request.method === "POST") {
    return handlePasswordLogin(request, env);
  }

  if (url.pathname === "/api/auth/request-phone-code" && request.method === "POST") {
    return handleRequestPhoneCode(request, env);
  }

  if (url.pathname === "/api/auth/register-phone" && request.method === "POST") {
    return handlePhoneRegistration(request, env);
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    return handleCurrentUser(request, env);
  }

  if (url.pathname === "/api/me/password" && request.method === "POST") {
    return handleSetCurrentUserPassword(request, env);
  }

  if (url.pathname.startsWith("/api/")) {
    const route = findApiRoute(request.method, url.pathname);
    if (route) return notImplemented(route.name);
    return notFound();
  }

  return apiError("asset_not_found", "Static asset fallback is handled by Cloudflare assets.", 404);
}
