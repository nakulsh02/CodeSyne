import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Bell, FolderCheck, Check, X, Sparkles, HardDrive, Lock } from 'lucide-react';
import { requestNotificationPermission, sendBrowserNotification, getDeviceFileAccessState, setDeviceFileAccessState } from '../utils/notifications';

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionUpdated?: () => void;
}

export default function PermissionModal({ isOpen, onClose, onPermissionUpdated }: PermissionModalProps) {
  const [allowNotifications, setAllowNotifications] = useState<boolean>(true);
  const [allowFileAccess, setAllowFileAccess] = useState<boolean>(true);
  const [isGranted, setIsGranted] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const hasNotif = 'Notification' in window && Notification.permission === 'granted';
      const hasFiles = getDeviceFileAccessState();
      setAllowNotifications(hasNotif || true);
      setAllowFileAccess(hasFiles || true);
    }
  }, [isOpen]);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('codesyne_permissions_prompted', 'true');
    }
    onClose();
  };

  const handleGrant = async () => {
    setIsGranted(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('codesyne_permissions_prompted', 'true');
    }

    // Handle System Notifications
    if (allowNotifications) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          await Notification.requestPermission();
        } catch (e) {
          console.warn('Notification permission request error:', e);
        }
      }
    }

    // Handle Device File Access
    if (allowFileAccess) {
      setDeviceFileAccessState(true);
    } else {
      setDeviceFileAccessState(false);
    }

    sendBrowserNotification(
      'permissions_updated_event',
      'Permissions Active ⚡',
      'System Notifications & Device File Storage Access are now synced for CodeSyne.'
    );

    if (onPermissionUpdated) {
      onPermissionUpdated();
    }

    setTimeout(() => {
      setIsGranted(false);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-[92vw] max-w-sm bg-[#0a0d14] border border-cyan-500/20 rounded-xl p-4 shadow-2xl text-slate-200 overflow-hidden"
        >
          {/* Subtle Background Glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

          {/* Close (X) Button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 rounded-md bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer z-10"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Modal Header */}
          <div className="flex items-center space-x-2.5 mb-3 pr-6">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">Permissions</h2>
                <span className="px-1.5 py-0.5 text-[8px] sm:text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded uppercase">
                  IDE Sync
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Enable workspace features</p>
            </div>
          </div>

          {/* Permission Items Toggles */}
          <div className="space-y-2 mb-4">
            {/* 1. Device File Storage */}
            <div
              onClick={() => setAllowFileAccess(!allowFileAccess)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-2.5 ${
                allowFileAccess
                  ? 'bg-cyan-950/30 border-cyan-500/30 text-white'
                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10'
              }`}
            >
              <div className={`p-1.5 rounded border shrink-0 ${allowFileAccess ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                <HardDrive className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-semibold text-white truncate">Storage & File Sync</h3>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all shrink-0 ${allowFileAccess ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-600 bg-transparent'}`}>
                    {allowFileAccess && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-1">
                  Save code locally & export files
                </p>
              </div>
            </div>

            {/* 2. System Notifications */}
            <div
              onClick={() => setAllowNotifications(!allowNotifications)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-2.5 ${
                allowNotifications
                  ? 'bg-cyan-950/30 border-cyan-500/30 text-white'
                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10'
              }`}
            >
              <div className={`p-1.5 rounded border shrink-0 ${allowNotifications ? 'bg-cyan-500/20 border-cyan-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-semibold text-white truncate">Notifications</h3>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all shrink-0 ${allowNotifications ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-600 bg-transparent'}`}>
                    {allowNotifications && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-1">
                  Build completions & system alerts
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2.5 border-t border-white/10">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-300 transition-all cursor-pointer"
            >
              Later
            </button>
            <button
              type="button"
              onClick={handleGrant}
              disabled={isGranted}
              className="px-3.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 border border-cyan-400/40 text-slate-950 font-bold text-[11px] shadow-md active:scale-95 transition-all flex items-center space-x-1 cursor-pointer"
            >
              {isGranted ? (
                <>
                  <Check className="w-3 h-3 text-slate-950" />
                  <span>Enabled!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-slate-950" />
                  <span>Enable Features</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
