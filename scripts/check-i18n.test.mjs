import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyze, checkProject, runCli } from './check-i18n.mjs';

const file = 'frontend/src/Upstream.jsx';
const catalogFile = 'frontend/src/i18n/locales/zh-CN/fixture.json';
const catalog = (entries, name = catalogFile) => ({ file: name, source: JSON.stringify(entries) });
const scan = (source, entries = {}, allowlist = {}) => analyze({
  sources: [{ file, source }], catalogs: [catalog(entries)], allowlist,
}).findings;
const errors = findings => findings.filter(finding => finding.severity === 'error');
const texts = findings => findings.filter(finding => finding.code === 'hardcoded').map(finding => finding.text).sort();

test('finds missing literal translation keys with source locations and flat punctuation', () => {
  const findings = scan("t('Save');\ni18n.t('Upstream: new.label');\nt(`Cancel`);", { Save: '保存' });
  assert.deepEqual(findings.map(({ code, text, line }) => ({ code, text, line })), [
    { code: 'missing-key', text: 'Upstream: new.label', line: 2 },
    { code: 'missing-key', text: 'Cancel', line: 3 },
  ]);
  assert(findings.every(finding => finding.file === file && finding.column > 0));
});

test('checks statically known conditional keys while leaving interpolation data alone', () => {
  const findings = scan(`
    const label = active ? 'Active' : 'Inactive';
    const view = <p>{t(label)} {t('Hello {{name}}', { name: 'Guest' })}</p>;
  `, { Active: '活跃', 'Hello {{name}}': '你好，{{name}}' });
  assert.deepEqual(findings.map(({ code, text }) => ({ code, text })), [
    { code: 'missing-key', text: 'Inactive' },
  ]);
});

test('rejects conflicting translations across catalogs, allowing identical shared translations', () => {
  const { findings } = analyze({ sources: [], catalogs: [
    catalog({ Save: '保存', Close: '关闭' }, 'one.json'),
    catalog({ Save: '储存', Close: '关闭' }, 'two.json'),
  ] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'conflicting-translation');
  assert.equal(findings[0].file, 'two.json');
  assert.match(findings[0].message, /one\.json/);
});

test('does not let JSON.parse hide conflicting duplicate keys inside one catalog', () => {
  const { findings } = analyze({ sources: [], catalogs: [
    { file: 'duplicate.json', source: '{\n  "Save": "保存",\n  "Save": "储存"\n}' },
  ] });
  assert.equal(findings[0].code, 'conflicting-translation');
  assert.equal(findings[0].line, 3);
});

test('rejects removed, renamed, extra, and changed interpolation placeholders', () => {
  for (const [key, value] of [
    ['Hello {{name}}', '你好'],
    ['Hello {{name}}', '你好 {{user}}'],
    ['Save', '保存 {{count}}'],
    ['{{count}} of {{total}}', '{{count}} / {{count}}'],
    ['Hello {{- name}}', '你好 {{name}}'],
    ['Total {{count, number}}', '共 {{count}}'],
  ]) {
    const findings = scan('', { [key]: value });
    assert.equal(findings[0]?.code, 'interpolation-mismatch', `${key} -> ${value}`);
  }
  assert.deepEqual(scan('', {
    '{{name}} has {{count}} ports': '{{ count }} 个端口属于 {{ name }}',
    'Hello {{- name}}': '你好 {{-name}}',
  }), []);
});

test('validates flat nonempty string catalogs and reports malformed JSON/source', () => {
  for (const value of ['', '  ', { nested: '嵌套' }, ['数组'], null, 5]) {
    assert.equal(scan('', { Label: value })[0]?.code, 'catalog-error');
  }
  const { findings } = analyze({
    sources: [{ file, source: 'const broken = <p>;' }],
    catalogs: [{ file: 'bad.json', source: '{\n "Save": }' }],
  });
  assert.deepEqual(findings.map(finding => finding.code).sort(), ['catalog-error', 'parse-error']);
  assert(findings.every(finding => finding.line >= 1));
});

test('catches new upstream JSX text, accessible attributes, and visible expression literals', () => {
  const findings = scan(`const view = <>
    <button title="Refresh now" aria-label={'Refresh services'}>
      New upstream action
    </button>
    <input placeholder="Find a server" />
    <img alt="Server diagram" />
    <Panel label="New group">{'More details'}</Panel>
  </>;`);
  assert.deepEqual(texts(findings), [
    'Find a server', 'More details', 'New group', 'New upstream action',
    'Refresh now', 'Refresh services', 'Server diagram',
  ]);
  assert.equal(findings.find(finding => finding.text === 'New upstream action').line, 3);
});

test('follows local variables, memo callbacks, and rendered ternary/logical branches', () => {
  const findings = scan(`function Header({ active, busy }) {
    const title = active ? 'Disable filter' : 'Enable filter';
    const summary = useMemo(() => {
      if (busy) return 'Loading services';
      return 'Ready to refresh';
    }, [busy]);
    const view = <button title={title}>{summary}{busy && 'Please wait'}{active ? 'Active view' : 'All services'}</button>;
    return view;
  }`);
  assert.deepEqual(texts(findings), [
    'Active view', 'All services', 'Disable filter', 'Enable filter',
    'Loading services', 'Please wait', 'Ready to refresh',
  ]);
});

test('follows memoized menu objects and map parameters without scanning internal properties', () => {
  const findings = scan(`function Menu({ filters }) {
    const filtersMenu = useMemo(() => [
      { key: 'system', label: 'System ports', title: filters.system ? 'Disable System filter' : 'Enable System filter', className: 'text-blue-500' },
      { key: 'docker', label: 'Container ports', title: 'Filter containers', className: 'text-green-500' },
    ], [filters]);
    return <>{filtersMenu.map(({ key, label, title, className }) => <button key={key} title={title} className={className}>{label}</button>)}</>;
  }`);
  assert.deepEqual(texts(findings), [
    'Container ports', 'Disable System filter', 'Enable System filter',
    'Filter containers', 'System ports',
  ]);
});

test('tracks visible state initializers and setter messages', () => {
  assert.deepEqual(texts(scan(`function Status() {
    const [message, setMessage] = useState('Waiting for connection');
    const connect = () => setMessage('Connection failed');
    return <p>{message}</p>;
  }`)), ['Connection failed', 'Waiting for connection']);
});

test('follows simple local helper returns and template/concatenation text', () => {
  const findings = scan(`function getLabel() { return connected ? 'Connected' : 'Disconnected'; }
    const view = <p>{getLabel()}{'Ports: ' + count}{\`Welcome \${user.name}\`}</p>;`);
  assert.deepEqual(texts(findings), ['Connected', 'Disconnected', 'Ports:', 'Welcome ${…}']);
});

test('ignores code metadata, condition tests, URL attributes, user data, and backend errors', () => {
  assert.deepEqual(scan(`
    const internal = { name: 'internal-enum', className: 'text-red-500', url: 'https://example.com' };
    const log = () => console.error('Backend diagnostic');
    function Card({ server, error, mode }) {
      return <a href={internal.url} className={internal.className} data-state="active">
        {mode === 'system' && <span>{server.name}</span>}
        {error?.message}
        {t('Open')}
      </a>;
    }
  `, { Open: '打开' }), []);
});

test('respects lexical shadowing and keeps binding resolution within each source file', () => {
  const { findings } = analyze({ sources: [
    { file: 'one.jsx', source: "const name = 'Internal name'; function User({ name }) { return <p>{name}</p>; }" },
    { file: 'two.jsx', source: 'function Other({ name }) { return <p>{name}</p>; }' },
    { file: 'three.jsx', source: "const name = 'Visible name'; const view = <p>{name}</p>;" },
  ], catalogs: [catalog({})] });
  assert.deepEqual(texts(findings), ['Visible name']);
  assert.equal(findings[0].file, 'three.jsx');
});

test('translated memo labels do not become hardcoded findings', () => {
  assert.deepEqual(scan(`const label = useMemo(() => active ? t('Active') : t('Inactive'), [active, t]);
    const view = <p title={label}>{label}</p>;`, { Active: '活跃', Inactive: '未激活' }), []);
});

test('reports unresolved dynamic translation keys as informational inventory findings', () => {
  const findings = scan('function Label({ runtimeKey }) { return <p>{t(runtimeKey)}</p>; }');
  assert.equal(errors(findings).length, 0);
  assert.equal(findings[0]?.code, 'dynamic-key');
  assert.equal(findings[0]?.line, 1);
});

test('allows only exact documented strings and never bypasses missing-key validation', () => {
  const allowlist = { Docker: 'Product name', 'https://example.com': 'Example address' };
  assert.deepEqual(texts(scan('<p>Docker</p>', {}, allowlist)), []);
  assert.deepEqual(texts(scan('<p>Docker settings</p>', {}, allowlist)), ['Docker settings']);
  assert.equal(scan("t('Docker');", {}, allowlist)[0]?.code, 'missing-key');
  const { findings } = analyze({ sources: [], catalogs: [catalog({})], allowlist: { '*': 'all files' } });
  assert.equal(findings[0]?.code, 'allowlist-error');
});

function projectFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'portracker-i18n-'));
  t.after(() => {
    assert.equal(path.dirname(root), tmpdir());
    assert(path.basename(root).startsWith('portracker-i18n-'));
    rmSync(root, { recursive: true, force: true });
  });
  const put = (name, contents) => {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  put('scripts/i18n-allowlist.json', '{}');
  put(catalogFile, '{ "Save": "保存" }');
  return { root, put };
}

test('project scan discovers nested source files and skips test sources, not components', t => {
  const { root, put } = projectFixture(t);
  put('frontend/src/new/Upstream.jsx', "const view = <button>{t('Save')}New upstream control</button>;");
  put('frontend/src/new/Upstream.test.mjs', "const fixture = '<p>Test label</p>'; t('Test-only key');");
  const result = checkProject(root);
  assert.equal(result.sourceCount, 1);
  assert.equal(result.catalogCount, 1);
  assert.deepEqual(texts(result.findings), ['New upstream control']);
  assert.equal(result.findings[0].file, 'frontend/src/new/Upstream.jsx');
});

test('CLI check fails new UI findings; inventory reports file/line without gating coverage', t => {
  const { root, put } = projectFixture(t);
  put('frontend/src/New.jsx', "const view = <p>{t('Missing translation')}New label</p>;");
  const output = [];
  const options = { root, write: text => output.push(text) };
  assert.equal(runCli([], options), 1);
  assert.match(output.join(''), /frontend\/src\/New\.jsx:1:\d+.*missing-key/);
  assert.match(output.join(''), /hardcoded.*New label/);
  output.length = 0;
  assert.equal(runCli(['--inventory'], options), 0);
  assert.match(output.join(''), /Missing translation/);
  assert.match(output.join(''), /New label/);
  assert.match(output.join(''), /Static/);
});

test('CLI rejects invalid options, invalid allowlists, and absent/malformed input', t => {
  const { root, put } = projectFixture(t);
  const options = { root, write: () => {} };
  assert.equal(runCli(['--unknown'], options), 2);
  put('frontend/src/Broken.jsx', 'const broken = <p>;');
  assert.equal(runCli(['--inventory'], options), 1);
  put('scripts/i18n-allowlist.json', '[]');
  assert(checkProject(root).findings.some(finding => finding.code === 'allowlist-error'));
  const missing = checkProject(path.join(root, 'does-not-exist'));
  assert(missing.findings.some(finding => finding.code === 'input-error'));
});

test('empty error-state resets are not missing translation keys', () => {
  const findings = scan(`function ErrorMessage({ backendError }) {
    const [error, setError] = useState('');
    const reset = () => setError('');
    const fail = () => setError(backendError.message);
    return <p>{error && t(error)}</p>;
  }`);
  assert.equal(errors(findings).length, 0);
  assert(findings.some(finding => finding.code === 'dynamic-key'));
});

test('checks input button labels while ignoring enum-like input values and hidden script/style text', () => {
  const findings = scan(`const view = <>
    <input type="submit" value="Apply changes" />
    <input type="hidden" value="internal-state" />
    <option value="system">{t('System')}</option>
    <style>{'body { color: red; }'}</style>
    <script>{'console.log("diagnostic")'}</script>
  </>;`, { System: '系统' });
  assert.deepEqual(texts(findings), ['Apply changes']);
});

test('unknown object lookups in t(...) remain a manual-review finding', () => {
  const findings = scan("const labels = {}; const view = <p>{t(labels[server.status])}</p>;");
  assert.equal(errors(findings).length, 0);
  assert.equal(findings[0]?.code, 'dynamic-key');
});

test('resolves object lookup labels and terminates cyclic local aliases', () => {
  const findings = scan(`const labels = { online: 'Online', offline: 'Offline' };
    let a = b; let b = a;
    const view = <p>{labels[status]}{a}</p>;`);
  assert.deepEqual(texts(findings), ['Offline', 'Online']);
});

test('supports TypeScript JSX and does not inspect hook dependency arrays as display values', () => {
  const { findings } = analyze({ sources: [{ file: 'future.tsx', source: `
    const label: string = React.useMemo(() => 'Upstream TS label', ['internal-dependency']);
    const view = <p>{label as string}</p>;
  ` }], catalogs: [catalog({})] });
  assert.deepEqual(texts(findings), ['Upstream TS label']);
});

test('does not normalize away changes inside placeholder names or accept broken interpolation syntax', () => {
  for (const [key, value] of [
    ['Hello {{user name}}', '你好 {{username}}'],
    ['Hello {{name}}', '你好 {{name}} {{}}'],
    ['Hello {{name}}', '你好 {{name}} {{'],
    ['Hello {{name}}', '你好 {{name}} {{ }}'],
  ]) {
    assert.equal(scan('', { [key]: value })[0]?.code, 'interpolation-mismatch', value);
  }
});

test('malformed catalogs identify the failing JSON line', () => {
  const { findings } = analyze({ sources: [], catalogs: [{ file: 'broken.json', source: '{\n  "Save":\n}' }] });
  assert.equal(findings[0]?.code, 'catalog-error');
  assert.equal(findings[0]?.line, 3);
});

test('keeps translated display labels out of structural JSX props', () => {
  const findings = scan('const view = <ServiceIcon source={t(isDocker ? "docker" : "system")} />;', { docker: 'Docker', system: '系统' });
  assert.equal(errors(findings).filter(item => item.code === 'translated-identifier').length, 1);
  assert.deepEqual(errors(scan('const view = <><ServiceIcon source={isDocker ? "docker" : "system"} /><span>{t(isDocker ? "docker" : "system")}</span></>;', { docker: 'Docker', system: '系统' })), []);
});
