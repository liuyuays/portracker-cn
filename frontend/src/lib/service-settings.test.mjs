import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyServiceSettings, formatServiceName, serviceIdentityFor } from './service-settings.js';

test('compose services are identified by project name', () => {
  assert.equal(serviceIdentityFor({ source: 'docker', owner: 'immich-server-1', container_id: 'abc' }, 'immich'), 'compose:immich');
});

test('standalone containers are identified by container name, not id', () => {
  assert.equal(serviceIdentityFor({ source: 'docker', owner: 'redis', container_id: 'abc' }, null), 'container:redis');
});

test('containers without a name fall back to the container id', () => {
  assert.equal(serviceIdentityFor({ source: 'docker', owner: '', container_id: 'abc' }, null), 'container:abc');
});

test('system services are identified by process name', () => {
  assert.equal(serviceIdentityFor({ source: 'system', owner: 'sshd' }, null), 'process:sshd');
  assert.equal(serviceIdentityFor({ source: 'system' }, null), 'process:unknown');
});

test('alias is appended in ASCII parentheses', () => {
  assert.equal(formatServiceName('immich', '相册'), 'immich (相册)');
});

test('no alias leaves the name unchanged', () => {
  assert.equal(formatServiceName('immich', null), 'immich');
  assert.equal(formatServiceName('immich', '  '), 'immich');
});

test('settings attach aliases and split hidden services out', () => {
  const services = [
    { key: 'a', identity: 'compose:immich', name: 'immich' },
    { key: 'b', identity: 'process:sshd', name: 'sshd' },
    { key: 'c', identity: 'container:redis', name: 'redis' },
  ];
  const settings = [
    { service_key: 'compose:immich', alias: '相册', hidden: false },
    { service_key: 'process:sshd', alias: 'SSH', hidden: true },
  ];
  const { visible, hidden } = applyServiceSettings(services, settings);
  assert.deepEqual(visible.map((s) => [s.identity, s.alias]), [
    ['compose:immich', '相册'],
    ['container:redis', null],
  ]);
  assert.deepEqual(hidden.map((s) => [s.identity, s.alias]), [['process:sshd', 'SSH']]);
});

test('missing settings keep every service visible', () => {
  const services = [{ key: 'a', identity: 'process:x', name: 'x' }];
  const { visible, hidden } = applyServiceSettings(services, undefined);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].alias, null);
  assert.equal(hidden.length, 0);
});
