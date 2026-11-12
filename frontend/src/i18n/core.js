import { createInstance } from 'i18next';

export const LANGUAGE_STORAGE_KEY = 'portracker.language';
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN'];

function supportedLanguage(value) {
  if (typeof value !== 'string') return null;
  if (/^zh(?:-|$)/i.test(value)) return 'zh-CN';
  if (/^en(?:-|$)/i.test(value)) return 'en';
  return null;
}

export function resolveLanguage({ storage, languages = [] } = {}) {
  try {
    const saved = supportedLanguage(storage?.getItem(LANGUAGE_STORAGE_KEY));
    if (saved) return saved;
  } catch { void 0; }
  for (const language of languages) {
    const supported = supportedLanguage(language);
    if (supported) return supported;
  }
  return 'en';
}

function variables(text) {
  return [...new Set(Array.from(text.matchAll(/{{\s*([^},]+)(?:,[^}]+)?\s*}}/g), match => match[1].trim()))].sort().join(',');
}

export function mergeCatalogs(catalogs) {
  const merged = {};
  for (const catalog of catalogs) {
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Empty translation: ' + key);
      if (variables(key) !== variables(value)) throw new Error('Interpolation mismatch: ' + key);
      if (Object.hasOwn(merged, key) && merged[key] !== value) throw new Error('Conflicting translation: ' + key);
      merged[key] = value;
    }
  }
  return merged;
}

export function createLocalization({ language = 'en', catalogs = [], plugins = [] } = {}) {
  const chinese = mergeCatalogs(catalogs);
  const english = Object.fromEntries(Object.keys(chinese).map(key => [key, key]));
  const instance = createInstance();
  plugins.forEach(plugin => instance.use(plugin));
  instance.init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    load: 'currentOnly',
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    initAsync: false,
    resources: { en: { translation: english }, 'zh-CN': { translation: chinese } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

export function bindLocaleEnvironment(instance, { storage, document, eventTarget, languages = [] } = {}) {
  let storageUpdates = 0;
  const updateDocument = () => {
    if (document?.documentElement) document.documentElement.lang = instance.resolvedLanguage || instance.language;
  };
  const onLanguageChanged = language => {
    updateDocument();
    if (storageUpdates > 0) return;
    try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { void 0; }
  };
  const onStorage = async event => {
    if (event.key !== LANGUAGE_STORAGE_KEY) return;
    const language = event.newValue === null ? resolveLanguage({ languages }) : supportedLanguage(event.newValue);
    if (!language || language === instance.language) return;
    storageUpdates++;
    try { await instance.changeLanguage(language); } finally { storageUpdates--; }
  };
  updateDocument();
  instance.on('languageChanged', onLanguageChanged);
  eventTarget?.addEventListener('storage', onStorage);
  return () => {
    instance.off('languageChanged', onLanguageChanged);
    eventTarget?.removeEventListener('storage', onStorage);
  };
}
