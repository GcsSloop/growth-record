import { findApiRoute } from "./api-routes";
import {
  handleAdminBootstrap,
  handleAdminCreateUser,
  handleAdminDeleteUser,
  handleAdminListUsers,
  handleAdminMetrics,
  handleAdminResetPassword,
  handleAdminResetUserPassword,
  handleAdminSetupPassword,
  handleAdminUpdateUser,
  handleCurrentUser,
  handleCreateRecord,
  handleDashboard,
  handleDeleteRecord,
  handleEmailRegistration,
  handleGetSettings,
  handleListRecords,
  handlePasswordLogin,
  handlePhoneRegistration,
  handleRequestPhoneCode,
  handleSetCurrentUserPassword,
  handleUpdateRecord,
  handleUpdateSettings
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

  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    return handleAdminListUsers(request, env);
  }

  if (url.pathname === "/api/admin/metrics" && request.method === "GET") {
    return handleAdminMetrics(request, env);
  }

  if (url.pathname === "/api/admin/users" && request.method === "POST") {
    return handleAdminCreateUser(request, env);
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminUserMatch && request.method === "PATCH") {
    return handleAdminUpdateUser(request, env, adminUserMatch[1]);
  }
  if (adminUserMatch && request.method === "DELETE") {
    return handleAdminDeleteUser(request, env, adminUserMatch[1]);
  }

  const adminResetUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (adminResetUserMatch && request.method === "POST") {
    return handleAdminResetUserPassword(request, env, adminResetUserMatch[1]);
  }

  if (url.pathname === "/api/auth/login-password" && request.method === "POST") {
    return handlePasswordLogin(request, env);
  }

  if (url.pathname === "/api/auth/register-email" && request.method === "POST") {
    return handleEmailRegistration(request, env);
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

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    return handleDashboard(request, env);
  }

  if (url.pathname === "/api/records" && request.method === "GET") {
    return handleListRecords(request, env);
  }

  if (url.pathname === "/api/records" && request.method === "POST") {
    return handleCreateRecord(request, env);
  }

  const recordMatch = url.pathname.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch && request.method === "PATCH") {
    return handleUpdateRecord(request, env, recordMatch[1]);
  }
  if (recordMatch && request.method === "DELETE") {
    return handleDeleteRecord(request, env, recordMatch[1]);
  }

  if (url.pathname === "/api/settings" && request.method === "GET") {
    return handleGetSettings(request, env);
  }

  if (url.pathname === "/api/settings" && request.method === "PUT") {
    return handleUpdateSettings(request, env);
  }

  if (url.pathname.startsWith("/api/")) {
    const route = findApiRoute(request.method, url.pathname);
    if (route) return notImplemented(route.name);
    return notFound();
  }

  return apiError("asset_not_found", "Static asset fallback is handled by Cloudflare assets.", 404);
}
