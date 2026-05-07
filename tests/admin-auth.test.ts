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

  all<T = unknown>(): Promise<D1Result<T>> {
    return this.db.all<T>(this.sql, this.bindings);
  }
}

class FakeD1Database {
  users = new Map<string, Record<string, unknown>>();
  sessions: Array<Record<string, unknown>> = [];
  phoneCodes: Array<Record<string, unknown>> = [];
  records: Array<Record<string, unknown>> = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async first<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    if (sql.includes("SELECT id, phone, username, role, status, display_name, must_change_password")) {
      return (this.users.get(String(bindings[0])) as T) ?? null;
    }
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

  async all<T>(sql: string, _bindings: unknown[] = []): Promise<D1Result<T>> {
    if (sql.includes("SELECT id, phone, username, role, status, display_name, must_change_password")) {
      return {
        ...fakeResult(),
        results: [...this.users.values()] as T[]
      };
    }
    if (sql.includes("FROM growth_records WHERE user_id = ?")) {
      const [userId] = _bindings;
      return {
        ...fakeResult(),
        results: this.records.filter((record) => record.user_id === userId) as T[]
      };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  async run(sql: string, bindings: unknown[]): Promise<D1Result> {
    if (sql.includes("INSERT INTO users") && sql.includes("must_change_password")) {
      const [id, phone, username, passwordHash, passwordSalt, role, status, displayName] = bindings;
      this.users.set(String(id), {
        id,
        phone,
        username,
        password_hash: passwordHash,
        password_salt: passwordSalt,
        role,
        status,
        display_name: displayName,
        must_change_password: true
      });
      return fakeResult();
    }
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
        password_salt: null,
        must_change_password: false
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
    if (sql.includes("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1")) {
      const [passwordHash, passwordSalt, id] = bindings;
      const user = this.users.get(String(id));
      if (user) Object.assign(user, { password_hash: passwordHash, password_salt: passwordSalt, must_change_password: true });
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
        user.must_change_password = false;
      }
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET phone = ?")) {
      const [phone, username, role, status, displayName, id] = bindings;
      const user = this.users.get(String(id));
      if (user) Object.assign(user, { phone, username, role, status, display_name: displayName });
      return fakeResult();
    }
    if (sql.includes("DELETE FROM users WHERE id = ?")) {
      this.users.delete(String(bindings[0]));
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
    if (sql.includes("INSERT INTO growth_records")) {
      const [id, userId, recordDate, dimension, hours, description, exp] = bindings;
      this.records.push({
        id,
        user_id: userId,
        record_date: recordDate,
        dimension,
        hours,
        description,
        exp
      });
      return fakeResult();
    }
    if (sql.includes("UPDATE growth_records SET")) {
      const [recordDate, dimension, hours, description, exp, id, userId] = bindings;
      const record = this.records.find((entry) => entry.id === id && entry.user_id === userId);
      if (record) Object.assign(record, { record_date: recordDate, dimension, hours, description, exp });
      return fakeResult();
    }
    if (sql.includes("DELETE FROM growth_records WHERE id = ? AND user_id = ?")) {
      const [id, userId] = bindings;
      this.records = this.records.filter((entry) => !(entry.id === id && entry.user_id === userId));
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

async function loginAdmin(database: FakeD1Database): Promise<{ cookie: string; testEnv: Env }> {
  const testEnv = env(database);
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
  return { cookie: login.headers.get("set-cookie")?.split(";")[0] ?? "", testEnv };
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

  it("keeps admin authenticated across refresh through /api/me", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const me = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie }
      }),
      testEnv
    );

    expect(me.status).toBe(200);
    await expect(json(me)).resolves.toMatchObject({
      data: {
        user: {
          username: "admin",
          role: "admin"
        }
      }
    });
  });

  it("lets admins create, list, update, reset, and delete users", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          phone: "13700137000",
          username: "alice",
          displayName: "Alice",
          role: "user",
          status: "active"
        })
      }),
      testEnv
    );
    expect(create.status).toBe(200);
    const createPayload = (await json(create)) as { data: { user: { id: string }; defaultPassword: string } };
    expect(createPayload.data.defaultPassword).toEqual(expect.any(String));

    const list = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        headers: { cookie }
      }),
      testEnv
    );
    expect(list.status).toBe(200);
    await expect(json(list)).resolves.toMatchObject({
      data: {
        users: expect.arrayContaining([
          expect.objectContaining({
            username: "alice",
            mustChangePassword: true
          })
        ])
      }
    });

    const update = await handleRequest(
      new Request(`https://example.com/api/admin/users/${createPayload.data.user.id}`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({
          phone: "13700137001",
          username: "alice-updated",
          displayName: "Alice Updated",
          role: "user",
          status: "disabled"
        })
      }),
      testEnv
    );
    expect(update.status).toBe(200);
    expect(database.users.get(createPayload.data.user.id)).toMatchObject({
      phone: "13700137001",
      username: "alice-updated",
      status: "disabled"
    });

    const reset = await handleRequest(
      new Request(`https://example.com/api/admin/users/${createPayload.data.user.id}/reset-password`, {
        method: "POST",
        headers: { cookie }
      }),
      testEnv
    );
    expect(reset.status).toBe(200);
    expect(database.users.get(createPayload.data.user.id)?.must_change_password).toBe(true);

    const remove = await handleRequest(
      new Request(`https://example.com/api/admin/users/${createPayload.data.user.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      testEnv
    );
    expect(remove.status).toBe(200);
    expect(database.users.has(createPayload.data.user.id)).toBe(false);
  });

  it("requires admin-created users to change default password before normal use", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);
    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ phone: "13600136000", username: "bob" })
      }),
      testEnv
    );
    const createPayload = (await json(create)) as { data: { defaultPassword: string } };

    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "13600136000", password: createPayload.data.defaultPassword })
      }),
      testEnv
    );
    expect(login.status).toBe(200);
    await expect(json(login)).resolves.toMatchObject({
      data: {
        requiresPasswordChange: true
      }
    });

    const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const password = await handleRequest(
      new Request("https://example.com/api/me/password", {
        method: "POST",
        headers: { cookie: userCookie },
        body: JSON.stringify({ password: "BobPassword123" })
      }),
      testEnv
    );
    expect(password.status).toBe(200);

    const normalLogin = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "13600136000", password: "BobPassword123" })
      }),
      testEnv
    );
    expect(normalLogin.status).toBe(200);
    await expect(json(normalLogin)).resolves.toMatchObject({
      data: {
        requiresPasswordChange: false
      }
    });
  });

  it("rejects protected admin operations from guests and normal users", async () => {
    const database = new FakeD1Database();
    const guestList = await handleRequest(new Request("https://example.com/api/admin/users"), env(database));
    expect(guestList.status).toBe(401);

    const phone = "13500135000";
    const testEnv = env(database);
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
    const userCookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";
    const forbidden = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        headers: { cookie: userCookie }
      }),
      testEnv
    );
    expect(forbidden.status).toBe(403);
  });

  it("rejects unsafe admin user mutations and disabled user login", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const invalidCreate = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ phone: "bad-phone" })
      }),
      testEnv
    );
    expect(invalidCreate.status).toBe(400);

    const editAdmin = await handleRequest(
      new Request("https://example.com/api/admin/users/admin", {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ phone: "13700137002", username: "root" })
      }),
      testEnv
    );
    expect(editAdmin.status).toBe(400);

    const deleteAdmin = await handleRequest(
      new Request("https://example.com/api/admin/users/admin", {
        method: "DELETE",
        headers: { cookie }
      }),
      testEnv
    );
    expect(deleteAdmin.status).toBe(400);

    const resetAdmin = await handleRequest(
      new Request("https://example.com/api/admin/users/admin/reset-password", {
        method: "POST",
        headers: { cookie }
      }),
      testEnv
    );
    expect(resetAdmin.status).toBe(400);

    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ phone: "13400134000", status: "disabled" })
      }),
      testEnv
    );
    const createPayload = (await json(create)) as { data: { defaultPassword: string } };
    const disabledLogin = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "13400134000", password: createPayload.data.defaultPassword })
      }),
      testEnv
    );
    expect(disabledLogin.status).toBe(401);
  });

  it("does not expose phone codes when SMS is not configured", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone: "13300133000", purpose: "register" })
      }),
      env(new FakeD1Database(), { DEV_SMS_CODES: undefined, SMS_PROVIDER: undefined })
    );

    expect(response.status).toBe(501);
  });

  it("isolates dashboard and record APIs by authenticated user", async () => {
    const database = new FakeD1Database();
    const envOne = env(database);

    async function register(phone: string): Promise<string> {
      const codeResponse = await handleRequest(
        new Request("https://example.com/api/auth/request-phone-code", {
          method: "POST",
          body: JSON.stringify({ phone, purpose: "register" })
        }),
        envOne
      );
      const codePayload = (await json(codeResponse)) as { data: { devCode: string } };
      const registerResponse = await handleRequest(
        new Request("https://example.com/api/auth/register-phone", {
          method: "POST",
          body: JSON.stringify({ phone, code: codePayload.data.devCode })
        }),
        envOne
      );
      return registerResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    }

    const userOneCookie = await register("13200132001");
    const userTwoCookie = await register("13200132002");

    const oneRecord = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie: userOneCookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "科研学习", hours: 2, description: "论文阅读" })
      }),
      envOne
    );
    expect(oneRecord.status).toBe(200);

    const twoRecord = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie: userTwoCookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "编程能力", hours: 1, description: "功能开发" })
      }),
      envOne
    );
    expect(twoRecord.status).toBe(200);

    const userOneRecords = await handleRequest(
      new Request("https://example.com/api/records", { headers: { cookie: userOneCookie } }),
      envOne
    );
    await expect(json(userOneRecords)).resolves.toMatchObject({
      data: {
        records: [
          expect.objectContaining({
            dimension: "科研学习",
            description: "论文阅读"
          })
        ]
      }
    });

    const userOneDashboard = await handleRequest(
      new Request("https://example.com/api/dashboard", { headers: { cookie: userOneCookie } }),
      envOne
    );
    expect(userOneDashboard.status).toBe(200);
    const dashboardPayload = (await json(userOneDashboard)) as { data: { records: Array<{ dimension: string }> } };
    expect(dashboardPayload.data.records).toHaveLength(1);
    expect(dashboardPayload.data.records[0].dimension).toBe("科研学习");
  });

  it("validates and mutates only the current user's records", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const phone = "13100131000";
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
    const cookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";

    const invalid = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "", hours: 13 })
      }),
      testEnv
    );
    expect(invalid.status).toBe(400);

    const create = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "科研学习", hours: 4, description: "深度学习" })
      }),
      testEnv
    );
    const createPayload = (await json(create)) as { data: { record: { id: string } } };

    const update = await handleRequest(
      new Request(`https://example.com/api/records/${createPayload.data.record.id}`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ date: "2026-05-08", dimension: "编程能力", hours: 2.5, description: "接口开发" })
      }),
      testEnv
    );
    expect(update.status).toBe(200);
    expect(database.records[0]).toMatchObject({ dimension: "编程能力", description: "接口开发" });

    const remove = await handleRequest(
      new Request(`https://example.com/api/records/${createPayload.data.record.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      testEnv
    );
    expect(remove.status).toBe(200);
    expect(database.records).toHaveLength(0);
  });
});
