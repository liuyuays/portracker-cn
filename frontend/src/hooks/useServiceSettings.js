import { useCallback, useEffect, useRef, useState } from "react";
import Logger from "../lib/logger";
import { getServiceSettings, updateServiceSetting } from "../lib/api/serviceSettings";

const logger = new Logger("useServiceSettings");

function upsert(settings, saved) {
  const rest = settings.filter((item) => item.service_key !== saved.service_key);
  return saved.alias || saved.hidden ? [...rest, saved] : rest;
}

/**
 * Loads and updates service aliases / hidden flags for one server.
 * Updates are applied optimistically and rolled back if saving fails.
 */
export function useServiceSettings(serverId, enabled = true) {
  const [settings, setSettings] = useState([]);
  const [error, setError] = useState(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!serverId || !enabled) return undefined;
    let cancelled = false;
    getServiceSettings(serverId)
      .then((rows) => {
        if (!cancelled) setSettings(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        logger.warn(`Failed to load service settings for ${serverId}:`, err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, enabled]);

  const update = useCallback(
    async (serviceKey, patch) => {
      const empty = { service_key: serviceKey, alias: null, hidden: false };
      const previous = settingsRef.current.find((item) => item.service_key === serviceKey) || empty;
      setSettings((latest) => {
        const current = latest.find((item) => item.service_key === serviceKey) || empty;
        const optimistic = { ...current, ...patch };
        if (typeof optimistic.alias === "string") optimistic.alias = optimistic.alias.trim() || null;
        return upsert(latest, optimistic);
      });
      setError(null);
      try {
        const saved = await updateServiceSetting(serverId, serviceKey, patch);
        setSettings((latest) => upsert(latest, saved));
        return true;
      } catch (err) {
        logger.warn(`Failed to save service setting ${serviceKey}:`, err.message);
        setSettings((latest) => upsert(latest, previous));
        setError(err.message);
        return false;
      }
    },
    [serverId]
  );

  return { settings, update, error };
}
