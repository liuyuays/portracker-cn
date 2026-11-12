import { formatUptime } from '../lib/utils.js';
import { t } from './index.js';

const patterns = [
  [/^Heartbeat steady: (\d+)ms - uptime (.+)$/, 'Heartbeat steady: {{latency}}ms - uptime {{uptime}}', ['latency', 'uptime']],
  [/^Health check failed: (.+)$/, 'Health check failed: {{error}}', ['error']],
  [/^Failed to fetch servers: (\d+)$/, 'Failed to fetch servers: {{status}}', ['status']],
  [/^Local scan failed with status (\d+)$/, 'Local scan failed with status {{status}}', ['status']],
  [/^Scan failed \(status (\d+)\)$/, 'Scan failed (status {{status}})', ['status']],
  [/^Network error fetching scan: (.+)$/, 'Network error fetching scan: {{error}}', ['error']],
  [/^Failed to generate port \(HTTP (\d+)\)$/, 'Failed to generate port (HTTP {{status}})', ['status']],
  [/^Failed to delete server: (\d+)$/, 'Failed to delete server: {{status}}', ['status']],
  [/^Failed to scan peer '(.+)' via backend\. Status: (\d+)$/, "Failed to scan peer '{{server}}' via backend. Status: {{status}}", ['server', 'status']],
];

export function translateMessage(message, values) {
  if (typeof message !== 'string') return message;
  if (message === 'Heartbeat steady: {{latency}}ms - uptime {{uptime}}' && values) {
    return t(message, { latency: values.latency, uptime: values.uptimeSeconds ? formatUptime(values.uptimeSeconds) : t('unknown') });
  }
  if (message.startsWith('Error: ')) return translateMessage(message.slice(7));
  for (const [pattern, key, names] of patterns) {
    const match = message.match(pattern);
    if (match) return t(key, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
  }
  return t(message);
}
