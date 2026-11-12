import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import i18n from './index.js';
import { translateMessage } from './messages.js';
import { formatUptime, formatDuration, formatCreatedDate, formatCreatedTooltip } from '../lib/utils.js';
import { buildAutoRefreshMessages } from '../lib/autoRefreshMessages.js';

afterEach(() => i18n.changeLanguage('en'));

test('non-browser imports default to English independently of the host locale', () => {
  assert.equal(i18n.language, 'en');
});

test('shared helpers follow the selected UI language without changing numeric data', async () => {
  await i18n.changeLanguage('en');
  assert.equal(formatUptime(90060), '1d 1h 1m');
  assert.equal(formatDuration(65, { showSeconds: true }), '1m 5s');
  await i18n.changeLanguage('zh-CN');
  assert.equal(formatUptime(90060), '1 天 1 小时 1 分钟');
  assert.equal(formatDuration(65, { showSeconds: true }), '1 分钟 5 秒');
  assert.equal(formatCreatedDate(new Date(Date.now() - 120000).toISOString()), '2 分钟前');
  assert.match(formatCreatedTooltip('2026-01-02T00:00:00Z'), /^创建时间：/);
});

test('refresh text follows language and preserves the configured port', async () => {
  await i18n.changeLanguage('zh-CN');
  const messages = buildAutoRefreshMessages({ isTrueNAS: true, currentPort: '4999' });
  assert(messages.includes('正在确认端口 4999 仍然归你使用。'));
  assert(messages.some(message => message.includes('TrueNAS')));
});

test('known dynamic errors translate; unknown diagnostic details remain intact', async () => {
  await i18n.changeLanguage('zh-CN');
  assert.equal(translateMessage('Error: Failed to fetch servers: 503'), '获取服务器失败：503');
  assert.equal(translateMessage('Network error fetching scan: ECONNREFUSED 10.0.0.2:4999'), '获取扫描结果时发生网络错误：ECONNREFUSED 10.0.0.2:4999');
  assert.equal(translateMessage('ECONNRESET at 10.0.0.2:4999'), 'ECONNRESET at 10.0.0.2:4999');
});

test('an existing heartbeat toast reformats its raw uptime when language changes', async () => {
  const message = 'Heartbeat steady: {{latency}}ms - uptime {{uptime}}';
  const values = { latency: 12, uptimeSeconds: 90060 };
  await i18n.changeLanguage('zh-CN');
  assert.equal(translateMessage(message, values), '心跳正常：12 毫秒 - 已运行 1 天 1 小时 1 分钟');
  await i18n.changeLanguage('en');
  assert.equal(translateMessage(message, values), 'Heartbeat steady: 12ms - uptime 1d 1h 1m');
});
