const MAX_SERVICE_KEY_LENGTH = 300;
const MAX_ALIAS_LENGTH = 100;

function toPublic(row) {
  return {
    service_key: row.service_key,
    alias: row.alias || null,
    hidden: !!row.hidden,
  };
}

function validateUpdate(body) {
  const { service_key, alias, hidden } = body || {};
  if (typeof service_key !== "string" || !service_key || service_key.length > MAX_SERVICE_KEY_LENGTH) {
    return { field: "service_key", error: "service_key must be a non-empty string" };
  }
  if (alias === undefined && hidden === undefined) {
    return { field: "alias", error: "Provide alias or hidden" };
  }
  if (alias !== undefined && alias !== null) {
    if (typeof alias !== "string") return { field: "alias", error: "alias must be a string" };
    if (alias.trim().length > MAX_ALIAS_LENGTH) {
      return { field: "alias", error: `alias must be at most ${MAX_ALIAS_LENGTH} characters` };
    }
  }
  if (hidden !== undefined && typeof hidden !== "boolean") {
    return { field: "hidden", error: "hidden must be a boolean" };
  }
  return null;
}

function listHandler({ db, logger }) {
  return (req, res) => {
    const serverId = req.query?.server_id;
    if (!serverId || typeof serverId !== "string") {
      return res.status(400).json({ error: "server_id query parameter is required" });
    }
    try {
      const rows = db
        .prepare("SELECT service_key, alias, hidden FROM service_settings WHERE server_id = ? ORDER BY service_key")
        .all(serverId);
      return res.json(rows.map(toPublic));
    } catch (err) {
      logger.error(`Database error in GET /api/service-settings: ${err.message}`);
      return res.status(500).json({ error: "Unable to retrieve service settings" });
    }
  };
}

function updateHandler({ db, logger }) {
  return (req, res) => {
    const body = req.body || {};
    const invalid = validateUpdate(body);
    if (invalid) return res.status(400).json(invalid);

    const serverId = body.server_id;
    try {
      const server = typeof serverId === "string"
        ? db.prepare("SELECT id FROM servers WHERE id = ?").get(serverId)
        : null;
      if (!server) return res.status(404).json({ error: "Server not found", field: "server_id" });

      const saved = db.transaction(() => {
        const existing = db
          .prepare("SELECT service_key, alias, hidden FROM service_settings WHERE server_id = ? AND service_key = ?")
          .get(serverId, body.service_key);
        const next = existing ? toPublic(existing) : { service_key: body.service_key, alias: null, hidden: false };
        if (body.alias !== undefined) next.alias = (body.alias || "").trim() || null;
        if (body.hidden !== undefined) next.hidden = body.hidden;

        if (!next.alias && !next.hidden) {
          db.prepare("DELETE FROM service_settings WHERE server_id = ? AND service_key = ?").run(serverId, body.service_key);
        } else {
          db.prepare(`
            INSERT INTO service_settings (server_id, service_key, alias, hidden, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(server_id, service_key)
            DO UPDATE SET alias = excluded.alias, hidden = excluded.hidden, updated_at = excluded.updated_at
          `).run(serverId, body.service_key, next.alias, next.hidden ? 1 : 0);
        }
        return next;
      })();

      return res.json(saved);
    } catch (err) {
      logger.error(`Database error in PUT /api/service-settings: ${err.message}`);
      return res.status(500).json({ error: "Unable to save service settings" });
    }
  };
}

function registerServiceSettingsRoutes(app, deps) {
  const { requireAuth } = deps;
  app.get("/api/service-settings", requireAuth, listHandler(deps));
  app.put("/api/service-settings", requireAuth, updateHandler(deps));
}

module.exports = { registerServiceSettingsRoutes };
