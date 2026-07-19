'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isAndroid() {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    return true;
  } catch (err) {
    console.warn('[PWA] service worker registration failed', err);
    return false;
  }
}

export default function PwaRegister() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [standalone, setStandalone] = useState(true);
  const [swReady, setSwReady] = useState(false);
  const installEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const openedOnceRef = useRef(false);
  const ios = isIos();
  const android = isAndroid();

  useEffect(() => {
    const installed = isStandalone();
    setStandalone(installed);
    setReady(true);
    if (installed) return;

    registerServiceWorker().then((ok) => setSwReady(ok));

    const onBip = (e: Event) => {
      e.preventDefault();
      installEventRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
      setInstallError('');
      if (!openedOnceRef.current) {
        openedOnceRef.current = true;
        setOpen(true);
      }
    };
    window.addEventListener('beforeinstallprompt', onBip);

    const onInstalled = () => {
      installEventRef.current = null;
      setCanInstall(false);
      setStandalone(true);
      setOpen(false);
      setInstallError('');
    };
    window.addEventListener('appinstalled', onInstalled);

    // Show install help after user has been on the page (Chrome needs engagement)
    const t = window.setTimeout(() => {
      if (!openedOnceRef.current && !installEventRef.current) {
        openedOnceRef.current = true;
        setOpen(true);
      }
    }, 4000);

    const onDisplayChange = () => {
      if (isStandalone()) {
        setStandalone(true);
        setOpen(false);
      }
    };
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onDisplayChange);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onDisplayChange);
    };
  }, []);

  const dismiss = () => setOpen(false);

  const install = useCallback(async () => {
    const installEvent = installEventRef.current;
    if (!installEvent) return;

    setInstalling(true);
    setInstallError('');
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setOpen(false);
      } else {
        setInstallError('Install cancelled. Use the browser menu to install anytime.');
      }
      installEventRef.current = null;
      setCanInstall(false);
    } catch (err) {
      console.error('[PWA] install prompt failed', err);
      setInstallError('Use your browser menu → Install app.');
    } finally {
      setInstalling(false);
    }
  }, []);

  if (!ready || standalone) return null;

  const manualSteps = ios ? (
    <>
      <p className="pwa-install__hint">
        1. Tap <strong>Share</strong>{' '}
        <span className="material-icons-round pwa-install__inline-icon">ios_share</span>
      </p>
      <p className="pwa-install__hint">2. Tap <strong>Add to Home Screen</strong></p>
    </>
  ) : android ? (
    <>
      <p className="pwa-install__hint">
        1. Tap <strong>⋮</strong> menu (top right)
      </p>
      <p className="pwa-install__hint">2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong></p>
    </>
  ) : (
    <>
      <p className="pwa-install__hint">
        1. Click the <strong>install icon</strong> in the address bar (if shown)
      </p>
      <p className="pwa-install__hint">
        2. Or menu <span className="material-icons-round pwa-install__inline-icon">more_vert</span> →{' '}
        <strong>Install Moneybag</strong>
      </p>
    </>
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          className="pwa-install-fab"
          onClick={() => {
            setInstallError('');
            setOpen(true);
          }}
          aria-label="Install Moneybag"
        >
          <span className="material-icons-round">download</span>
          <span>Install</span>
        </button>
      )}

      {open && (
        <div className="pwa-install" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
          <button type="button" className="pwa-install__backdrop" onClick={dismiss} aria-label="Close" />
          <div className="pwa-install__sheet pwa-install__sheet--compact">
            <div className="pwa-install__handle" />

            <div className="pwa-install__row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/Money-bag-5.png" alt="" className="pwa-install__icon-sm" width={56} height={56} />
              <div className="pwa-install__copy">
                <h2 id="pwa-install-title" className="pwa-install__title pwa-install__title--sm">
                  Install Moneybag
                </h2>
                <p className="pwa-install__sub pwa-install__sub--sm">
                  {canInstall
                    ? 'Install the app for quick access and full-screen use.'
                    : 'Follow these steps to add Moneybag to your device.'}
                </p>
              </div>
            </div>

            {installError && <p className="pwa-install__error">{installError}</p>}

            <div className="pwa-install__actions">
              {canInstall ? (
                <>
                  <button
                    type="button"
                    className="pwa-install__primary"
                    onClick={install}
                    disabled={installing}
                  >
                    {installing ? 'Installing…' : 'Install app'}
                  </button>
                  <button type="button" className="pwa-install__secondary" onClick={dismiss}>
                    Not now
                  </button>
                </>
              ) : (
                <>
                  {!swReady && !ios && (
                    <p className="pwa-install__hint pwa-install__hint--muted">Preparing install…</p>
                  )}
                  {manualSteps}
                  <button type="button" className="pwa-install__primary" onClick={dismiss}>
                    Got it
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
