import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, RefreshCcw } from 'lucide-react';
import {
  isBootstrapRuntime,
  onBootstrapProgress,
  readBootstrapLog,
  readBootstrapState,
  runBootstrap,
} from '../bootstrap/bootstrapManager';
import type { BootstrapProgressEvent } from '../bootstrap/downloader';
import type { BootstrapState } from '../bootstrap/state';
import { createTranslator, detectSystemLanguage } from '../lib/i18n';

const t = createTranslator(detectSystemLanguage());
const APP_ICON_URL = '/app-icon.png';

const INSTALL_STEPS = [
  'manifest',
  'preflight',
  'uv',
  'python',
  'pythonPackages',
  'ffmpeg',
  'models',
  'verification',
  'completed',
];

const STEP_MESSAGES: Record<string, string> = {
  manifest: t('bootstrapMessageManifest'),
  preflight: t('bootstrapMessagePreflight'),
  uv: t('bootstrapMessageUv'),
  python: t('bootstrapMessagePython'),
  pythonPackages: t('bootstrapMessagePythonPackages'),
  ffmpeg: t('bootstrapMessageFfmpeg'),
  models: t('bootstrapMessageModels'),
  verification: t('bootstrapMessageVerification'),
  completed: t('bootstrapMessageCompleted'),
};

interface BootstrapGateProps {
  children: ReactNode;
}

export function BootstrapGate({ children }: BootstrapGateProps) {
  const [enabled] = useState(() => isBootstrapRuntime());
  const [state, setState] = useState<BootstrapState | null>(null);
  const [message, setMessage] = useState(t('bootstrapStatusChecking'));
  const [error, setError] = useState<string | null>(null);
  const [logText, setLogText] = useState(t('bootstrapInitialLog'));
  const [running, setRunning] = useState(false);
  const [logSessionReady, setLogSessionReady] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);
  const logUpdatedAtRef = useRef<number | null>(null);

  const totalProgress = useMemo(() => {
    const step = state?.step ?? 'manifest';
    const index = Math.max(0, INSTALL_STEPS.indexOf(step));
    return Math.round((index / (INSTALL_STEPS.length - 1)) * 100);
  }, [state?.step]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function boot() {
      unlisten = await onBootstrapProgress((event) => {
        if (cancelled) return;
        handleProgress(event);
      });
      const current = await readBootstrapState();
      if (cancelled) return;
      setState(current);
      if (current.status === 'completed') return;
      await startInstall();
    }

    boot().catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !logSessionReady) return;
    let cancelled = false;

    async function refreshLog() {
      try {
        const snapshot = await readBootstrapLog();
        if (cancelled) return;
        if (logUpdatedAtRef.current === snapshot.updatedAt) return;
        logUpdatedAtRef.current = snapshot.updatedAt;
        setLogText(snapshot.text.trimEnd() || t('bootstrapLogWaiting'));
      } catch {
        if (!cancelled) setLogText(t('bootstrapLogReadFailed'));
      }
    }

    const initialTimer = window.setTimeout(refreshLog, 250);
    const timer = window.setInterval(refreshLog, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [enabled, logSessionReady]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logText]);

  async function startInstall() {
    setRunning(true);
    setError(null);
    setLogSessionReady(false);
    setLogText(t('bootstrapInitialLog'));
    logUpdatedAtRef.current = null;
    try {
      const next = await runBootstrap();
      setState(next);
      setMessage(STEP_MESSAGES.completed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState((current) =>
        current
          ? { ...current, status: 'failed', error: cause instanceof Error ? cause.message : String(cause) }
          : current,
      );
    } finally {
      setRunning(false);
    }
  }

  function handleProgress(event: BootstrapProgressEvent) {
    if (event.type === 'step') {
      setLogSessionReady(true);
      setState((current) =>
        current
          ? { ...current, step: event.step, status: event.step === 'verification' ? 'verifying' : current.status }
          : current,
      );
      setMessage(STEP_MESSAGES[event.step] ?? event.message);
    }
    if (event.type === 'download-progress') {
      setMessage(t('bootstrapMessageUv'));
    }
    if (event.type === 'install-progress') {
      setMessage(STEP_MESSAGES[event.id] ?? event.message);
    }
    if (event.type === 'error') {
      setLogSessionReady(true);
      setError(event.error);
      setMessage(t('bootstrapFailed'));
    }
    if (event.type === 'done') {
      setLogSessionReady(true);
      setState((current) =>
        current
          ? { ...current, status: 'completed', step: 'completed', error: null }
          : {
              status: 'completed',
              step: 'completed',
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              installedManifestVersion: 1,
              error: null,
            },
      );
      setMessage(STEP_MESSAGES.completed);
    }
  }

  if (!enabled || state?.status === 'completed') {
    return <>{children}</>;
  }

  if (state === null) {
    return (
      <main className="bootstrap-screen">
        <section className="bootstrap-panel">
          <div className="bootstrap-icon" aria-hidden="true">
            <Loader2 size={30} className="spin" />
          </div>
          <div className="bootstrap-hero">
            <div>
              <p className="bootstrap-kicker">{t('bootstrapKicker')}</p>
              <h1>{t('bootstrapTitle')}</h1>
            </div>
            <img className="bootstrap-app-icon" src={APP_ICON_URL} alt="Addy's Parrot" />
          </div>
          <span>{t('bootstrapStatusChecking')}</span>
        </section>
      </main>
    );
  }

  return (
    <main className="bootstrap-screen">
      <section className="bootstrap-panel">
        <div className="bootstrap-icon" aria-hidden="true">
          {error ? <RefreshCcw size={30} /> : running ? <Loader2 size={30} className="spin" /> : <Check size={30} />}
        </div>
        <div className="bootstrap-hero">
          <div>
            <p className="bootstrap-kicker">{t('bootstrapKicker')}</p>
            <h1>{t('bootstrapTitle')}</h1>
          </div>
          <img className="bootstrap-app-icon" src={APP_ICON_URL} alt="Addy's Parrot" />
        </div>
        <p className="bootstrap-copy">
          <span>{t('bootstrapCopy1')}</span>
          <span>{t('bootstrapCopy2')}</span>
        </p>

        <div className="bootstrap-log" aria-label={t('bootstrapLogLabel')}>
          <div className="bootstrap-log-header">
            <span>{t('bootstrapLogLabel')}</span>
          </div>
          <pre ref={logRef}>{logText}</pre>
        </div>

        <div className="bootstrap-progress" aria-label={t('bootstrapProgressLabel')}>
          <div className="bootstrap-progress-bar" style={{ width: `${totalProgress}%` }} />
        </div>
        <div className="bootstrap-status-row">
          <span>{message}</span>
          <strong>{totalProgress}%</strong>
        </div>

        {error && <p className="bootstrap-error">{error}</p>}

        <div className="bootstrap-actions">
          <button type="button" onClick={startInstall} disabled={running}>
            <RefreshCcw size={18} />
            {t('bootstrapActionRetry')}
          </button>
        </div>
      </section>
    </main>
  );
}
