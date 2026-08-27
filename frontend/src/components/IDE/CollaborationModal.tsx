import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  Users, Shield, Link as LinkIcon, Copy, Check, MessageSquare, Send, Mail,
  UserX, LogOut, Radio, Crown, Eye, Edit3, Sparkles, X, ChevronRight, RefreshCw, QrCode,
  Phone, PhoneOff, Mic, MicOff, Monitor, MonitorOff, Volume2, Activity, Video, VideoOff, Maximize2
} from 'lucide-react';
import { CollabUser, UserProfile, ChatMessage } from '@shared/types';
import { ScreenSharerInfo, RemoteMediaState } from '../../hooks/useCollabMedia';

interface CollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  user: UserProfile;
  userRole: 'Owner' | 'Editor' | 'Viewer';
  collaborators: CollabUser[];
  roomConnections?: (CollabUser & { connectionId?: string })[];
  clientConnectionId?: string;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  onCopyLink: () => void;
  onJoinRoom: (newRoomId: string) => void;
  onChangeUserRole: (userId: string, newRole: 'Owner' | 'Editor' | 'Viewer') => void;
  onKickUser: (userId: string) => void;
  onEndSession: () => void;
  onLeaveRoom?: () => void;
  chatMessages: ChatMessage[];
  onSendChatMessage: (text: string) => void;
  onSaveProject?: () => void;
  
  // Voice & Video Call & Screen Sharing Media Props
  isCallActive?: boolean;
  isMuted?: boolean;
  isVideoActive?: boolean;
  isCameraOff?: boolean;
  localVideoStream?: MediaStream | null;
  mediaStatus?: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  activeSpeakerId?: string | null;
  isScreenSharing?: boolean;
  activeScreenSharer?: ScreenSharerInfo | null;
  remoteParticipants?: Record<string, RemoteMediaState>;
  onStartVoiceCall?: () => void;
  onStartVideoCall?: () => void;
  onToggleMute?: () => void;
  onToggleCamera?: () => void;
  onLeaveVoiceCall?: () => void;
  onStartScreenShare?: () => void;
  onStopScreenShare?: () => void;
}

function CustomRoleDropdown({ 
  value, 
  onChange 
}: { 
  value: 'Owner' | 'Editor' | 'Viewer'; 
  onChange: (newRole: 'Owner' | 'Editor' | 'Viewer') => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 110;
      const showAbove = rect.bottom + dropdownHeight > window.innerHeight && rect.top > dropdownHeight;
      setCoords({
        top: showAbove ? Math.max(8, rect.top - dropdownHeight - 4) : Math.min(window.innerHeight - dropdownHeight - 8, rect.bottom + 4),
        left: Math.max(8, Math.min(window.innerWidth - 140, rect.right - 128))
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#121222] hover:bg-[#1a1a32] border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl text-[10px] font-mono font-bold text-slate-200 shadow-sm transition-all cursor-pointer active:scale-95"
      >
        {value === 'Editor' ? (
          <Edit3 className="w-3 h-3 text-indigo-400 shrink-0" />
        ) : (
          <Eye className="w-3 h-3 text-cyan-400 shrink-0" />
        )}
        <span>{value}</span>
        <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {isOpen && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-[99998]" onClick={() => setIsOpen(false)} />
          <div
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className="fixed w-32 bg-[#0d0d1c]/98 border border-indigo-500/50 rounded-xl shadow-2xl backdrop-blur-2xl z-[99999] p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              onClick={() => {
                onChange('Editor');
                setIsOpen(false);
              }}
              className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                value === 'Editor' 
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' 
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Edit3 className="w-3 h-3 text-indigo-400 shrink-0" />
              <span>Editor</span>
              {value === 'Editor' && <Check className="w-3 h-3 text-indigo-400 ml-auto shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                onChange('Viewer');
                setIsOpen(false);
              }}
              className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                value === 'Viewer' 
                  ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' 
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Eye className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Viewer</span>
              {value === 'Viewer' && <Check className="w-3 h-3 text-cyan-400 ml-auto shrink-0" />}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function VideoTile({ stream, name, isMuted, isSelf }: { key?: React.Key; stream: MediaStream; name: string; isMuted?: boolean; isSelf?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.warn('VideoTile play error:', e));
    }
  }, [stream]);

  return (
    <div className="relative aspect-video rounded-xl bg-black border border-white/10 overflow-hidden shadow-md group">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        className={`w-full h-full object-cover ${isSelf ? 'transform -scale-x-100' : ''}`}
      />
      <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center space-x-1 text-[10px] font-bold text-white z-10">
        <span className="truncate max-w-[90px]">{name} {isSelf ? '(You)' : ''}</span>
        {isMuted && <MicOff className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
      </div>
    </div>
  );
}

export default function CollaborationModal({
  isOpen,
  onClose,
  roomId,
  user,
  userRole,
  collaborators,
  roomConnections,
  clientConnectionId,
  wsStatus,
  onCopyLink,
  onJoinRoom,
  onChangeUserRole,
  onKickUser,
  onEndSession,
  onLeaveRoom,
  chatMessages,
  onSendChatMessage,
  onSaveProject,
  
  isCallActive = false,
  isMuted = false,
  isVideoActive = false,
  isCameraOff = false,
  localVideoStream = null,
  mediaStatus = 'disconnected',
  activeSpeakerId = null,
  isScreenSharing = false,
  activeScreenSharer = null,
  remoteParticipants = {},
  onStartVoiceCall,
  onStartVideoCall,
  onToggleMute,
  onToggleCamera,
  onLeaveVoiceCall,
  onStartScreenShare,
  onStopScreenShare
}: CollaborationModalProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'chat'>('members');
  const [joinInput, setJoinInput] = useState('');
  const [chatText, setChatText] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInvitingEmail, setIsInvitingEmail] = useState(false);
  const [inviteEmailFeedback, setInviteEmailFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  const handleSendInviteEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || isInvitingEmail) return;

    setIsInvitingEmail(true);
    setInviteEmailFeedback(null);
    try {
      const res = await fetch('/api/collab/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          recipientEmail: inviteEmail.trim(),
          inviterName: user.username || 'A CodeSyne User',
          projectName: 'Collaborative Workspace'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInviteEmailFeedback({ type: 'success', message: 'Invitation email sent via Brevo!' });
        setInviteEmail('');
        setTimeout(() => setInviteEmailFeedback(null), 4000);
      } else {
        setInviteEmailFeedback({ type: 'error', message: data.error || 'Failed to send invite email.' });
      }
    } catch (err: any) {
      setInviteEmailFeedback({ type: 'error', message: 'Network error sending invitation.' });
    } finally {
      setIsInvitingEmail(false);
    }
  };

  const activeVideoStreams: Array<{ id: string; name: string; stream: MediaStream; isMuted?: boolean; isSelf?: boolean }> = [];

  if (isVideoActive && !isCameraOff && localVideoStream) {
    activeVideoStreams.push({
      id: user.id,
      name: user.username || 'You',
      stream: localVideoStream,
      isMuted,
      isSelf: true
    });
  }

  Object.entries(remoteParticipants).forEach(([key, participant]) => {
    if (participant.videoStream && participant.isVideoOn) {
      activeVideoStreams.push({
        id: key,
        name: participant.name || 'Collaborator',
        stream: participant.videoStream,
        isMuted: participant.isMuted,
        isSelf: false
      });
    }
  });

  if (!isOpen) return null;

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/workspace?collab=${roomId}`;

  const handleCopy = () => {
    onCopyLink();
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendChatMessage(chatText.trim());
    setChatText('');
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    let cleanRoomId = joinInput.trim();
    if (cleanRoomId.includes('collab=')) {
      cleanRoomId = cleanRoomId.split('collab=')[1].split('&')[0];
    } else if (cleanRoomId.includes('room=')) {
      cleanRoomId = cleanRoomId.split('room=')[1].split('&')[0];
    } else if (cleanRoomId.includes('share=')) {
      cleanRoomId = cleanRoomId.split('share=')[1].split('&')[0];
    } else if (cleanRoomId.includes('project=')) {
      cleanRoomId = cleanRoomId.split('project=')[1].split('&')[0];
    } else if (cleanRoomId.includes('p=')) {
      cleanRoomId = cleanRoomId.split('p=')[1].split('&')[0];
    }
    onJoinRoom(cleanRoomId);
    setJoinInput('');
  };

  const handleManualSave = async () => {
    if (!onSaveProject) return;
    setIsSaving(true);
    try {
      await onSaveProject();
    } finally {
      setTimeout(() => setIsSaving(false), 600);
    }
  };

  // Ensure connected device participants are mapped directly from real active room connections
  const allParticipants: (CollabUser & { connectionId?: string })[] = (roomConnections && roomConnections.length > 0)
    ? roomConnections.map(c => {
        const isSelf = c.connectionId ? c.connectionId === clientConnectionId : c.id === user.id;
        let displayName = c.name || c.username || user.username || 'Collaborator';
        if (isSelf && !displayName.includes('(You)')) {
          displayName = `${displayName} (You)`;
        }
        return {
          ...c,
          name: displayName,
          role: c.role || (isSelf ? userRole : 'Editor')
        };
      })
    : [
        {
          id: user.id,
          name: `${user.username} (You)`,
          avatar: user.avatar,
          color: '#6366f1',
          role: userRole,
          isTyping: false
        },
        ...collaborators.map(c => ({
          ...c,
          role: c.role || 'Editor'
        }))
      ];

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-[#0a0a14] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto shrink-0 text-left font-sans max-h-[85vh] sm:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 bg-[#101020] border-b border-white/10 shrink-0 gap-2">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">Collab Center</h3>
                <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border shrink-0 ${
                  wsStatus === 'connected' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : wsStatus === 'connecting'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    wsStatus === 'connected' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`} />
                  <span>{wsStatus}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate font-mono">
                Room ID: <span className="text-indigo-300 font-bold">{roomId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {onSaveProject && (
              <button
                type="button"
                onClick={handleManualSave}
                disabled={isSaving}
                className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 rounded-xl text-[11px] font-semibold transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                title="Save current collaborative project state"
              >
                <Sparkles className={`w-3 h-3 ${isSaving ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Share & Join Header Controls */}
        <div className="p-3 sm:p-4 bg-[#0d0d1a]/95 border-b border-white/5 space-y-3 overflow-y-auto max-h-[42vh] shrink-0 custom-scrollbar">
          
          {/* Voice, Video & Screen Sharing Media Control Hub */}
          <div className="p-3 bg-gradient-to-r from-[#121226] to-[#0a0a18] border border-white/10 rounded-2xl space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span className="text-xs font-bold text-white tracking-tight">Voice, Video & Screen Hub</span>
              </div>

              <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${
                isVideoActive
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                  : isCallActive 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : isScreenSharing
                      ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                      : 'bg-white/5 text-slate-400 border-white/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isCallActive || isVideoActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                <span>
                  {isVideoActive ? (isCameraOff ? 'Camera Paused' : 'Video Live') : isCallActive ? (isMuted ? 'Voice Muted' : 'Voice Active') : isScreenSharing ? 'Screen Live' : 'Call Ready'}
                </span>
              </span>
            </div>

            {/* Media Action Buttons Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Voice Call / Mic Button */}
              {!isCallActive && !isVideoActive ? (
                <button
                  type="button"
                  onClick={onStartVoiceCall}
                  className="py-2 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
                  title="Join Voice Call with room members"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Voice Call</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className={`py-2 px-2.5 ${
                    isMuted 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' 
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  } border rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5 text-amber-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />}
                  <span>{isMuted ? 'Unmute' : 'Mute Mic'}</span>
                </button>
              )}

              {/* Video Call / Camera Button */}
              {!isVideoActive ? (
                <button
                  type="button"
                  onClick={onStartVideoCall}
                  className="py-2 px-2.5 bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                  title="Start Video Call with camera"
                >
                  <Video className="w-3.5 h-3.5 text-purple-400" />
                  <span>Video Call</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggleCamera}
                  className={`py-2 px-2.5 ${
                    isCameraOff 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                      : 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                  } border rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95`}
                  title={isCameraOff ? 'Turn Camera On' : 'Pause Camera'}
                >
                  {isCameraOff ? <VideoOff className="w-3.5 h-3.5 text-amber-400" /> : <Video className="w-3.5 h-3.5 text-purple-400" />}
                  <span>{isCameraOff ? 'Cam Off' : 'Cam Live'}</span>
                </button>
              )}

              {/* Screen Share Button */}
              {!isScreenSharing ? (
                <button
                  type="button"
                  onClick={onStartScreenShare}
                  className="col-span-2 sm:col-span-1 py-2 px-2.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                  title="Share your screen with room participants"
                >
                  <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Screen</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStopScreenShare}
                  className="col-span-2 sm:col-span-1 py-2 px-2.5 bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                  title="Stop Sharing Screen"
                >
                  <MonitorOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Stop Share</span>
                </button>
              )}
            </div>

            {/* End Call Button if active */}
            {(isCallActive || isVideoActive) && (
              <button
                type="button"
                onClick={onLeaveVoiceCall}
                className="w-full py-1.5 px-3 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95 mt-1"
                title="Disconnect from call"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Leave Call</span>
              </button>
            )}

            {/* Active Screen Share Notice inside Modal if active */}
            {activeScreenSharer && (
              <div className="px-2.5 py-1.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between text-[10px] text-indigo-300 font-mono">
                <div className="flex items-center space-x-1.5 truncate">
                  <Monitor className="w-3 h-3 text-indigo-400 shrink-0 animate-pulse" />
                  <span className="truncate">Screen Stream: <strong className="text-white">{activeScreenSharer.name}</strong></span>
                </div>
                <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded font-bold text-[9px] uppercase">Active</span>
              </div>
            )}

            {/* Live Camera Video Streams Grid */}
            {activeVideoStreams.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-purple-300 font-mono uppercase">
                  <span>Live Video Feeds ({activeVideoStreams.length})</span>
                  <span className="animate-pulse flex items-center space-x-1 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>HD 720p</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {activeVideoStreams.map((v) => (
                    <VideoTile
                      key={v.id}
                      stream={v.stream}
                      name={v.name}
                      isMuted={v.isMuted}
                      isSelf={v.isSelf}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Shareable Link Box */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Shareable Room Link</span>
              <button 
                type="button" 
                onClick={() => setShowQr(!showQr)} 
                className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer font-mono"
              >
                <QrCode className="w-3 h-3" />
                <span>{showQr ? 'Hide QR' : 'Show QR'}</span>
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full min-w-0 bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-slate-300 select-all outline-none truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-xl transition-all flex items-center space-x-1 shrink-0 cursor-pointer active:scale-95 shadow-md shadow-indigo-600/30"
              >
                {copiedLink ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* QR Code display (compact non-breaking box) */}
            {showQr && (
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center justify-center space-y-1.5 mt-2 transition-all">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(shareUrl)}&color=000000&bgcolor=ffffff`} 
                  alt="Room QR Code" 
                  className="w-24 h-24 rounded-lg border border-white/20 p-1 bg-white shrink-0"
                />
                <span className="text-[9px] text-slate-400 font-mono text-center">Scan with camera on mobile to join</span>
              </div>
            )}
          </div>

          {/* Invite Collaborator via Brevo Email */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center space-x-1.5">
                <Mail className="w-3 h-3 text-indigo-400" />
                <span>Invite via Email</span>
              </span>
              <span className="text-[9px] text-slate-500 font-mono">Brevo Delivery</span>
            </div>

            <form onSubmit={handleSendInviteEmail} className="flex items-center space-x-2">
              <input
                type="email"
                placeholder="Enter collaborator's email address..."
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full min-w-0 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50"
              />
              <button
                type="submit"
                disabled={!inviteEmail.trim() || isInvitingEmail}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-[11px] rounded-xl transition-all shrink-0 cursor-pointer flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 active:scale-95"
              >
                {isInvitingEmail ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                <span>{isInvitingEmail ? 'Sending...' : 'Send'}</span>
              </button>
            </form>

            {inviteEmailFeedback && (
              <div className={`text-[10.5px] px-2.5 py-1 rounded-lg flex items-center space-x-1.5 font-medium ${
                inviteEmailFeedback.type === 'success' 
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
              }`}>
                {inviteEmailFeedback.type === 'success' ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
                <span>{inviteEmailFeedback.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-[#0c0c18] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex-1 min-w-0 py-2.5 px-3 text-center text-[11px] font-bold transition-all border-b-2 cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'members'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Participants ({allParticipants.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex-1 min-w-0 py-2.5 px-3 text-center text-[11px] font-bold transition-all border-b-2 cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'chat'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Chat ({chatMessages.length})</span>
          </button>
        </div>

        {/* Tab Content Area (Scrollable flex-1) */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#080811] flex flex-col">
          {activeTab === 'members' ? (
            <div className="p-3 sm:p-4 space-y-3 flex-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                <span>Active ({allParticipants.length})</span>
                <span>Role: <span className="text-indigo-400 font-mono font-bold">{userRole}</span></span>
              </div>

              <div className="space-y-2">
                {allParticipants.map((member) => {
                  const connKey = member.connectionId || member.id;
                  const isSelf = member.connectionId ? member.connectionId === clientConnectionId : member.id === user.id;
                  const isOwner = userRole === 'Owner';
                  const remoteState = member.connectionId ? (remoteParticipants[member.connectionId] || remoteParticipants[member.id]) : remoteParticipants[member.id];

                  const memberIsCallActive = isSelf ? isCallActive : (!!remoteState || isCallActive);
                  const memberIsMuted = isSelf ? isMuted : (remoteState ? remoteState.isMuted : false);
                  const memberIsSpeaking = activeSpeakerId === member.id || activeSpeakerId === member.connectionId || (remoteState ? remoteState.isSpeaking : false);
                  const memberIsSharing = isSelf ? isScreenSharing : (activeScreenSharer?.userId === member.id || activeScreenSharer?.userId === member.connectionId || remoteState?.isScreenSharing);

                  return (
                    <div 
                      key={connKey}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                        memberIsSpeaking
                          ? 'bg-emerald-950/30 border border-emerald-500/50 shadow-md shadow-emerald-500/10'
                          : 'bg-white/[0.03] border border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <img
                            src={member.avatar || user.avatar}
                            alt={member.name}
                            className={`w-8 h-8 rounded-full object-cover border transition-all ${
                              memberIsSpeaking 
                                ? 'border-emerald-400 ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0a0a14] animate-pulse' 
                                : memberIsSharing
                                  ? 'border-indigo-400 ring-2 ring-indigo-500/50'
                                  : 'border-white/10'
                            }`}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=6366f1&color=fff`;
                            }}
                          />
                          <span 
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a14]"
                            style={{ backgroundColor: member.color || '#6366f1' }}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="text-xs font-bold text-white truncate max-w-[110px] sm:max-w-[150px]">
                              {member.name}
                            </span>
                            {member.role === 'Owner' && (
                              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[9px] font-mono font-bold uppercase flex items-center space-x-0.5 shrink-0">
                                <Crown className="w-2.5 h-2.5 fill-amber-300/20" />
                                <span>Owner</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 mt-0.5">
                            {member.isTyping ? (
                              <span className="text-[10px] text-indigo-400 font-mono font-bold animate-pulse block">
                                typing code...
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {member.cursor ? `Line ${member.cursor.lineNumber}:${member.cursor.column}` : 'Active'}
                              </span>
                            )}

                            {/* Audio & Screen Status Badges */}
                            <div className="flex items-center space-x-1 shrink-0">
                              {memberIsCallActive && (
                                memberIsMuted ? (
                                  <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[9px] font-mono flex items-center space-x-0.5" title="Microphone Muted">
                                    <MicOff className="w-2.5 h-2.5 text-amber-400" />
                                    <span>Muted</span>
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[9px] font-mono flex items-center space-x-0.5" title="Mic Live">
                                    <Mic className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                                    <span>Voice</span>
                                  </span>
                                )
                              )}

                              {memberIsSharing && (
                                <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[9px] font-mono flex items-center space-x-0.5" title="Sharing Screen">
                                  <Monitor className="w-2.5 h-2.5 text-indigo-400 animate-pulse" />
                                  <span>Sharing</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Permissions & Actions */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {isOwner && !isSelf ? (
                          <>
                            <CustomRoleDropdown
                              value={member.role || 'Editor'}
                              onChange={(newRole) => onChangeUserRole(member.id, newRole)}
                            />

                            <button
                              type="button"
                              onClick={() => onKickUser(member.id)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl transition-all cursor-pointer active:scale-95"
                              title="Remove Participant"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-mono text-slate-300">
                            {member.role || 'Editor'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons: Leave Room / End Session */}
              <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                {onLeaveRoom && (
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="flex-1 px-3 py-1.5 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-400" />
                    <span>Leave Room</span>
                  </button>
                )}

                {userRole === 'Owner' && (
                  <button
                    type="button"
                    onClick={onEndSession}
                    className="flex-1 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm active:scale-95"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>End Session For All</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Built-in Room Chat Tab */
            <div className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col justify-between min-h-[300px]">
              <div className="space-y-2.5 overflow-y-auto max-h-[260px] pr-1 scrollbar-thin flex-1">
                {chatMessages.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                    <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
                      <MessageSquare className="w-4 h-4 animate-bounce" />
                    </div>
                    <span className="font-semibold text-slate-300 text-xs">Room Chat Active</span>
                    <span className="text-[10px] text-slate-500 max-w-xs">
                      Send live messages to collaborators.
                    </span>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => {
                    const isSelf = 
                      (msg.senderId && msg.senderId === user.id) ||
                      (msg.senderEmail && user.email && msg.senderEmail.toLowerCase() === user.email.toLowerCase()) || 
                      (msg.senderName && user.username && msg.senderName.trim().toLowerCase() === user.username.trim().toLowerCase());

                    return (
                      <div
                        key={msg.id || idx}
                        className={`flex items-start gap-2 ${isSelf ? 'flex-row-reverse justify-start' : 'flex-row'}`}
                      >
                        <img
                          src={msg.senderAvatar || (isSelf ? user.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || 'Collaborator')}&background=6366f1&color=fff`)}
                          alt={msg.senderName || 'User'}
                          className="w-6 h-6 rounded-full object-cover border border-white/20 shrink-0 mt-0.5"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || 'Collaborator')}&background=6366f1&color=fff`;
                          }}
                        />

                        <div className={`flex flex-col ${isSelf ? 'items-end text-right' : 'items-start text-left'} max-w-[80%]`}>
                          <div className={`flex items-center space-x-1 mb-0.5 text-[9px] text-slate-400 font-mono ${isSelf ? 'flex-row-reverse space-x-reverse' : ''}`}>
                            <span className="font-bold text-slate-200">{isSelf ? 'You' : msg.senderName}</span>
                            <span>•</span>
                            <span>
                              {typeof msg.timestamp === 'number' 
                                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : msg.timestamp}
                            </span>
                          </div>
                          <div className={`px-2.5 py-1.5 rounded-xl text-[11px] break-words font-sans leading-relaxed ${
                            isSelf 
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-none' 
                              : 'bg-white/10 text-slate-100 rounded-tl-none border border-white/10'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick Reactions Bar */}
              <div className="flex items-center space-x-1 overflow-x-auto py-1 border-t border-white/10 shrink-0">
                <span className="text-[9px] text-slate-500 uppercase font-mono font-bold shrink-0 mr-1">Quick:</span>
                {['👍', '❤️', '🔥', '🚀', '💯', '🎉', '👋'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSendChatMessage(emoji);
                    }}
                    className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 text-xs rounded border border-white/5 transition-all shrink-0 cursor-pointer active:scale-95"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleSendChat} className="flex items-center space-x-1.5 shrink-0 pt-1">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500/50"
                />
                <button
                  type="submit"
                  disabled={!chatText.trim()}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all shrink-0 cursor-pointer active:scale-95 shadow-md shadow-indigo-600/30"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

