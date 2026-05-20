import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/worker/router";
import type { Env } from "../src/worker/types";

const env = {
  ASSETS: {
    fetch: async (request: Request) => new Response(`asset:${new URL(request.url).pathname}`)
  } as unknown as Fetcher,
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

  it("requires authentication for implemented user data routes", async () => {
    const response = await handleRequest(new Request("https://example.com/api/records"), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "Authentication is required."
      }
    });
  });

  it("delegates non-API fallback routes to Cloudflare assets", async () => {
    const response = await handleRequest(new Request("https://example.com/mobile.html"), env);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/mobile.html");
  });
});
