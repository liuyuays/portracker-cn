const {
  afterAll,
  beforeEach,
  describe,
  expect,
  test,
} = require("@jest/globals");

const originalDatabasePath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = ":memory:";

const db = require("../db");
const { registerServiceSettingsRoutes } = require("./service-settings");

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const routes = {};
const requireAuth = () => {};
const registrar = (method) => (path, ...handlers) => {
  routes[`${method} ${path}`] = { handlers, handler: handlers[handlers.length - 1] };
};
registerServiceSettingsRoutes(
  { get: registrar("GET"), put: registrar("PUT") },
  { db, logger, requireAuth }
);

function call(method, { query = {}, body = {} } = {}) {
  let statusCode = 200;
  let payload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    },
  };
  routes[`${method} /api/service-settings`].handler({ query, body }, res);
  return { statusCode, payload };
}

const put = (body) => call("PUT", { body });
const list = (server_id) => call("GET", { query: { server_id } });

beforeEach(() => {
  db.prepare("DELETE FROM service_settings").run();
  db.prepare("DELETE FROM servers").run();
  db.ensureLocalServer(4999);
});

afterAll(() => {
  db.close();
  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }
});

describe("service settings routes", () => {
  test("both routes require authentication", () => {
    expect(routes["GET /api/service-settings"].handlers[0]).toBe(requireAuth);
    expect(routes["PUT /api/service-settings"].handlers[0]).toBe(requireAuth);
  });

  test("returns an empty list for a server without settings", () => {
    expect(list("local")).toEqual({ statusCode: 200, payload: [] });
  });

  test("saves a trimmed alias and lists it for that server only", () => {
    const saved = put({ server_id: "local", service_key: "compose:immich", alias: "  相册  " });
    expect(saved.statusCode).toBe(200);
    expect(saved.payload).toEqual({ service_key: "compose:immich", alias: "相册", hidden: false });

    expect(list("local").payload).toEqual([
      { service_key: "compose:immich", alias: "相册", hidden: false },
    ]);
  });

  test("hiding keeps an existing alias and unhiding keeps it too", () => {
    put({ server_id: "local", service_key: "process:sshd", alias: "SSH" });
    put({ server_id: "local", service_key: "process:sshd", hidden: true });
    expect(list("local").payload).toEqual([
      { service_key: "process:sshd", alias: "SSH", hidden: true },
    ]);

    put({ server_id: "local", service_key: "process:sshd", hidden: false });
    expect(list("local").payload).toEqual([
      { service_key: "process:sshd", alias: "SSH", hidden: false },
    ]);
  });

  test("an empty alias on a visible service removes the record", () => {
    put({ server_id: "local", service_key: "container:redis", alias: "缓存" });
    const cleared = put({ server_id: "local", service_key: "container:redis", alias: "   " });
    expect(cleared.payload).toEqual({ service_key: "container:redis", alias: null, hidden: false });
    expect(list("local").payload).toEqual([]);
  });

  test("rejects an unknown server", () => {
    const result = put({ server_id: "nope", service_key: "process:x", hidden: true });
    expect(result.statusCode).toBe(404);
    expect(list("nope").payload).toEqual([]);
  });

  test.each([
    [{ server_id: "local", alias: "x" }, "service_key"],
    [{ server_id: "local", service_key: "", alias: "x" }, "service_key"],
    [{ server_id: "local", service_key: "k".repeat(301), alias: "x" }, "service_key"],
    [{ server_id: "local", service_key: "process:x", alias: "a".repeat(101) }, "alias"],
    [{ server_id: "local", service_key: "process:x", alias: 5 }, "alias"],
    [{ server_id: "local", service_key: "process:x", hidden: "yes" }, "hidden"],
    [{ server_id: "local", service_key: "process:x" }, "alias"],
  ])("rejects invalid input %#", (body, field) => {
    const result = put(body);
    expect(result.statusCode).toBe(400);
    expect(result.payload.field).toBe(field);
  });

  test("GET requires server_id", () => {
    expect(call("GET").statusCode).toBe(400);
  });
});
