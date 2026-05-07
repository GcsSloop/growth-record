import { describe, expect, it } from "vitest";
import { API_ROUTES, findApiRoute } from "../src/worker/api-routes";

describe("API route registry", () => {
  it("declares public authentication endpoints", () => {
    expect(findApiRoute("POST", "/api/auth/register-phone")).toMatchObject({
      access: "public"
    });
    expect(findApiRoute("POST", "/api/auth/login-password")).toMatchObject({
      access: "public"
    });
    expect(findApiRoute("POST", "/api/auth/login-phone-code")).toMatchObject({
      access: "public"
    });
  });

  it("declares user-scoped growth endpoints", () => {
    expect(findApiRoute("GET", "/api/me")).toMatchObject({ access: "user" });
    expect(findApiRoute("GET", "/api/records")).toMatchObject({ access: "user" });
    expect(findApiRoute("POST", "/api/records")).toMatchObject({ access: "user" });
    expect(findApiRoute("PUT", "/api/settings")).toMatchObject({ access: "user" });
  });

  it("declares admin-only management endpoints", () => {
    expect(findApiRoute("GET", "/api/admin/users")).toMatchObject({ access: "admin" });
    expect(findApiRoute("PATCH", "/api/admin/users/:id")).toMatchObject({ access: "admin" });
    expect(findApiRoute("GET", "/api/admin/metrics")).toMatchObject({ access: "admin" });
  });

  it("keeps route names unique", () => {
    const names = API_ROUTES.map((route) => route.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
