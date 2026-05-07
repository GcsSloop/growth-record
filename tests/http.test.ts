import { describe, expect, it } from "vitest";
import { apiError, json, notFound } from "../src/worker/http";

describe("HTTP helpers", () => {
  it("wraps successful JSON responses in a data envelope", async () => {
    const response = json({ ok: true });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({ data: { ok: true } });
  });

  it("returns structured API errors", async () => {
    const response = apiError("bad_input", "Bad input", 422);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_input",
        message: "Bad input"
      }
    });
  });

  it("returns a standard not found response", async () => {
    const response = notFound();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "The requested resource was not found."
      }
    });
  });
});
