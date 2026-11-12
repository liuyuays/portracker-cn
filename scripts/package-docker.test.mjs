import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repository = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(repository, 'scripts/package-docker.mjs');

async function write(root, name, content = 'fixture') {
  const target = path.join(root, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'portracker-package-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('portracker-package-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const sources = {
    'package.json': JSON.stringify({ name: 'portracker', version: '1.3.17' }),
    'CHANGELOG.md': '# Releases',
    'LICENSE': 'MIT',
    '.dockerignore': 'node_modules/\n.env*\n',
    'docker-compose.yml': 'services:\n  portracker:\n    image: upstream:latest\n    volumes:\n      - ./portracker-data:/data\n',
    'compose.cn.yaml': 'services:\n  portracker:\n    image: portracker-cn:local\n    build: .\n',
    'backend/package.json': '{"type":"commonjs"}',
    'backend/package-lock.json': '{"lockfileVersion":3}',
    'backend/index.js': 'process.stdout.write("backend");',
    'frontend/package.json': '{"type":"module"}',
    'frontend/package-lock.json': '{"lockfileVersion":3}',
    'frontend/index.html': '<html></html>',
    'frontend/vite.config.js': 'export default {};',
    'frontend/src/main.jsx': 'export default "简体中文";',
    'frontend/src/i18n/locales/zh-CN/app.json': '{"Language":"语言"}',
    'frontend/public/logo.svg': '<svg></svg>',
  };
  sources.Dockerfile = await fs.readFile(path.join(repository, 'Dockerfile'), 'utf8');
  await Promise.all(Object.entries(sources).map(([name, content]) => write(root, name, content)));
  return root;
}

async function runPackage(projectRoot) {
  assert.ok(existsSync(entry), 'package:docker entry point has not been implemented');
  const { packageDocker } = await import('./package-docker.mjs');
  return packageDocker({ projectRoot });
}

async function absent(name) {
  await assert.rejects(fs.access(name), { code: 'ENOENT' });
}

test('packages current source with one merged docker-compose.yaml deployment file', async t => {
  const root = await fixture(t);
  await write(root, 'frontend/src/main.jsx', 'export default "尚未提交的汉化修改";');
  await write(root, 'frontend/src/data/presets.json', '{"default":true}');
  await write(root, 'backend/lib/data/constants.json', '{"port":4999}');
  const result = await runPackage(root);
  const output = path.join(root, 'deploy/app');
  assert.equal(result.outputDirectory, output);
  assert.equal(await fs.readFile(path.join(output, 'frontend/src/main.jsx'), 'utf8'), 'export default "尚未提交的汉化修改";');
  const compose = yaml.safeLoad(await fs.readFile(path.join(output, 'docker-compose.yaml'), 'utf8'));
  assert.equal(compose.services.portracker.image, 'portracker-cn:local');
  assert.equal(compose.services.portracker.build, '.');
  assert.equal(compose.services.portracker.volumes[0], './portracker-data:/data');
  await absent(path.join(output, 'compose.yaml'));
  await absent(path.join(output, 'compose.override.yaml'));
  assert.equal(await fs.readFile(path.join(output, 'Dockerfile'), 'utf8'), await fs.readFile(path.join(root, 'Dockerfile'), 'utf8'));
  for (const name of ['package.json', 'CHANGELOG.md', 'backend/package-lock.json', 'frontend/package-lock.json', 'frontend/public/logo.svg', 'frontend/src/i18n/locales/zh-CN/app.json', 'frontend/src/data/presets.json', 'backend/lib/data/constants.json']) {
    await fs.access(path.join(output, name));
  }
  assert.match(await fs.readFile(path.join(output, 'README.md'), 'utf8'), /docker compose up -d --build/);
  assert.match(await fs.readFile(path.join(output, '.env.example'), 'utf8'), /ENABLE_AUTH=true/);
});

test('excludes dependencies, generated builds, tests, secrets, databases and machine files', async t => {
  const root = await fixture(t);
  const unwanted = ['.env', '.git/config', 'portracker-data/portracker.db', 'frontend/node_modules/pkg/index.js', 'backend/node_modules/pkg/index.js', 'frontend/dist/index.html', 'backend/build/output.js', 'backend/data/app.db', 'backend/cache.sqlite3', 'backend/cache.db-journal', 'backend/cache.sqlite3-journal', 'backend/cache.sqlite3-wal', 'frontend/.env.production', 'backend/.secrets-local', 'backend/credentials.json', 'backend/tls/private.pem', 'backend/private.key', 'backend/logs/app.log', 'backend/lib/example.test.js', 'frontend/src/example.spec.jsx', 'frontend/coverage/report.json'];
  await Promise.all(unwanted.map(name => write(root, name, 'must stay private')));
  await runPackage(root);
  for (const name of unwanted) await absent(path.join(root, 'deploy/app', name));
});

test('repackaging removes obsolete packaged source while preserving deployment settings and data', async t => {
  const root = await fixture(t);
  await write(root, 'backend/obsolete.js', 'old implementation');
  await runPackage(root);
  await write(root, 'deploy/app/.env', 'SESSION_SECRET=keep-this-value');
  await write(root, 'deploy/app/portracker-data/portracker.db', 'live-database');
  await write(root, 'deploy/app/operator-notes.txt', 'keep these notes');
  await fs.unlink(path.join(root, 'backend/obsolete.js'));
  await write(root, 'backend/replacement.js', 'new implementation');
  await runPackage(root);
  await absent(path.join(root, 'deploy/app/backend/obsolete.js'));
  assert.equal(await fs.readFile(path.join(root, 'deploy/app/backend/replacement.js'), 'utf8'), 'new implementation');
  assert.equal(await fs.readFile(path.join(root, 'deploy/app/.env'), 'utf8'), 'SESSION_SECRET=keep-this-value');
  assert.equal(await fs.readFile(path.join(root, 'deploy/app/portracker-data/portracker.db'), 'utf8'), 'live-database');
  assert.equal(await fs.readFile(path.join(root, 'deploy/app/operator-notes.txt'), 'utf8'), 'keep these notes');
});

test('refuses a nonempty output directory that is not owned by the packaging command', async t => {
  const root = await fixture(t);
  await write(root, 'deploy/app/important.txt', 'keep this file');
  await assert.rejects(runPackage(root), /已有文件/);
  assert.equal(await fs.readFile(path.join(root, 'deploy/app/important.txt'), 'utf8'), 'keep this file');
});

test('checks required build inputs before creating output', async t => {
  const root = await fixture(t);
  await fs.unlink(path.join(root, 'frontend/package-lock.json'));
  await assert.rejects(runPackage(root), /frontend[/\\]package-lock.json/);
  await absent(path.join(root, 'deploy/app'));
});

test('rejects manifest paths outside managed deployment files before changing output', async t => {
  const root = await fixture(t);
  await runPackage(root);
  const marker = path.join(root, 'deploy/app/.portracker-package.json');
  const manifest = JSON.parse(await fs.readFile(marker, 'utf8'));
  manifest.files.push('../../sentinel.txt');
  await write(root, 'sentinel.txt', 'untouched');
  await fs.writeFile(marker, JSON.stringify(manifest));
  await assert.rejects(runPackage(root), /清单/);
  assert.equal(await fs.readFile(path.join(root, 'sentinel.txt'), 'utf8'), 'untouched');
});

test('rejects redirected deployment paths instead of writing through a directory symlink', async t => {
  const root = await fixture(t);
  const redirected = path.join(root, 'redirected');
  await fs.mkdir(redirected);
  await fs.symlink(redirected, path.join(root, 'deploy'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runPackage(root), /符号链接/);
  await absent(path.join(redirected, 'app'));
});


test('merges upstream settings with localized build and environment without resolving secrets or relative paths', async t => {
  const root = await fixture(t);
  await write(root, 'docker-compose.yml', yaml.safeDump({
    services: {
      portracker: {
        image: 'upstream:latest',
        build: '.',
        command: ['node', 'old.js'],
        environment: ['KEEP=upstream', 'ENABLE_AUTH=false', 'UNSET', 'WITH_EQUALS=a=b=c'],
        ports: ['4999:4999'],
        volumes: ['./portracker-data:/data'],
        healthcheck: { test: ['CMD', 'wget', 'http://localhost:4999/api/health'], interval: '30s' },
      },
      cache: { image: 'redis:7' },
    },
    networks: { default: { name: 'upstream-network' } },
  }));
  await write(root, 'compose.cn.yaml', yaml.safeDump({
    services: { portracker: {
      image: 'portracker-cn:local',
      pull_policy: 'build',
      build: { dockerfile: 'Dockerfile' },
      command: ['node', 'index.js'],
      healthcheck: { test: ['CMD', 'wget', 'http://localhost:4999/api/health?new'] },
      environment: { ENABLE_AUTH: '${ENABLE_AUTH:-true}', SESSION_SECRET: '${SESSION_SECRET:-}' },
    } },
  }));
  await runPackage(root);
  const combined = yaml.safeLoad(await fs.readFile(path.join(root, 'deploy/app/docker-compose.yaml'), 'utf8'));
  const service = combined.services.portracker;
  assert.deepEqual(service.build, { context: '.', dockerfile: 'Dockerfile' });
  assert.deepEqual(service.environment, { KEEP: 'upstream', ENABLE_AUTH: '${ENABLE_AUTH:-true}', UNSET: null, WITH_EQUALS: 'a=b=c', SESSION_SECRET: '${SESSION_SECRET:-}' });
  assert.deepEqual(service.ports, ['4999:4999']);
  assert.deepEqual(service.volumes, ['./portracker-data:/data']);
  assert.equal(service.healthcheck.interval, '30s');
  assert.deepEqual(service.command, ['node', 'index.js']);
  assert.deepEqual(service.healthcheck.test, ['CMD', 'wget', 'http://localhost:4999/api/health?new']);
  assert.equal(combined.services.cache.image, 'redis:7');
  assert.equal(combined.networks.default.name, 'upstream-network');
});

test('upgrading a previously packaged directory removes both legacy Compose files and preserves deployment data', async t => {
  const root = await fixture(t);
  await runPackage(root);
  const output = path.join(root, 'deploy/app');
  await write(output, 'compose.yaml', 'legacy base');
  await write(output, 'compose.override.yaml', 'legacy override');
  await write(output, '.env', 'SESSION_SECRET=keep-this');
  await write(output, 'portracker-data/portracker.db', 'keep-data');
  const marker = path.join(output, '.portracker-package.json');
  const manifest = JSON.parse(await fs.readFile(marker, 'utf8'));
  manifest.files = [...new Set([...manifest.files, 'compose.yaml', 'compose.override.yaml'])];
  await fs.writeFile(marker, JSON.stringify(manifest));
  await runPackage(root);
  await fs.access(path.join(output, 'docker-compose.yaml'));
  await absent(path.join(output, 'compose.yaml'));
  await absent(path.join(output, 'compose.override.yaml'));
  assert.equal(await fs.readFile(path.join(output, '.env'), 'utf8'), 'SESSION_SECRET=keep-this');
  assert.equal(await fs.readFile(path.join(output, 'portracker-data/portracker.db'), 'utf8'), 'keep-data');
});

test('unsupported sequence overrides fail before packaging instead of silently changing Compose merge semantics', async t => {
  const root = await fixture(t);
  await write(root, 'compose.cn.yaml', 'services:\n  portracker:\n    volumes:\n      - ./other-data:/data\n');
  await assert.rejects(runPackage(root), /volumes.*合并/);
  await absent(path.join(root, 'deploy/app'));
});
