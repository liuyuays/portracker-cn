import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import i18n from '../../i18n/index.js';
import { humanizeProbeError, translateHealthReason } from '../../lib/health-copy.js';
import { overrideReason, resolveComponentOverride, applyOverridesToMatches } from '../../lib/service-health-state.js';

const KNOWN_REASON_CASES = [
  ["Connection refused.","连接被拒绝。"],
  ["Connection timed out.","连接超时。"],
  ["Connection reset.","连接被重置。"],
  ["Nothing is listening inside the container.","容器内部没有程序监听此端口。"],
  ["UDP port, not checked.","UDP 端口，未检查。"],
  ["Starts on demand, not checked.","按需启动，未检查。"],
  ["Not checked: more published ports than the check limit.","未检查：已发布端口数量超出检查上限。"],
  ["Not checked: the check ran out of time.","未检查：检查超时。"],
  ["Completed job; this port was not checked.","任务已完成；未检查此端口。"],
  ["Container health was checked; this port was not checked.","已检查容器健康状态；未检查此端口。"],
  ["Not published; this port was not checked.","端口未发布；未检查此端口。"],
  ["Container is stopped; this port was not checked.","容器已停止；未检查此端口。"],
  ["Job completion is not confirmed; this port was not checked.","尚未确认任务完成；未检查此端口。"],
  ["Port open, no HTTP response.","端口已开放，但无 HTTP 响应。"],
  ["Port open on the container network.","容器网络上的端口已开放。"],
  ["Port open (TCP check).","端口已开放（TCP 检查）。"],
  ["Reachable.","可访问。"],
  ["Port is not responding.","端口无响应。"],
  ["Port isn't responding.","端口无响应。"],
  ["Not checked.","未检查。"],
  ["No result for this port.","此端口暂无检查结果。"],
  ["Container is running, but the port isn't responding.","容器正在运行，但端口无响应。"],
  ["Bound to 127.0.0.1","绑定到 127.0.0.1"],
  ["Container uses host networking; 127.0.0.1 stays local.","容器使用主机网络；127.0.0.1 仅限本机访问。"],
  ["No bridge IP available to route through.","没有可用于路由的网桥 IP。"],
  ["No components found.","未找到组件。"],
  ["Main service unreachable.","主服务无法访问。"],
  ["Main service health is not yet known.","主服务健康状态尚不明确。"],
  ["Service is partially reachable.","服务部分可访问。"],
  ["Main service reachable, but a helper has issues.","主服务可访问，但有辅助组件异常。"],
  ["Main service is reachable.","主服务可访问。"],
  ["No main service identified — set a role if needed.","未识别出主服务，可按需设置角色。"],
  ["A setup job failed.","有一个初始化任务失败。"],
  ["Only finished jobs observed.","仅发现已完成的任务。"],
  ["Setup job completion is not yet known.","尚不清楚初始化任务是否完成。"],
  ["No main service identified, and a helper is failing. Pick a role to get a verdict.","未识别出主服务，且有辅助组件故障。请选择角色以得出结论。"],
  ["No main service identified; helper services are reachable.","未识别出主服务；辅助服务均可访问。"],
  ["Not enough info to judge.","信息不足，无法判断。"],
  ["Declared one-time setup task.","已声明为一次性初始化任务。"],
  ["The only port this service publishes - treated as the main service.","这是此服务唯一发布的端口，因此视为主服务。"],
  ["Component importance is not known. Set a role if needed.","尚不清楚此组件的重要性，可按需设置角色。"],
  ["No current health result.","暂无健康检查结果。"],
  ["Not yet assessed.","尚未评估。"],
  ["Unable to check this port","无法检查此端口"],
  ["Container status unknown","容器状态未知"],
  ["Container healthy","容器健康"],
  ["Container unhealthy","容器不健康"],
  ["Container running","容器正在运行"],
  ["Container not running","容器未运行"],
  ["System service","系统服务"],
  ["Service not reachable","服务无法访问"],
  ["Web service accessible","Web 服务可访问"],
  ["Web accessible (auth)","Web 可访问（需要认证）"],
  ["Service responding (Forbidden)","服务有响应（禁止访问）"],
  ["Web accessible (GET)","Web 可访问（GET）"],
  ["Web accessible","Web 可访问"],
  ["Service responding (no web UI)","服务有响应（无 Web 界面）"],
  ["HTTP accessible (auth)","可通过 HTTP 访问（需要认证）"],
  ["HTTP accessible","可通过 HTTP 访问"],
  ["Service responding (not HTTP)","服务有响应（非 HTTP）"],
  ["Service responding","服务有响应"],
  ["Sign in on the remote server to view raw diagnostics.","请登录远程服务器以查看原始诊断数据。"],
  ["Failed to load stats","加载统计信息失败"]
];

const PATTERN_CASES = [
  ["Answers with HTTPS 503.","返回 HTTPS 503。"],
  ["Answers with HTTP 200.","返回 HTTP 200。"],
  ["Main service answers with HTTP 502.","主服务返回 HTTP 502。"],
  ["Service is running, but 1 published port isn't responding.","服务正在运行，但有 1 个已发布端口无响应。"],
  ["Service is running, but 3 published ports aren't responding.","服务正在运行，但有 3 个已发布端口无响应。"],
  ["Marked as main service by you.","你已将其标记为主服务。"],
  ["Marked as helper by you.","你已将其标记为辅助组件。"],
  ["Marked as finished job by you.","你已将其标记为已完成任务。"],
  ["Marked as unknown by you.","你已将其标记为未知。"],
  ["Raw diagnostics unavailable (HTTP 403).","原始诊断数据不可用（HTTP 403）。"],
  ["Web accessible (HTTP 302)","Web 可访问（HTTP 302）"],
  ["HTTP 500 error","HTTP 500 错误"],
  ["my-api-v2 - HTTP 500 error","my-api-v2 - HTTP 500 错误"],
  ["Bound to [::1]","绑定到 [::1]"],
  ["Bound to fe80::1%eth0","绑定到 fe80::1%eth0"],
  ["Main service answers with HTTP 503.; disk full (errno 28)","主服务返回 HTTP 503。; disk full (errno 28)"]
];

const PROBE_CASES = [
  ["timeout","Connection timed out.","连接超时。"],
  ["healthcheck-unhealthy","Container reports unhealthy.","容器报告不健康。"],
  ["stale-completion","Last finished too long ago to count as healthy.","上次完成距今过久，无法视为健康。"],
  ["docker-api-unavailable","Can't reach Docker.","无法连接 Docker。"],
  ["inspect-failed","Couldn't inspect container.","无法检查容器。"],
  ["send-failed","Couldn't send UDP packet.","无法发送 UDP 数据包。"],
  ["send-threw","Couldn't send UDP packet.","无法发送 UDP 数据包。"],
  ["no-valid-host-port","No valid port to probe.","没有可探测的有效端口。"],
  ["missing-container-id","Container info missing.","缺少容器信息。"],
  ["unreachable","Unreachable.","无法访问。"],
  ["no-listener","Nothing is listening inside the container.","容器内部没有程序监听此端口。"],
  ["exit-code--137","Exited with error (code -137).","已异常退出（代码 -137）。"],
  ["not-exited-running","Container is running, not finished.","容器状态为 running，尚未完成。"],
  ["http-status-503","Answers with HTTP 503.","返回 HTTP 503。"],
  ["ports-closed-1","1 published port not responding.","1 个已发布端口无响应。"],
  ["ports-closed-4","4 published ports not responding.","4 个已发布端口无响应。"]
];

afterEach(() => i18n.changeLanguage('en'));

test('known backend and port reasons switch between English and Chinese without changing the source', async () => {
  for (const language of ['en', 'zh-CN', 'en']) {
    await i18n.changeLanguage(language);
    for (const [english, chinese] of KNOWN_REASON_CASES) {
      assert.equal(translateHealthReason(english), language === 'en' ? english : chinese, english);
    }
  }
});

test('known sentence patterns translate while preserving names, addresses, HTTP codes and diagnostic details', async () => {
  for (const language of ['en', 'zh-CN', 'en']) {
    await i18n.changeLanguage(language);
    for (const [english, chinese] of PATTERN_CASES) {
      assert.equal(translateHealthReason(english), language === 'en' ? english : chinese, english);
    }
  }
});

test('probe tokens retain English defaults, singular and plural grammar, and raw container states', async () => {
  for (const language of ['en', 'zh-CN', 'en']) {
    await i18n.changeLanguage(language);
    for (const [token, english, chinese] of PROBE_CASES) {
      assert.equal(humanizeProbeError(token), language === 'en' ? english : chinese, token);
    }
  }
});

test('unknown diagnostic text and internal status values remain unchanged in either language', async () => {
  const reasons = ['ECONNREFUSED 10.0.0.99:1234', 'running', 'core_runtime', 'my-api-v2', 'new backend diagnostic: errno=45', 'service-name - something new'];
  for (const language of ['en', 'zh-CN']) {
    await i18n.changeLanguage(language);
    for (const reason of reasons) assert.equal(translateHealthReason(reason), reason);
    assert.equal(translateHealthReason(null), null);
    assert.equal(translateHealthReason(''), null);
    assert.equal(humanizeProbeError(null), null);
  }
});

test('override explanations react to language changes while health rules, probes and service identities stay intact', async () => {
  const component = { role: 'unknown', autoRole: 'unknown', autoRuleId: 'R8', autoReason: 'Not yet assessed.', ruleId: 'R8', reason: 'Not yet assessed.', containerId: 'abc', probe: { ok: true, severity: 'yellow', error: 'http-status-503' } };
  const original = structuredClone(component);
  for (const language of ['en', 'zh-CN', 'en']) {
    await i18n.changeLanguage(language);
    assert.equal(overrideReason('support'), language === 'en' ? 'Marked as helper by you.' : '你已将其标记为辅助组件。');
    const resolved = resolveComponentOverride(component, 'core_runtime');
    assert.equal(resolved.effectiveRole, 'core_runtime');
    assert.equal(resolved.effectiveRuleId, 'R2');
    assert.equal(resolved.reason, language === 'en' ? 'Marked as main service by you.' : '你已将其标记为主服务。');
    const matches = applyOverridesToMatches([{ serviceId: 'api', name: 'my-api-v2', color: 'gray', components: [component] }], () => 'core_runtime');
    assert.equal(matches.overrideAdjustedColors.get('api'), 'yellow');
    assert.equal(matches.components[0]._serviceName, 'my-api-v2');
    assert.deepEqual(matches.components[0].probe, original.probe);
    const reset = resolveComponentOverride(resolved, null);
    assert.equal(reset.effectiveRole, 'unknown');
    assert.equal(reset.effectiveRuleId, 'R8');
    assert.equal(reset.reason, language === 'en' ? 'Not yet assessed.' : '尚未评估。');
    assert.deepEqual(component, original);
  }
});
