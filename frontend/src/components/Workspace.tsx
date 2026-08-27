import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  Files, Folder, Search, GitBranch, History, MessageSquare, Cpu, Settings, 
  Play, Square, Monitor, ChevronLeft, Bug, Blocks, ArrowLeft, Shield, X, Keyboard,
  Terminal, Globe, FileCode, Eye, Users, PhoneOff, Mic, MicOff, Video, VideoOff, AlertTriangle
} from 'lucide-react';
import Sidebar, { SidebarTab } from './IDE/Sidebar';
import FileExplorer from './IDE/FileExplorer';
import SearchTools from './IDE/SearchTools';
import GitTools from './IDE/GitTools';
import VersionTools from './IDE/VersionTools';
import CollabChat from './IDE/CollabChat';
import SettingsPanel, { IDETheme } from './IDE/SettingsPanel';
import EditorArea from './IDE/EditorArea';
import PreviewPanel from './IDE/PreviewPanel';
import TerminalPanel, { TerminalLine } from './IDE/TerminalPanel';
import CollaborationModal from './IDE/CollaborationModal';
import CollabFloatingWidget from './IDE/CollabFloatingWidget';
import ScreenShareViewer from './IDE/ScreenShareViewer';
import FloatingVideoOverlay from './IDE/FloatingVideoOverlay';
import { useCollabMedia } from '../hooks/useCollabMedia';
import AdminDashboard from './AdminDashboard';
import { API_BASE_URL, getWebSocketUrl } from '../config';
import { safeFetch } from '../api';
import { simulateCodeExecutionClient, hasInteractiveStdin } from '../utils/codeSimulator';
import { sanitizeAndFixCode } from '../utils/codeFixer';
import { TEMPLATES } from '@shared/mockData';

import { 
  Project, FileSystemState, FileNode, OpenTab, ChatMessage, CollabUser, 
  GitCommit, VersionSnapshot, ExecutionResult, UserProfile, FileAccessLog 
} from '@shared/types';

interface WorkspaceProps {
  user: UserProfile;
  project: Project;
  onGoBack: () => void;
  onShowToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void;
  onUpdateUser?: (updatedUser: UserProfile) => void;
  onUpdateProjectFiles?: (projectId: string, newFiles: FileSystemState) => void;
  theme: IDETheme;
  onChangeTheme: (theme: IDETheme) => void;
}

export default function Workspace({
  user,
  project,
  onGoBack,
  onShowToast,
  onUpdateUser,
  onUpdateProjectFiles,
  theme,
  onChangeTheme
}: WorkspaceProps) {
  
  // Tab/Panel layouts
  const [activeTab, setActiveTab] = useState<SidebarTab | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [sessionEndedNotice, setSessionEndedNotice] = useState<string | null>(null);

  // Mobile navigation views: 'editor' | 'preview' | 'terminal' | 'chat'
  const [mobileActiveView, setMobileActiveView] = useState<'editor' | 'preview' | 'terminal' | 'chat'>('editor');

  // Resizing states
  const [sidePanelWidth, setSidePanelWidth] = useState<number>(250);
  const [editorWidthPercent, setEditorWidthPercent] = useState<number>(60);
  const [previewHeightPercent, setPreviewHeightPercent] = useState<number>(50);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || (window.innerWidth < 1024 && window.innerHeight < 520);
    }
    return false;
  });

  // VS Code activity-bar click tracking for single vs double clicks
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTabClick = (tabId: SidebarTab | null) => {
    if (!tabId) {
      setActiveTab(null);
      return;
    }
    
    if (isMobile) {
      // Instant toggle on mobile/tablet to avoid touch-tap latency and support fast clicks
      setActiveTab(prev => {
        const next = prev === tabId ? null : tabId;
        if (next === 'explorer') {
          setMobileActiveView('editor');
        }
        return next;
      });
      return;
    }
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      // Double click -> collapse the sidebar panel
      setActiveTab(null);
      if (notifications) {
        onShowToast('Sidebar Collapsed', 'Panel collapsed to full editor space.', 'info');
      }
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        // Single click -> toggle active tab
        setActiveTab(prev => prev === tabId ? null : tabId);
      }, 250);
    }
  };

  // Detect mobile viewport & Lock body layout to prevent virtual keyboard shift/scroll bugs
  useEffect(() => {
    const checkMobile = () => {
      const winW = window.innerWidth;
      setIsMobile(winW < 768 || (winW < 1024 && window.innerHeight < 520));

      // Automatic Responsive Resize adjustment: restrict side panel max width (180px - 280px or 28% win width)
      setSidePanelWidth(prev => {
        const minVal = 180;
        const maxVal = Math.min(280, Math.max(minVal, Math.floor(winW * 0.28)));
        if (prev < minVal) return minVal;
        if (prev > maxVal) return maxVal;
        return prev;
      });
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const originalOverflow = document.body.style.overflow;

    // Prevent body overflow glitches on small screens
    const isTouchOnlyDevice = (window.innerWidth < 768) && ('ontouchstart' in window);
    if (isTouchOnlyDevice) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      if (isTouchOnlyDevice) {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, []);

  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleSidePanelResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startWidth = sidePanelWidth;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - startX;
      // Responsive side panel bounds: min 180px, max 420px or 32% screen width
      const maxSidePanel = Math.min(420, Math.max(220, Math.floor(window.innerWidth * 0.32)));
      const newWidth = Math.max(180, Math.min(maxSidePanel, startWidth + deltaX));
      setSidePanelWidth(newWidth);
    };

    const handleEnd = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  };

  const handleEditorResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    
    const container = document.getElementById('split_panels_container');
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const startPercent = editorWidthPercent;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      
      // Ensure Editor gets guaranteed spacious width (at least 40% or 360px)
      // Ensure Right Panel (Preview + Terminal) gets at least 350px
      const minEditorPx = 360;
      const minRightPx = 350;
      
      const minEditorPercent = Math.max(40, (minEditorPx / containerWidth) * 100);
      const maxEditorPercent = Math.min(65, 100 - (minRightPx / containerWidth) * 100);
      
      const safeMin = Math.min(minEditorPercent, maxEditorPercent);
      const safeMax = Math.max(minEditorPercent, maxEditorPercent);
      
      const newPercent = Math.max(safeMin, Math.min(safeMax, startPercent + deltaPercent));
      setEditorWidthPercent(newPercent);
    };

    const handleEnd = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  };

  const handlePreviewResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const container = document.getElementById('right_panels_container');
    if (!container) return;
    const containerHeight = container.getBoundingClientRect().height;
    const startPercent = previewHeightPercent;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaY = currentY - startY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      
      // Ensure Web Preview and Terminal each get at least 35% height and 160px min
      const minPreviewPx = 160;
      const minTerminalPx = 160;
      
      const minPreviewPercent = Math.max(35, (minPreviewPx / containerHeight) * 100);
      const maxPreviewPercent = Math.min(65, 100 - (minTerminalPx / containerHeight) * 100);
      
      const safeMin = Math.min(minPreviewPercent, maxPreviewPercent);
      const safeMax = Math.max(minPreviewPercent, maxPreviewPercent);
      
      const newPercent = Math.max(safeMin, Math.min(safeMax, startPercent + deltaPercent));
      setPreviewHeightPercent(newPercent);
    };

    const handleEnd = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  };

  // File states
  const clientSessionIdRef = useRef<string>('sess_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
  const [files, setFiles] = useState<FileSystemState>(() => {
    return project.files || (TEMPLATES as any)[project.type]?.files || (TEMPLATES as any).web?.files || {};
  });
  const filesRef = useRef<FileSystemState>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Real-time automatic persistence on tab unload / component unmount
  useEffect(() => {
    if (!project?.id) return;

    const flushSave = () => {
      if (filesRef.current && Object.keys(filesRef.current).length > 0) {
        const payload = JSON.stringify(filesRef.current);
        const url = `/api/projects/${project.id}/files?connectionId=${clientSessionIdRef.current}`;
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } else {
          safeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', flushSave);
    return () => {
      window.removeEventListener('beforeunload', flushSave);
      flushSave();
    };
  }, [project?.id]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Settings
  const [fontSize, setFontSize] = useState<number>(14);
  const [autoSave, setAutoSave] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<boolean>(true);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Theme styling helpers
  const isLightTheme = theme === 'light';
  const isCyberTheme = theme === 'cyberpunk';
  
  const rootBgClass = isLightTheme 
    ? 'bg-[#f8fafc] text-slate-800' 
    : isCyberTheme 
      ? 'bg-[#05030d] text-pink-200' 
      : 'bg-[#030307] text-slate-300';
      
  const mainBgClass = isLightTheme 
    ? 'bg-[#f1f5f9]' 
    : isCyberTheme 
      ? 'bg-[#090514]' 
      : 'bg-[#040409]';
      
  const borderClass = isLightTheme 
    ? 'border-slate-200' 
    : isCyberTheme 
      ? 'border-pink-500/20' 
      : 'border-white/5';
      
  const leftPanelBgClass = isLightTheme 
    ? 'bg-white border-r border-slate-200 text-slate-800' 
    : isCyberTheme 
      ? 'bg-[#0d071d]/95 border-r border-pink-500/20 text-pink-200' 
      : 'bg-[#08080d]/95 border-r border-white/5 text-slate-300';
      
  const leftHeaderBgClass = isLightTheme 
    ? 'bg-slate-100 border-b border-slate-200' 
    : isCyberTheme 
      ? 'bg-[#0b0618]/90 border-b border-pink-500/20' 
      : 'bg-[#06060a]/90 border-b border-white/5';

  const leftContentBgClass = isLightTheme 
    ? 'bg-[#f8fafc]/40' 
    : isCyberTheme 
      ? 'bg-[#0c061a]/40' 
      : 'bg-[#0a0a0f]/40';

  // Collaboration States
  const [collabRoomId, setCollabRoomId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search || window.location.hash.replace('#', '?'));
      const roomParam = params.get('collab') || params.get('room');
      if (roomParam) return roomParam;
    }
    return (project as any).originalId || project.id;
  });
  const [showCollabModal, setShowCollabModal] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'Owner' | 'Editor' | 'Viewer'>(() => {
    if (project.ownerId === user.email || project.ownerId === user.id) return 'Owner';
    return 'Editor';
  });

  // Keep collabRoomId and userRole strictly synced with active project & logged in user
  useEffect(() => {
    const isOwner = project.ownerId === user.email || project.ownerId === user.id;
    setUserRole(isOwner ? 'Owner' : 'Editor');
    const targetRoom = (project as any).originalId || project.id;
    setCollabRoomId(targetRoom);
  }, [project.id, project.ownerId, user.email, user.id]);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [collaborators, setCollaborators] = useState<CollabUser[]>([]);
  const [roomConnections, setRoomConnections] = useState<(CollabUser & { connectionId?: string })[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(project.messages || []);

  // Git states
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [commitsList, setCommitsList] = useState<GitCommit[]>([]);

  // Snapshots (Versions) & File Access Logs
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [fileAccessLogs, setFileAccessLogs] = useState<FileAccessLog[]>([]);

  // Fetch initial file access logs for cross-device history
  useEffect(() => {
    if (!project.id) return;
    fetch(`/api/projects/${project.id}/file-access-logs`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setFileAccessLogs(data);
        }
      })
      .catch(() => {});
  }, [project.id]);

  // Real Executions & STDIN handling
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isRunningCode, setIsRunningCode] = useState<boolean>(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState<boolean>(false);
  const activeStdinResolverRef = useRef<((input: string, isAborted?: boolean) => void) | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const executionAbortControllerRef = useRef<AbortController | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<TerminalLine[]>([
    { text: 'Codesyne Cloud Terminal v2.4.0 (x86_64-pc-linux-gnu)', type: 'system' },
    { text: 'Type "help" to view available shell commands. Ctrl+C to cancel prompt.', type: 'info' },
    { text: '', type: 'default' }
  ]);

  const handleStopExecution = () => {
    isRunningRef.current = false;
    if (executionAbortControllerRef.current) {
      executionAbortControllerRef.current.abort();
      executionAbortControllerRef.current = null;
    }
    if (activeStdinResolverRef.current) {
      activeStdinResolverRef.current('', true);
      activeStdinResolverRef.current = null;
    }
    setIsWaitingForInput(false);
    setIsRunningCode(false);
    setTerminalHistory(prev => [
      ...prev,
      { text: '[PROCESS HALTED]: Execution stopped and cancelled by user.', type: 'error' },
      { text: '', type: 'default' }
    ]);
    onShowToast('Execution Stopped', 'Code execution process halted.', 'info');
  };

  // WebSocket Ref for collaborative typing
  const wsRef = useRef<WebSocket | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsBroadcastTimeoutsRef = useRef<{ [fileId: string]: any }>({});
  const wsLastSendTimesRef = useRef<{ [fileId: string]: number }>({});

  // Open first file in workspace by default on boot
  useEffect(() => {
    const fileIds = Object.keys(files).filter(id => {
      const file = files[id];
      if (!file || file.type !== 'file') return false;
      const name = file.name ? file.name.toLowerCase() : '';
      return name !== 'dockerfile' && name !== 'vercel.json';
    });
    if (fileIds.length > 0) {
      handleSelectFile(fileIds[0]);
    }

    // Capture initial backup snapshot
    handleTakeSnapshot('Initial project workspace directory seed');
  }, []);

  // Global Keyboard Shortcuts Event Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      // 1. Save Active File: Ctrl + S / Cmd + S
      if (modKey && !e.shiftKey && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        if (activeFileId) {
          handleSaveFile(activeFileId);
        }
        return;
      }

      // 2. Run / Compile Active Code: Ctrl + Enter / Cmd + Enter
      if (modKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleRunActiveFile();
        return;
      }

      // 3. Toggle Sidebar / Rail: Ctrl + B / Cmd + B
      if (modKey && !e.shiftKey && !e.altKey && key === 'b') {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev ? null : 'explorer');
        return;
      }

      // 4. Toggle Unified AI Chatbot / Assistant: Ctrl + L, Ctrl + I, Alt + C, Ctrl + Shift + C, Alt + A, Ctrl + Shift + A
      if (
        (modKey && !e.shiftKey && (key === 'l' || key === 'i')) || 
        (e.altKey && (key === 'c' || key === 'a')) || 
        (modKey && e.shiftKey && (key === 'c' || key === 'a'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => (prev === 'chat' || prev === 'ai') ? null : 'chat');
        return;
      }

      // 6. Toggle File Explorer: Alt + E, Ctrl + Shift + E
      if ((e.altKey && key === 'e') || (modKey && e.shiftKey && key === 'e')) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev === 'explorer' ? null : 'explorer');
        return;
      }

      // 7. Toggle Global Search: Alt + F, Ctrl + Shift + F
      if ((e.altKey && key === 'f') || (modKey && e.shiftKey && key === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev === 'search' ? null : 'search');
        return;
      }

      // 8. Toggle Source Control / Git: Alt + G, Ctrl + Shift + G
      if ((e.altKey && key === 'g') || (modKey && e.shiftKey && key === 'g')) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev === 'git' ? null : 'git');
        return;
      }

      // 9. Toggle Run & Debug: Alt + D, Ctrl + Shift + D
      if ((e.altKey && key === 'd') || (modKey && e.shiftKey && key === 'd')) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev === 'rundebug' ? null : 'rundebug');
        return;
      }

      // 10. Toggle Extensions: Alt + X, Ctrl + Shift + X
      if ((e.altKey && key === 'x') || (modKey && e.shiftKey && key === 'x')) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev === 'extensions' ? null : 'extensions');
        return;
      }

      // 11. Toggle Settings: Alt + S, Ctrl + ,
      if ((e.altKey && key === 's') || (modKey && e.key === ',')) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => prev === 'settings' ? null : 'settings');
        return;
      }

      // 12. Toggle Terminal Panel: Ctrl + ` (tilde), Ctrl + J, Ctrl + Tab
      if (modKey && (e.key === '`' || key === 'j' || e.key === 'Tab')) {
        e.preventDefault();
        e.stopPropagation();
        setPreviewHeightPercent(prev => prev === 100 ? 50 : 100);
        return;
      }

      // 13. Toggle Live Web Preview: Ctrl + Shift + P, Alt + P, Ctrl + M
      if ((modKey && e.shiftKey && key === 'p') || (e.altKey && key === 'p') || (modKey && key === 'm')) {
        e.preventDefault();
        e.stopPropagation();
        setShowPreview(prev => !prev);
        return;
      }

      // 14. Shortcuts Cheatsheet Modal: Ctrl + Shift + K, Ctrl + /, Alt + /
      if ((modKey && e.shiftKey && key === 'k') || (modKey && e.key === '/') || (e.altKey && e.key === '/')) {
        e.preventDefault();
        e.stopPropagation();
        setShowShortcutsModal(prev => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [activeFileId, activeTab, files]);

  // Web Sockets for real-time multiplayer room synchronization!
  const hasConnectedToastShownRef = useRef<boolean>(false);

  // Voice Call and Screen Sharing Media Hook
  const collabMedia = useCollabMedia({
    roomId: collabRoomId,
    user,
    wsRef,
    clientSessionId: clientSessionIdRef.current,
    collaborators,
    roomConnections,
    onShowToast
  });

  useEffect(() => {
    hasConnectedToastShownRef.current = false;
  }, [collabRoomId]);

  const persistProjectFiles = async (filesToSave?: FileSystemState) => {
    const targetFiles = filesToSave || filesRef.current;
    if (onUpdateProjectFiles) {
      onUpdateProjectFiles(project.id, targetFiles);
    }
    try {
      await safeFetch(`/api/projects/${project.id}/files?connectionId=${clientSessionIdRef.current}&userId=${encodeURIComponent(user.id)}&email=${encodeURIComponent(user.email || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: targetFiles,
          userId: user.id,
          email: user.email,
          ownerId: project.ownerId || user.id
        })
      });

      await safeFetch(`/api/projects/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          name: project.name,
          description: project.description,
          type: project.type,
          ownerId: project.ownerId || user.id,
          userId: user.id,
          email: user.email,
          sharedWith: Array.from(new Set([user.id, user.email, ...(project.sharedWith || [])].filter(Boolean))),
          files: targetFiles
        })
      }).catch(() => {});
    } catch (e) {
      console.error('[Collab Sync] Error saving project files:', e);
    }
  };

  const lastCursorSendTimeRef = useRef<number>(0);
  const isExplicitlyClosedRef = useRef<boolean>(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let isMounted = true;
    let reconnectTimer: any = null;

    if (!collabRoomId) {
      setWsStatus('disconnected');
      return;
    }

    isExplicitlyClosedRef.current = false;

    const connectWS = () => {
      if (isExplicitlyClosedRef.current) return;
      setWsStatus('connecting');
      const wsUrl = getWebSocketUrl(collabRoomId, user, clientSessionIdRef.current);

      try {
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setWsStatus('connected');
          if (notifications && !hasConnectedToastShownRef.current) {
            hasConnectedToastShownRef.current = true;
            onShowToast('Room Connected', `Connected to real-time collaboration room ${collabRoomId}`, 'success');
          }
          // Request current file system state from room host
          try {
            socket.send(JSON.stringify({
              type: 'request_sync',
              connectionId: clientSessionIdRef.current
            }));
          } catch (e) {}
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            
            // Forward to WebRTC & Voice/Screen sharing media processor
            collabMedia.processWSMessage(data);

            if (data.type === 'init_sync' || data.type === 'user_joined' || data.type === 'user_left') {
              if (data.usersList) {
                setRoomConnections(data.usersList);
                const otherCollaborators = data.usersList.filter((c: any) => 
                  c.connectionId ? c.connectionId !== clientSessionIdRef.current : c.id !== user.id
                );
                setCollaborators(otherCollaborators);
              }
              if (data.type === 'user_joined' && data.joinedUser && data.connectionId !== clientSessionIdRef.current) {
                onShowToast('Collaborator Joined 👥', `${data.joinedUser.name || 'A participant'} entered room ${collabRoomId}`, 'info');
              }
            } else if (data.type === 'request_files_state') {
              if (data.requesterConnectionId !== clientSessionIdRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'send_files_state',
                  targetUserId: data.requesterId,
                  connectionId: clientSessionIdRef.current,
                  files: filesRef.current
                }));
              }
            } else if (data.type === 'files_state_synced' || data.type === 'files_updated') {
              if (data.senderConnectionId !== clientSessionIdRef.current && data.files && Object.keys(data.files).length > 0) {
                setFiles(data.files);
                filesRef.current = data.files;
                if (onUpdateProjectFiles) {
                  onUpdateProjectFiles(project.id, data.files);
                }
              }
            } else if (data.type === 'cursor_update' || data.type === 'cursor_move') {
              if (data.connectionId !== clientSessionIdRef.current) {
                setCollaborators(prev => prev.map(c => 
                  ((c as any).connectionId && data.connectionId ? (c as any).connectionId === data.connectionId : c.id === data.userId)
                    ? { ...c, cursor: data.cursor }
                    : c
                ));
              }
            } else if (data.type === 'typing_update') {
              if (data.connectionId !== clientSessionIdRef.current) {
                setCollaborators(prev => prev.map(c => 
                  ((c as any).connectionId && data.connectionId ? (c as any).connectionId === data.connectionId : c.id === data.userId)
                    ? { ...c, isTyping: data.isTyping }
                    : c
                ));
              }
            } else if (data.type === 'code_sync' || data.type === 'code_edit') {
              if (data.fileId) {
                const isSelfSession = data.connectionId && data.connectionId === clientSessionIdRef.current;
                if (!isSelfSession) {
                  setFiles(prev => {
                    const currentFile = prev[data.fileId];
                    if (currentFile) {
                      if (currentFile.content !== data.content) {
                        const updated = {
                          ...prev,
                          [data.fileId]: {
                            ...currentFile,
                            content: data.content
                          }
                        };
                        filesRef.current = updated;
                        if (onUpdateProjectFiles) {
                          onUpdateProjectFiles(project.id, updated);
                        }
                        return updated;
                      }
                      return prev;
                    } else {
                      const updated = {
                        ...prev,
                        [data.fileId]: {
                          id: data.fileId,
                          name: data.fileId,
                          type: 'file',
                          content: data.content,
                          language: 'javascript'
                        }
                      };
                      filesRef.current = updated;
                      if (onUpdateProjectFiles) {
                        onUpdateProjectFiles(project.id, updated);
                      }
                      return updated;
                    }
                  });
                }
              }
            } else if (data.type === 'permission_update') {
              if (data.targetUserId === user.id) {
                setUserRole(data.newRole);
                onShowToast('Role Updated', `Your room permission is now ${data.newRole}`, 'info');
              } else {
                setCollaborators(prev => prev.map(c => c.id === data.targetUserId ? { ...c, role: data.newRole } : c));
              }
            } else if (data.type === 'kicked_out') {
              if (data.targetUserId === user.id) {
                onShowToast('Removed from Room', 'You were removed from this collaboration session.', 'error');
                setShowCollabModal(false);
                setCollabRoomId('');
                setWsStatus('disconnected');
                if (socket) socket.close();
              } else {
                setCollaborators(prev => prev.filter(c => c.id !== data.targetUserId));
              }
            } else if (data.type === 'session_ended') {
              isExplicitlyClosedRef.current = true;
              persistProjectFiles(filesRef.current);
              setSessionEndedNotice(data.message || 'This room collaboration session has been ended by the owner and is now expired.');
              setCollabRoomId('');
              setWsStatus('disconnected');
              setShowCollabModal(false);
              setCollaborators([]);
              if (collabMedia.isCallActive || collabMedia.isVideoActive) {
                collabMedia.leaveVoiceCall();
              }
              if (collabMedia.isScreenSharing) {
                collabMedia.stopScreenShare();
              }
              if (socket) socket.close();
              if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                window.history.replaceState({ page: 'workspace' }, document.title, '/workspace');
              }
              onShowToast('Session Ended', 'The room owner ended collaboration.', 'info');
            } else if (data.type === 'chat_message') {
              setChatMessages(prev => [...prev, data.message]);
            } else if (data.type === 'execution_sync') {
              if (data.execution) {
                setExecutionResult(data.execution);
              }
            } else if (data.type === 'FILE_ACCESSED' && data.log) {
              setFileAccessLogs(prev => [data.log, ...prev.filter(l => l.id !== data.log.id)]);
            }
          } catch (e) {}
        };

        socket.onclose = () => {
          if (!isMounted || isExplicitlyClosedRef.current) return;
          setWsStatus('disconnected');
          if (collabRoomId && !isExplicitlyClosedRef.current) {
            reconnectTimer = setTimeout(() => {
              if (isMounted && collabRoomId && !isExplicitlyClosedRef.current) connectWS();
            }, 3000);
          }
        };

        socket.onerror = () => {
          setWsStatus('disconnected');
        };
      } catch (e) {
        setWsStatus('disconnected');
      }
    };

    connectWS();

    // Instant reconnection and wake-up when user returns to tab after a long idle period
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !isExplicitlyClosedRef.current && collabRoomId) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[Collab] Tab woke up - reconnecting collaboration socket...');
          connectWS();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleVisibilityOrFocus);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [collabRoomId, user.id]);

  // Real-time Collaboration handlers
  const handleSendCursorMove = (lineNumber: number, column: number, selection?: any) => {
    const now = Date.now();
    if (now - lastCursorSendTimeRef.current < 80) return; // throttle cursor sends
    lastCursorSendTimeRef.current = now;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeFileId) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor_move',
        fileId: activeFileId,
        lineNumber,
        column,
        selection
      }));
    }
  };

  const handleSendTerminalCommand = (command: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'terminal_command',
        command,
        userId: user.id,
        userName: user.username
      }));
    }
  };

  const handleSendTypingState = (isTyping: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'typing_state',
        isTyping
      }));
    }
  };

  const handleChangeUserRole = (userId: string, newRole: 'Owner' | 'Editor' | 'Viewer') => {
    setCollaborators(prev => prev.map(c => c.id === userId ? { ...c, role: newRole } : c));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'permission_change',
        targetUserId: userId,
        newRole
      }));
    }
    onShowToast('Role Updated', `Participant role updated to ${newRole}`, 'info');
  };

  const handleKickUser = (userId: string) => {
    setCollaborators(prev => prev.filter(c => c.id !== userId));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'kick_user',
        targetUserId: userId
      }));
    }
    onShowToast('Participant Removed', 'User removed from room session', 'info');
  };

  const handleLeaveRoom = async () => {
    isExplicitlyClosedRef.current = true;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_room',
        userId: user.id,
        email: user.email,
        files: filesRef.current
      }));
    }
    if (collabMedia.isCallActive || collabMedia.isVideoActive) {
      collabMedia.leaveVoiceCall();
    }
    if (collabMedia.isScreenSharing) {
      collabMedia.stopScreenShare();
    }
    await persistProjectFiles();
    setCollabRoomId('');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
    setShowCollabModal(false);
    setCollaborators([]);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('collab');
        url.searchParams.delete('room');
        window.history.replaceState({ page: 'workspace' }, document.title, url.pathname + (url.search ? url.search : ''));
      } catch (e) {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ page: 'workspace' }, document.title, '/workspace');
        }
      }
    }
    onShowToast('Left Room & Saved 💾', 'You disconnected from the room. Workspace saved to your account.', 'info');
  };

  const handleEndSession = async () => {
    isExplicitlyClosedRef.current = true;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'end_session',
        userId: user.id,
        email: user.email,
        files: filesRef.current
      }));
    }
    if (collabMedia.isCallActive || collabMedia.isVideoActive) {
      collabMedia.leaveVoiceCall();
    }
    if (collabMedia.isScreenSharing) {
      collabMedia.stopScreenShare();
    }
    await persistProjectFiles();
    setCollabRoomId('');
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    setWsStatus('disconnected');
    setShowCollabModal(false);
    setCollaborators([]);
    setRoomConnections([]);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('collab');
        url.searchParams.delete('room');
        window.history.replaceState({ page: 'workspace' }, document.title, url.pathname + (url.search ? url.search : ''));
      } catch (e) {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ page: 'workspace' }, document.title, '/workspace');
        }
      }
    }
    onShowToast('Session Ended & Saved 💾', 'Room collaboration session closed. Old link is now expired.', 'success');
    // Prepare a fresh room ID for future new collaboration sessions
    const freshRoomId = 'room_' + Math.random().toString(36).substring(2, 9);
    setCollabRoomId(freshRoomId);
  };

  const handleSendRoomChatMessage = (text: string) => {
    const msg: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      senderId: user.id,
      senderName: user.username,
      senderEmail: user.email,
      senderAvatar: user.avatar,
      text,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, msg]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat_message',
        message: msg
      }));
    }
  };

  // Handle selecting a file (opens in tabs if not already open)
  const handleSelectFile = (id: string) => {
    const file = files[id];
    if (!file || file.type !== 'file') return;

    setActiveFileId(id);
    
    // Add to tabs if not already present
    setOpenTabs(prev => {
      const exists = prev.some(t => t.fileId === id);
      if (exists) return prev;
      return [...prev, { fileId: id, isDirty: false }];
    });

    if (isMobile) {
      setActiveTab(null);
      setMobileActiveView('editor');
    }

    // Record file access in database for cross-device tracking
    const deviceType = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
    let pathStr = file.name;
    let curr = file;
    while (curr.parentId && curr.parentId !== 'root' && files[curr.parentId]) {
      curr = files[curr.parentId];
      pathStr = `${curr.name}/${pathStr}`;
    }

    fetch(`/api/projects/${project.id}/file-access-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: id,
        fileName: file.name,
        filePath: pathStr,
        userEmail: user?.email || 'developer',
        username: user?.username || 'Developer',
        device: deviceType
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.log) {
        setFileAccessLogs(prev => [data.log, ...prev.filter(l => l.id !== data.log.id)]);
      }
    })
    .catch(() => {});
  };

  const handleCloseTab = (id: string) => {
    setOpenTabs(prev => {
      const filtered = prev.filter(t => t.fileId !== id);
      
      // If we closed the active file, switch to another tab if available
      if (activeFileId === id) {
        if (filtered.length > 0) {
          setActiveFileId(filtered[filtered.length - 1].fileId);
        } else {
          setActiveFileId(null);
        }
      }
      return filtered;
    });
  };

  const handleCloseOthers = (keepId: string) => {
    setOpenTabs(prev => prev.filter(t => t.fileId === keepId));
    setActiveFileId(keepId);
  };

  const handleCloseAll = () => {
    setOpenTabs([]);
    setActiveFileId(null);
  };

  // On file contents edited in Monaco Editor
  const handleFileContentChange = (id: string, newContent: string) => {
    // 1. Synchronously update filesRef.current for instant ref access
    const updatedFiles = {
      ...filesRef.current,
      [id]: {
        ...(filesRef.current[id] || { id, name: id, language: 'javascript' }),
        content: newContent
      }
    };
    filesRef.current = updatedFiles;

    // 2. Update files state cleanly
    setFiles(prev => {
      if (prev[id] && prev[id].content === newContent) {
        return prev;
      }
      return updatedFiles;
    });

    // 3. Ultra-fast real-time broadcast (15ms / ~60 FPS) so editing appears INSTANTLY on collaborators' screens!
    const sendCodeEditWS = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'code_edit',
            fileId: id,
            content: newContent,
            userId: user.id || user.email,
            connectionId: clientSessionIdRef.current
          }));
        } catch (e) {
          console.error('[WS] Failed to send code_edit:', e);
        }
      }
    };

    const now = Date.now();
    const lastSendTime = wsLastSendTimesRef.current[id] || 0;
    const THROTTLE_MS = 15; // 15ms = 60 FPS real-time instant transmission

    if (now - lastSendTime >= THROTTLE_MS) {
      wsLastSendTimesRef.current[id] = now;
      sendCodeEditWS();
    } else {
      if (wsBroadcastTimeoutsRef.current[id]) {
        clearTimeout(wsBroadcastTimeoutsRef.current[id]);
      }
      wsBroadcastTimeoutsRef.current[id] = setTimeout(() => {
        wsLastSendTimesRef.current[id] = Date.now();
        sendCodeEditWS();
        delete wsBroadcastTimeoutsRef.current[id];
      }, THROTTLE_MS);
    }

    // 4. Debounced autosave to server outside React render cycle
    if (autoSave) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        const latestFiles = filesRef.current;
        safeFetch(`/api/projects/${project.id}/files?connectionId=${clientSessionIdRef.current}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(latestFiles)
        }).catch(e => {
          console.error('[Autosave] Failed to sync content change to server:', e);
        });
        if (onUpdateProjectFiles) {
          onUpdateProjectFiles(project.id, latestFiles);
        }
      }, 800);
    }

    // 5. Update dirty indicator on tabs
    setOpenTabs(prev => {
      const isDirtyVal = !autoSave;
      if (prev.some(t => t.fileId === id && t.isDirty === isDirtyVal)) {
        return prev;
      }
      return prev.map(t => 
        t.fileId === id ? { ...t, isDirty: isDirtyVal } : t
      );
    });
  };

  const handleUpdateFilesState = async (newFiles: FileSystemState) => {
    setFiles(newFiles);
    filesRef.current = newFiles;
    if (onUpdateProjectFiles) {
      onUpdateProjectFiles(project.id, newFiles);
    }
    
    // Broadcast file tree changes (new files, deleted files, renames) to room collaborators
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'files_updated',
          files: newFiles,
          connectionId: clientSessionIdRef.current
        }));
      } catch (e) {}
    }

    // Save to the project server filesystem so reloads are perfectly persistent
    try {
      await safeFetch(`/api/projects/${project.id}/files?connectionId=${clientSessionIdRef.current}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFiles)
      });
    } catch (e) {
      console.error('[Codesyne File Sync] Failed to sync files to server:', e);
    }
  };

  const handleSaveFile = async (id: string) => {
    let sanitizedFiles = filesRef.current || files;
    const target = sanitizedFiles[id];
    if (target && target.type === 'file' && typeof target.content === 'string') {
      const fixed = sanitizeAndFixCode(target.content, target.name || target.language || '');
      if (fixed !== target.content) {
        sanitizedFiles = {
          ...sanitizedFiles,
          [id]: {
            ...target,
            content: fixed
          }
        };
        setFiles(sanitizedFiles);
        filesRef.current = sanitizedFiles;
      }
    }

    setOpenTabs(prev => prev.map(t => 
      t.fileId === id ? { ...t, isDirty: false } : t
    ));
    
    try {
      await safeFetch(`/api/projects/${project.id}/files?connectionId=${clientSessionIdRef.current}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedFiles)
      });
      if (onUpdateProjectFiles) {
        onUpdateProjectFiles(project.id, sanitizedFiles);
      }
      if (notifications) {
        onShowToast('File Saved 💾', 'File content saved and synchronized to project storage!', 'success');
      }
    } catch (e) {
      console.error('[Codesyne File Sync] Save error:', e);
      if (notifications) {
        onShowToast('Save Error', 'Failed to write changes to backend storage.', 'error');
      }
    }
  };

  const handleTakeSnapshot = (description: string) => {
    const newSnap: VersionSnapshot = {
      id: 'snap_' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      description,
      fileSystem: { ...files }
    };
    setSnapshots(prev => [newSnap, ...prev]);
    
    if (notifications) {
      onShowToast('Snapshot Captured', `Historical backup snap "${description}" added to timeline!`, 'success');
    }
  };

  const handleRestoreSnapshot = (snap: VersionSnapshot) => {
    setFiles(snap.fileSystem);
    if (onUpdateProjectFiles) {
      onUpdateProjectFiles(project.id, snap.fileSystem);
    }
    // Reload active file in editor
    const activeExists = Object.keys(snap.fileSystem).includes(activeFileId || '');
    if (!activeExists) {
      const firstFile = Object.keys(snap.fileSystem).filter(id => {
        const file = snap.fileSystem[id];
        if (!file || file.type !== 'file') return false;
        const name = file.name ? file.name.toLowerCase() : '';
        return name !== 'dockerfile' && name !== 'vercel.json';
      })[0];
      setActiveFileId(firstFile || null);
    }
    
    onShowToast('Trees Restored', `Restored workspace structure back to "${snap.description}" snapshot!`, 'info');
  };

  const handleCommit = (message: string) => {
    const hashStr = 'commit_' + Math.random().toString(36).substr(2, 6);
    const newCommit: GitCommit = {
      id: hashStr,
      hash: hashStr,
      message,
      timestamp: Date.now(),
      author: user.username,
      additions: Math.floor(Math.random() * 25) + 5,
      deletions: Math.floor(Math.random() * 8) + 1
    };
    setCommitsList(prev => [newCommit, ...prev]);
    onShowToast('Git Commited', `Successfully staged & commited changes under branch "${currentBranch}"!`, 'success');
  };

  const handleSendMessage = (text: string) => {
    const newMsg: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      senderName: user.username,
      senderAvatar: user.avatar,
      senderEmail: user.email,
      text,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, newMsg]);

    // Broadcast chat
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat_message',
        message: newMsg
      }));
    }
  };

  // Teammate reply system
  const handleTriggerBotReply = (userMessage: string) => {
    setTimeout(() => {
      const bots = collaborators;
      if (bots.length === 0) return;
      const chosenBot = bots[Math.floor(Math.random() * bots.length)];

      const replies = [
        `Awesome! Checked out the logic, looks perfect.`,
        `Nice! Let me review this file. I'm busy fixing class structures.`,
        `I am currently editing the styling files, want to compile a test runner?`,
        `That code is remarkably clean. Solid job!`,
        `Should we commit these changes to ${currentBranch}?`
      ];

      const botReply: ChatMessage = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        senderName: chosenBot.name,
        senderAvatar: chosenBot.avatar,
        senderEmail: 'nakulsharma02011@gmail.com',
        text: replies[Math.floor(Math.random() * replies.length)],
        timestamp: Date.now()
      };

      setChatMessages(prev => [...prev, botReply]);
    }, 2500);
  };

  // Compile / Run Active Code file via API backend execution environment!
  const handleRunActiveFile = async () => {
    if (isRunningRef.current || isRunningCode) {
      console.log('[Execution] Execution already in progress, blocking duplicate run.');
      return;
    }
    isRunningRef.current = true;

    if (!activeFileId) {
      onShowToast('No File Selected', 'Please open a script file in the editor first to run compile.', 'error');
      return;
    }

    const file = files[activeFileId];
    if (!file || file.type !== 'file') return;

    // Automatically detect language / file type to route execution properly
    const fileNameLower = file.name.toLowerCase();
    const fileContent = file.content || '';
    const hasHtmlInWorkspace = Object.values(files).some((f: any) => f.type === 'file' && f.name.toLowerCase().endsWith('.html'));

    const isFrontendExtension = 
      fileNameLower.endsWith('.html') || 
      fileNameLower.endsWith('.htm') || 
      fileNameLower.endsWith('.css') || 
      fileNameLower.endsWith('.scss') || 
      fileNameLower.endsWith('.less') || 
      fileNameLower.endsWith('.jsx') || 
      fileNameLower.endsWith('.tsx') || 
      fileNameLower.endsWith('.svg');

    const isBackendNodeCode = 
      fileContent.includes('express') || 
      fileContent.includes('app.listen') || 
      fileContent.includes("require('fs')") || 
      fileContent.includes('import fs') || 
      fileContent.includes("require('path')") || 
      fileContent.includes('import path') ||
      fileContent.includes('process.env');

    const isFrontendScript = 
      (fileNameLower.endsWith('.js') || fileNameLower.endsWith('.ts')) && 
      hasHtmlInWorkspace && 
      !isBackendNodeCode && (
        fileContent.includes('document.') || 
        fileContent.includes('window.') || 
        fileContent.includes('getElementById') || 
        fileContent.includes('querySelector') || 
        fileContent.includes('addEventListener') || 
        fileContent.includes('import React') || 
        fileContent.includes('className=') || 
        fileContent.includes('ReactDOM') ||
        fileNameLower === 'script.js' || 
        fileNameLower === 'main.js' || 
        fileNameLower === 'index.js'
      );

    const shouldShowWebPreview = isFrontendExtension || isFrontendScript;

    if (shouldShowWebPreview) {
      onShowToast('Web Preview Active', `Displaying ${file.name} in Live Preview...`, 'success');
      
      if (isMobile) {
        setActiveTab(null);
        setMobileActiveView('preview');
      } else {
        setShowPreview(true);
        setPreviewHeightPercent(100);
      }
      return;
    }

    // Otherwise (JS, TS, Python, etc.), execute on the container terminal
    if (isMobile) {
      setActiveTab(null);
      setMobileActiveView('terminal');
    } else {
      setShowPreview(true);
      setPreviewHeightPercent(0);
    }

    onShowToast('Running Compiler', `Compiling and launching container runner for ${file.name}...`, 'info');

    setExecutionResult(null);
    setIsRunningCode(true);
    setTerminalHistory(prev => [
      ...prev,
      { text: `=== RUNNING: ${file.name} ===`, type: 'info' }
    ]);

    // Automatically sanitize and auto-fix code formatting for all files before execution
    const sanitizedFilesState: FileSystemState = {};
    Object.keys(files).forEach(fId => {
      const fNode = files[fId];
      if (fNode && fNode.type === 'file' && typeof fNode.content === 'string') {
        sanitizedFilesState[fId] = {
          ...fNode,
          content: sanitizeAndFixCode(fNode.content, fNode.name || fNode.language || '')
        };
      } else {
        sanitizedFilesState[fId] = fNode;
      }
    });

    setFiles(sanitizedFilesState);

    const controller = new AbortController();
    executionAbortControllerRef.current = controller;

    const createWorkspaceStdinReader = () => {
      return () => {
        if (!isRunningRef.current || controller.signal.aborted) {
          return Promise.reject(new Error('EXECUTION_ABORTED'));
        }
        setIsWaitingForInput(true);
        return new Promise<string>((resolve, reject) => {
          activeStdinResolverRef.current = (userInput: string, isAborted?: boolean) => {
            setIsWaitingForInput(false);
            activeStdinResolverRef.current = null;
            if (isAborted || controller.signal.aborted || !isRunningRef.current) {
              reject(new Error('EXECUTION_ABORTED'));
            } else {
              resolve(userInput);
            }
          };
        });
      };
    };

    const stdinReader = createWorkspaceStdinReader();
    const onOutputLine = (lineText: string, type: 'default' | 'error' | 'info' = 'default') => {
      if (!isRunningRef.current || controller.signal.aborted) return;
      setTerminalHistory(prev => [...prev, { text: lineText, type: type === 'default' ? 'success' : type }]);
    };

    try {
      const isInteractive = hasInteractiveStdin(fileContent || '');

    let resultOutput = '';
    let resultErrors: string | undefined = undefined;
    let executionTime = 120;
    let memoryUsage = 12;

    if (!isInteractive) {
      try {
        const response = await safeFetch(`/api/projects/${project.id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: activeFileId,
            filesState: sanitizedFilesState
          }),
          signal: controller.signal,
          skipThrowOnNonOk: true
        });

        if (response.ok) {
          const data = await response.json();
          resultOutput = data.output || '';
          resultErrors = data.errors || undefined;
          executionTime = data.executionTime || 120;
          memoryUsage = data.memoryUsage || 12;
        }
      } catch (e) {
        console.warn('Server execution skipped/failed:', e);
      }
    }

    if (controller.signal.aborted || !isRunningRef.current) {
      return;
    }

    let ranWithLiveOutput = false;
    if (isInteractive || (!resultOutput && fileContent)) {
      ranWithLiveOutput = true;
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      try {
        const simulation = await simulateCodeExecutionClient(fileContent, ext, stdinReader, onOutputLine);
        if (simulation.aborted || controller.signal.aborted || !isRunningRef.current) {
          return;
        }
        if (simulation.output && simulation.output.trim() !== '') {
          resultOutput = simulation.output;
          resultErrors = simulation.errors || undefined;
        }
      } catch (err: any) {
        if (err?.message === 'EXECUTION_ABORTED' || controller.signal.aborted || !isRunningRef.current) {
          return;
        }
      }
    }

    if (controller.signal.aborted || !isRunningRef.current) {
      return;
    }

    const result = {
      output: resultOutput,
      errors: resultErrors,
      executionTime,
      memoryUsage
    };
    setExecutionResult(result);

    setTerminalHistory(prev => {
      const outputLines: TerminalLine[] = [];
      
      // Determine if output lines were already pushed to terminal history
      const existingTexts = prev.map(l => l.text);
      const isAlreadyPushed = result.output 
        ? result.output.split('\n').some(line => line.trim() && existingTexts.includes(line.trim()))
        : false;

      if (result.output && (!ranWithLiveOutput || !isAlreadyPushed)) {
        result.output.split('\n').forEach(lineText => {
          if (lineText) {
            outputLines.push({ text: lineText, type: 'success' });
          }
        });
      }
      if (result.errors) {
        result.errors.split('\n').forEach(errText => {
          if (errText) {
            outputLines.push({ text: errText, type: 'error' });
          }
        });
      }
      return [
        ...prev,
        ...outputLines,
        { text: `Finished in ${result.executionTime}ms.`, type: 'system' },
        { text: '', type: 'default' }
      ];
    });

    onShowToast('Run Completed', `Finished running ${file.name} successfully!`, 'success');
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'The user aborted a request.') {
        console.log('[Execution] Execution process aborted by user.');
        return;
      }
      const ext = '.' + file.name.split('.').pop();
      console.log('Backend execution connection error, simulating client-side:', e);
      
      const simulation = await simulateCodeExecutionClient(fileContent, ext);
      
      const result = {
        output: simulation.output,
        errors: simulation.errors || undefined,
        executionTime: 45,
        memoryUsage: 4
      };
      setExecutionResult(result);
      
      setTerminalHistory(prev => {
        const outputLines: TerminalLine[] = [];
        if (result.output) {
          outputLines.push({ text: result.output, type: 'success' });
        }
        if (result.errors) {
          outputLines.push({ text: result.errors, type: 'error' });
        }
        return [
          ...prev,
          ...outputLines,
          { text: `Finished in ${result.executionTime}ms (Client-Side Safe Sandbox).`, type: 'system' },
          { text: '', type: 'default' }
        ];
      });
      onShowToast('Client-Side Sandbox Active', 'Executed successfully in your secure browser sandbox.', 'success');
    } finally {
      isRunningRef.current = false;
      setIsRunningCode(false);
    }
  };

  // AI response modifier injector
  const handleApplyAICodeChanges = (newContent: string) => {
    if (activeFileId) {
      handleFileContentChange(activeFileId, newContent);
    }
  };

  // Helper to resolve full directory path for nested files
  const getFullNodePath = (nodeId: string, currentFiles: FileSystemState): string => {
    const node = currentFiles[nodeId];
    if (!node || nodeId === 'root') return '';
    
    const parts = [node.name];
    let curr = node;
    while (curr.parentId && curr.parentId !== 'root' && currentFiles[curr.parentId]) {
      curr = currentFiles[curr.parentId];
      parts.unshift(curr.name);
    }
    return parts.join('/');
  };

  // Export complete workspace folder structure as standard ZIP archive!
  const handleDownloadProject = async () => {
    try {
      const zip = new JSZip();

      Object.entries(files).forEach(([id, nodeVal]) => {
        const node = nodeVal as any;
        if (id === 'root') return;
        
        // Exclude system files like Dockerfile or .dockerignore or vercel.json from export
        const nodeNameLower = (node.name || '').toLowerCase();
        if (nodeNameLower === 'dockerfile' || nodeNameLower === '.dockerignore' || nodeNameLower === 'vercel.json') {
          return;
        }

        const fullPath = getFullNodePath(id, files);
        if (!fullPath) return;

        if (node.type === 'file') {
          let content: any = node.content || '';
          if (typeof content === 'string' && content.startsWith('data:') && content.includes(';base64,')) {
            const parts = content.split(';base64,');
            if (parts[1]) {
              const binaryString = atob(parts[1]);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              content = bytes.buffer;
            }
          }
          zip.file(fullPath, content);
        } else if (node.type === 'folder') {
          zip.folder(fullPath);
        }
      });

      onShowToast('Building ZIP', 'Packing all project workspaces and nested directory paths...', 'info');

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_workspace.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      onShowToast('Export Complete', 'All files and folder structures downloaded safely as ZIP!', 'success');
    } catch (error: any) {
      console.error('Failed to create ZIP package:', error);
      onShowToast('ZIP Export Failed', 'An error occurred while compiling your browser files.', 'error');
    }
  };

  // Render Left panel contents based on active tab select
  const renderSidePanelContentOnly = () => {
    switch (activeTab) {
      case 'explorer':
        return (
          <FileExplorer
            files={files}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onUpdateFiles={handleUpdateFilesState}
            onDownloadProject={handleDownloadProject}
            onShowToast={onShowToast}
          />
        );
      case 'search':
        return (
          <SearchTools
            files={files}
            onSelectFile={handleSelectFile}
          />
        );
      case 'git':
        return (
          <GitTools
            files={files}
            activeFileId={activeFileId}
            onCommit={handleCommit}
            commitsList={commitsList}
            currentBranch={currentBranch}
            onSwitchBranch={setCurrentBranch}
            onUpdateFiles={handleUpdateFilesState}
            onShowToast={onShowToast}
          />
        );
      case 'history':
        return (
          <VersionTools
            snapshots={snapshots}
            fileAccessLogs={fileAccessLogs}
            onTakeSnapshot={handleTakeSnapshot}
            onRestoreSnapshot={handleRestoreSnapshot}
            onSelectFile={handleSelectFile}
          />
        );
      case 'chat':
      case 'ai': {
        const activeFileContext = activeFileId && files[activeFileId] && files[activeFileId].type === 'file'
          ? {
              fileName: files[activeFileId].name,
              code: files[activeFileId].content || '',
              language: files[activeFileId].name.toLowerCase().endsWith('.py') ? 'python' :
                        files[activeFileId].name.toLowerCase().endsWith('.js') ? 'javascript' :
                        files[activeFileId].name.toLowerCase().endsWith('.ts') ? 'typescript' :
                        files[activeFileId].name.toLowerCase().endsWith('.jsx') ? 'jsx' :
                        files[activeFileId].name.toLowerCase().endsWith('.tsx') ? 'tsx' :
                        files[activeFileId].name.toLowerCase().endsWith('.html') ? 'html' :
                        files[activeFileId].name.toLowerCase().endsWith('.css') ? 'css' : 'plaintext'
            }
          : null;
        return (
          <CollabChat
            projectId={project.id}
            activeFile={activeFileContext}
          />
        );
      }
      case 'settings':
        return (
          <SettingsPanel
            theme={theme}
            onChangeTheme={onChangeTheme}
            fontSize={fontSize}
            onChangeFontSize={setFontSize}
            autoSave={autoSave}
            onToggleAutoSave={() => setAutoSave(!autoSave)}
            notifications={notifications}
            onToggleNotifications={() => setNotifications(!notifications)}
            currentUser={user}
            onUpdateUser={onUpdateUser}
            onShowToast={onShowToast}
            onShowShortcuts={() => setShowShortcutsModal(true)}
          />
        );
      case 'admin':
        return null;
      case 'rundebug':
        return (
          <div className={`p-4 flex flex-col space-y-4 font-sans ${isLightTheme ? 'text-slate-700' : 'text-slate-300'}`}>
            <div className={`p-3 border rounded-xl flex flex-col space-y-3 shadow-md ${
              isLightTheme ? 'bg-slate-50 border-slate-200' : isCyberTheme ? 'bg-[#100b26] border-pink-500/20' : 'bg-[#0a0a12] border-white/5'
            }`}>
              <span className={`text-xs font-bold uppercase tracking-wider block ${isLightTheme ? 'text-slate-900' : 'text-white'}`}>Run Active File</span>
              <p className={`text-[11px] leading-relaxed ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>
                Compile and run the currently selected tab in a sandbox container environment.
              </p>
              <button
                onClick={isRunningCode ? handleStopExecution : handleRunActiveFile}
                className={`w-full py-2 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-md cursor-pointer active:scale-95 ${
                  isRunningCode 
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 animate-pulse' 
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/10'
                }`}
              >
                {isRunningCode ? (
                  <>
                    <Square className="h-3.5 w-3.5 fill-current text-white" />
                    <span>Stop Program</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current text-emerald-400" />
                    <span>Run Program</span>
                  </>
                )}
              </button>
            </div>

            <div className={`border-t pt-3 ${isLightTheme ? 'border-slate-200' : 'border-white/5'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>Variables</span>
              <div className={`p-2.5 rounded-lg text-xs font-mono space-y-1 ${isLightTheme ? 'bg-slate-100 text-slate-500' : 'bg-black/20 text-slate-500'}`}>
                <div>No active debugging session</div>
              </div>
            </div>

            <div className={`border-t pt-3 ${isLightTheme ? 'border-slate-200' : 'border-white/5'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>Watch Expressions</span>
              <div className={`p-2.5 rounded-lg text-xs font-mono space-y-1 ${isLightTheme ? 'bg-slate-100 text-slate-500' : 'bg-black/20 text-slate-500'}`}>
                <div>No watch expressions declared</div>
              </div>
            </div>

            <div className={`border-t pt-3 ${isLightTheme ? 'border-slate-200' : 'border-white/5'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>Breakpoints</span>
              <div className="space-y-2">
                <label className={`flex items-center space-x-2 text-xs cursor-pointer ${isLightTheme ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                  <input type="checkbox" defaultChecked className={`rounded text-indigo-500 focus:ring-0 ${isLightTheme ? 'border-slate-300 bg-white' : 'border-white/10 bg-[#0f0f1b]'}`} />
                  <span>All Exceptions</span>
                </label>
                <label className={`flex items-center space-x-2 text-xs cursor-pointer ${isLightTheme ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                  <input type="checkbox" className={`rounded text-indigo-500 focus:ring-0 ${isLightTheme ? 'border-slate-300 bg-white' : 'border-white/10 bg-[#0f0f1b]'}`} />
                  <span>Uncaught Exceptions</span>
                </label>
              </div>
            </div>
          </div>
        );
      case 'extensions':
        return (
          <div className={`p-4 flex flex-col space-y-3 font-sans ${isLightTheme ? 'text-slate-700' : 'text-slate-300'}`}>
            <div className="relative">
              <Search className={`absolute left-3 top-2.5 h-3.5 w-3.5 ${isLightTheme ? 'text-slate-400' : 'text-slate-500'}`} />
              <input 
                type="text" 
                placeholder="Search Extensions in Marketplace..." 
                className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs outline-none transition-all ${
                  isLightTheme 
                    ? 'bg-slate-100 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white' 
                    : 'bg-[#0f0f1b]/80 border-white/5 text-white placeholder-slate-500 focus:border-indigo-500/30'
                }`}
              />
            </div>

            <div className="space-y-2 pt-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>Installed Extensions</span>
              
              <div className={`p-2.5 border rounded-xl flex items-start space-x-2.5 ${
                isLightTheme ? 'bg-slate-50 border-slate-200' : isCyberTheme ? 'bg-[#100b26] border-pink-500/20' : 'bg-[#0a0a12] border-white/5'
              }`}>
                <div className={`p-1.5 rounded-lg shrink-0 ${isLightTheme ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/10 text-indigo-400'}`}>
                  <Cpu className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className={`text-xs font-bold truncate ${isLightTheme ? 'text-slate-900' : 'text-white'}`}>Codesyne Offline Analyzer</h5>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isLightTheme ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/10 text-indigo-400'}`}>v1.2.4</span>
                  </div>
                  <p className={`text-[10px] mt-0.5 leading-relaxed truncate ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>Interactive local assistant for fast static analysis.</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-emerald-500 font-medium">● Enabled</span>
                    <button className="text-[10px] text-slate-500 hover:text-slate-700 font-bold transition-all cursor-pointer">Disable</button>
                  </div>
                </div>
              </div>

              <div className={`p-2.5 border rounded-xl flex items-start space-x-2.5 ${
                isLightTheme ? 'bg-slate-50 border-slate-200' : isCyberTheme ? 'bg-[#100b26] border-pink-500/20' : 'bg-[#0a0a12] border-white/5'
              }`}>
                <div className={`p-1.5 rounded-lg shrink-0 ${isLightTheme ? 'bg-cyan-50 text-cyan-600' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  <Blocks className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className={`text-xs font-bold truncate ${isLightTheme ? 'text-slate-900' : 'text-white'}`}>Prettier Formatter</h5>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isLightTheme ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>v3.1.0</span>
                  </div>
                  <p className={`text-[10px] mt-0.5 leading-relaxed truncate ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>Opinionated code formatter for workspace.</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-emerald-500 font-medium">● Enabled</span>
                    <button className="text-[10px] text-slate-500 hover:text-slate-700 font-bold transition-all cursor-pointer">Disable</button>
                  </div>
                </div>
              </div>

              <div className={`p-2.5 border rounded-xl flex items-start space-x-2.5 opacity-60 hover:opacity-100 transition-opacity ${
                isLightTheme ? 'bg-slate-50 border-slate-200' : isCyberTheme ? 'bg-[#100b26] border-pink-500/20' : 'bg-[#0a0a12] border-white/5'
              }`}>
                <div className={`p-1.5 rounded-lg shrink-0 ${isLightTheme ? 'bg-teal-50 text-teal-600' : 'bg-teal-500/10 text-teal-400'}`}>
                  <Folder className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className={`text-xs font-bold truncate ${isLightTheme ? 'text-slate-900' : 'text-white'}`}>Tailwind IntelliSense</h5>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isLightTheme ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>v0.9.15</span>
                  </div>
                  <p className={`text-[10px] mt-0.5 leading-relaxed truncate ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>Autocomplete & color helpers for styles.</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-slate-400 font-medium">Not Installed</span>
                    <button className="text-[10px] text-indigo-500 hover:text-indigo-600 font-bold transition-all cursor-pointer">Install</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderSidePanel = () => {
    if (!activeTab || activeTab === 'admin') return null;

    const getTabTitle = () => {
      switch (activeTab) {
        case 'explorer': return 'Explorer';
        case 'search': return 'Search';
        case 'git': return 'Source Control';
        case 'rundebug': return 'Run & Debug';
        case 'extensions': return 'Extensions';
        case 'chat': return 'Workspace Chat';
        case 'ai': return 'AI Assistant';
        case 'settings': return 'Settings';
        case 'history': return 'Timeline';
        case 'admin': return 'System Admin';
        default: return 'Sidebar';
      }
    };

    if (isMobile) {
      return null;
    }

    const maxAllowedWidth = typeof window !== 'undefined' 
      ? Math.min(420, Math.max(220, Math.floor(window.innerWidth * 0.32)))
      : 280;
    const computedPanelWidth = Math.max(180, Math.min(sidePanelWidth || 250, maxAllowedWidth));

    return (
      <div 
        style={{ width: `${computedPanelWidth}px` }} 
        className={`flex flex-col shrink-0 self-stretch relative z-40 overflow-visible border ${borderClass} rounded-xl md:rounded-2xl min-w-0 max-w-[85vw] shadow-2xl ${
          isLightTheme 
            ? 'bg-white text-slate-800' 
            : isCyberTheme 
              ? 'bg-[#0d071d]/95 text-pink-200' 
              : 'bg-[#08080d]/95 text-slate-300'
        }`}
      >
        {/* Compact Panel Header with Collapse button */}
        <div className={`flex items-center justify-between px-3 py-1.5 shrink-0 select-none rounded-t-2xl min-w-0 w-full border-b ${
          isLightTheme ? 'border-slate-200 bg-slate-100/90' : 'border-white/10 bg-[#06060c]/90'
        } gap-2`}>
          <span className={`text-[11px] font-bold uppercase tracking-wider truncate shrink-0 ${isLightTheme ? 'text-slate-700' : 'text-slate-300'}`}>{getTabTitle()}</span>
          <button 
            onClick={() => setActiveTab(null)}
            className={`p-1 rounded-lg transition-all cursor-pointer shrink-0 ${isLightTheme ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-900' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}
            title="Collapse Sidebar"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Panel Content Wrapper */}
        <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'chat' ? 'overflow-visible' : 'overflow-hidden'} rounded-b-2xl ${leftContentBgClass}`}>
          {renderSidePanelContentOnly()}
        </div>
      </div>
    );
  };

  return (
    <div 
      id="ide_workspace_root" 
      className={`relative w-full h-full max-h-full overflow-hidden flex flex-row ${
        isMobile 
          ? 'p-1 gap-1.5 pt-[calc(env(safe-area-inset-top,0px)+4px)] pb-[calc(env(safe-area-inset-bottom,0px)+4px)] pl-[calc(env(safe-area-inset-left,0px)+4px)] pr-[calc(env(safe-area-inset-right,0px)+4px)]' 
          : 'p-4 gap-3'
      } font-sans transition-colors duration-300 z-10 ${rootBgClass}`}
    >
      
      {/* Sidebar navigation rail */}
      {/* Sidebar navigation rail - Hidden on mobile, active on desktop */}
      {!isMobile && (
        <Sidebar
          user={user}
          activeTab={activeTab}
          setActiveTab={handleTabClick}
          collaborators={collaborators}
          onRunCode={handleRunActiveFile}
          onTogglePreview={() => setShowPreview(!showPreview)}
          showPreview={showPreview}
          onGoBack={onGoBack}
          theme={theme}
          onOpenCollabModal={() => setShowCollabModal(true)}
        />
      )}

      {/* Primary Side Panel */}
      {renderSidePanel()}

      {/* Resize Handle for Side Panel */}
      {activeTab && !isMobile && (
        <div 
          onMouseDown={handleSidePanelResizeStart}
          onTouchStart={handleSidePanelResizeStart}
          className="hidden md:block w-[5px] hover:w-[7px] bg-white/5 hover:bg-indigo-500/40 cursor-col-resize transition-all self-stretch z-30 select-none group relative"
          title="Drag to resize panel"
        >
          <div className="absolute inset-y-0 left-[2px] w-[1px] bg-white/10 group-hover:bg-indigo-500" />
        </div>
      )}

      {/* Main interactive coding stage */}
      <main className={`flex-1 flex flex-col overflow-hidden min-w-0 transition-colors duration-300 md:border ${borderClass} md:rounded-2xl md:shadow-2xl ${
        isMobile 
          ? 'p-2 pb-[74px] space-y-2' 
          : 'p-4 space-y-3'
      } ${mainBgClass}`}>
        
        {activeTab === 'admin' && (user?.email || '').trim().toLowerCase() === 'nakulsharma02011@gmail.com' ? (
          <div className="flex-1 flex flex-col space-y-3 sm:space-y-4 overflow-hidden h-full">
            {/* Elegant separate page header - Responsive for Mobile & Desktop */}
            <div className="flex flex-row items-center justify-between bg-slate-950/40 border border-white/5 p-2.5 sm:p-4 md:py-4 md:px-5 rounded-2xl shadow-xl backdrop-blur-md gap-2 shrink-0">
              <div className="flex items-center space-x-2 sm:space-x-3 text-left min-w-0">
                <div className="p-1.5 sm:p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 shrink-0">
                  <Shield className="h-4 w-4 sm:h-5 sm:w-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    <h2 className="text-xs sm:text-sm md:text-base font-extrabold text-white tracking-tight leading-none font-sans truncate">Admin Workspace</h2>
                    <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider font-mono border border-indigo-500/20 shrink-0">ROOT SECURE</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-medium truncate max-w-[180px] sm:max-w-none">Exclusive backend dashboard for {user.email}</p>
                </div>
              </div>

              {/* Compact Back to Editor button - Top right aligned */}
              <button
                onClick={() => handleTabClick('explorer')}
                className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-[10px] sm:text-xs transition-all flex items-center space-x-1 sm:space-x-1.5 cursor-pointer active:scale-95 shadow-md shadow-indigo-600/20 shrink-0 font-sans"
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                <span>Back to Editor</span>
              </button>
            </div>

            {/* Standalone Page Content Container */}
            <div className="flex-1 overflow-y-auto bg-slate-950/20 p-2 sm:p-4 md:p-6 rounded-2xl border border-white/5 shadow-2xl scrollbar-thin">
              <AdminDashboard
                currentUser={user}
                onShowToast={onShowToast}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Top title banner line - Visible on PC/Desktop only */}
            <div 
              id="workspace_top_banner"
              className={`hidden md:flex items-center justify-between gap-3 py-2.5 px-4 rounded-xl shadow-md border transition-all shrink-0 ${
                isLightTheme 
                  ? 'bg-white border-slate-200 text-slate-800' 
                  : isCyberTheme 
                    ? 'bg-[#0c071d]/90 border-pink-500/20 text-pink-100' 
                    : 'bg-slate-950/40 border-white/5'
              }`}
            >
              <div className="flex items-center space-x-3 text-left min-w-0">
                <span className="flex items-center justify-center shrink-0 w-9 h-9 bg-gradient-to-tr from-indigo-600 to-fuchsia-600 rounded-xl text-white font-extrabold text-xs shadow-md shadow-indigo-600/10 select-none">
                  IDE
                </span>
                <div className="min-w-0 flex flex-col justify-center">
                  <h2 className={`text-sm font-bold tracking-tight leading-normal truncate max-w-[180px] lg:max-w-[320px] ${isLightTheme ? 'text-slate-900' : 'text-white'}`} title={project.name}>
                    {project.name}
                  </h2>
                  <div className="flex items-center gap-x-2 gap-y-0.5 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-bold font-mono tracking-wider uppercase ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>
                      Workspace Sync Active
                    </span>
                    <span className="text-[9px] opacity-40 leading-none select-none">•</span>
                    <span className={`text-[9px] font-bold font-mono leading-none ${isLightTheme ? 'text-indigo-600' : 'text-indigo-400'}`}>
                      Branch: {currentBranch}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-[5px] shrink-0">
                {/* Web Preview Split Toggle Icon Button */}
                <button
                  onClick={() => {
                    if (!showPreview) {
                      setShowPreview(true);
                      setPreviewHeightPercent(50);
                    } else if (previewHeightPercent === 0) {
                      setPreviewHeightPercent(50);
                    } else {
                      setPreviewHeightPercent(0);
                    }
                  }}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 text-xs font-mono shrink-0 active:scale-95 ${
                    showPreview && previewHeightPercent > 0
                      ? 'bg-indigo-600/20 text-cyan-300 border-cyan-500/30'
                      : 'bg-white/5 text-slate-400 hover:text-white border-transparent'
                  }`}
                  title={showPreview && previewHeightPercent > 0 ? "Web Preview Split Active (Click to minimize)" : "Open / Restore Web Preview Split"}
                >
                  <Globe className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden xl:inline text-[10px] font-bold">Web</span>
                </button>

                {/* Terminal Split Toggle Icon Button */}
                <button
                  onClick={() => {
                    if (!showPreview) {
                      setShowPreview(true);
                      setPreviewHeightPercent(50);
                    } else if (previewHeightPercent === 100) {
                      setPreviewHeightPercent(50);
                    } else {
                      setPreviewHeightPercent(100);
                    }
                  }}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 text-xs font-mono shrink-0 active:scale-95 ${
                    showPreview && previewHeightPercent < 100
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                      : 'bg-white/5 text-slate-400 hover:text-white border-transparent'
                  }`}
                  title={showPreview && previewHeightPercent < 100 ? "Terminal Split Active (Click to minimize)" : "Open / Restore Terminal Split"}
                >
                  <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="hidden xl:inline text-[10px] font-bold">Terminal</span>
                </button>

                {/* Collaborate Room Button */}
                <button
                  onClick={() => setShowCollabModal(true)}
                  className={`flex items-center space-x-2 text-[11px] font-bold px-3 py-1.5 rounded-lg border shrink-0 transition-all cursor-pointer active:scale-95 shadow-sm ${
                    wsStatus === 'connected' 
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                      : wsStatus === 'connecting'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                  title="Open Collaboration Room & Chat"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Collaborate ({collaborators.length + 1})</span>
                  <span className="sm:hidden">Collab</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    wsStatus === 'connected' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`} />
                </button>
              </div>
            </div>



        {/* Dynamic split panels layout */}
        <div 
          id="split_panels_container"
          className={`flex-1 flex min-h-0 min-w-0 overflow-hidden relative ${isMobile ? 'flex-col gap-2' : 'flex-row gap-0'}`}
        >
          {isMobile ? (
            <div className="flex-1 flex flex-col min-h-0 space-y-2 relative">
              {/* Mobile View Switcher Tab bar */}
              <div className={`flex p-1 rounded-xl w-full shrink-0 border ${
                isLightTheme 
                  ? 'bg-slate-200/60 border-slate-300' 
                  : isCyberTheme 
                    ? 'bg-[#0f0926]/80 border-pink-500/20' 
                    : 'bg-[#0f0f1b]/80 border-white/5'
              }`}>
                <button
                  onClick={() => setMobileActiveView('editor')}
                  className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                    mobileActiveView === 'editor' 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 font-bold' 
                      : isLightTheme 
                        ? 'text-slate-600 hover:text-slate-900' 
                        : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5" />
                  <span>Editor</span>
                </button>
                <button
                  onClick={() => setMobileActiveView('preview')}
                  className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                    mobileActiveView === 'preview' 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 font-bold' 
                      : isLightTheme 
                        ? 'text-slate-600 hover:text-slate-900' 
                        : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={() => setMobileActiveView('terminal')}
                  className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                    mobileActiveView === 'terminal' 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 font-bold' 
                      : isLightTheme 
                        ? 'text-slate-600 hover:text-slate-900' 
                        : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Terminal</span>
                </button>
              </div>

              {/* Sub panels switch render on mobile */}
              <div className="flex-1 flex flex-col min-h-0">
                {mobileActiveView === 'editor' && (
                  <div className="flex-1 flex flex-col min-h-0 h-full">
                    <EditorArea
                      files={files}
                      openTabs={openTabs}
                      activeFileId={activeFileId}
                      onSelectFile={handleSelectFile}
                      onCloseTab={handleCloseTab}
                      onCloseOthers={handleCloseOthers}
                      onCloseAll={handleCloseAll}
                      onFileContentChange={handleFileContentChange}
                      theme={theme}
                      fontSize={fontSize}
                      onChangeFontSize={setFontSize}
                      autoSave={autoSave}
                      onSaveFile={handleSaveFile}
                      projectId={project.id}
                      roomId={collabRoomId}
                      collaborators={collaborators}
                      userRole={userRole}
                      onCursorMove={handleSendCursorMove}
                      onTypingStateChange={handleSendTypingState}
                    />
                  </div>
                )}
                {mobileActiveView === 'preview' && (
                  <div className="flex-1 flex flex-col min-h-0 h-full">
                    <PreviewPanel
                      activeFile={activeFileId ? files[activeFileId] : null}
                      filesState={files}
                      onSelectFile={handleSelectFile}
                    />
                  </div>
                )}
                {mobileActiveView === 'terminal' && (
                  <div className="flex-1 flex flex-col min-h-0 h-full">
                    <TerminalPanel
                      execution={executionResult}
                      onClearOutput={() => setExecutionResult(null)}
                      onRunActiveFile={handleRunActiveFile}
                      onStopExecution={handleStopExecution}
                      activeFileName={activeFileId ? files[activeFileId].name : 'index.js'}
                      files={files}
                      isRunning={isRunningCode}
                      terminalHistory={terminalHistory}
                      setTerminalHistory={setTerminalHistory}
                      projectId={project.id}
                      onOpenWebPreview={() => setMobileActiveView('preview')}
                      isPreviewVisible={mobileActiveView === 'preview'}
                      isWaitingForInput={isWaitingForInput}
                      setIsWaitingForInput={setIsWaitingForInput}
                      activeStdinResolverRef={activeStdinResolverRef}
                      onSendTerminalCommand={handleSendTerminalCommand}
                      userRole={userRole}
                      collaborators={collaborators}
                    />
                  </div>
                )}
              </div>

              {/* Mobile Slide-over Drawer overlay for Active Side Tabs */}
              {activeTab && (
                <div className="absolute inset-0 z-40 flex">
                  {/* Backdrop */}
                  <div 
                    onClick={() => setActiveTab(null)}
                    className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
                  />
                  
                  {/* Drawer Content */}
                  <div className="relative w-[80%] max-w-[320px] h-full bg-[#07070c]/98 border-r border-white/10 flex flex-col shadow-2xl z-50 animate-in slide-in-from-left duration-200">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#10101a]/95 shrink-0">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                        {activeTab === 'explorer' && 'Explorer'}
                        {activeTab === 'search' && 'Search Files'}
                        {activeTab === 'git' && 'Source Control'}
                        {activeTab === 'history' && 'Timeline & Snapshots'}
                        {activeTab === 'chat' && 'Workspace Chat'}
                        {activeTab === 'settings' && 'Workspace Settings'}
                      </span>
                      <button 
                        onClick={() => setActiveTab(null)}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0 overflow-visible relative bg-[#0a0a0f]/40">
                      {renderSidePanelContentOnly()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Desktop resizable side-by-side split panels
            <>
              {/* Editor block - occupies left portion or full space */}
              <div 
                style={{ flex: !showPreview ? '1 1 100%' : `${editorWidthPercent} 1 0%` }}
                className="flex flex-col min-h-0 min-w-[150px] h-full overflow-hidden"
              >
                <EditorArea
                  files={files}
                  openTabs={openTabs}
                  activeFileId={activeFileId}
                  onSelectFile={handleSelectFile}
                  onCloseTab={handleCloseTab}
                  onCloseOthers={handleCloseOthers}
                  onCloseAll={handleCloseAll}
                  onFileContentChange={handleFileContentChange}
                  theme={theme}
                  fontSize={fontSize}
                  onChangeFontSize={setFontSize}
                  autoSave={autoSave}
                  onSaveFile={handleSaveFile}
                  projectId={project.id}
                  roomId={collabRoomId}
                  collaborators={collaborators}
                  userRole={userRole}
                  onCursorMove={handleSendCursorMove}
                  onTypingStateChange={handleSendTypingState}
                />
              </div>

              {/* Vertical splitter handle between Editor and Preview/Terminal */}
              {showPreview && (
                <div 
                  onMouseDown={handleEditorResizeStart}
                  onTouchStart={handleEditorResizeStart}
                  className="w-1.5 hover:w-2 bg-white/5 hover:bg-indigo-500/40 cursor-col-resize transition-all self-stretch z-30 select-none shrink-0 mx-1.5 group relative rounded-full"
                  title="Drag to resize editor"
                >
                  <div className="absolute inset-y-0 left-[2px] w-[1px] bg-white/10 group-hover:bg-indigo-500" />
                </div>
              )}

              {/* Console Output & Live Visual Preview panel (if enabled) - occupies right portion */}
              {showPreview && (
                <div 
                  id="right_panels_container"
                  style={{ flex: `${100 - editorWidthPercent} 1 0%` }}
                  className="flex flex-col min-h-0 min-w-[140px] space-y-0 h-full overflow-hidden"
                >
                  
                  {/* Visual Preview */}
                  {previewHeightPercent > 0 && (
                    <div 
                      style={{ flex: previewHeightPercent === 100 ? '1 1 100%' : `${previewHeightPercent} 1 0%` }}
                      className="min-h-0 min-w-0 flex flex-col overflow-hidden"
                    >
                      <PreviewPanel
                        activeFile={activeFileId ? files[activeFileId] : null}
                        filesState={files}
                        onSelectFile={handleSelectFile}
                        onOpenTerminal={() => {
                          setShowPreview(true);
                          setPreviewHeightPercent(50);
                        }}
                        isTerminalVisible={showPreview && previewHeightPercent < 100}
                      />
                    </div>
                  )}

                  {/* Horizontal splitter handle */}
                  {previewHeightPercent > 0 && previewHeightPercent < 100 && (
                    <div 
                      onMouseDown={handlePreviewResizeStart}
                      onTouchStart={handlePreviewResizeStart}
                      className="h-1.5 hover:h-2 bg-white/5 hover:bg-indigo-500/40 cursor-row-resize transition-all w-full z-30 select-none shrink-0 my-1.5 group relative rounded-full"
                      title="Drag to resize terminal"
                    >
                      <div className="absolute inset-x-0 top-[2px] h-[1px] bg-white/10 group-hover:bg-indigo-500" />
                    </div>
                  )}

                  {/* Terminal Logs & execution stats */}
                  {previewHeightPercent < 100 && (
                    <div 
                      style={{ flex: previewHeightPercent === 0 ? '1 1 100%' : `${100 - previewHeightPercent} 1 0%` }}
                      className="min-h-0 min-w-0 flex flex-col overflow-hidden"
                    >
                      <TerminalPanel
                        execution={executionResult}
                        onClearOutput={() => setExecutionResult(null)}
                        onRunActiveFile={handleRunActiveFile}
                        onStopExecution={handleStopExecution}
                        activeFileName={activeFileId ? files[activeFileId].name : 'index.js'}
                        files={files}
                        isRunning={isRunningCode}
                        terminalHistory={terminalHistory}
                        setTerminalHistory={setTerminalHistory}
                        projectId={project.id}
                        onOpenWebPreview={() => {
                          setShowPreview(true);
                          setPreviewHeightPercent(60);
                        }}
                        isPreviewVisible={showPreview && previewHeightPercent > 0}
                        isWaitingForInput={isWaitingForInput}
                        setIsWaitingForInput={setIsWaitingForInput}
                        activeStdinResolverRef={activeStdinResolverRef}
                        onSendTerminalCommand={handleSendTerminalCommand}
                        userRole={userRole}
                        collaborators={collaborators}
                      />
                    </div>
                  )}

                </div>
              )}
            </>
          )}
        </div>
          </>
        )}

      </main>

      {/* Mobile responsive bottom navigation bar */}
      {isMobile && (
        <nav 
          id="ide_mobile_bottom_nav" 
          className="fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0f]/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 z-50 shadow-2xl"
        >
        {/* Projects / Dashboard */}
        <button
          onClick={onGoBack}
          className="flex flex-col items-center justify-center p-2 rounded-xl transition-all text-slate-500 hover:text-slate-300 active:scale-95 cursor-pointer"
          title="Back to Projects"
        >
          <Folder className="h-4.5 w-4.5 text-slate-400" />
          <span className="text-[10px] mt-0.5 tracking-tight font-sans">Projects</span>
        </button>

        {/* Explorer */}
        <button
          onClick={() => handleTabClick('explorer')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer active:scale-95 ${
            activeTab === 'explorer' ? 'text-indigo-400 font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Files className="h-4.5 w-4.5" />
          <span className="text-[10px] mt-0.5 tracking-tight font-sans">Explorer</span>
          {activeTab === 'explorer' && (
            <span className="absolute -top-1 w-4 h-[2px] rounded bg-indigo-500" />
          )}
        </button>

        {/* Chat */}
        <button
          onClick={() => handleTabClick('chat')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer active:scale-95 ${
            activeTab === 'chat' ? 'text-indigo-400 font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <MessageSquare className="h-4.5 w-4.5" />
          <span className="text-[10px] mt-0.5 tracking-tight font-sans">Chat</span>
          {activeTab === 'chat' && (
            <span className="absolute -top-1 w-4 h-[2px] rounded bg-indigo-500" />
          )}
        </button>

        {/* Run / Stop (Quick Action) */}
        {isRunningCode ? (
          <button
            onClick={handleStopExecution}
            className="flex flex-col items-center justify-center p-2 rounded-xl transition-all text-rose-400 hover:text-rose-300 active:scale-95 cursor-pointer animate-pulse"
            title="Stop Execution"
          >
            <Square className="h-4.5 w-4.5 fill-current text-rose-500" />
            <span className="text-[10px] mt-0.5 tracking-tight font-sans text-rose-400 font-bold">Stop</span>
          </button>
        ) : (
          <button
            onClick={() => {
              handleRunActiveFile();
              if (isMobile) {
                setActiveTab(null);
              }
            }}
            className="flex flex-col items-center justify-center p-2 rounded-xl transition-all text-emerald-400 hover:text-emerald-300 active:scale-95 cursor-pointer"
            title="Run Code"
          >
            <Play className="h-4.5 w-4.5 fill-current text-emerald-400" />
            <span className="text-[10px] mt-0.5 tracking-tight font-sans">Run</span>
          </button>
        )}

        {/* Admin on Mobile */}
        {(user?.email || '').trim().toLowerCase() === 'nakulsharma02011@gmail.com' && (
          <button
            onClick={() => handleTabClick('admin')}
            className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer active:scale-95 ${
              activeTab === 'admin' ? 'text-indigo-400 font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Shield className="h-4.5 w-4.5 text-indigo-400" />
            <span className="text-[10px] mt-0.5 tracking-tight font-sans">Admin</span>
            {activeTab === 'admin' && (
              <span className="absolute -top-1 w-4 h-[2px] rounded bg-indigo-500" />
            )}
          </button>
        )}

        {/* Profile (Settings) */}
        <button
          onClick={() => handleTabClick('settings')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer active:scale-95 ${
            activeTab === 'settings' ? 'text-indigo-400 font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <div className="w-5 h-5 rounded-full border border-indigo-500/30 overflow-hidden shrink-0">
            <img 
              src={user.avatar} 
              alt={user.username} 
              referrerPolicy="no-referrer" 
              className="w-full h-full object-cover" 
              onError={(e) => {
                e.currentTarget.onerror = null;
                const initial = user.username ? encodeURIComponent(user.username.charAt(0).toUpperCase()) : 'U';
                e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%234f46e5'/><text x='50%' y='55%' font-family='sans-serif' font-size='40' font-weight='bold' fill='%23ffffff' dominant-baseline='middle' text-anchor='middle'>${initial}</text></svg>`;
              }}
            />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-sans">Profile</span>
          {activeTab === 'settings' && (
            <span className="absolute -top-1 w-4 h-[2px] rounded bg-indigo-500" />
          )}
        </button>
      </nav>
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <AnimatePresence>
        {showShortcutsModal && (
          <div 
            id="shortcuts_modal_overlay" 
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
            onClick={() => setShowShortcutsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl overflow-hidden flex flex-col relative max-h-[90vh] ${
                isLightTheme 
                  ? 'bg-white border-slate-200 text-slate-800' 
                  : isCyberTheme 
                    ? 'bg-[#0f0a21]/98 border-pink-500/30 text-pink-100' 
                    : 'bg-[#0a0a14]/98 border-white/10 text-slate-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5 shrink-0">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-2 rounded-xl ${isLightTheme ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/10 text-indigo-400'}`}>
                    <Keyboard className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h3 className={`text-sm font-extrabold tracking-tight ${isLightTheme ? 'text-slate-900' : 'text-white'}`}>Codesyne Keyboard Shortcuts</h3>
                    <p className={`text-[10px] mt-0.5 ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>Boost your developer productivity with hotkey shortcuts</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShortcutsModal(false)}
                  className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                    isLightTheme 
                      ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-900' 
                      : 'hover:bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Shortcuts Grid container */}
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-5 pr-1 text-left">
                {/* 1. Core IDE Controls */}
                <div className="space-y-2">
                  <h4 className={`text-xs font-bold uppercase tracking-wider ${isLightTheme ? 'text-indigo-600' : 'text-indigo-400'}`}>Core IDE Controls</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { keys: ['Ctrl', 'Enter'], desc: 'Compile & Run Active Program' },
                      { keys: ['Ctrl', 'S'], desc: 'Manual File Auto-Save' },
                      { keys: ['Ctrl', 'B'], desc: 'Toggle Sidebar Panel' },
                      { keys: ['Ctrl', 'Tab'], desc: 'Toggle Terminal Bottom Drawer' },
                      { keys: ['Ctrl', '/'], desc: 'Toggle Keyboard Shortcuts Guide' },
                    ].map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border min-w-0 ${
                        isLightTheme ? 'bg-slate-50 border-slate-100' : 'bg-[#0f0f1c]/40 border-white/5'
                      }`}>
                        <span className="text-[11px] font-medium truncate min-w-0">{item.desc}</span>
                        <div className="flex items-center space-x-1 shrink-0">
                          {item.keys.map((k, kidx) => (
                            <kbd key={kidx} className={`px-1.5 py-0.5 text-[9px] font-bold font-mono rounded border ${
                              isLightTheme 
                                ? 'bg-white border-slate-300 text-slate-800 shadow-xs' 
                                : 'bg-[#0d0d18] border-white/10 text-slate-300 shadow-md'
                            }`}>{k}</kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Left Panel Hotkeys */}
                <div className="space-y-2 pt-1">
                  <h4 className={`text-xs font-bold uppercase tracking-wider ${isLightTheme ? 'text-indigo-600' : 'text-indigo-400'}`}>Panel Navigation Rail</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: 'E', name: 'File Explorer Panel' },
                      { key: 'F', name: 'Global Content Search' },
                      { key: 'G', name: 'Source Control & Git' },
                      { key: 'D', name: 'Run & Sandbox Debugger' },
                      { key: 'X', name: 'Vibrant Extensions' },
                      { key: 'C', name: 'Multiplayer Collab Chat' },
                      { key: 'A', name: 'AI Assistant Copilot' },
                      { key: 'S', name: 'Workspace Preferences' },
                      { key: 'H', name: 'History timeline snapshots' },
                    ].map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border min-w-0 ${
                        isLightTheme ? 'bg-slate-50 border-slate-100' : 'bg-[#0f0f1c]/40 border-white/5'
                      }`}>
                        <span className="text-[11px] font-medium truncate min-w-0">{item.name}</span>
                        <div className="flex items-center space-x-1 font-mono shrink-0">
                          <kbd className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${
                            isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#0d0d18] border-white/10 text-slate-300'
                          }`}>Alt</kbd>
                          <span className="text-[9px] font-bold">+</span>
                          <kbd className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${
                            isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#0d0d18] border-white/10 text-slate-300'
                          }`}>{item.key}</kbd>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. File Explorer Actions */}
                <div className="space-y-2 pt-1">
                  <h4 className={`text-xs font-bold uppercase tracking-wider ${isLightTheme ? 'text-indigo-600' : 'text-indigo-400'}`}>File Explorer Operations</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { keys: ['Ctrl', 'C'], desc: 'Copy selected file/folder' },
                      { keys: ['Ctrl', 'X'], desc: 'Cut selected file/folder' },
                      { keys: ['Ctrl', 'V'], desc: 'Paste clipboard items' },
                      { keys: ['F2'], desc: 'Rename selected file/folder' },
                      { keys: ['Delete'], desc: 'Delete selected items' },
                    ].map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-2.5 rounded-xl border ${
                        isLightTheme ? 'bg-slate-50 border-slate-100' : 'bg-[#0f0f1c]/40 border-white/5'
                      }`}>
                        <span className="text-[11px] font-medium">{item.desc}</span>
                        <div className="flex items-center space-x-1">
                          {item.keys.map((k, kidx) => (
                            <kbd key={kidx} className={`px-1.5 py-0.5 text-[9px] font-bold font-mono rounded border ${
                              isLightTheme 
                                ? 'bg-white border-slate-300 text-slate-800' 
                                : 'bg-[#0d0d18] border-white/10 text-slate-300'
                            }`}>{k}</kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 pt-4 border-t border-white/5 shrink-0 flex items-center justify-between text-[10px] text-slate-500">
                <span>Press <kbd className="px-1 bg-white/5 border border-white/10 rounded font-bold">Esc</kbd> anytime to close this overlay.</span>
                <span>Version 1.2.4</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Draggable Screen Share Overlay */}
      {collabMedia.activeScreenSharer && (
        <ScreenShareViewer
          screenSharer={collabMedia.activeScreenSharer}
          isSelfSharing={collabMedia.isScreenSharing}
          onStopShare={collabMedia.stopScreenShare}
          onTakeoverShare={collabMedia.startScreenShare}
        />
      )}

      {/* Floating Draggable & Resizable Video Call Pop-up Overlay */}
      {(collabMedia.isVideoActive || collabMedia.isCallActive || Object.keys(collabMedia.remoteParticipants).some(k => collabMedia.remoteParticipants[k]?.isVideoOn || collabMedia.remoteParticipants[k]?.stream || collabMedia.remoteParticipants[k]?.videoStream)) && (
        <FloatingVideoOverlay
          localStream={collabMedia.localVideoStream}
          remoteParticipants={collabMedia.remoteParticipants}
          isCameraOff={collabMedia.isCameraOff}
          isMuted={collabMedia.isMuted}
          onToggleCamera={collabMedia.toggleCamera}
          onToggleMute={collabMedia.toggleMute}
          onEndCall={collabMedia.leaveVoiceCall}
          localUserName={user.username || 'You'}
          localUserAvatar={user.avatar || ''}
        />
      )}

      {/* Collaboration Floating Button & Widget */}
      <CollabFloatingWidget
        roomId={collabRoomId}
        collaborators={collaborators}
        roomConnections={roomConnections}
        wsStatus={wsStatus}
        userRole={userRole}
        unreadChatCount={0}
        onOpenCollabModal={() => setShowCollabModal(true)}
        onEndSession={handleEndSession}
        isMobile={isMobile}
        isCallActive={collabMedia.isCallActive}
        isMuted={collabMedia.isMuted}
        isScreenSharing={collabMedia.isScreenSharing}
      />

      {/* Collaboration Control Center & Chat Modal */}
      <CollaborationModal
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        roomId={collabRoomId}
        user={user}
        userRole={userRole}
        collaborators={collaborators}
        roomConnections={roomConnections}
        clientConnectionId={clientSessionIdRef.current}
        wsStatus={wsStatus}
        onSaveProject={persistProjectFiles}
        onCopyLink={() => {
          const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/workspace?collab=${collabRoomId}`;
          navigator.clipboard.writeText(shareUrl);
          onShowToast('Room Link Copied', 'Shareable room link copied to clipboard!', 'success');
        }}
        onJoinRoom={(newRoomId) => {
          setCollabRoomId(newRoomId);
          onShowToast('Room Joined', `Switched to collaboration room ${newRoomId}`, 'success');
        }}
        onChangeUserRole={handleChangeUserRole}
        onKickUser={handleKickUser}
        onEndSession={handleEndSession}
        onLeaveRoom={handleLeaveRoom}
        chatMessages={chatMessages}
        onSendChatMessage={handleSendRoomChatMessage}
        
        isCallActive={collabMedia.isCallActive}
        isMuted={collabMedia.isMuted}
        isVideoActive={collabMedia.isVideoActive}
        isCameraOff={collabMedia.isCameraOff}
        localVideoStream={collabMedia.localVideoStream}
        mediaStatus={collabMedia.connectionStatus}
        activeSpeakerId={collabMedia.activeSpeakerId}
        isScreenSharing={collabMedia.isScreenSharing}
        activeScreenSharer={collabMedia.activeScreenSharer}
        remoteParticipants={collabMedia.remoteParticipants}
        onStartVoiceCall={collabMedia.startVoiceCall}
        onStartVideoCall={collabMedia.startVideoCall}
        onToggleMute={collabMedia.toggleMute}
        onToggleCamera={collabMedia.toggleCamera}
        onLeaveVoiceCall={collabMedia.leaveVoiceCall}
        onStartScreenShare={collabMedia.startScreenShare}
        onStopScreenShare={collabMedia.stopScreenShare}
      />

      {/* Session Ended Overlay Notice Dialog */}
      {sessionEndedNotice && (
        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0e0e1a] border border-indigo-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 font-sans animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Collaboration Session Ended</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {sessionEndedNotice}
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSessionEndedNotice(null);
                  const freshRoomId = 'room_' + Math.random().toString(36).substring(2, 9);
                  setCollabRoomId(freshRoomId);
                  setShowCollabModal(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Start New Session
              </button>
              <button
                type="button"
                onClick={() => setSessionEndedNotice(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Transparent Drag Overlay during panel resizing on PC */}
      {isResizing && (
        <div className="fixed inset-0 z-[999999] cursor-col-resize select-none pointer-events-auto bg-transparent" />
      )}
    </div>
  );
}
