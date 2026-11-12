import { t } from '../i18n/index.js';
const GENERAL_MESSAGES = [
  "Shushing noisy daemons… give us 30 seconds.",
  "Counting bits, bytes, and bad decisions.",
  "Scanning the subnet for uninvited guests.",
  "Checking if Docker went rogue again.",
  "Playing hide-and-seek under bridged networks.",
  "Waiting for services to line up for roll call.",
  "Scripting yet another docker ps flex.",
  "Watching for containers that missed curfew.",
  "Renegotiating NAT treaties at the border.",
  "Diffing firewall rules so you don’t have to.",
  "Running ip neigh gossip down the rack.",
  "Patching cables with positive thoughts.",
  "Staring down cronjobs until they blink.",
  "Cross-checking config drift in the margins.",
  "Counting open ports faster than nmap.",
  "Waiting for log ingestion to stop screaming."
];

const TRUE_NAS_MESSAGE = "Asking TrueNAS if it woke another VM.";

export function buildAutoRefreshMessages({ isTrueNAS = false, currentPort = "4999", translate = t } = {}) {
  const base = GENERAL_MESSAGES.map(message => translate(message));

  base.push(translate('Confirming that Port {{port}} still belongs to you.', { port: currentPort }));

  if (isTrueNAS) {
    base.push(translate(TRUE_NAS_MESSAGE));
  }

  const shuffled = base
    .map((text) => ({ text, sortKey: Math.random() }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.text);

  return shuffled;
}
