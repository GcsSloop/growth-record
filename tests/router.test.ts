import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/worker/router";
import type { Env } from "../src/worker/types";

const env = {
  DB: {} as D1Database
} satisfies Env;

describe("Worker router", () => {
  it("responds to the health endpoint", async () => {
    const response = await handleRequest(new Request("https://example.com/api/health"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        ok: true,
        service: "growth-record",
        storage: true
      }
    });
  });

  it("returns API 404 for unknown API routes", async () => {
    const response = await handleRequest(new Request("https://example.com/api/missing"), env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "The requested resource was not found."
      }
    });
  });

  it("returns 501 for planned API routes that are not implemented yet", async () => {
    const response = await handleRequest(new Request("https://example.com/api/records"), env);

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Route 'list-records' is planned but not implemented yet."
      }
    });
  });

  it("returns a clear response for non-API fallback routes", async () => {
    const response = await handleRequest(new Request("https://example.com/dashboard"), env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "asset_not_found",
        message: "Static asset fallback is handled by Cloudflare assets."
      }
    });
  });
});
