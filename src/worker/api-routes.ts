export type AccessLevel = "public" | "user" | "admin";

export interface ApiRoute {
  name: string;
  method: string;
  path: string;
  access: AccessLevel;
}

export const API_ROUTES = [
  { name: "health", method: "GET", path: "/api/health", access: "public" },
  { name: "register-phone", method: "POST", path: "/api/auth/register-phone", access: "public" },
  { name: "request-phone-code", method: "POST", path: "/api/auth/request-phone-code", access: "public" },
  { name: "login-password", method: "POST", path: "/api/auth/login-password", access: "public" },
  { name: "login-phone-code", method: "POST", path: "/api/auth/login-phone-code", access: "public" },
  { name: "admin-bootstrap", method: "GET", path: "/api/admin/bootstrap", access: "public" },
  { name: "admin-setup-password", method: "POST", path: "/api/admin/setup-password", access: "public" },
  { name: "admin-reset-password", method: "POST", path: "/api/admin/reset-password", access: "admin" },
  { name: "logout", method: "POST", path: "/api/auth/logout", access: "user" },
  { name: "current-user", method: "GET", path: "/api/me", access: "user" },
  { name: "set-current-user-password", method: "POST", path: "/api/me/password", access: "user" },
  { name: "dashboard", method: "GET", path: "/api/dashboard", access: "user" },
  { name: "list-records", method: "GET", path: "/api/records", access: "user" },
  { name: "create-record", method: "POST", path: "/api/records", access: "user" },
  { name: "update-record", method: "PATCH", path: "/api/records/:id", access: "user" },
  { name: "delete-record", method: "DELETE", path: "/api/records/:id", access: "user" },
  { name: "get-settings", method: "GET", path: "/api/settings", access: "user" },
  { name: "update-settings", method: "PUT", path: "/api/settings", access: "user" },
  { name: "admin-list-users", method: "GET", path: "/api/admin/users", access: "admin" },
  { name: "admin-create-user", method: "POST", path: "/api/admin/users", access: "admin" },
  { name: "admin-update-user", method: "PATCH", path: "/api/admin/users/:id", access: "admin" },
  { name: "admin-delete-user", method: "DELETE", path: "/api/admin/users/:id", access: "admin" },
  { name: "admin-reset-user-password", method: "POST", path: "/api/admin/users/:id/reset-password", access: "admin" },
  { name: "admin-user-records", method: "GET", path: "/api/admin/users/:id/records", access: "admin" },
  { name: "admin-metrics", method: "GET", path: "/api/admin/metrics", access: "admin" }
] as const satisfies readonly ApiRoute[];

export function findApiRoute(method: string, pathname: string): ApiRoute | undefined {
  return API_ROUTES.find((route) => {
    if (route.method !== method.toUpperCase()) return false;
    return route.path === pathname || matchesParameterizedPath(route.path, pathname);
  });
}

function matchesParameterizedPath(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");
  if (patternParts.length !== pathParts.length) return false;

  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}
