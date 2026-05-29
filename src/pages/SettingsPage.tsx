import {
  ArrowLeft,
  Bug,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCcw,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_DICTIONARY_TARGET_LANGUAGE,
  DICTIONARY_TARGET_LANGUAGES,
  normalizeDictionaryTargetLanguage,
} from '../lib/dictionary';
import {
  INTERFACE_LANGUAGES,
  normalizeInterfaceLanguage,
} from '../lib/i18n';
import { useI18n } from '../lib/i18n/context';
import type { Translator } from '../lib/i18n/context';
import { platformBridge, type RuntimeDiagnostics } from '../lib/platformBridge';
import { getAppSetting, listFavoriteSentences, listFavoriteWords, listReviewCards, listReviewLogs, listReviewProgress, listVideos, saveAppSetting, syncLocalStorageToBackend } from '../lib/storage';
import { formatBackupResultMessage, formatClearDataResultMessage, formatFileSize } from '../lib/formatUtils';
import { navigate } from '../lib/router';

const DICTIONARY_TARGET_LANGUAGE_SETTING_ID = 'dictionaryTargetLanguage';

type SyncDataSummaryItem = {
  label: string;
  count: number;
  bytes: number;
};

type RuntimeFileStatus = RuntimeDiagnostics['python'];

async function loadDictionaryTargetLanguageSetting(): Promise<string> {
  try {
    const saved = await getAppSetting<string>(DICTIONARY_TARGET_LANGUAGE_SETTING_ID);
    const { detectSystemLanguage } = await import('../lib/i18n');
    return saved ? normalizeDictionaryTargetLanguage(saved) : detectSystemLanguage();
  } catch {
    const { detectSystemLanguage } = await import('../lib/i18n');
    return detectSystemLanguage() || DEFAULT_DICTIONARY_TARGET_LANGUAGE;
  }
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function createSyncDataSummary(t: Translator): Promise<SyncDataSummaryItem[]> {
  const [videos, reviewCards, reviewLogs, reviewProgress, favoriteSentences, favoriteWords] = await Promise.all([
    listVideos(),
    listReviewCards(),
    listReviewLogs(),
    listReviewProgress(),
    listFavoriteSentences(),
    listFavoriteWords(),
  ]);

  return [
    {
      label: t('syncVideos'),
      count: videos.length,
      bytes: byteSize(videos) + videos.reduce((total, video) => total + Math.max(0, video.fileSize ?? 0), 0),
    },
    {
      label: t('reviewProgress'),
      count: reviewCards.length + reviewLogs.length + reviewProgress.length,
      bytes: byteSize(reviewCards) + byteSize(reviewLogs) + byteSize(reviewProgress),
    },
    {
      label: t('favoriteSentences'),
      count: favoriteSentences.length,
      bytes: byteSize(favoriteSentences),
    },
    {
      label: t('favoriteWords'),
      count: favoriteWords.length,
      bytes: byteSize(favoriteWords),
    },
  ];
}

function renderDiagnosticItem(label: string, item: RuntimeFileStatus, t: Translator) {
  return (
    <div className="diagnostic-item" key={label}>
      <span>{label}</span>
      <strong>{item.exists ? t('available') : t('missing')}</strong>
      <code>{item.path}</code>
    </div>
  );
}

export function SettingsPage() {
  const { language: interfaceLanguage, setLanguage: saveInterfaceLanguage, t } = useI18n();
  const [pairingUrl, setPairingUrl] = useState('');
  const [syncSummary, setSyncSummary] = useState<SyncDataSummaryItem[]>([]);
  const [dictionaryTargetLanguage, setDictionaryTargetLanguage] = useState(DEFAULT_DICTIONARY_TARGET_LANGUAGE);
  const [dictionarySettingsError, setDictionarySettingsError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState<'video' | 'learning' | null>(null);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [loadingPairing, setLoadingPairing] = useState(true);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [runtimeClearMessage, setRuntimeClearMessage] = useState<string | null>(null);
  const showDebugPanel = __DEBUG_FEATURES__;

  const refreshPairing = useCallback(async (options: { restart?: boolean } = {}) => {
    setLoadingPairing(true);
    setPairingError(null);
    try {
      await syncLocalStorageToBackend();
      const [summary, payload] = await Promise.all([
        createSyncDataSummary(t),
        options.restart ? platformBridge.sync.restartPairingInfo() : platformBridge.sync.getPairingInfo(),
      ]);
      const deepLink = `addysparrot://pair?baseUrl=${encodeURIComponent(payload.baseUrl)}`;
      setSyncSummary(summary);
      setPairingUrl(await QRCode.toDataURL(deepLink, { margin: 2, width: 260 }));
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : t('pairingFailed'));
    } finally {
      setLoadingPairing(false);
    }
  }, [t]);

  useEffect(() => {
    if (!__DEBUG_FEATURES__) return;
    refreshPairing();
  }, [refreshPairing]);

  useEffect(() => {
    let cancelled = false;
    loadDictionaryTargetLanguageSetting().then((dictLang) => {
      if (!cancelled) {
        setDictionaryTargetLanguage(dictLang);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    if (!platformBridge.isDesktop()) {
      setDiagnostics(null);
      return;
    }
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      setDiagnostics(await platformBridge.settings.runtimeDiagnostics());
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!__DEBUG_FEATURES__) return;
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  const runDebugAction = useCallback(async (action: () => Promise<void>) => {
    setDiagnosticsError(null);
    setRuntimeClearMessage(null);
    try {
      await action();
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const runBackupAction = useCallback(async (kind: 'export' | 'import') => {
    if (!platformBridge.isElectron()) return;
    setBackupBusy(kind);
    setBackupMessage(null);
    setBackupError(null);
    setClearMessage(null);
    setClearError(null);
    try {
      const result = kind === 'export'
        ? await platformBridge.settings.exportUserBackup()
        : await platformBridge.settings.importUserBackup();
      if (result.cancelled) return;
      setBackupMessage(formatBackupResultMessage(kind, result, t));
      if (kind === 'import') {
        await refreshPairing();
      }
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : t(kind === 'export' ? 'backupExportFailed' : 'backupImportFailed'));
    } finally {
      setBackupBusy(null);
    }
  }, [refreshPairing, t]);

  const runClearDataAction = useCallback(async (kind: 'video' | 'learning') => {
    if (!platformBridge.isElectron()) return;
    const confirmKey = kind === 'video' ? 'clearVideoDataConfirm' : 'clearLearningDataConfirm';
    if (!window.confirm(t(confirmKey))) return;

    setClearBusy(kind);
    setClearMessage(null);
    setClearError(null);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const result = kind === 'video'
        ? await platformBridge.settings.clearVideoData()
        : await platformBridge.settings.clearLearningData();
      setClearMessage(formatClearDataResultMessage(kind, result, t));
      await refreshPairing();
    } catch (error) {
      setClearError(error instanceof Error ? error.message : t(kind === 'video' ? 'clearVideoDataFailed' : 'clearLearningDataFailed'));
    } finally {
      setClearBusy(null);
    }
  }, [refreshPairing, t]);

  return (
    <section className="page settings-page">
      <div className="page-heading">
        <div className="review-heading-stack">
          <div className="title-with-back">
            <button className="bare-icon-button title-back-button" title={t('settingsBackHome')} onClick={() => navigate({ name: 'home' })}>
              <ArrowLeft size={18} />
            </button>
            <h1>{t('settings')}</h1>
          </div>
        </div>
      </div>

      {__DEBUG_FEATURES__ && (
      <section className="settings-panel">
        <div className="settings-section-heading">
          <h2>{t('settingsMobileTitle')}</h2>
        </div>

        <div className="pairing-layout">
          <div className="pairing-qr">
            {loadingPairing ? (
              <Loader2 className="spin" size={24} />
            ) : pairingUrl ? (
              <img src={pairingUrl} alt={t('mobilePairingQrAlt')} />
            ) : (
              <Settings size={28} />
            )}
          </div>
          <div className="pairing-details">
            {pairingError ? (
              <p className="form-error">{pairingError}</p>
            ) : (
              <div className="sync-summary-grid" aria-label={t('mobilePairingSummaryLabel')}>
                {syncSummary.map((item) => (
                  <div className="sync-summary-item" key={item.label}>
                    <span>{item.label}</span>
                    <div className="sync-summary-value">
                      <strong>{item.count}</strong>
                      <small>{formatFileSize(item.bytes, t)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              className="secondary-button"
              type="button"
              onClick={() => refreshPairing({ restart: true })}
              disabled={loadingPairing}
            >
              {loadingPairing ? <Loader2 className="spin" size={17} /> : <RefreshCcw size={17} />}
              {t('pairingRegenerate')}
            </button>
          </div>
        </div>
      </section>
      )}

      <section className="settings-panel dictionary-settings-panel">
        <div className="settings-section-heading">
          <h2>{t('systemSettingsTitle')}</h2>
        </div>

        <label className="settings-select-row">
          <span>{t('interfaceLanguage')}</span>
          <select
            value={interfaceLanguage}
            onChange={(event) => {
              const nextLanguage = normalizeInterfaceLanguage(event.currentTarget.value);
              setDictionarySettingsError(null);
              void saveInterfaceLanguage(nextLanguage).catch((error) => {
                setDictionarySettingsError(error instanceof Error ? error.message : t('interfaceSettingsSaveFailed'));
              });
            }}
          >
            {INTERFACE_LANGUAGES.map((language) => (
              <option value={language.code} key={language.code}>
                {language.flag} {language.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-select-row">
          <span>{t('dictionaryLanguage')}</span>
          <select
            value={dictionaryTargetLanguage}
            onChange={(event) => {
              const nextLanguage = normalizeDictionaryTargetLanguage(event.currentTarget.value);
              setDictionaryTargetLanguage(nextLanguage);
              setDictionarySettingsError(null);
              void saveAppSetting(DICTIONARY_TARGET_LANGUAGE_SETTING_ID, nextLanguage).catch((error) => {
                setDictionarySettingsError(error instanceof Error ? error.message : t('dictionarySettingsSaveFailed'));
              });
            }}
          >
            {DICTIONARY_TARGET_LANGUAGES.map((language) => (
              <option value={language.code} key={language.code}>
                {language.flag} {language.label}
              </option>
            ))}
          </select>
        </label>
        {dictionarySettingsError && <p className="form-error">{dictionarySettingsError}</p>}
      </section>

      <section className="settings-panel data-cleanup-panel">
        <div className="settings-section-heading">
          <h2>{t('dataCleanupTitle')}</h2>
        </div>

        <div className="settings-action-row">
          <div>
            <span>{t('backupImportTitle')}</span>
          </div>
          <div className="settings-action-buttons">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void runBackupAction('export')}
              disabled={!platformBridge.isElectron() || backupBusy !== null || clearBusy !== null}
            >
              {backupBusy === 'export' ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
              {t('backupExport')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void runBackupAction('import')}
              disabled={!platformBridge.isElectron() || backupBusy !== null || clearBusy !== null}
            >
              {backupBusy === 'import' ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
              {t('backupImport')}
            </button>
          </div>
        </div>
        {backupError && <p className="form-error">{backupError}</p>}
        {backupMessage && <p className="inline-status success">{backupMessage}</p>}

        <div className="settings-action-row">
          <div>
            <span>{t('clearVideoDataTitle')}</span>
          </div>
          <div className="settings-action-buttons">
            <button
              className="secondary-button danger-action"
              type="button"
              onClick={() => void runClearDataAction('video')}
              disabled={!platformBridge.isElectron() || backupBusy !== null || clearBusy !== null}
            >
              {clearBusy === 'video' ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
              {t('clearVideoData')}
            </button>
          </div>
        </div>
        <div className="settings-action-row">
          <div>
            <span>{t('clearLearningDataTitle')}</span>
          </div>
          <div className="settings-action-buttons">
            <button
              className="secondary-button danger-action"
              type="button"
              onClick={() => void runClearDataAction('learning')}
              disabled={!platformBridge.isElectron() || backupBusy !== null || clearBusy !== null}
            >
              {clearBusy === 'learning' ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
              {t('clearLearningData')}
            </button>
          </div>
        </div>
        {clearError && <p className="form-error">{clearError}</p>}
        {clearMessage && <p className="inline-status success">{clearMessage}</p>}
      </section>

      {showDebugPanel && (
        <section className="settings-panel debug-panel">
          <div className="settings-section-heading">
            <h2>{t('debugPanelTitle')}</h2>
          </div>

          <div className="debug-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => runDebugAction(() => platformBridge.settings.openBootstrapLogs())}
              disabled={!platformBridge.isDesktop()}
            >
              <FileText size={17} />
              {t('debugBootstrapLogs')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => runDebugAction(() => platformBridge.settings.openBridgeLogs())}
              disabled={!platformBridge.isDesktop()}
            >
              <FileText size={17} />
              {t('debugBridgeLogs')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => runDebugAction(() => platformBridge.settings.openRuntimeLogsDir())}
              disabled={!platformBridge.isDesktop()}
            >
              <FolderOpen size={17} />
              {t('debugRuntimeLogs')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={refreshDiagnostics}
              disabled={!platformBridge.isDesktop() || diagnosticsLoading}
            >
              {diagnosticsLoading ? <Loader2 className="spin" size={17} /> : <Bug size={17} />}
              {t('debugDiagnosticsRefresh')}
            </button>
            <button
              className="secondary-button danger-action"
              type="button"
              onClick={() =>
                runDebugAction(async () => {
                  if (!window.confirm(t('clearRuntimeConfirm'))) return;
                  const result = await platformBridge.settings.clearBootstrapRuntime();
                  setRuntimeClearMessage(t('clearRuntimeDone', { bytes: formatFileSize(result.deletedBytes, t) }));
                  await refreshDiagnostics();
                })
              }
              disabled={!platformBridge.isDesktop()}
            >
              <Trash2 size={17} />
              {t('debugRuntimeDelete')}
            </button>
          </div>

          {diagnosticsError && <p className="form-error">{diagnosticsError}</p>}
          {runtimeClearMessage && <p className="inline-status success">{runtimeClearMessage}</p>}
          {!platformBridge.isDesktop() && <p className="muted">{t('debugUnavailable')}</p>}
          {diagnostics && (
            <div className="diagnostics-grid">
              {renderDiagnosticItem('Python', diagnostics.python, t)}
              {renderDiagnosticItem('uv', diagnostics.uv, t)}
              {renderDiagnosticItem('ffmpeg', diagnostics.ffmpeg, t)}
              {renderDiagnosticItem('yt-dlp', diagnostics.ytDlp, t)}
              <div className="diagnostic-item diagnostic-item-wide">
                <span>AppData</span>
                <code>{diagnostics.appData}</code>
              </div>
              <div className="diagnostic-item diagnostic-item-wide">
                <span>PATH</span>
                <code>{diagnostics.path}</code>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
