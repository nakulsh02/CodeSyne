import React, { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { UserProfile, CollabUser } from '@shared/types';

export interface RemoteMediaState {
  userId: string;
  name: string;
  avatar: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isVideoOn?: boolean;
  isScreenSharing: boolean;
  connectionId?: string;
  stream?: MediaStream;
  videoStream?: MediaStream;
  connectionState?: 'Connecting' | 'Connected' | 'Reconnecting' | 'Disconnected';
}

export interface ScreenSharerInfo {
  userId: string;
  name: string;
  avatar: string;
  connectionId?: string;
  stream?: MediaStream;
}

interface UseCollabMediaProps {
  roomId: string;
  user: UserProfile;
  wsRef: RefObject<WebSocket | null>;
  clientSessionId: string;
  collaborators: CollabUser[];
  roomConnections?: (CollabUser & { connectionId?: string })[];
  onShowToast?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle'
};

export function useCollabMedia({
  roomId,
  user,
  wsRef,
  clientSessionId,
  collaborators,
  roomConnections,
  onShowToast
}: UseCollabMediaProps) {
  // Voice call state
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Video call state
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);

  // Screen share state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [activeScreenSharer, setActiveScreenSharerState] = useState<ScreenSharerInfo | null>(null);
  const activeScreenSharerRef = useRef<ScreenSharerInfo | null>(null);

  const setActiveScreenSharer = useCallback((action: ScreenSharerInfo | null | ((prev: ScreenSharerInfo | null) => ScreenSharerInfo | null)) => {
    setActiveScreenSharerState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      activeScreenSharerRef.current = next;
      return next;
    });
  }, []);

  // Remote participants state map
  const [remoteParticipants, setRemoteParticipants] = useState<Record<string, RemoteMediaState>>({});

  // Refs for WebRTC & Audio/Video Streams
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioAnalysersRef = useRef<Map<string, { analyser: AnalyserNode; dataArray: Uint8Array }>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeNotificationRef = useRef<Notification | null>(null);

  // Helper to get unique peer connections to prevent duplicate offers and SDP collisions
  const getUniquePeerConnections = useCallback(() => {
    const uniqueMap = new Map<RTCPeerConnection, string>();
    peerConnectionsRef.current.forEach((pc, key) => {
      if (!uniqueMap.has(pc) || !key.startsWith('conn_')) {
        uniqueMap.set(pc, key);
      }
    });
    return uniqueMap;
  }, []);

  // Update document title when voice call is active
  useEffect(() => {
    if (isCallActive) {
      const origTitle = document.title;
      document.title = `🎙️ (Voice Call Active) ${origTitle.replace(/^🎙️ \(Voice Call Active\) /, '')}`;
      return () => {
        document.title = origTitle.replace(/^🎙️ \(Voice Call Active\) /, '');
      };
    }
  }, [isCallActive]);

  // Helper to send WS signaling message
  const sendSignaling = useCallback((payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        connectionId: clientSessionId,
        senderUserId: user.id,
        senderName: user.username,
        senderAvatar: user.avatar,
        ...payload
      }));
    }
  }, [wsRef, clientSessionId, user.id, user.username, user.avatar]);

  // Attach local media streams (audio mic, video camera, & screen share) to a PeerConnection
  const attachLocalTracksToPC = useCallback((pc: RTCPeerConnection) => {
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getAudioTracks().forEach(track => {
        const senders = pc.getSenders();
        const existingAudioSender = senders.find(s => s.track?.kind === 'audio');
        if (existingAudioSender) {
          if (existingAudioSender.track !== track) {
            existingAudioSender.replaceTrack(track).catch(e => console.warn('replaceTrack audio error:', e));
          }
        } else {
          try {
            pc.addTrack(track, localAudioStreamRef.current!);
          } catch (e) {
            console.warn('addTrack audio error:', e);
          }
        }
      });
    }

    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getVideoTracks().forEach(track => {
        const senders = pc.getSenders();
        const existingVideoSender = senders.find(s => s.track?.kind === 'video' && s.track?.id === track.id);
        if (!existingVideoSender) {
          try {
            pc.addTrack(track, localVideoStreamRef.current!);
          } catch (e) {
            console.warn('addTrack video error:', e);
          }
        }
      });
    }

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(track => {
        const senders = pc.getSenders();
        const existingScreenSender = senders.find(s => s.track?.id === track.id);
        if (!existingScreenSender) {
          try {
            pc.addTrack(track, localScreenStreamRef.current!);
          } catch (e) {
            console.warn('addTrack screen error:', e);
          }
        }
      });
    }
  }, []);

  // Audio Context & Analyser setup for speaking level detection
  const setupAudioAnalyser = useCallback((stream: MediaStream, identifier: string) => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current && stream.getAudioTracks().length > 0) {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        audioAnalysersRef.current.set(identifier, { analyser, dataArray });
      }
    } catch (e) {
      console.warn('Audio analyser setup notice:', e);
    }
  }, []);

  // Periodic active speaker check loop
  useEffect(() => {
    if (!isCallActive && audioAnalysersRef.current.size === 0) return;

    speakerCheckIntervalRef.current = setInterval(() => {
      let maxVol = 0;
      let loudestId: string | null = null;

      audioAnalysersRef.current.forEach(({ analyser, dataArray }, identifier) => {
        analyser.getByteFrequencyData(dataArray as any);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        if (avg > 25 && avg > maxVol) {
          maxVol = avg;
          loudestId = identifier;
        }
      });

      setActiveSpeakerId(loudestId);
    }, 200);

    return () => {
      if (speakerCheckIntervalRef.current) {
        clearInterval(speakerCheckIntervalRef.current);
      }
    };
  }, [isCallActive]);

  // Create WebRTC Peer Connection with a target participant
  const createPeerConnection = useCallback((targetUserId: string, targetConnId?: string) => {
    // Check both targetUserId and targetConnId in case it was stored under either key
    let pc = peerConnectionsRef.current.get(targetUserId);
    if (!pc && targetConnId) {
      pc = peerConnectionsRef.current.get(targetConnId);
    }

    if (pc) {
      console.log(`[WebRTC Log] Reusing existing PeerConnection for user:${targetUserId} conn:${targetConnId}`);
      attachLocalTracksToPC(pc);
      return pc;
    }

    console.log(`[WebRTC Log] Creating new RTCPeerConnection for user:${targetUserId} conn:${targetConnId}`);
    pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Index under both targetUserId and targetConnId to guarantee answer & candidate lookup success
    peerConnectionsRef.current.set(targetUserId, pc);
    if (targetConnId) {
      peerConnectionsRef.current.set(targetConnId, pc);
    }

    attachLocalTracksToPC(pc);

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC Log] ICE candidate generated for target:${targetUserId}:`, event.candidate.candidate);
        sendSignaling({
          type: 'webrtc_ice',
          targetUserId,
          targetConnectionId: targetConnId,
          candidate: event.candidate
        });
      }
    };

    // Connection state handler
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Log] PeerConnection state for user:${targetUserId} ->`, pc?.connectionState);
      if (pc?.connectionState === 'connected') {
        setConnectionStatus('connected');
      } else if (pc?.connectionState === 'connecting') {
        setConnectionStatus('connecting');
      } else if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed') {
        setConnectionStatus('reconnecting');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC Log] ICE connection state for user:${targetUserId} ->`, pc?.iceConnectionState);
      if (pc?.iceConnectionState === 'failed' || pc?.iceConnectionState === 'disconnected') {
        console.warn(`[WebRTC Log] ICE connection loss or high latency detected on ${pc?.iceConnectionState} for peer:${targetUserId}. Triggering peer-to-peer ICE restart.`);
        setConnectionStatus('reconnecting');
        pc?.createOffer({ iceRestart: true }).then(offer => {
          pc.setLocalDescription(offer);
          sendSignaling({
            type: 'webrtc_offer',
            targetUserId,
            targetConnectionId: targetConnId,
            sdp: offer
          });
        }).catch(err => console.warn('ICE restart offer error:', err));
      } else if (pc?.iceConnectionState === 'connected' || pc?.iceConnectionState === 'completed') {
        setConnectionStatus('connected');
      }
    };

    // Remote Track Handler
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const track = event.track;
      console.log(`[WebRTC Log] Received remote track kind:${track.kind} id:${track.id} from user:${targetUserId}`);

      if (!remoteStream) return;

      if (track.kind === 'audio') {
        // Create or update audio element for peer
        let audioEl = audioElementsRef.current.get(targetUserId);
        if (!audioEl && targetConnId) {
          audioEl = audioElementsRef.current.get(targetConnId);
        }

        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = `remote-audio-${targetUserId}`;
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          (audioEl as any).volume = 1.0;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          audioElementsRef.current.set(targetUserId, audioEl);
          if (targetConnId) {
            audioElementsRef.current.set(targetConnId, audioEl);
          }
        }
        audioEl.srcObject = remoteStream;

        const playAudio = () => {
          if (audioEl) {
            audioEl.play().then(() => {
              console.log(`[WebRTC Log] Audio playback active for peer:${targetUserId}`);
            }).catch((err) => {
              console.warn('[WebRTC Log] Audio autoplay deferred:', err);
              const unlockAudio = () => {
                if (audioEl) audioEl.play().catch(() => {});
                if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                  audioContextRef.current.resume().catch(() => {});
                }
                window.removeEventListener('click', unlockAudio);
                window.removeEventListener('touchstart', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
              };
              window.addEventListener('click', unlockAudio);
              window.addEventListener('touchstart', unlockAudio);
              window.addEventListener('keydown', unlockAudio);
            });
          }
        };

        playAudio();
        setupAudioAnalyser(remoteStream, targetUserId);
      } else if (track.kind === 'video') {
        const labelLower = (track.label || '').toLowerCase();
        const isScreenByLabel = labelLower.includes('screen') || labelLower.includes('display') || labelLower.includes('window') || labelLower.includes('monitor');
        
        // Check if this peer is currently marked as active screen sharer in state or via connectionId/userId
        const isCurrentSharer = activeScreenSharerRef.current && (
          activeScreenSharerRef.current.userId === targetUserId ||
          activeScreenSharerRef.current.connectionId === targetConnId
        );

        if (isScreenByLabel || isCurrentSharer) {
          console.log(`[WebRTC Log] Remote screen share video stream received & attached for user:${targetUserId}`);
          setActiveScreenSharer(prev => ({
            userId: targetUserId,
            name: prev?.name || 'Collaborator',
            avatar: prev?.avatar || '',
            connectionId: targetConnId || prev?.connectionId,
            stream: remoteStream
          }));
        } else {
          console.log(`[WebRTC Log] Remote camera video stream received for user:${targetUserId}`);
          const participantKey = targetUserId;
          setRemoteParticipants(prev => {
            const existing = prev[participantKey];
            // If participant already has camera video stream and a NEW video track arrives, it's screen share!
            if (existing && existing.videoStream && existing.videoStream.id !== remoteStream.id) {
              console.log(`[WebRTC Log] Second video stream received from user:${targetUserId} -> assigning as Screen Share stream`);
              setActiveScreenSharer({
                userId: targetUserId,
                name: existing.name || 'Collaborator',
                avatar: existing.avatar || '',
                connectionId: targetConnId || existing.connectionId,
                stream: remoteStream
              });
              return prev;
            }

            return {
              ...prev,
              [participantKey]: {
                ...prev[participantKey],
                userId: targetUserId,
                name: prev[participantKey]?.name || 'Collaborator',
                avatar: prev[participantKey]?.avatar || '',
                isMuted: prev[participantKey]?.isMuted ?? false,
                isSpeaking: prev[participantKey]?.isSpeaking ?? false,
                isVideoOn: true,
                isScreenSharing: prev[participantKey]?.isScreenSharing ?? false,
                connectionId: targetConnId || prev[participantKey]?.connectionId,
                videoStream: remoteStream,
                connectionState: 'Connected'
              }
            };
          });
        }
      }
    };

    return pc;
  }, [attachLocalTracksToPC, sendSignaling, setupAudioAnalyser]);

  // Pending ICE candidates queue for when candidates arrive before setRemoteDescription
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Cleanup a participant's WebRTC connection, audio element, analyser, and remote state
  const cleanupParticipant = useCallback((targetUserId?: string, targetConnId?: string) => {
    const keysToClean = new Set<string>();
    if (targetConnId) keysToClean.add(targetConnId);
    if (targetUserId) keysToClean.add(targetUserId);

    keysToClean.forEach(key => {
      const pc = peerConnectionsRef.current.get(key);
      if (pc) {
        try { pc.close(); } catch (e) {}
        peerConnectionsRef.current.delete(key);
      }

      const audioEl = audioElementsRef.current.get(key);
      if (audioEl) {
        try {
          audioEl.pause();
          audioEl.srcObject = null;
          if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
        } catch (e) {}
        audioElementsRef.current.delete(key);
      }

      audioAnalysersRef.current.delete(key);
    });

    // Clear activeScreenSharer if it belonged to this leaving participant
    if (activeScreenSharerRef.current) {
      const sharer = activeScreenSharerRef.current;
      if (
        (targetConnId && sharer.connectionId === targetConnId) ||
        (targetUserId && sharer.userId === targetUserId)
      ) {
        setActiveScreenSharer(null);
      }
    }

    // Remove from remoteParticipants state map
    setRemoteParticipants(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(k => {
        const p = next[k];
        if (
          (targetConnId && (k === targetConnId || p.connectionId === targetConnId)) ||
          (targetUserId && (k === targetUserId || p.userId === targetUserId))
        ) {
          delete next[k];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [setActiveScreenSharer]);

  // Sync peer connections and remote participants with active roomConnections
  useEffect(() => {
    if (!roomConnections) return;
    const activeConnIds = new Set<string>();
    const activeUserIds = new Set<string>();

    roomConnections.forEach(c => {
      if (c.connectionId) activeConnIds.add(c.connectionId);
      if (c.id) activeUserIds.add(c.id);
    });

    setRemoteParticipants(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(key => {
        const p = next[key];
        const connMatch = p.connectionId && activeConnIds.has(p.connectionId);
        const userMatch = p.userId && activeUserIds.has(p.userId);
        if (!connMatch && !userMatch) {
          cleanupParticipant(p.userId, p.connectionId);
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [roomConnections, cleanupParticipant]);

  // Handle incoming WebRTC offer from peer
  const handleOffer = useCallback(async (data: any) => {
    const senderId = data.senderUserId;
    const senderConnId = data.connectionId;
    const isSelfTab = senderConnId ? senderConnId === clientSessionId : (senderId === user.id && !senderConnId);
    if (!senderId || isSelfTab) return;

    if (data.targetConnectionId && data.targetConnectionId !== clientSessionId) return;
    if (data.targetUserId && data.targetUserId !== user.id && !data.targetConnectionId) return;

    console.log(`[WebRTC Log] Received WebRTC offer from senderId:${senderId} connId:${senderConnId}`);

    const targetKey = senderConnId || senderId;
    let pc = peerConnectionsRef.current.get(targetKey) || peerConnectionsRef.current.get(senderId);

    // Glare resolution for simultaneous offers: lexicographical comparison
    const isPolite = clientSessionId > (senderConnId || senderId || '');
    if (pc && pc.signalingState !== 'stable') {
      if (!isPolite) {
        console.log(`[WebRTC Glare] Impolite peer ignoring offer collision from sender:${senderId}`);
        return;
      } else {
        console.log(`[WebRTC Glare] Polite peer rolling back local description for sender:${senderId}`);
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (e) {}
      }
    }

    try {
      if (!pc) {
        pc = createPeerConnection(senderId, senderConnId);
      }
      attachLocalTracksToPC(pc);

      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      console.log(`[WebRTC Log] Remote description set for offer from senderId:${senderId}`);

      // Process any queued ICE candidates for this peer connection
      const pendingCandidates = pendingIceCandidatesRef.current.get(targetKey) || [];
      for (const cand of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      pendingIceCandidatesRef.current.delete(targetKey);

      const answer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(answer);
      console.log(`[WebRTC Log] Created local answer for senderId:${senderId}`);

      sendSignaling({
        type: 'webrtc_answer',
        targetUserId: senderId,
        targetConnectionId: senderConnId,
        sdp: answer
      });
    } catch (err) {
      console.error('[WebRTC Log] Error handling offer:', err);
    }
  }, [user.id, clientSessionId, createPeerConnection, attachLocalTracksToPC, sendSignaling]);

  // Handle incoming WebRTC answer from peer
  const handleAnswer = useCallback(async (data: any) => {
    const senderId = data.senderUserId;
    const senderConnId = data.connectionId;

    if (data.targetConnectionId && data.targetConnectionId !== clientSessionId) return;
    if (data.targetUserId && data.targetUserId !== user.id && !data.targetConnectionId) return;

    console.log(`[WebRTC Log] Received WebRTC answer from senderId:${senderId} connId:${senderConnId}`);

    const pc = peerConnectionsRef.current.get(senderConnId || senderId) || peerConnectionsRef.current.get(senderId);
    
    if (pc) {
      if (pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log(`[WebRTC Log] Successfully set remote answer from senderId:${senderId}`);

          // Process any queued ICE candidates for this peer connection
          const targetKey = senderConnId || senderId;
          const pendingCandidates = pendingIceCandidatesRef.current.get(targetKey) || [];
          for (const cand of pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          pendingIceCandidatesRef.current.delete(targetKey);
        } catch (err) {
          console.error('[WebRTC Log] Error setting remote answer:', err);
        }
      } else {
        console.log(`[WebRTC Log] PeerConnection already in stable state for senderId:${senderId}`);
      }
    } else {
      console.warn(`[WebRTC Log] Could not find active PeerConnection for answer from senderId:${senderId} connId:${senderConnId}`);
    }
  }, [clientSessionId, user.id]);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (data: any) => {
    const senderId = data.senderUserId;
    const senderConnId = data.connectionId;

    if (data.targetConnectionId && data.targetConnectionId !== clientSessionId) return;
    if (data.targetUserId && data.targetUserId !== user.id && !data.targetConnectionId) return;

    const targetKey = senderConnId || senderId;
    const pc = peerConnectionsRef.current.get(targetKey) || peerConnectionsRef.current.get(senderId);
    
    if (pc && data.candidate) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log(`[WebRTC Log] Added ICE candidate from senderId:${senderId}`);
        } catch (err) {
          console.warn('[WebRTC Log] ICE candidate error:', err);
        }
      } else {
        // Buffer candidate until remote description is set
        if (!pendingIceCandidatesRef.current.has(targetKey)) {
          pendingIceCandidatesRef.current.set(targetKey, []);
        }
        pendingIceCandidatesRef.current.get(targetKey)!.push(data.candidate);
      }
    }
  }, [clientSessionId, user.id]);

  // Stop Screen Sharing
  const stopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(track => track.stop());
      localScreenStreamRef.current = null;
    }

    setLocalScreenStream(null);
    setIsScreenSharing(false);
    setActiveScreenSharer(prev => prev?.userId === user.id ? null : prev);

    sendSignaling({
      type: 'screen_share_state',
      isSharing: false,
      sharerUserId: user.id
    });

    if (onShowToast) {
      onShowToast('Screen Share Stopped', 'You stopped sharing your screen.', 'info');
    }
  }, [user.id, sendSignaling, setActiveScreenSharer, onShowToast]);

  // Process incoming WS media signaling messages
  const processWSMessage = useCallback((data: any) => {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'user_left':
      case 'kicked_out':
      case 'webrtc_leave':
        cleanupParticipant(data.userId || data.targetUserId || data.senderUserId, data.connectionId);
        break;

      case 'voice_call_state':
        const isSelfVoiceMsg = data.connectionId ? data.connectionId === clientSessionId : data.senderUserId === user.id;
        if (data.senderUserId && !isSelfVoiceMsg) {
          const participantKey = data.senderUserId;
          setRemoteParticipants(prev => ({
            ...prev,
            [participantKey]: {
              ...prev[participantKey],
              userId: data.senderUserId,
              name: data.senderName || prev[participantKey]?.name || 'Collaborator',
              avatar: data.senderAvatar || prev[participantKey]?.avatar || '',
              isMuted: !!data.isMuted,
              isSpeaking: false,
              isVideoOn: data.isVideoActive && !data.isCameraOff,
              isScreenSharing: !!data.isScreenSharing,
              connectionId: data.connectionId || prev[participantKey]?.connectionId
            }
          }));

          // If local user is in active voice call and remote user is also active in call, send WebRTC offer
          if (isCallActive && data.isVoiceActive) {
            const pc = createPeerConnection(data.senderUserId, data.connectionId);
            pc.createOffer().then(offer => {
              pc.setLocalDescription(offer);
              sendSignaling({
                type: 'webrtc_offer',
                targetUserId: data.senderUserId,
                targetConnectionId: data.connectionId,
                sdp: offer
              });
            }).catch(e => console.error('Error creating offer for participant:', e));
          }
        }
        break;

      case 'screen_share_state':
        if (data.isSharing) {
          setActiveScreenSharer({
            userId: data.sharerUserId || data.senderUserId,
            name: data.sharerName || data.senderName || 'Collaborator',
            avatar: data.sharerAvatar || data.senderAvatar || '',
            connectionId: data.connectionId
          });
          if (data.sharerUserId !== user.id && isScreenSharing) {
            stopScreenShare();
            if (onShowToast) {
              onShowToast('Screen Share Takeover', `${data.sharerName || 'Collaborator'} started sharing screen.`, 'info');
            }
          }
        } else {
          if (activeScreenSharer?.userId === (data.sharerUserId || data.senderUserId)) {
            setActiveScreenSharer(null);
          }
        }
        break;

      case 'webrtc_offer':
        handleOffer(data);
        break;

      case 'webrtc_answer':
        handleAnswer(data);
        break;

      case 'webrtc_ice':
        handleIceCandidate(data);
        break;
    }
  }, [user.id, clientSessionId, isCallActive, isScreenSharing, cleanupParticipant, createPeerConnection, sendSignaling, handleOffer, handleAnswer, handleIceCandidate, activeScreenSharer?.userId, stopScreenShare, onShowToast]);

  // Start Voice Call (with tablet/mobile audio constraint fallback)
  const startVoiceCall = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (constrainedErr) {
        console.warn('[Voice Call] Constrained audio capture failed, trying basic audio capture fallback:', constrainedErr);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      localAudioStreamRef.current = stream;
      setIsCallActive(true);
      setIsMuted(false);
      setConnectionStatus('connected');

      setupAudioAnalyser(stream, user.id);

      // Unlock AudioContext and play any remote audio elements
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      audioElementsRef.current.forEach((el) => {
        el.play().catch(() => {});
      });

      // Broadcast voice active state to room
      sendSignaling({
        type: 'voice_call_state',
        isVoiceActive: true,
        isMuted: false,
        isVideoActive,
        isScreenSharing
      });

      // 1. Add audio tracks to all existing peer connections and send renegotiation offers
      getUniquePeerConnections().forEach((key, pc) => {
        attachLocalTracksToPC(pc);
        pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(offer => {
          pc.setLocalDescription(offer);
          sendSignaling({
            type: 'webrtc_offer',
            targetUserId: key,
            sdp: offer
          });
        }).catch(e => console.error('Error offering to existing peer connection:', e));
      });

      // 2. Also send WebRTC offer to room collaborators that do not have a peer connection yet
      collaborators.forEach(collab => {
        if (collab.id !== user.id && !peerConnectionsRef.current.has(collab.id)) {
          const pc = createPeerConnection(collab.id);
          pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(offer => {
            pc.setLocalDescription(offer);
            sendSignaling({
              type: 'webrtc_offer',
              targetUserId: collab.id,
              sdp: offer
            });
          }).catch(e => console.error('Error offering to collaborator:', e));
        }
      });

      if (onShowToast) {
        onShowToast('Voice Call Active 🎙️', 'Connected to room audio stream. Talk freely!', 'success');
      }
    } catch (err: any) {
      console.error('[Voice Call] Permission or initialization error:', err);
      setConnectionStatus('disconnected');
      setIsCallActive(false);

      let msg = 'Could not access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone permission denied. Please enable mic access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No microphone device found on this system.';
      }

      if (onShowToast) {
        onShowToast('Voice Call Error', msg, 'error');
      }
    }
  }, [user.id, isVideoActive, isScreenSharing, collaborators, attachLocalTracksToPC, createPeerConnection, sendSignaling, setupAudioAnalyser, onShowToast]);

  // Start Video Call (Camera + Mic)
  const startVideoCall = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      let videoStream: MediaStream;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true
        });
      } catch (err) {
        console.warn('[Video Call] Constrained video capture failed, trying basic video/audio:', err);
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      localVideoStreamRef.current = videoStream;
      setLocalVideoStream(videoStream);
      setIsVideoActive(true);
      setIsCameraOff(false);

      // Separate audio track if available
      const audioTrack = videoStream.getAudioTracks()[0];
      if (audioTrack) {
        const audioStream = new MediaStream([audioTrack]);
        localAudioStreamRef.current = audioStream;
        setIsCallActive(true);
        setIsMuted(false);
        setupAudioAnalyser(audioStream, user.id);
      }

      setConnectionStatus('connected');

      // Attach tracks and send offers to all peers
      getUniquePeerConnections().forEach((key, pc) => {
        attachLocalTracksToPC(pc);
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
          sendSignaling({
            type: 'webrtc_offer',
            targetUserId: key,
            sdp: offer
          });
        }).catch(e => console.error('Error offering video to existing peer connection:', e));
      });

      collaborators.forEach(collab => {
        if (collab.id !== user.id && !peerConnectionsRef.current.has(collab.id)) {
          const pc = createPeerConnection(collab.id);
          pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            sendSignaling({
              type: 'webrtc_offer',
              targetUserId: collab.id,
              sdp: offer
            });
          }).catch(e => console.error('Error offering video to collaborator:', e));
        }
      });

      sendSignaling({
        type: 'voice_call_state',
        isVoiceActive: true,
        isMuted: false,
        isVideoActive: true,
        isScreenSharing
      });

      if (onShowToast) {
        onShowToast('Video Call Started 📹', 'Camera and microphone are live!', 'success');
      }
    } catch (err: any) {
      console.error('[Video Call] Error starting camera:', err);
      setIsVideoActive(false);
      if (onShowToast) {
        onShowToast('Video Call Error', err.message || 'Could not access camera.', 'error');
      }
    }
  }, [user.id, isScreenSharing, collaborators, attachLocalTracksToPC, createPeerConnection, sendSignaling, setupAudioAnalyser, onShowToast]);

  // Toggle Camera On / Off
  const toggleCamera = useCallback(() => {
    if (!localVideoStreamRef.current) return;
    const nextCameraOff = !isCameraOff;
    localVideoStreamRef.current.getVideoTracks().forEach(track => {
      track.enabled = !nextCameraOff;
    });
    setIsCameraOff(nextCameraOff);

    sendSignaling({
      type: 'voice_call_state',
      isVoiceActive: isCallActive,
      isMuted,
      isVideoActive: !nextCameraOff,
      isScreenSharing
    });

    if (onShowToast) {
      onShowToast(nextCameraOff ? 'Camera Turned Off 📷' : 'Camera Turned On 📹', nextCameraOff ? 'Your camera feed is paused' : 'Your video feed is live', 'info');
    }
  }, [isCameraOff, isCallActive, isMuted, isScreenSharing, sendSignaling, onShowToast]);

  // Toggle Mute / Unmute
  const toggleMute = useCallback(() => {
    if (!localAudioStreamRef.current) return;
    const newMuted = !isMuted;
    localAudioStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMuted;
    });
    setIsMuted(newMuted);

    sendSignaling({
      type: 'voice_call_state',
      isVoiceActive: isCallActive,
      isMuted: newMuted,
      isScreenSharing
    });

    if (onShowToast) {
      onShowToast(newMuted ? 'Microphone Muted' : 'Microphone Unmuted', newMuted ? 'Your mic is now muted' : 'Your mic is live', 'info');
    }
  }, [isMuted, isCallActive, isScreenSharing, sendSignaling, onShowToast]);

  // Leave Voice / Video Call
  const leaveVoiceCall = useCallback(() => {
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach(track => track.stop());
      localAudioStreamRef.current = null;
    }

    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach(track => track.stop());
      localVideoStreamRef.current = null;
    }

    setLocalVideoStream(null);
    setIsVideoActive(false);
    setIsCameraOff(false);

    // Clean up audio elements from DOM
    audioElementsRef.current.forEach((audioEl) => {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        if (audioEl.parentNode) {
          audioEl.parentNode.removeChild(audioEl);
        }
      } catch (e) {}
    });
    audioElementsRef.current.clear();

    // Close system notification
    if (activeNotificationRef.current) {
      activeNotificationRef.current.close();
      activeNotificationRef.current = null;
    }

    setIsCallActive(false);
    setIsMuted(false);
    setConnectionStatus('disconnected');

    sendSignaling({
      type: 'voice_call_state',
      isVoiceActive: false,
      isMuted: true,
      isVideoActive: false,
      isScreenSharing
    });

    if (onShowToast) {
      onShowToast('Call Ended 📞', 'Disconnected from audio & video call.', 'info');
    }
  }, [isScreenSharing, sendSignaling, onShowToast]);

  // Start Screen Sharing
  const startScreenShare = useCallback(async () => {
    // Safely check if getDisplayMedia is supported on the current device & browser
    const getDisplayMediaFn = navigator.mediaDevices && (
      navigator.mediaDevices.getDisplayMedia || 
      (navigator.mediaDevices as any).webkitGetDisplayMedia
    );

    if (!getDisplayMediaFn) {
      console.warn('[Screen Share Log] getDisplayMedia is not available in this browser environment.');
      if (onShowToast) {
        onShowToast(
          'Screen Share Unsupported',
          'Screen sharing requires a desktop browser (Chrome, Brave, Edge, Firefox). Mobile or restricted frames do not support screen capture.',
          'warning'
        );
      }
      return;
    }

    try {
      console.log('[Screen Share Log] Requesting display media stream...');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
            logicalSurface: true,
            cursor: 'always'
          } as any,
          audio: true
        });
      } catch (displayErr: any) {
        // If user cancelled, rethrow to outer catch block
        if (displayErr.name === 'NotAllowedError' || displayErr.name === 'PermissionDeniedError' || displayErr.name === 'AbortError') {
          throw displayErr;
        }
        console.log('[Screen Share Log] System audio capture omitted/unsupported, falling back to video-only display media');
        // Fallback to video-only display media if system audio capture is unsupported
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
      }

      console.log('[Screen Share Log] Screen stream acquired successfully with tracks:', stream.getTracks().map(t => `${t.kind}:${t.id}`));
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsScreenSharing(true);

      const sharerInfo: ScreenSharerInfo = {
        userId: user.id,
        name: `${user.username} (You)`,
        avatar: user.avatar,
        connectionId: clientSessionId,
        stream
      };

      setActiveScreenSharer(sharerInfo);

      // Add track ended listener (user clicks "Stop sharing" browser banner)
      stream.getVideoTracks().forEach(track => {
        track.onended = () => {
          console.log('[Screen Share Log] Video track ended by browser UI banner stop button.');
          stopScreenShare();
        };
      });

      // Broadcast screen share state across room
      sendSignaling({
        type: 'screen_share_state',
        isSharing: true,
        sharerUserId: user.id,
        sharerName: user.username,
        sharerAvatar: user.avatar
      });

      // Send screen share video track to all active peer connections
      getUniquePeerConnections().forEach((targetKey, pc) => {
        attachLocalTracksToPC(pc);
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
          sendSignaling({
            type: 'webrtc_offer',
            targetUserId: targetKey,
            sdp: offer
          });
          console.log(`[Screen Share Log] Sent renegotiation offer for screen share to peer:${targetKey}`);
        }).catch(e => console.warn('[Screen Share Log] Offer renegotiation error:', e));
      });

      if (onShowToast) {
        onShowToast('Screen Sharing Live 🖥️', 'Your screen is now visible in the Collaboration Center.', 'success');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'AbortError') {
        console.info('[Screen Share Log] User cancelled or denied screen selection.');
      } else {
        console.error('[Screen Share Log] Error starting screen share:', err);
        if (onShowToast) {
          onShowToast('Screen Share Notice', err.message || 'Could not start screen sharing.', 'error');
        }
      }
    }
  }, [user.id, user.username, user.avatar, clientSessionId, sendSignaling, attachLocalTracksToPC, onShowToast]);

  // Clean up all media & connections on unmount
  useEffect(() => {
    return () => {
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (localVideoStreamRef.current) {
        localVideoStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();

      audioElementsRef.current.forEach(el => {
        el.pause();
        el.srcObject = null;
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      audioElementsRef.current.clear();

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (activeNotificationRef.current) {
        activeNotificationRef.current.close();
        activeNotificationRef.current = null;
      }
    };
  }, []);

  return {
    isCallActive,
    isMuted,
    isVideoActive,
    isCameraOff,
    localVideoStream,
    connectionStatus,
    activeSpeakerId,
    isScreenSharing,
    localScreenStream,
    activeScreenSharer,
    remoteParticipants,
    startVoiceCall,
    startVideoCall,
    toggleCamera,
    toggleMute,
    leaveVoiceCall,
    startScreenShare,
    stopScreenShare,
    processWSMessage
  };
}
