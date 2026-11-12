/**
 * Helpers for per-service aliases and hidden services in the "services" view.
 *
 * A service is identified by something that survives container re-creation:
 * the compose project, the container name, or the process name.
 */

export function serviceIdentityFor(port, composeProject) {
  if (port.source === "docker") {
    if (composeProject) return `compose:${composeProject}`;
    return `container:${port.owner || port.container_id || "unknown"}`;
  }
  return `process:${port.owner || "unknown"}`;
}

export function formatServiceName(name, alias) {
  const trimmed = typeof alias === "string" ? alias.trim() : "";
  return trimmed ? `${name} (${trimmed})` : name;
}

export function applyServiceSettings(services, settings) {
  const byKey = new Map((settings || []).map((item) => [item.service_key, item]));
  const visible = [];
  const hidden = [];
  for (const service of services) {
    const setting = byKey.get(service.identity);
    const withAlias = { ...service, alias: setting?.alias || null };
    (setting?.hidden ? hidden : visible).push(withAlias);
  }
  return { visible, hidden };
}
