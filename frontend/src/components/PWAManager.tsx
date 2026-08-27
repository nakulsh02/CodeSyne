import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, RefreshCw, WifiOff, X, Sparkles, CheckCircle } from 'lucide-react';
import { sendBrowserNotification } from '../utils/notifications';

declare global {
  interface Window {
    deferredPrompt: any;
  }
}

interface PWAManagerProps {
  currentPage?: string;
}

export default function PWAManager({ currentPage }: PWAManagerProps) {
  const [installable, setInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [pendingWorker, setPendingWorker] = useState<ServiceWorker | null>(null);
  const [showInstallToast, setShowInstallToast] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [diagnostics, setDiagnostics] = useState({
    https: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
    swRegistered: false,
    manifestFound: false,
    iconsReady: true,
  });

  useEffect(() => {
    // Check service worker status for diagnostics
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          setDiagnostics((prev) => ({ ...prev, swRegistered: true }));
        }
      });
    }

    // Check manifest link
    const manifestEl = document.querySelector('link[rel="manifest"]');
    if (manifestEl) {
      setDiagnostics((prev) => ({ ...prev, manifestFound: true }));
    }

    // 1. Detect if the app is strictly running inside standalone window/PWA container mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                             (navigator as any).standalone === true ||
                             document.referrer.includes('android-app://');

    if (isStandaloneMode) {
      setIsInstalled(true);
      setInstallable(false);
      setShowInstallToast(false);
      window.dispatchEvent(new CustomEvent('pwa-installable-state', { detail: { installable: false, installed: true } }));
    } else {
      setIsInstalled(false);
      if (window.deferredPrompt) {
        // Prompt available from early listener
        setInstallable(true);
        setShowInstallToast(true);
        window.dispatchEvent(new CustomEvent('pwa-installable-state', { detail: { installable: true, installed: false } }));
      }
    }

    // Media query listener for real-time standalone detection
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        localStorage.setItem('pwa_installed', 'true');
        setShowInstallToast(false);
        setInstallable(false);
        window.dispatchEvent(new CustomEvent('pwa-installable-state', { detail: { installable: false, installed: true } }));
      }
    };
    try {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } catch {
      // Fallback for older browsers
    }

    // 2. Handle beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.deferredPrompt = e;
      
      // If prompt fires, app is installable and not currently in standalone
      localStorage.removeItem('pwa_installed');
      setIsInstalled(false);
      setInstallable(true);
      setShowInstallToast(true);

      // Dispatch custom event to notify other modules
      window.dispatchEvent(new CustomEvent('pwa-installable-state', { detail: { installable: true, installed: false } }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Handle early prompts caught by the HTML head script
    const handleEarlyPrompt = () => {
      if (window.deferredPrompt) {
        localStorage.removeItem('pwa_installed');
        setIsInstalled(false);
        setInstallable(true);
        setShowInstallToast(true);
        window.dispatchEvent(new CustomEvent('pwa-installable-state', { detail: { installable: true, installed: false } }));
      }
    };
    window.addEventListener('pwa-early-prompt', handleEarlyPrompt);

    // If deferredPrompt is already set when react boots
    if (window.deferredPrompt) {
      localStorage.removeItem('pwa_installed');
      setIsInstalled(false);
      setInstallable(true);
      setShowInstallToast(true);
      window.dispatchEvent(new CustomEvent('pwa-installable-state', { detail: { installable: true, installed: false } }));
    }

    // 3. Handle appinstalled
    const handleAppInstalled = () => {
      window.deferredPrompt = null;
      setInstallable(false);
      setShowInstallToast(false);
      setShowGuideModal(false);
      setJustInstalled(true);
      setTimeout(() => setJustInstalled(false), 5000);

      sendBrowserNotification(
        'pwa_installed_success',
        'CodeSyne PWA Activated 📱',
        'CodeSyne is now installed on your device. Launch directly from your home screen or desktop anytime!'
      );

      // Notify other modules - only set installed=true if actually running in standalone mode
      const currentlyStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                                 (navigator as any).standalone === true ||
                                 document.referrer.includes('android-app://');
      setIsInstalled(currentlyStandalone);
      window.dispatchEvent(new CustomEvent('pwa-installable-state', { 
        detail: { installable: false, installed: currentlyStandalone } 
      }));
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // 4. Listen for manual trigger events from LandingPage/Dashboard buttons
    const triggerInstallListener = () => {
      triggerNativeInstallPrompt();
    };

    window.addEventListener('pwa-trigger-install', triggerInstallListener);

    // 5. Register Service Worker with safe update polling
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('[PWA] Service Worker registered successfully:', registration.scope);

        // Check for updates on load
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New update discovered. Prompting user.');
                setNewVersionAvailable(true);
                setPendingWorker(installingWorker);
              }
            });
          }
        });
      }).catch((err) => {
        console.error('[PWA] Service Worker registration failed:', err);
      });

      // Handle controllerchange (reload after skipWaiting)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // 6. Connectivity Listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Clean up
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-early-prompt', handleEarlyPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-trigger-install', triggerInstallListener);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerNativeInstallPrompt = async () => {
    const promptEvent = window.deferredPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        console.log(`[PWA] User choice outcome: ${outcome}`);
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setShowInstallToast(false);
          setShowGuideModal(false);
          setJustInstalled(true);
          setTimeout(() => setJustInstalled(false), 5000);
          return;
        }
      } catch (err) {
        console.warn('[PWA] Prompt execution error:', err);
      }
      window.deferredPrompt = null;
    }

    // If no native prompt event or prompt failed, open the interactive PWA Install Guide Modal
    setShowGuideModal(true);
  };

  const handleUpdateApp = () => {
    if (pendingWorker) {
      console.log('[PWA] Post-install active version switch requested.');
      // Send message to SW to trigger skipWaiting
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  const isInIframe = window.self !== window.top;

  return (
    <>
      <div id="pwa-manager-layer" className="fixed bottom-4 right-4 left-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[99999] flex flex-col space-y-3 pointer-events-none">
        <AnimatePresence>
          {/* Offline Notice banner */}
          {isOffline && (
            <motion.div
              id="pwa-offline-notice"
              drag="x"
              dragSnapToOrigin={true}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 400) {
                  setIsOffline(false);
                }
              }}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="pointer-events-auto flex items-center space-x-3 bg-red-950/90 border border-red-500/30 p-4 rounded-2xl shadow-2xl backdrop-blur-md w-full sm:max-w-sm cursor-grab active:cursor-grabbing select-none"
            >
              <div className="p-2 bg-red-500/10 rounded-xl shrink-0">
                <WifiOff className="h-5 w-5 text-red-400 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Working Offline</h4>
                <p className="text-[10px] text-red-300/80 leading-normal">
                  No internet connection. Workspace projects served from cache. <span className="opacity-60">(Swipe to dismiss)</span>
                </p>
              </div>
            </motion.div>
          )}

          {/* Update Available notification */}
          {newVersionAvailable && (
            <motion.div
              id="pwa-update-notice"
              drag="x"
              dragSnapToOrigin={true}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 400) {
                  setNewVersionAvailable(false);
                }
              }}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="pointer-events-auto flex flex-col space-y-3 bg-[#080c18]/95 border border-cyan-500/30 p-4 rounded-2xl shadow-2xl backdrop-blur-md w-full sm:max-w-sm accent-glow-cyan cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-cyan-500/10 rounded-xl shrink-0">
                  <RefreshCw className="h-5 w-5 text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1">
                    <span>Version Update</span>
                    <Sparkles className="h-3 w-3 text-cyan-400" />
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-normal mt-0.5">
                    A new version of Codesyne is available. <span className="text-slate-400">(Swipe to dismiss)</span>
                  </p>
                </div>
                <button
                  onClick={() => setNewVersionAvailable(false)}
                  className="text-slate-500 hover:text-white transition-colors p-0.5 hover:bg-white/5 rounded cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center space-x-2 justify-end">
                <button
                  onClick={() => setNewVersionAvailable(false)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer border border-white/5"
                >
                  Later
                </button>
                <button
                  onClick={handleUpdateApp}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold rounded-lg text-[10px] uppercase transition-all shadow-md shadow-cyan-500/10 hover:scale-105 cursor-pointer"
                >
                  Update Now
                </button>
              </div>
            </motion.div>
          )}

          {/* Beautiful Optional Install Promotion Toast */}
          {showInstallToast && installable && !isInstalled && currentPage !== 'dashboard' && (
            <motion.div
              id="pwa-install-banner"
              drag={true}
              dragSnapToOrigin={true}
              dragElastic={0.35}
              onDragEnd={(_, info) => {
                if (
                  Math.abs(info.offset.x) > 28 || 
                  Math.abs(info.offset.y) > 28 || 
                  Math.abs(info.velocity.x) > 120 || 
                  Math.abs(info.velocity.y) > 120
                ) {
                  setShowInstallToast(false);
                }
              }}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="pointer-events-auto flex flex-col space-y-3 bg-[#0a0718]/95 border border-indigo-500/30 p-4 rounded-2xl shadow-2xl backdrop-blur-md w-full sm:max-w-sm accent-glow-indigo cursor-grab active:cursor-grabbing select-none touch-none"
            >
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl shrink-0">
                  <Download className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Install Codesyne App</h4>
                  <p className="text-[11px] text-slate-300 leading-normal mt-0.5">
                    Run the IDE in standalone mode directly from your desktop or phone home screen.
                  </p>
                </div>
                <button
                  onClick={() => setShowInstallToast(false)}
                  className="text-slate-500 hover:text-white transition-colors p-0.5 hover:bg-white/5 rounded cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center space-x-2 justify-end">
                <button
                  onClick={() => setShowInstallToast(false)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer border border-white/5"
                >
                  Dismiss
                </button>
                <button
                  onClick={triggerNativeInstallPrompt}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg text-[10px] uppercase transition-all shadow-md shadow-indigo-500/10 hover:scale-105 cursor-pointer"
                >
                  Install App
                </button>
              </div>
            </motion.div>
          )}

          {/* Successful installation notification */}
          {justInstalled && (
            <motion.div
              id="pwa-installed-toast"
              drag={true}
              dragSnapToOrigin={true}
              dragElastic={0.35}
              onDragEnd={(_, info) => {
                if (
                  Math.abs(info.offset.x) > 28 || 
                  Math.abs(info.offset.y) > 28 || 
                  Math.abs(info.velocity.x) > 120 || 
                  Math.abs(info.velocity.y) > 120
                ) {
                  setJustInstalled(false);
                }
              }}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="pointer-events-auto flex items-center space-x-3 bg-emerald-950/95 border border-emerald-500/40 p-4 rounded-2xl shadow-2xl backdrop-blur-xl w-full max-w-full sm:max-w-md cursor-grab active:cursor-grabbing select-none touch-none"
            >
              <div className="p-2 bg-emerald-500/10 rounded-xl shrink-0">
                <CheckCircle className="h-5 w-5 text-emerald-400 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">PWA Activated</h4>
                <p className="text-xs text-emerald-300/90 leading-relaxed font-sans break-words whitespace-normal">
                  Codesyne is now installed on your device!
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Global PWA Installation Assistant Modal */}
      <AnimatePresence>
        {showGuideModal && (
          <div className="fixed inset-0 bg-[#04020a]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 z-[999999] overflow-y-auto font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#0b0821]/95 border border-indigo-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl max-w-sm sm:max-w-lg w-full relative accent-glow-indigo text-left"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowGuideModal(false)}
                className="absolute top-3.5 right-3.5 text-slate-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-xl hover:bg-white/10 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center space-x-2.5 mb-3">
                <div className="p-2 sm:p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl">
                  <Download className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">Install Codesyne App</h3>
                  <p className="text-[10px] text-indigo-300/90 font-mono">PROGRESSIVE WEB APP (PWA)</p>
                </div>
              </div>

              {/* If in iframe warning */}
              {isInIframe && (
                <div className="mb-3 p-2.5 bg-cyan-950/40 border border-cyan-500/30 rounded-xl flex items-start space-x-2 text-[11px] text-cyan-200">
                  <span className="text-xs">💡</span>
                  <div>
                    <strong className="text-cyan-300 font-semibold block">Preview Frame Notice:</strong>
                    Browsers block PWA prompts inside preview frames. Click <strong className="text-white">"Open Direct App"</strong> below to open in a full window.
                  </div>
                </div>
              )}

              {/* Guide instructions per browser */}
              <div className="space-y-3.5 mb-5 text-xs text-slate-300 leading-relaxed">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
                  <div className="space-y-1">
                    <span className="font-bold text-cyan-400 block text-xs flex items-center space-x-1.5">
                      <span>🖥️ Google Chrome / MS Edge (Desktop & Android):</span>
                    </span>
                    <p className="text-slate-300 pl-4 text-[11.5px] border-l-2 border-cyan-500/40">
                      Look at the right side of your browser address bar and click the <strong className="text-white font-semibold">Install Icon</strong> (desktop with down arrow), or click <strong className="text-white font-semibold">⋮ (3 dots) → Save and Share → Install Codesyne...</strong>
                    </p>
                  </div>

                  <div className="space-y-1 border-t border-white/10 pt-2.5">
                    <span className="font-bold text-purple-400 block text-xs flex items-center space-x-1.5">
                      <span>🍏 Apple Safari (iPhone / iPad / Mac):</span>
                    </span>
                    <p className="text-slate-300 pl-4 text-[11.5px] border-l-2 border-purple-500/40">
                      Tap the <strong className="text-white font-semibold">Share button</strong> (square with up arrow ↑), then scroll and tap <strong className="text-white font-semibold">"Add to Home Screen"</strong> (iOS) or <strong className="text-white font-semibold">"Add to Dock"</strong> (Mac Safari).
                    </p>
                  </div>
                </div>

                {/* System Diagnostics checklist */}
                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl space-y-2 text-[11px]">
                  <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                    PWA System Diagnostics
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-300">
                    <div className="flex items-center space-x-1.5">
                      <span className={diagnostics.https ? "text-emerald-400" : "text-amber-400"}>
                        {diagnostics.https ? "✓" : "!"}
                      </span>
                      <span>HTTPS / Secure</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className={diagnostics.swRegistered ? "text-emerald-400" : "text-amber-400"}>
                        {diagnostics.swRegistered ? "✓" : "!"}
                      </span>
                      <span>Service Worker</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className={diagnostics.manifestFound ? "text-emerald-400" : "text-amber-400"}>
                        {diagnostics.manifestFound ? "✓" : "!"}
                      </span>
                      <span>Web Manifest</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-emerald-400">✓</span>
                      <span>App Icons Ready</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                {isInIframe ? (
                  <button
                    onClick={() => {
                      window.open(window.location.href, '_blank');
                      setShowGuideModal(false);
                    }}
                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-cyan-400/20 flex items-center justify-center space-x-2"
                  >
                    <span>Open Direct App Window</span>
                  </button>
                ) : (window.deferredPrompt ? (
                  <button
                    onClick={() => {
                      triggerNativeInstallPrompt();
                    }}
                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>Trigger Install Prompt</span>
                  </button>
                ) : null)}

                <button
                  onClick={() => setShowGuideModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer border border-slate-700 shrink-0"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
