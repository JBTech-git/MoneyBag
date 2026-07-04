'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

export default function PwaRegister() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    const installed = isStandalone();
    setStandalone(installed);
    setReady(true);
    if (installed) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // Show on every page load until the app is installed
    const t = window.setTimeout(() => setOpen(true), 500);

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
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onDisplayChange);
    };
  }, []);

  const dismiss = () => {
    // Only closes for this visit — shows again on next refresh
    setOpen(false);
  };

  const install = async () => {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setOpen(false);
        setStandalone(true);
      }
      setInstallEvent(null);
    } finally {
      setInstalling(false);
    }
  };

  if (!ready || standalone) return null;

  const ios =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  return (
    <>
      {!open && (
        <button
          type="button"
          className="pwa-install-fab"
          onClick={() => setOpen(true)}
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
              <img src="/icons/app-icon.png" alt="" className="pwa-install__icon-sm" width={56} height={56} />
              <div className="pwa-install__copy">
                <h2 id="pwa-install-title" className="pwa-install__title pwa-install__title--sm">
                  Install Moneybag
                </h2>
                <p className="pwa-install__sub pwa-install__sub--sm">
                  {ios
                    ? 'Add Moneybag to your home screen for quick access to your finances'
                    : 'Manage your money faster with the Moneybag app'}
                </p>
              </div>
            </div>

            <div className="pwa-install__actions">
              {installEvent ? (
                <>
                  <button
                    type="button"
                    className="pwa-install__primary"
                    onClick={install}
                    disabled={installing}
                  >
                    {installing ? 'Installing…' : 'Install'}
                  </button>
                  <button type="button" className="pwa-install__secondary" onClick={dismiss}>
                    Not now
                  </button>
                </>
              ) : (
                <>
                  {ios ? (
                    <p className="pwa-install__hint">Use Share, then Add to Home Screen</p>
                  ) : (
                    <p className="pwa-install__hint">Use your browser menu to install this app</p>
                  )}
                  <button type="button" className="pwa-install__primary" onClick={dismiss}>
                    OK
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
