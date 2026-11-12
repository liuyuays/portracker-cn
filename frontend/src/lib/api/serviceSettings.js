/**
 * API client for per-service aliases and hidden services.
 * Settings are stored on this instance, keyed by server id (peers included).
 */

async function parseResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function getServiceSettings(serverId) {
  const response = await fetch(`/api/service-settings?server_id=${encodeURIComponent(serverId)}`);
  return parseResponse(response);
}

export async function updateServiceSetting(serverId, serviceKey, patch) {
  const response = await fetch("/api/service-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server_id: serverId, service_key: serviceKey, ...patch }),
  });
  return parseResponse(response);
}
