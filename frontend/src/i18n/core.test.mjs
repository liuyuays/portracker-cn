import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalization, resolveLanguage, bindLocaleEnvironment, mergeCatalogs } from './core.js';

function storage(value) {
  return { value, getItem() { return this.value; }, setItem(key, next) { this.key = key; this.value = next; } };
}

test('saved language overrides the browser; unsupported preferences fall back safely', () => {
  assert.equal(resolveLanguage({ storage: storage('en'), languages: ['zh-CN'] }), 'en');
  assert.equal(resolveLanguage({ storage: storage('zh-CN'), languages: ['en-US'] }), 'zh-CN');
  assert.equal(resolveLanguage({ storage: storage('invalid'), languages: ['fr', 'zh-TW'] }), 'zh-CN');
  assert.equal(resolveLanguage({ storage: storage(null), languages: ['de-DE'] }), 'en');
});

test('disabled browser storage does not block locale detection', () => {
  assert.equal(resolveLanguage({ storage: { getItem() { throw Error('blocked'); } }, languages: ['zh'] }), 'zh-CN');
});

test('source keys preserve English fallback, punctuation, and dynamic values', async () => {
  const instance = createLocalization({ language: 'zh-CN', catalogs: [{ 'Ports: {{count}}': '端口：{{count}}', 'Settings': '设置' }] });
  assert.equal(instance.t('Ports: {{count}}', { count: 12 }), '端口：12');
  assert.equal(instance.t('New upstream label.'), 'New upstream label.');
  await instance.changeLanguage('en');
  assert.equal(instance.t('Ports: {{count}}', { count: 12 }), 'Ports: 12');
});

test('language changes persist, update HTML lang, and follow other tabs', async () => {
  const instance = createLocalization({ catalogs: [{ Settings: '设置' }] });
  const saved = storage(null);
  const doc = { documentElement: { lang: '' } };
  const target = new EventTarget();
  const cleanup = bindLocaleEnvironment(instance, { storage: saved, document: doc, eventTarget: target, languages: ['en'] });
  await instance.changeLanguage('zh-CN');
  assert.equal(saved.value, 'zh-CN');
  assert.equal(saved.key, 'portracker.language');
  assert.equal(doc.documentElement.lang, 'zh-CN');
  const event = new Event('storage');
  Object.assign(event, { key: 'portracker.language', newValue: 'en' });
  target.dispatchEvent(event);
  assert.equal(instance.resolvedLanguage, 'en');
  assert.equal(doc.documentElement.lang, 'en');
  cleanup();
});

test('language switching still works if saving is denied', async () => {
  const instance = createLocalization({ catalogs: [{ Settings: '设置' }] });
  const cleanup = bindLocaleEnvironment(instance, { storage: { setItem() { throw Error('blocked'); } } });
  await instance.changeLanguage('zh-CN');
  assert.equal(instance.t('Settings'), '设置');
  cleanup();
});

test('catalog merging rejects conflicting translations and interpolation changes', () => {
  assert.throws(() => mergeCatalogs([{ Save: '保存' }, { Save: '储存' }]), /Conflicting translation/);
  assert.throws(() => mergeCatalogs([{ 'Hello {{name}}': '你好' }]), /Interpolation mismatch/);
  assert.deepEqual(mergeCatalogs([{ Save: '保存' }, { Save: '保存' }]), { Save: '保存' });
});

test('queued cross-tab choices converge without writing storage events back', async () => {
  let value = 'en';
  let writes = 0;
  const queue = [];
  const targets = [new EventTarget(), new EventTarget()];
  const instances = targets.map(() => createLocalization({ catalogs: [{ Settings: '设置' }] }));
  const cleanups = instances.map((instance, index) => bindLocaleEnvironment(instance, {
    eventTarget: targets[index],
    storage: {
      getItem: () => value,
      setItem(key, next) {
        if (next === value) return;
        value = next;
        writes++;
        queue.push({ target: targets[1 - index], key, newValue: next });
      },
    },
  }));
  await instances[0].changeLanguage('zh-CN');
  await instances[0].changeLanguage('en');
  for (let turn = 0; queue.length && turn < 20; turn++) {
    const { target, ...payload } = queue.shift();
    target.dispatchEvent(Object.assign(new Event('storage'), payload));
    await Promise.resolve();
  }
  cleanups.forEach(cleanup => cleanup());
  assert.equal(queue.length, 0);
  assert.equal(writes, 2);
  assert.equal(value, 'en');
  assert(instances.every(instance => instance.language === 'en'));
});
