import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import type { Env } from "../src/worker/types";

const env = {
  ASSETS: {
    fetch: async () => new Response("asset")
  } as unknown as Fetcher,
  DB: {} as D1Database
} satisfies Env;

describe("Worker entrypoint", () => {
  it("delegates fetch requests to the router", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/health"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        ok: true,
        service: "growth-record",
        storage: true
      }
    });
  });
});
