import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Minimize2, Maximize2, Move, User } from 'lucide-react';
import { RemoteMediaState } from '../../hooks/useCollabMedia';

interface FloatingVideoOverlayProps {
  localStream: MediaStream | null;
  remoteParticipants: Record<string, RemoteMediaState>;
  isCameraOff: boolean;
  isMuted: boolean;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onEndCall: () => void;
  localUserName?: string;
  localUserAvatar?: string;
}

export default function FloatingVideoOverlay({
  localStream,
  remoteParticipants,
  isCameraOff,
  isMuted,
  onToggleCamera,
  onToggleMute,
  onEndCall,
  localUserName = 'You',
  localUserAvatar = ''
}: FloatingVideoOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [sizeMode, setSizeMode] = useState<'small' | 'medium' | 'large'>('medium');
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Attach local video stream to element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff]);

  const activeRemotes = Object.values(remoteParticipants);

  const sizeClasses = {
    small: 'w-64',
    medium: 'w-80',
    large: 'w-96 sm:w-[420px]'
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.05}
      initial={{ x: window.innerWidth - 360, y: 80 }}
      className={`fixed z-[9990] touch-none select-none shadow-2xl rounded-2xl overflow-hidden border border-indigo-500/40 bg-[#0d0d1a]/95 backdrop-blur-xl transition-all duration-200 ${sizeClasses[sizeMode]}`}
    >
      {/* Draggable Header Handle */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#121226]/90 border-b border-white/10 cursor-grab active:cursor-grabbing">
        <div className="flex items-center space-x-2 text-xs font-bold text-cyan-300">
          <Move className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="truncate">Live Video Feed</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              if (sizeMode === 'small') setSizeMode('medium');
              else if (sizeMode === 'medium') setSizeMode('large');
              else setSizeMode('small');
            }}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-mono font-bold px-1.5"
            title="Resize Window"
          >
            {sizeMode.toUpperCase()}
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isMinimized ? "Maximize Video" : "Minimize Video"}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onEndCall}
            className="p-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors cursor-pointer"
            title="End Call"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Video View Content */}
      {!isMinimized && (
        <div className="p-2 space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
          {/* Grid layout for local + remote video feeds */}
          <div className="grid grid-cols-1 gap-2">
            {/* Local Video Stream Preview */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-[#05050c] border border-white/10 group">
              {localStream && !isCameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-950/40 text-slate-400 p-2">
                  {localUserAvatar ? (
                    <img
                      src={localUserAvatar}
                      alt={localUserName}
                      className="w-10 h-10 rounded-full border border-indigo-400/40 object-cover mb-1"
                    />
                  ) : (
                    <User className="w-8 h-8 text-indigo-400 mb-1" />
                  )}
                  <span className="text-[11px] font-semibold text-slate-300">Camera Off</span>
                </div>
              )}

              {/* Name Tag */}
              <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[10px] font-bold text-white flex items-center space-x-1">
                <span>{localUserName} (You)</span>
                {isMuted && <MicOff className="w-2.5 h-2.5 text-rose-400" />}
              </div>
            </div>

            {/* Remote Participants Video Feeds */}
            {activeRemotes.map((remote) => (
              <RemoteVideoCard key={remote.connectionId || remote.userId} participant={remote} />
            ))}
          </div>

          {/* Quick Media Controls Bar */}
          <div className="flex items-center justify-center space-x-2 pt-1 border-t border-white/5">
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-xl transition-all cursor-pointer border ${
                isMuted 
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30' 
                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={onToggleCamera}
              className={`p-2 rounded-xl transition-all cursor-pointer border ${
                isCameraOff 
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30' 
                  : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30'
              }`}
              title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isCameraOff ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            </button>

            <button
              onClick={onEndCall}
              className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md shadow-rose-600/30"
              title="Leave Video Call"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Subcomponent for Remote Participant Video Feed
function RemoteVideoCard({ participant }: { participant: RemoteMediaState; key?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const stream = participant.videoStream || participant.stream || null;
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(err => console.warn('Remote video play:', err));
    }
  }, [participant.videoStream, participant.stream]);

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-[#05050c] border border-white/10">
      {participant.videoStream || participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          onLoadedMetadata={(e) => {
            const v = e.target as HTMLVideoElement;
            v.play().catch(err => console.warn('Remote video play metadata:', err));
          }}
          onCanPlay={(e) => {
            const v = e.target as HTMLVideoElement;
            v.play().catch(err => console.warn('Remote video play canplay:', err));
          }}
          className="w-full h-full object-cover bg-black"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-2">
          {participant.avatar ? (
            <img src={participant.avatar} alt={participant.name} className="w-10 h-10 rounded-full border border-slate-700 object-cover mb-1" />
          ) : (
            <User className="w-8 h-8 text-slate-500 mb-1" />
          )}
          <span className="text-[11px] font-medium text-slate-300">{participant.name}</span>
        </div>
      )}

      {/* Name Tag */}
      <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[10px] font-bold text-white flex items-center space-x-1">
        <span>{participant.name}</span>
        {participant.isMuted && <MicOff className="w-2.5 h-2.5 text-rose-400" />}
      </div>
    </div>
  );
}
