import { initReactI18next } from 'react-i18next';
import { bindLocaleEnvironment, createLocalization, resolveLanguage } from './core.js';
import app from './locales/zh-CN/app.json' with { type: 'json' };
import shared from './locales/zh-CN/shared.json' with { type: 'json' };
import authSettings from './locales/zh-CN/auth-settings.json' with { type: 'json' };
import layoutBatch from './locales/zh-CN/layout-batch.json' with { type: 'json' };
import servicePort from './locales/zh-CN/service-port.json' with { type: 'json' };

import changelog from './locales/zh-CN/changelog.json' with { type: 'json' };

let storage;
try { if (globalThis.window) storage = globalThis.localStorage; } catch { void 0; }
const languages = globalThis.window
  ? globalThis.navigator?.languages || [globalThis.navigator?.language].filter(Boolean)
  : [];
const i18n = createLocalization({
  language: resolveLanguage({ storage, languages }),
  catalogs: [app, shared, authSettings, layoutBatch, servicePort, changelog],
  plugins: [initReactI18next],
});
bindLocaleEnvironment(i18n, { storage, languages, document: globalThis.document, eventTarget: globalThis.window });

export const t = (...args) => i18n.t(...args);
export default i18n;
