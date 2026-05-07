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
  phoneCodes: Array<Record<string, unknown>> = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async first<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    if (sql.includes("password_hash") && sql.includes("FROM users WHERE username = ?")) {
      return (this.findUserByAccount(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("FROM users WHERE phone = ?")) {
      return (this.findUserByPhone(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("SELECT id, username, role, status FROM users WHERE username = ?")) {
      const user = this.findUserByUsername(String(bindings[0]));
      if (!user) return null;
      const { id, username, role, status } = user;
      return { id, username, role, status } as T;
    }
    if (sql.includes("FROM sessions s JOIN users u")) {
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
    if (sql.includes("SELECT code_hash FROM phone_verification_codes")) {
      const [phone, purpose] = bindings;
      const code = [...this.phoneCodes]
        .reverse()
        .find((entry) => entry.phone === phone && entry.purpose === purpose && !entry.consumed_at);
      return (code as T) ?? null;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async run(sql: string, bindings: unknown[]): Promise<D1Result> {
    if (sql.includes("INSERT INTO users")) {
      const isGeneratedUsername = !sql.includes("NULL");
      const [id, phone] = bindings;
      const username = isGeneratedUsername ? bindings[2] : null;
      const role = isGeneratedUsername ? bindings[3] : bindings[2];
      const status = isGeneratedUsername ? bindings[4] : bindings[3];
      const displayName = isGeneratedUsername ? bindings[5] : bindings[4];
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
    if (sql.includes("INSERT INTO phone_verification_codes")) {
      const [id, phone, codeHash, purpose] = bindings;
      this.phoneCodes.push({ id, phone, code_hash: codeHash, purpose, consumed_at: null });
      return fakeResult();
    }
    if (sql.includes("UPDATE phone_verification_codes SET consumed_at")) {
      const [phone, purpose] = bindings;
      const code = [...this.phoneCodes]
        .reverse()
        .find((entry) => entry.phone === phone && entry.purpose === purpose && !entry.consumed_at);
      if (code) code.consumed_at = "now";
      return fakeResult();
    }
    if (sql.includes("UPDATE sessions SET expires_at")) {
      const [tokenHash] = bindings;
      const session = this.sessions.find((entry) => entry.token_hash === tokenHash);
      if (session) session.refreshed = true;
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
      const [passwordHash, passwordSalt, lookup] = bindings;
      const user = sql.includes("WHERE id = ?")
        ? this.users.get(String(lookup))
        : this.findUserByUsername(String(lookup));
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

  private findUserByPhone(phone: string): Record<string, unknown> | undefined {
    return [...this.users.values()].find((user) => user.phone === phone);
  }

  private findUserByAccount(account: string): Record<string, unknown> | undefined {
    return this.findUserByUsername(account) ?? this.findUserByPhone(account);
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
    DEV_SMS_CODES: "true",
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
    expect(login.headers.get("set-cookie")).toContain("Max-Age=2592000");
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
    expect(currentUser.headers.get("set-cookie")).toContain("Max-Age=2592000");
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

  it("registers a phone user with a verification code and creates a 30 day session", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const phone = "13800138000";

    const codeResponse = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone, purpose: "register" })
      }),
      testEnv
    );
    expect(codeResponse.status).toBe(200);
    const codePayload = (await json(codeResponse)) as { data: { devCode: string } };

    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-phone", {
        method: "POST",
        body: JSON.stringify({ phone, code: codePayload.data.devCode })
      }),
      testEnv
    );

    expect(register.status).toBe(200);
    expect(register.headers.get("set-cookie")).toContain("Max-Age=2592000");
    expect([...database.users.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phone,
          role: "user",
          status: "active"
        })
      ])
    );
  });

  it("lets the current user set a password and then login by phone and password", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const phone = "13900139000";
    const codeResponse = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone, purpose: "register" })
      }),
      testEnv
    );
    const codePayload = (await json(codeResponse)) as { data: { devCode: string } };
    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-phone", {
        method: "POST",
        body: JSON.stringify({ phone, code: codePayload.data.devCode })
      }),
      testEnv
    );
    const cookie = register.headers.get("set-cookie")?.split(";")[0];

    const password = await handleRequest(
      new Request("https://example.com/api/me/password", {
        method: "POST",
        headers: { cookie: cookie ?? "" },
        body: JSON.stringify({ password: "UserPassword123" })
      }),
      testEnv
    );
    expect(password.status).toBe(200);

    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: phone, password: "UserPassword123" })
      }),
      testEnv
    );
    expect(login.status).toBe(200);
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
