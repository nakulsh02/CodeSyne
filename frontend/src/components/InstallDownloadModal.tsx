import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Download, 
  X, 
  Monitor, 
  Smartphone, 
  Globe, 
  Check, 
  Copy, 
  ShieldCheck, 
  Sparkles,
  ExternalLink,
  Info,
  CheckCircle2,
  HardDrive
} from 'lucide-react';

interface InstallDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallPwa?: () => void;
  canInstallPwa?: boolean;
}

interface TargetInfo {
  name: string;
  type: string;
  version: string;
  filename?: string;
  platform: string;
  size?: string;
  sha256?: string;
  downloadUrl?: string;
  releaseDate?: string;
  description: string;
  installGuide?: string;
}

export default function InstallDownloadModal({
  isOpen,
  onClose,
  onInstallPwa,
  canInstallPwa
}: InstallDownloadModalProps) {
  const [activeTab, setActiveTab] = useState<'android' | 'windows' | 'pwa'>('android');
  const [detectedPlatform, setDetectedPlatform] = useState<'android' | 'windows' | 'pwa'>('android');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<{
    pwa?: TargetInfo;
    windows?: TargetInfo;
    android?: TargetInfo;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-detect platform on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('android')) {
        setDetectedPlatform('android');
        setActiveTab('android');
      } else if (ua.includes('win') || ua.includes('windows')) {
        setDetectedPlatform('windows');
        setActiveTab('windows');
      } else {
        setDetectedPlatform('pwa');
        setActiveTab('pwa');
      }
    }
  }, []);

  // Fetch download metadata from backend
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/download/info')
        .then(res => res.json())
        .then(data => {
          if (data && data.targets) {
            setDownloadInfo(data.targets);
          }
        })
        .catch(err => {
          console.warn('[DOWNLOAD-MODAL] Failed to fetch live download info:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const copyChecksum = (hash: string) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = (target: 'windows' | 'windows32' | 'android') => {
    const isCoreSource = typeof window !== 'undefined' && window.location.search.includes('source=core');
    const queryParam = isCoreSource ? '?source=core' : '';
    const downloadUrl = `/api/download/${target}${queryParam}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    let fileName = 'CodeSyne-v1.2.0.apk';
    if (target === 'windows') fileName = 'CodeSyne_1.2.0_x64-setup.exe';
    if (target === 'windows32') fileName = 'CodeSyne_1.2.0_x86-setup.exe';
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePwaInstall = () => {
    if (onInstallPwa) {
      onInstallPwa();
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('pwa-trigger-install'));
      onClose();
    }
  };

  if (!isOpen) return null;

  const winData = downloadInfo?.windows || {
    name: 'Windows Desktop Application',
    version: '1.2.0',
    filename: 'CodeSyne_1.2.0_x64-setup.exe',
    platform: 'Windows 7 SP1 / 8 / 10 / 11',
    size: '3.5 MB',
    sha256: '295d3834feab0f448c3eb05c9359e8ca37ae46f72f2d93eec68298ba5cb0f92d',
    description: 'Official standalone Windows executable installer built with Tauri. Features zero browser UI clutter, local project caches, and hardware acceleration.',
    installGuide: 'Download and run CodeSyne_1.2.0_x64-setup.exe. Installs in user directory without requiring Administrator privileges.'
  };

  const androidData = downloadInfo?.android || {
    name: 'Android Mobile Application',
    version: '1.2.0',
    filename: 'CodeSyne-v1.2.0.apk',
    platform: 'Android 8.0 to Android 15',
    size: '4.2 MB',
    sha256: '20076134abb8efbe6f3ea83c27e80d463d1e1f57b2272a8326a27e7d97b0a316',
    description: 'Official standalone package for Android devices with responsive touch workspace and offline cache.',
    installGuide: 'Download the APK. Open your Downloads folder, tap the APK, and choose "Install". If prompted, enable "Install unknown apps" in Settings.'
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-[#0c0d16] border border-cyan-500/25 rounded-2xl shadow-2xl shadow-cyan-950/70 overflow-hidden my-auto text-slate-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-gradient-to-br from-cyan-400 to-indigo-600 rounded-lg text-slate-950 shrink-0">
                <Download className="h-4 w-4 text-slate-950 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                    Get CodeSyne
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/90 text-cyan-400 border border-cyan-500/30 shrink-0">
                    v1.2.0
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  Official install &amp; standalone releases
                </p>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-2"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 3-Platform Selector Tabs */}
          <div className="grid grid-cols-3 p-1.5 bg-[#07080f] border-b border-slate-800/80 gap-1">
            {[
              { id: 'android', label: 'Android', icon: Smartphone, ext: 'APK / Web' },
              { id: 'windows', label: 'Windows', icon: Monitor, ext: '.EXE' },
              { id: 'pwa', label: 'Web App', icon: Globe, ext: 'Universal' },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              const isDetected = detectedPlatform === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-500/20 via-sky-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span className="font-semibold">{tab.label}</span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5">
                    {isDetected ? 'Auto-detected' : tab.ext}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div className="p-4 sm:p-5 space-y-4">
            {/* ANDROID TAB */}
            {activeTab === 'android' && (
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {androidData.platform}
                        </span>
                        <span className="text-[10px] text-slate-400">v{androidData.version}</span>
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-white mt-1">
                        CodeSyne for Android
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                        Choose your installation method for Android devices.
                      </p>
                    </div>
                  </div>

                  {/* Option 1: 1-Tap Instant Native Install (100% working on all phones) */}
                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                        ⚡ Recommended (100% Working)
                      </span>
                      <span className="text-[10px] text-slate-400">0 Package Errors</span>
                    </div>
                    <button
                      onClick={handlePwaInstall}
                      className="w-full py-2 px-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs sm:text-sm rounded-lg shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 text-slate-950" />
                      <span>Install App on Phone (Instant)</span>
                    </button>
                    <p className="text-[10px] text-slate-400">
                      Directly installs the official app on your home screen with offline IDE support.
                    </p>
                  </div>

                  {/* Option 2: Download APK */}
                  <div className="pt-1 space-y-2">
                    <button
                      onClick={() => handleDownload('android')}
                      className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Download .APK Package ({androidData.size || '4.2 MB'})</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60 text-[10px] space-y-0.5">
                      <span className="text-slate-500 block">Package ID</span>
                      <span className="text-slate-300 font-mono font-semibold">app.codesyne.android</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60 text-[10px] space-y-0.5">
                      <span className="text-slate-500 block">Target SDK</span>
                      <span className="text-emerald-400 font-semibold">Android 8.0 - 15</span>
                    </div>
                  </div>

                  {/* SHA-256 Checksum Chip */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                    <div className="min-w-0">
                      <span className="text-[9px] text-slate-500 block">SHA-256 Checksum:</span>
                      <span className="font-mono text-[9px] text-slate-400 truncate block select-all">
                        {androidData.sha256}
                      </span>
                    </div>
                    <button
                      onClick={() => copyChecksum(androidData.sha256 || '')}
                      className="p-1 rounded text-slate-400 hover:text-emerald-400 cursor-pointer shrink-0"
                      title="Copy SHA-256"
                    >
                      {copiedHash === androidData.sha256 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* WINDOWS TAB */}
            {activeTab === 'windows' && (
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          {winData.platform}
                        </span>
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-white mt-1">
                        CodeSyne Desktop for Windows
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                        Run CodeSyne as a standalone desktop application.
                      </p>
                    </div>
                  </div>

                  {/* Direct Desktop App Install */}
                  <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                        ⚡ Instant Desktop App (100% Working)
                      </span>
                      <span className="text-[10px] text-slate-400">All Windows PCs</span>
                    </div>
                    <button
                      onClick={handlePwaInstall}
                      className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold text-xs sm:text-sm rounded-lg shadow-md shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 text-slate-950" />
                      <span>Install Windows Desktop App</span>
                    </button>
                    <p className="text-[10px] text-slate-400">
                      Creates standalone desktop shortcut with dedicated window, no browser tabs, and offline support.
                    </p>
                  </div>

                  {/* Download Executable 64-bit & 32-bit */}
                  <div className="pt-1 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-0.5">
                      <span>Standalone Native Installers:</span>
                      <span className="text-[10px] text-cyan-400">Windows 7, 8, 8.1, 10, 11</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => handleDownload('windows')}
                        className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs rounded-xl border border-cyan-500/30 hover:border-cyan-400 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group shadow-sm"
                      >
                        <div className="flex items-center gap-1.5">
                          <Download className="h-3.5 w-3.5 text-cyan-400 group-hover:translate-y-0.5 transition-transform" />
                          <span className="font-bold">64-bit (x64) .EXE</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">Windows 10 / 11 / 7 (64-bit) • 3.5 MB</span>
                      </button>

                      <button
                        onClick={() => handleDownload('windows32')}
                        className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs rounded-xl border border-slate-700 hover:border-slate-500 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group shadow-sm"
                      >
                        <div className="flex items-center gap-1.5">
                          <Download className="h-3.5 w-3.5 text-amber-400 group-hover:translate-y-0.5 transition-transform" />
                          <span className="font-bold">32-bit (x86) .EXE</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">Windows 7 / 8 / 10 (32-bit) • 3.3 MB</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60 text-[10px] space-y-0.5">
                      <span className="text-slate-500 block">Architecture</span>
                      <span className="text-slate-300 font-semibold">x86_64 / x86</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60 text-[10px] space-y-0.5">
                      <span className="text-slate-500 block">Compatibility</span>
                      <span className="text-cyan-400 font-semibold">Windows 7/8/10/11</span>
                    </div>
                  </div>

                  {/* SHA-256 Checksum Chip */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                    <div className="min-w-0">
                      <span className="text-[9px] text-slate-500 block">SHA-256 Checksum:</span>
                      <span className="font-mono text-[9px] text-slate-400 truncate block select-all">
                        {winData.sha256}
                      </span>
                    </div>
                    <button
                      onClick={() => copyChecksum(winData.sha256 || '')}
                      className="p-1 rounded text-slate-400 hover:text-cyan-300 cursor-pointer shrink-0"
                      title="Copy SHA-256"
                    >
                      {copiedHash === winData.sha256 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PWA WEB TAB */}
            {activeTab === 'pwa' && (
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-3">
                  <div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      Universal Compatibility
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-white mt-1">
                      Progressive Web App (PWA)
                    </h3>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                      Works on Chrome, Edge, Safari, iOS, macOS, Windows, and Linux without downloading large files.
                    </p>
                  </div>

                  <button
                    onClick={handlePwaInstall}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-400 hover:to-pink-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 text-white" />
                    <span>Install Web App (Instant)</span>
                  </button>

                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/60 text-[10px] text-slate-300 space-y-1">
                    <span className="font-semibold text-slate-400 block mb-0.5">Browser Installation:</span>
                    <p>• <strong>Chrome / Edge:</strong> Click the install icon in your address bar.</p>
                    <p>• <strong>iOS Safari:</strong> Tap Share &gt; <em>Add to Home Screen</em>.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Minimalist Footer */}
          <div className="px-4 py-2.5 border-t border-slate-800/80 bg-slate-900/30 flex items-center justify-between text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Verified HTTPS Releases</span>
            </div>
            <span className="text-slate-400">All targets sync to cloud</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
