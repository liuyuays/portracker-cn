import { t } from '../i18n/index.js';

export function humanizeProbeError(token) {
  if (!token || typeof token !== 'string') return token || null;

  if (token === 'timeout') return t('Connection timed out.');
  if (token === 'healthcheck-unhealthy') return t('Container reports unhealthy.');
  if (token === 'stale-completion') return t('Last finished too long ago to count as healthy.');
  if (token === 'docker-api-unavailable') return t("Can't reach Docker.");
  if (token === 'inspect-failed') return t("Couldn't inspect container.");
  if (token === 'send-failed' || token === 'send-threw') return t("Couldn't send UDP packet.");
  if (token === 'no-valid-host-port') return t('No valid port to probe.');
  if (token === 'missing-container-id') return t('Container info missing.');
  if (token === 'unreachable') return t('Unreachable.');
  if (token === 'no-listener') return t('Nothing is listening inside the container.');

  const exit = token.match(/^exit-code-(-?\d+)$/);
  if (exit) return t('Exited with error (code {{code}}).', { code: exit[1] });

  const notExited = token.match(/^not-exited-(.+)$/);
  if (notExited) return t('Container is {{state}}, not finished.', { state: notExited[1] });

  const httpStatus = token.match(/^http-status-(5\d\d)$/);
  if (httpStatus) return t('Answers with HTTP {{status}}.', { status: httpStatus[1] });

  const closed = token.match(/^ports-closed-(\d+)$/);
  if (closed) return closed[1] === '1'
    ? t('{{count}} published port not responding.', { count: closed[1] })
    : t('{{count}} published ports not responding.', { count: closed[1] });

  return token;
}

const KNOWN_REASONS = new Set([
  'Connection refused.',
  'Connection timed out.',
  'Connection reset.',
  'Nothing is listening inside the container.',
  'UDP port, not checked.',
  'Starts on demand, not checked.',
  'Not checked: more published ports than the check limit.',
  'Not checked: the check ran out of time.',
  'Completed job; this port was not checked.',
  'Container health was checked; this port was not checked.',
  'Not published; this port was not checked.',
  'Container is stopped; this port was not checked.',
  'Job completion is not confirmed; this port was not checked.',
  'Port open, no HTTP response.',
  'Port open on the container network.',
  'Port open (TCP check).',
  'Reachable.',
  'Port is not responding.',
  "Port isn't responding.",
  'Not checked.',
  'No result for this port.',
  "Container is running, but the port isn't responding.",
  'Bound to 127.0.0.1',
  'Container uses host networking; 127.0.0.1 stays local.',
  'No bridge IP available to route through.',
  'No components found.',
  'Main service unreachable.',
  'Main service health is not yet known.',
  'Service is partially reachable.',
  'Main service reachable, but a helper has issues.',
  'Main service is reachable.',
  'No main service identified — set a role if needed.',
  'A setup job failed.',
  'Only finished jobs observed.',
  'Setup job completion is not yet known.',
  'No main service identified, and a helper is failing. Pick a role to get a verdict.',
  'No main service identified; helper services are reachable.',
  'Not enough info to judge.',
  'Declared one-time setup task.',
  'The only port this service publishes - treated as the main service.',
  'Component importance is not known. Set a role if needed.',
  'No current health result.',
  'Not yet assessed.',
  'Unable to check this port',
  'Container status unknown',
  'Container healthy',
  'Container unhealthy',
  'Container running',
  'Container not running',
  'System service',
  'Service not reachable',
  'Web service accessible',
  'Web accessible (auth)',
  'Service responding (Forbidden)',
  'Web accessible (GET)',
  'Web accessible',
  'Service responding (no web UI)',
  'HTTP accessible (auth)',
  'HTTP accessible',
  'Service responding (not HTTP)',
  'Service responding',
  'Sign in on the remote server to view raw diagnostics.',
  'Failed to load stats',
]);

export function translateHealthReason(reason) {
  if (!reason || typeof reason !== 'string') return reason || null;
  if (KNOWN_REASONS.has(reason)) return t(reason);
  const humanized = humanizeProbeError(reason);
  if (humanized !== reason) return humanized;

  const bound = reason.match(/^Bound to (\S+)$/);
  if (bound) return t('Bound to {{host}}', { host: bound[1] });
  const answers = reason.match(/^Answers with (HTTPS?) (\d{3})\.$/);
  if (answers) return t('Answers with {{protocol}} {{status}}.', { protocol: answers[1], status: answers[2] });
  const mainHttp = reason.match(/^Main service answers with HTTP (\d{3})\.$/);
  if (mainHttp) return t('Main service answers with HTTP {{status}}.', { status: mainHttp[1] });
  const closed = reason.match(/^Service is running, but (\d+) published port(?: isn't|s aren't) responding\.$/);
  if (closed) return closed[1] === '1'
    ? t("Service is running, but {{count}} published port isn't responding.", { count: closed[1] })
    : t("Service is running, but {{count}} published ports aren't responding.", { count: closed[1] });
  const override = reason.match(/^Marked as (main service|helper|finished job|unknown) by you\.$/);
  if (override) return t('Marked as {{role}} by you.', { role: t(override[1]) });
  const raw = reason.match(/^Raw diagnostics unavailable \(HTTP (\d{3})\)\.$/);
  if (raw) return t('Raw diagnostics unavailable (HTTP {{status}}).', { status: raw[1] });
  const webHttp = reason.match(/^Web accessible \(HTTP (\d{3})\)$/);
  if (webHttp) return t('Web accessible (HTTP {{status}})', { status: webHttp[1] });
  const httpError = reason.match(/^HTTP (\d{3}) error$/);
  if (httpError) return t('HTTP {{status}} error', { status: httpError[1] });
  const service = reason.match(/^(.*) - (.+)$/);
  if (service) {
    const detail = translateHealthReason(service[2]);
    if (detail !== service[2]) return t('{{service}} - {{reason}}', { service: service[1], reason: detail });
  }
  if (reason.includes('; ')) return reason.split('; ').map(translateHealthReason).join('; ');
  return reason;
}
