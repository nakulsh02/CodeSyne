import React, { useRef, useEffect, useState } from 'react';
import { 
  Monitor, Maximize2, Minimize2, XCircle, Share2, 
  ChevronUp, ChevronDown, Sparkles, ShieldAlert
} from 'lucide-react';
import { motion } from 'motion/react';
import { ScreenSharerInfo } from '../../hooks/useCollabMedia';

interface ScreenShareViewerProps {
  screenSharer: ScreenSharerInfo | null;
  isSelfSharing: boolean;
  onStopShare: () => void;
  onTakeoverShare: () => void;
}

export default function ScreenShareViewer({
  screenSharer,
  isSelfSharing,
  onStopShare,
  onTakeoverShare
}: ScreenShareViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && screenSharer?.stream) {
      if (videoRef.current.srcObject !== screenSharer.stream) {
        videoRef.current.srcObject = screenSharer.stream;
      }
      videoRef.current.play().catch(err => {
        console.warn('Video play auto-resume notice:', err);
      });
    }
  }, [screenSharer?.stream, isMinimized]);

  if (!screenSharer) return null;

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => console.warn('Fullscreen error:', err));
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => console.warn('Exit fullscreen error:', err));
    }
  };

  return (
    <motion.div 
      ref={containerRef}
      drag={!isFullscreen}
      dragElastic={0.05}
      initial={{ x: Math.max(20, window.innerWidth - 540), y: 70 }}
      className={`fixed z-[9990] touch-none select-none shadow-2xl rounded-2xl overflow-hidden border border-indigo-500/40 bg-[#070710]/95 backdrop-blur-xl transition-all duration-200 font-sans ${
        isFullscreen 
          ? 'fixed inset-0 z-[99999] h-screen w-screen rounded-none' 
          : isMinimized 
            ? 'w-72 h-11' 
            : 'w-[480px] max-w-[92vw] h-[340px]'
      } flex flex-col`}
    >
      {/* Top Header Control Bar / Drag Handle */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e0e1c] border-b border-white/10 shrink-0 text-xs cursor-grab active:cursor-grabbing">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shrink-0">
            <Monitor className="w-3.5 h-3.5 animate-pulse" />
          </div>

          <div className="flex items-center space-x-1.5 truncate">
            <span className="font-bold text-white truncate">
              {screenSharer.name}
            </span>
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              is sharing screen
            </span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold uppercase tracking-wider animate-pulse shrink-0">
              Live
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {isSelfSharing ? (
            <button
              type="button"
              onClick={onStopShare}
              className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-lg text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer active:scale-95"
              title="Stop Sharing Screen"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Stop Sharing</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onTakeoverShare}
              className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 rounded-lg text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer active:scale-95"
              title="Takeover & Share Your Screen"
            >
              <Share2 className="w-3 h-3" />
              <span className="hidden sm:inline">Takeover Share</span>
            </button>
          )}

          {/* Minimize / Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isMinimized ? 'Expand Screen Stream' : 'Minimize Screen Stream'}
          >
            {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Screen Share Button */}
          <button
            type="button"
            onClick={onStopShare}
            className="p-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 hover:text-rose-100 transition-colors cursor-pointer border border-rose-500/30"
            title="Close / End Screen Share"
          >
            <XCircle className="w-4 h-4 text-rose-400" />
          </button>
        </div>
      </div>

      {/* Screen Stream Display Area */}
      <div className={`relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-0 group ${isMinimized ? 'hidden' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelfSharing} // Mute audio if self sharing to avoid feedback loop
          onLoadedMetadata={(e) => {
            const v = e.target as HTMLVideoElement;
            v.play().catch(err => console.warn('Screen video play notice:', err));
          }}
          onCanPlay={(e) => {
            const v = e.target as HTMLVideoElement;
            v.play().catch(err => console.warn('Screen video canplay notice:', err));
          }}
          className="w-full h-full object-contain bg-black"
        />

        {/* Hover Close Button Bar */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
          <button
            type="button"
            onClick={onStopShare}
            className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs shadow-xl backdrop-blur-md flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 border border-rose-400/40"
            title="Close Screen Share"
          >
            <XCircle className="w-4 h-4" />
            <span>Close Screen Share</span>
          </button>
        </div>

        {/* Floating Sharer Avatar Watermark */}
        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center space-x-2 pointer-events-none select-none">
          <img
            src={screenSharer.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(screenSharer.name)}&background=6366f1&color=fff`}
            alt={screenSharer.name}
            className="w-4 h-4 rounded-full border border-white/20 object-cover"
          />
          <span className="text-[10px] font-bold text-slate-200 font-mono">
            {screenSharer.name}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
