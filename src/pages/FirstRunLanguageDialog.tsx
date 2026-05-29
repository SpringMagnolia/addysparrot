import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_DICTIONARY_TARGET_LANGUAGE,
  DICTIONARY_TARGET_LANGUAGES,
  normalizeDictionaryTargetLanguage,
} from '../lib/dictionary';
import {
  INTERFACE_LANGUAGES,
  LANGUAGE_SETUP_COMPLETED_SETTING_ID,
  createTranslator,
  detectSystemLanguage,
  normalizeInterfaceLanguage,
} from '../lib/i18n';
import { useI18n } from '../lib/i18n/context';
import { getAppSetting, saveAppSetting } from '../lib/storage';

const DICTIONARY_TARGET_LANGUAGE_SETTING_ID = 'dictionaryTargetLanguage';

export function FirstRunLanguageDialog() {
  const { language, setLanguage, t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedInterfaceLanguage, setSelectedInterfaceLanguage] = useState(language);
  const [targetLanguage, setTargetLanguage] = useState(() => normalizeDictionaryTargetLanguage(detectSystemLanguage()));
  const [error, setError] = useState<string | null>(null);
  const previewT = createTranslator(selectedInterfaceLanguage);

  useEffect(() => {
    setSelectedInterfaceLanguage(language);
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialState() {
      try {
        const [completed, savedTarget] = await Promise.all([
          getAppSetting<boolean>(LANGUAGE_SETUP_COMPLETED_SETTING_ID),
          getAppSetting<string>(DICTIONARY_TARGET_LANGUAGE_SETTING_ID),
        ]);
        if (cancelled) return;
        setTargetLanguage(savedTarget ? normalizeDictionaryTargetLanguage(savedTarget) : normalizeDictionaryTargetLanguage(detectSystemLanguage()));
        setVisible(completed !== true);
      } catch {
        if (!cancelled) setVisible(true);
      }
    }

    loadInitialState();
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePreferences() {
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        setLanguage(selectedInterfaceLanguage),
        saveAppSetting(DICTIONARY_TARGET_LANGUAGE_SETTING_ID, targetLanguage),
        saveAppSetting(LANGUAGE_SETUP_COMPLETED_SETTING_ID, true),
      ]);
      setVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('dictionarySettingsSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="language-dialog" role="dialog" aria-modal="true" aria-labelledby="language-dialog-title">
        <p className="bootstrap-kicker">{previewT('appReady')}</p>
        <h1 id="language-dialog-title">{previewT('appReadyTitle')}</h1>
        <p className="muted">{previewT('appReadyCopy')}</p>
        <label className="settings-select-row">
          <span>{previewT('interfaceLanguage')}</span>
          <select
            value={selectedInterfaceLanguage}
            onChange={(event) => setSelectedInterfaceLanguage(normalizeInterfaceLanguage(event.currentTarget.value))}
          >
            {INTERFACE_LANGUAGES.map((option) => (
              <option value={option.code} key={option.code}>
                {option.flag} {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-select-row">
          <span>{previewT('dictionaryLanguage')}</span>
          <select
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(normalizeDictionaryTargetLanguage(event.currentTarget.value))}
          >
            {DICTIONARY_TARGET_LANGUAGES.map((option) => (
              <option value={option.code} key={option.code}>
                {option.flag} {option.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="language-dialog-actions">
          <button className="primary-button" type="button" onClick={savePreferences} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            {previewT('savePreferences')}
          </button>
        </div>
      </section>
    </div>
  );
}
