import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repository = fileURLToPath(new URL('../', import.meta.url));
const markerName = '.portracker-package.json';
const packageType = 'portracker-docker-source-package';
const rootSources = new Map([
  ['Dockerfile', 'Dockerfile'],
  ['.dockerignore', '.dockerignore'],
  ['package.json', 'package.json'],
  ['CHANGELOG.md', 'CHANGELOG.md'],
  ['LICENSE', 'LICENSE'],
]);
const managedRootFiles = new Set([...rootSources.values(), 'docker-compose.yaml', 'compose.yaml', 'compose.override.yaml', 'README.md', '.env.example']);
const omittedDirectories = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.github', '.idea', '.vscode', '.cache', '.tmp', 'portracker-data', 'test-results', '__tests__']);
const requiredInputs = ['backend/package.json', 'backend/package-lock.json', 'backend/index.js', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html'];

function excluded(name) {
  if (/^backend\/(?:data|logs)(?:\/|$)/.test(name)) return true;
  return name.split('/').some(part => omittedDirectories.has(part)
    || /^(?:\.env(?:\.|$)|\.secrets|credentials)/i.test(part)
    || /(?:\.(?:db(?:-shm|-wal|-journal)?|sqlite\w*(?:-shm|-wal|-journal)?|pem|key|log|bak|tmp|tar)|\.(?:test|spec)\.[cm]?[jt]sx?)$/i.test(part)
    || ['.DS_Store', 'Thumbs.db'].includes(part));
}

function managed(name) {
  return typeof name === 'string' && !name.includes('\\')
    && name.split('/').every(part => part && part !== '.' && part !== '..')
    && (managedRootFiles.has(name) || /^(?:frontend|backend)\//.test(name) && !excluded(name));
}

async function maybeStat(target) {
  try { return await fs.lstat(target); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function safePath(boundary, target) {
  const relative = path.relative(boundary, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('打包路径超出允许目录：' + target);
  }
  let current = boundary;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await maybeStat(current);
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error('打包路径不能包含符号链接：' + current);
  }
}

async function sourceFile(projectRoot, name) {
  const target = path.join(projectRoot, name);
  await safePath(projectRoot, target);
  const info = await maybeStat(target);
  if (!info?.isFile()) throw new Error('缺少构建所需文件：' + name);
  return fs.readFile(target);
}

async function collectDirectory(projectRoot, name, files) {
  if (excluded(name)) return;
  const target = path.join(projectRoot, name);
  const info = await fs.lstat(target);
  if (info.isSymbolicLink()) throw new Error('源码不能包含符号链接：' + name);
  if (info.isDirectory()) {
    for (const child of (await fs.readdir(target)).sort()) {
      await collectDirectory(projectRoot, name + '/' + child, files);
    }
  } else if (info.isFile()) {
    files.set(name, await fs.readFile(target));
  } else {
    throw new Error('不支持的源码文件类型：' + name);
  }
}

function mapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function environmentMap(value) {
  if (value == null) return {};
  if (mapping(value)) return value;
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
    throw new Error('Compose environment 必须为映射或字符串列表。');
  }
  return Object.fromEntries(value.map(entry => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [entry, null] : [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

function mergeComposeValue(base, override, location = []) {
  const serviceField = location.length === 3 && location[0] === 'services';
  if (serviceField && location[2] === 'environment') {
    base = environmentMap(base);
    override = environmentMap(override);
  }
  if (serviceField && location[2] === 'build' && typeof base === 'string' && mapping(override)) {
    base = { context: base };
  }
  const replaceCommand = serviceField && ['command', 'entrypoint'].includes(location[2])
    || location.length === 4 && location[0] === 'services' && location[2] === 'healthcheck' && location[3] === 'test';
  if (replaceCommand) return override;
  if (base != null && (Array.isArray(base) || Array.isArray(override))) {
    throw new Error(location.join('.') + ' 的列表合并暂不支持；请在基础 docker-compose.yml 中调整该项后重新打包。');
  }
  if (!mapping(override)) return override;
  const result = { ...(mapping(base) ? base : {}) };
  for (const [key, value] of Object.entries(override)) {
    Object.defineProperty(result, key, {
      value: mergeComposeValue(Object.hasOwn(result, key) ? result[key] : undefined, value, [...location, key]),
      enumerable: true, configurable: true, writable: true,
    });
  }
  return result;
}

const sourceDataDirectory = './portracker-data';
const deployedDataDirectory = '../portracker-data';

function moveDataDirectory(volume) {
  if (typeof volume === 'string') {
    return volume === sourceDataDirectory || volume.startsWith(sourceDataDirectory + ':')
      ? deployedDataDirectory + volume.slice(sourceDataDirectory.length)
      : volume;
  }
  if (mapping(volume) && volume.source === sourceDataDirectory) return { ...volume, source: deployedDataDirectory };
  return volume;
}

function relocateDataVolumes(config) {
  for (const service of Object.values(config.services)) {
    if (mapping(service) && Array.isArray(service.volumes)) service.volumes = service.volumes.map(moveDataDirectory);
  }
  return config;
}

async function deploymentCompose(projectRoot) {
  const configurations = [];
  for (const name of ['docker-compose.yml', 'compose.cn.yaml']) {
    const source = await sourceFile(projectRoot, name);
    const config = yaml.safeLoad(source.toString('utf8'), { filename: name });
    if (!mapping(config) || !mapping(config.services)) throw new Error(name + ' 缺少有效的 services 配置。');
    configurations.push(config);
  }
  const merged = relocateDataVolumes(mergeComposeValue(configurations[0], configurations[1]));
  return Buffer.from('# 由 npm run package:docker 合并生成；在本目录执行 docker compose up -d --build。\n'
    + yaml.safeDump(merged, { lineWidth: -1, noRefs: true }));
}

function deploymentReadme(version) {
  return [
    '# portracker-cn Docker 部署包', '',
    '应用版本：' + version, '',
    '本目录包含当前汉化源码和 Docker 构建配置。复制整个目录到 Docker 主机后，在该目录执行：', '',
    '~~~sh', 'docker compose config --quiet', 'docker compose up -d --build', '~~~', '',
    '本目录只需 docker-compose.yaml 一个 Compose 配置文件，构建本地镜像 portracker-cn:local。首次构建需要联网下载基础镜像、系统软件包和 npm 依赖。', '',
    '从旧版双文件部署包更新时，如果服务器目录仍留有 compose.yaml 或 compose.override.yaml，请显式执行 docker compose -f docker-compose.yaml up -d --build，避免自动选中旧配置。', '',
    '浏览器访问 http://服务器IP:4999，在右上角选择简体中文。默认关闭登录认证；需要登录保护时在 .env 中设置 ENABLE_AUTH=true，开启后首次访问创建管理员。', '',
    '如需配置，把 .env.example 复制为 .env；可设置 ENABLE_AUTH 和 SESSION_SECRET。Linux 上可以用 openssl rand -hex 32 生成随机密钥。未提供密钥时由应用随机生成；重启应用后需要重新登录。', '',
    '~~~sh', 'docker compose ps', 'docker compose logs --tail=100 -f portracker', '~~~', '',
    '数据保存在本目录上一级的 ../portracker-data/，替换或删除本目录不会影响数据。更新时保留 .env，替换打包文件后重新执行 docker compose up -d --build。从旧版部署包升级时，先停止服务，把本目录中的 portracker-data/ 移到上一级，再启动。对 SQLite 数据做文件备份前先停止服务。', '',
    '源码、Compose 配置、.env.example 和本说明由 npm run package:docker 生成，再次打包会覆盖。自定义设置优先放在 .env 中；配置文件的手工改动请另行保存。不要删除 .portracker-package.json，它记录命令管理的文件。', '',
    '打包在项目源码目录执行，本机不需要 Docker；镜像在部署主机上联网构建。', '',
  ].join('\n');
}

async function previousFiles(outputDirectory) {
  const info = await maybeStat(outputDirectory);
  if (!info) return [];
  if (!info.isDirectory()) throw new Error('部署输出路径不是目录：' + outputDirectory);
  const marker = path.join(outputDirectory, markerName);
  if (!await maybeStat(marker)) {
    if ((await fs.readdir(outputDirectory)).length) throw new Error('deploy/app 已有文件，且不是本命令生成的目录；请先保存并移走原有文件。');
    return [];
  }
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(marker, 'utf8')); } catch {
    throw new Error('部署文件清单损坏，请检查 ' + marker);
  }
  if (manifest.type !== packageType || manifest.schema !== 1 || !Array.isArray(manifest.files) || !manifest.files.every(managed)) {
    throw new Error('部署文件清单包含无效路径或格式：' + marker);
  }
  return manifest.files;
}

export async function packageDocker({ projectRoot = repository } = {}) {
  projectRoot = await fs.realpath(projectRoot);
  const files = new Map();
  for (const [source, destination] of rootSources) files.set(destination, await sourceFile(projectRoot, source));
  files.set('docker-compose.yaml', await deploymentCompose(projectRoot));
  for (const name of requiredInputs) await sourceFile(projectRoot, name);
  for (const name of ['backend', 'frontend']) await collectDirectory(projectRoot, name, files);
  const metadata = JSON.parse(files.get('package.json').toString('utf8'));
  files.set('README.md', Buffer.from(deploymentReadme(metadata.version)));
  files.set('.env.example', Buffer.from('# Set to true to require login.\nENABLE_AUTH=false\n\n# Optional: use openssl rand -hex 32 to generate a value.\n# SESSION_SECRET=\n'));

  const outputDirectory = path.join(projectRoot, 'deploy', 'app');
  await safePath(projectRoot, outputDirectory);
  const marker = path.join(outputDirectory, markerName);
  await safePath(projectRoot, marker);
  const previous = await previousFiles(outputDirectory);
  for (const name of new Set([...previous, ...files.keys()])) {
    if (!managed(name)) throw new Error('部署文件清单包含无效路径：' + name);
    const target = path.join(outputDirectory, name);
    await safePath(outputDirectory, target);
    const info = await maybeStat(target);
    if (info && !info.isFile()) throw new Error('部署文件路径被其他类型占用：' + target);
  }
  await fs.mkdir(outputDirectory, { recursive: true });
  for (const name of previous) {
    if (files.has(name)) continue;
    try { await fs.unlink(path.join(outputDirectory, name)); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const [name, content] of files) {
    const target = path.join(outputDirectory, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  const manifest = { schema: 1, type: packageType, version: metadata.version, files: [...files.keys()].sort() };
  await fs.writeFile(marker, JSON.stringify(manifest, null, 2) + '\n');
  return { outputDirectory, version: metadata.version, fileCount: files.size, totalBytes: [...files.values()].reduce((sum, content) => sum + content.length, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await packageDocker();
    process.stdout.write('Docker 部署包已生成：' + result.outputDirectory + '\n');
    process.stdout.write(result.fileCount + ' 个文件，' + (result.totalBytes / 1024 / 1024).toFixed(2) + ' MiB\n');
    process.stdout.write('复制 deploy/app 到服务器后，在该目录执行：docker compose up -d --build\n');
  } catch (error) {
    process.stderr.write('Docker 打包失败：' + error.message + '\n');
    process.exitCode = 1;
  }
}
