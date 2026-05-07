import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/worker/router";
import type { Env } from "../src/worker/types";

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private bindings: unknown[] = []
  ) {}

  bind(...bindings: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, bindings);
  }

  first<T = unknown>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.bindings);
  }

  run(): Promise<D1Result> {
    return this.db.run(this.sql, this.bindings);
  }
}

class FakeD1Database {
  users = new Map<string, Record<string, unknown>>();
  sessions: Array<Record<string, unknown>> = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async first<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    if (sql.includes("password_hash") && sql.includes("FROM users WHERE username = ?")) {
      return (this.findUserByUsername(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("SELECT id, username, role, status FROM users WHERE username = ?")) {
      const user = this.findUserByUsername(String(bindings[0]));
      if (!user) return null;
      const { id, username, role, status } = user;
      return { id, username, role, status } as T;
    }
    if (sql.includes("SELECT u.id, u.username, u.role, u.status FROM sessions")) {
      const tokenHash = String(bindings[0]);
      const session = this.sessions.find((entry) => entry.token_hash === tokenHash);
      if (!session) return null;
      const user = this.users.get(String(session.user_id));
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      } as T;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async run(sql: string, bindings: unknown[]): Promise<D1Result> {
    if (sql.includes("INSERT INTO users")) {
      const [id, phone, username, role, status, displayName] = bindings;
      this.users.set(String(id), {
        id,
        phone,
        username,
        role,
        status,
        display_name: displayName,
        password_hash: null,
        password_salt: null
      });
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET password_hash = NULL")) {
      const [username] = bindings;
      const user = this.findUserByUsername(String(username));
      if (user) {
        user.password_hash = null;
        user.password_salt = null;
      }
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET password_hash = ?")) {
      const [passwordHash, passwordSalt, username] = bindings;
      const user = this.findUserByUsername(String(username));
      if (user) {
        user.password_hash = passwordHash;
        user.password_salt = passwordSalt;
      }
      return fakeResult();
    }
    if (sql.includes("INSERT INTO sessions")) {
      const [id, userId, tokenHash] = bindings;
      this.sessions.push({ id, user_id: userId, token_hash: tokenHash });
      return fakeResult();
    }
    if (sql.includes("DELETE FROM sessions WHERE user_id")) {
      const [userId] = bindings;
      this.sessions = this.sessions.filter((entry) => entry.user_id !== userId);
      return fakeResult();
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }

  private findUserByUsername(username: string): Record<string, unknown> | undefined {
    return [...this.users.values()].find((user) => user.username === username);
  }
}

function fakeResult(): D1Result {
  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changed_db: true,
      changes: 1
    }
  };
}

function env(db = new FakeD1Database(), overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    SESSION_SECRET: "test-secret",
    ADMIN_RESET_KEY: "reset-key",
    ...overrides
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

describe("admin authentication bootstrap", () => {
  it("creates the default admin account and reports setup is required", async () => {
    const response = await handleRequest(new Request("https://example.com/api/admin/bootstrap"), env());

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      data: {
        username: "admin",
        requiresPasswordSetup: true
      }
    });
  });

  it("allows setting the admin password only while setup is required", async () => {
    const database = new FakeD1Database();
    const setup = await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      env(database)
    );

    expect(setup.status).toBe(200);
    expect(database.users.get("admin")?.password_hash).toEqual(expect.any(String));

    const repeat = await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "AnotherPassword123" })
      }),
      env(database)
    );

    expect(repeat.status).toBe(409);
  });

  it("logs admin in after password setup and returns an HttpOnly session cookie", async () => {
    const database = new FakeD1Database();
    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      env(database)
    );

    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin", password: "StrongPassword123" })
      }),
      env(database)
    );

    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("growth_session=");
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects weak setup passwords, malformed login bodies, and bad passwords", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const weak = await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "short" })
      }),
      testEnv
    );
    expect(weak.status).toBe(400);

    const missingBody = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: "{"
      }),
      testEnv
    );
    expect(missingBody.status).toBe(400);

    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      testEnv
    );

    const badPassword = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin", password: "WrongPassword123" })
      }),
      testEnv
    );
    expect(badPassword.status).toBe(401);
  });

  it("returns the current user only when a valid session cookie is present", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const guest = await handleRequest(new Request("https://example.com/api/me"), testEnv);
    expect(guest.status).toBe(401);

    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      testEnv
    );
    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin", password: "StrongPassword123" })
      }),
      testEnv
    );
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const currentUser = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie: `theme=dark; ${cookie}` }
      }),
      testEnv
    );
    expect(currentUser.status).toBe(200);
    await expect(json(currentUser)).resolves.toMatchObject({
      data: {
        user: {
          username: "admin",
          role: "admin"
        }
      }
    });

    const invalidCookie = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie: "theme=dark; growth_session=bad" }
      }),
      testEnv
    );
    expect(invalidCookie.status).toBe(401);
  });

  it("clears the admin password only with the backend reset key", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      testEnv
    );

    const forbidden = await handleRequest(
      new Request("https://example.com/api/admin/reset-password", { method: "POST" }),
      testEnv
    );
    expect(forbidden.status).toBe(403);

    const reset = await handleRequest(
      new Request("https://example.com/api/admin/reset-password", {
        method: "POST",
        headers: { "x-admin-reset-key": "reset-key" }
      }),
      testEnv
    );

    expect(reset.status).toBe(200);
    expect(database.users.get("admin")?.password_hash).toBeNull();
  });
});
