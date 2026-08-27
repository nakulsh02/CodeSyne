import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Lock, LogOut } from 'lucide-react';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import Workspace from './components/Workspace';
import PWAManager from './components/PWAManager';
import StylusPointer from './components/StylusPointer';
import ErrorBoundary from './components/ErrorBoundary';
import { Project, UserProfile, ProjectType, FileSystemState, getSecureAvatarUrl, getBotAvatarUrl } from '@shared/types';
import { MOCK_PROJECTS, TEMPLATES } from '@shared/mockData';
import { API_BASE_URL } from './config';
import { safeFetch } from './api';
import { requestNotificationPermission, sendBrowserNotification } from './utils/notifications';

// Safe key builder for localStorage keys to prevent null/undefined email crashes
const getUserEmailKey = (email?: string | null, username?: string | null, id?: string | null): string => {
  const val = email || username || id || 'user';
  return val.toString().trim().toLowerCase();
};

const isDummyProject = (p: any): boolean => {
  if (!p || !p.id) return true;
  const pid = String(p.id);
  if (pid.startsWith('proj_default_') || ['1', '2', '3'].includes(pid)) return true;
  const pname = String(p.name || '').toLowerCase();
  if (pname.includes('e-commerce platform') || pname.includes('fastapi microservice')) return true;
  return false;
};

export const sanitizeUserProfile = (uObj: any): UserProfile => {
  const emailKey = getUserEmailKey(uObj?.email, uObj?.username, uObj?.id);
  const userEmail = (uObj?.email && typeof uObj.email === 'string' && uObj.email.includes('@')) 
    ? uObj.email.trim() 
    : `${emailKey}@codesyne.app`;
  const username = uObj?.username || emailKey;
  const id = uObj?.id || `usr_${emailKey}`;
  const avatar = uObj?.avatar || getBotAvatarUrl(userEmail, username);
  const role = uObj?.role || ((userEmail || '').toLowerCase() === 'nakulsharma02011@gmail.com' ? 'admin' : 'user');

  return {
    id,
    username,
    email: userEmail,
    avatar,
    role,
    whatsapp: uObj?.whatsapp || '',
    bio: uObj?.bio || 'Developer Workspace Sandbox Active',
    hasCustomAvatar: uObj?.hasCustomAvatar ?? true,
    achievements: Array.isArray(uObj?.achievements) ? uObj.achievements : ['Early Adopter', 'Fullstack Pioneer'],
    stats: {
      linesCoded: typeof uObj?.stats?.linesCoded === 'number' ? uObj.stats.linesCoded : 0,
      activeHours: 0,
      projectsCount: typeof uObj?.stats?.projectsCount === 'number' ? uObj.stats.projectsCount : 0,
      commitsCount: typeof uObj?.stats?.commitsCount === 'number' ? uObj.stats.commitsCount : 0
    }
  };
};

export default function App() {
  
  // Helper function to extract user & token safely from OAuth URL params
  const getUrlAuthData = (): { token: string; user: UserProfile } | null => {
    if (typeof window === 'undefined') return null;
    try {
      const hash = window.location.hash;
      const search = window.location.search;
      const params = new URLSearchParams(hash ? hash.replace('#', '?') : search);
      
      const isCancelled = params.get('oauth_cancelled') || params.get('oauth_error') || params.get('error');
      if (isCancelled) {
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}
        }
        return null;
      }

      const token = params.get('token') || params.get('oauth_token');
      const userStr = params.get('user');

      if (token && userStr) {
        let uObj: any = null;
        try {
          const decoded = decodeURIComponent(userStr);
          uObj = JSON.parse(decoded);
        } catch {
          try {
            uObj = JSON.parse(userStr);
          } catch {
            uObj = null;
          }
        }

        if (uObj && typeof uObj === 'object') {
          // If stringified twice, parse once more
          if (typeof uObj === 'string') {
            try { uObj = JSON.parse(uObj); } catch {}
          }
          if (uObj && typeof uObj === 'object') {
            const cleanUser = sanitizeUserProfile(uObj);
            const emailKey = getUserEmailKey(cleanUser.email, cleanUser.username, cleanUser.id);
            localStorage.setItem('ide_jwt_token', token);
            localStorage.setItem('ide_session_user', JSON.stringify(cleanUser));
            localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(cleanUser));
            // Immediately clean URL params so they don't persist in browser address bar or trigger re-auth on logout
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
              try {
                window.history.replaceState({}, document.title, window.location.pathname);
              } catch {}
            }
            return { token, user: cleanUser };
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse url auth data:', e);
    }
    return null;
  };

  // Page routing state
  const [currentPage, setCurrentPage] = useState<'landing' | 'auth' | 'dashboard' | 'workspace'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const search = window.location.search;
        const hash = window.location.hash;
        const params = new URLSearchParams(hash && hash.includes('?') ? hash.substring(hash.indexOf('?')) : search);
        if (params.get('contact_verify_token') || params.get('contactVerifyToken') || params.get('contact_token') || hash.includes('#contact')) {
          return 'landing';
        }
      }
      const urlAuth = getUrlAuthData();
      if (urlAuth) return 'dashboard';
      const session = localStorage.getItem('ide_session_user');
      return session ? 'dashboard' : 'landing';
    } catch {
      return 'landing';
    }
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const urlAuth = getUrlAuthData();
      if (urlAuth) return urlAuth.user;

      const session = localStorage.getItem('ide_session_user');
      if (session) {
        let uObj = JSON.parse(session);
        if (typeof uObj === 'string') {
          try { uObj = JSON.parse(uObj); } catch {}
        }
        if (uObj && typeof uObj === 'object') {
          const emailKey = getUserEmailKey(uObj.email, uObj.username, uObj.id);
          const savedUserStr = localStorage.getItem(`ide_custom_user_${emailKey}`);
          if (savedUserStr) {
            try {
              const savedUser = JSON.parse(savedUserStr);
              uObj = { ...uObj, ...savedUser };
            } catch {}
          }
          const cleanUser = sanitizeUserProfile(uObj);
          return cleanUser;
        }
      }
    } catch (e) {
      console.error('Failed to parse user session from local storage:', e);
    }
    return null;
  });
  
  // Keep user state synchronized with ref for async listeners
  const userRef = useRef(user);
  const lastAuthTimeRef = useRef<number>(0);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Custom visual feedback toasts
  const [toast, setToast] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Backend sleep / cloning loading animation overlay state
  const [cloningState, setCloningState] = useState<{
    isCloning: boolean;
    title: string;
    message: string;
    step: number;
  }>({
    isCloning: false,
    title: '',
    message: '',
    step: 0
  });

  // Trigger visual alert
  const triggerToast = useCallback((title: string, message: string, type: 'success' | 'error' | 'info') => {
    setToast({ title, message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  // Fetch fresh user profile on app mount to keep profile photo & data synced with backend
  useEffect(() => {
    const fetchLatestProfile = async () => {
      const token = localStorage.getItem('ide_jwt_token');
      if (!token) return;
      try {
        const response = await safeFetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          skipThrowOnNonOk: true
        });
        const data = await response.json();
        if (response.ok && data && data.user) {
          const cleanUser = sanitizeUserProfile(data.user);
          setUser(cleanUser);
          const emailKey = getUserEmailKey(cleanUser.email, cleanUser.username, cleanUser.id);
          localStorage.setItem('ide_session_user', JSON.stringify(cleanUser));
          localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(cleanUser));
        } else if (response.status === 403 || response.status === 404) {
          localStorage.removeItem('ide_session_user');
          localStorage.removeItem('ide_jwt_token');
          setUser(null);
          setCurrentPage('auth');
          if (response.status === 403 || data?.suspended) {
            setAuthMode('login');
            triggerToast('Account Suspended', data?.error || 'Your account has been suspended by system administrators.', 'error');
          } else {
            setAuthMode('signup');
            triggerToast('Account Deleted', 'Your developer account was deleted. Please sign up to create a new account.', 'info');
          }
        }
      } catch (err) {
        console.warn('Failed to fetch latest profile on mount:', err);
      }
    };

    fetchLatestProfile();
  }, [triggerToast]);

  // Always scroll to top when changing views/pages so the header is never cut off
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [currentPage]);

  // Handle URL share links, verification tokens, and auth_error parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const search = window.location.search;
      const hash = window.location.hash;
      const params = new URLSearchParams(search);
      const hashParams = new URLSearchParams(hash && hash.includes('?') ? hash.substring(hash.indexOf('?')) : '');

      const contactToken = params.get('contact_verify_token') || 
                           params.get('contactVerifyToken') || 
                           params.get('contact_token') ||
                           hashParams.get('contact_verify_token') ||
                           hashParams.get('contactVerifyToken') ||
                           hashParams.get('contact_token');

      if (contactToken) {
        localStorage.setItem('codesyne_pending_contact_token', contactToken);
        if (userRef.current) {
          triggerToast(
            'Contact Email Verified! 🎉',
            'Your contact inquiry email has been verified. You can review and confirm transmission on the Contact page.',
            'success'
          );
        }
        setCurrentPage('landing');
      } else if (hash === '#contact' || search.includes('page=contact')) {
        setCurrentPage('landing');
      }

      const resetTok = params.get('resetToken') || hashParams.get('resetToken');
      if (resetTok) {
        setCurrentPage('auth');
        setAuthMode('login');
      }

      const verifyTok = params.get('verifyToken') || hashParams.get('verifyToken');
      if (verifyTok) {
        setCurrentPage('auth');
        setAuthMode('login');
      }

      const shareId = params.get('share') || params.get('collab') || params.get('project') || params.get('p') || params.get('room') ||
                      hashParams.get('share') || hashParams.get('collab') || hashParams.get('project');
      if (shareId) {
        localStorage.setItem('codesyne_pending_share_project_id', shareId);
        if (!userRef.current) {
          setCurrentPage('auth');
          setAuthMode('login');
          triggerToast(
            'Shared Workspace Invitation 🚀',
            'Please sign in or create an account to import and start editing this shared project!',
            'info'
          );
        } else {
          processPendingSharedProject(userRef.current);
        }
      }

      const authErr = params.get('auth_error') || hashParams.get('auth_error');
      if (authErr) {
        localStorage.removeItem('ide_session_user');
        localStorage.removeItem('ide_jwt_token');
        setUser(null);
        setCurrentPage('auth');
        setAuthMode('login');
        triggerToast('Account Suspended', decodeURIComponent(authErr), 'error');
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch (e) {
      console.warn('Error reading URL parameters:', e);
    }
  }, [triggerToast]);

  // Automatically process pending share link whenever user is logged in
  useEffect(() => {
    if (user) {
      processPendingSharedProject(user);
    }
  }, [user]);

  // Centralized theme state
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('codesyne_ide_theme') || 'midnight');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [expiredSessionInfo, setExpiredSessionInfo] = useState<{ isExpired: boolean; message: string } | null>(null);

  // Register/sync user active session with backend database
  useEffect(() => {
    if (!user || !user.email) return;
    const syncUserWithBackend = async () => {
      try {
        const response = await safeFetch('/api/admin/register-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            role: user.role,
            lastAction: 'Active Session Sandbox'
          }),
          skipThrowOnNonOk: true
        });
        const serverUser = await response.json();
        if (response.ok && serverUser) {
          setUser(prev => {
            if (!prev) return prev;
            let modified = false;
            const updated = { ...prev };
            if (serverUser.avatar && serverUser.avatar !== prev.avatar) {
              updated.avatar = serverUser.avatar;
              modified = true;
            }
            if (serverUser.role && serverUser.role !== prev.role) {
              updated.role = serverUser.role;
              modified = true;
            }
            if (modified) {
              localStorage.setItem('ide_session_user', JSON.stringify(updated));
              return updated;
            }
            return prev;
          });
        } else if (response.status === 403 || response.status === 404) {
          localStorage.removeItem('ide_session_user');
          localStorage.removeItem('ide_jwt_token');
          setUser(null);
          setCurrentPage('auth');
          if (response.status === 403 || serverUser?.suspended) {
            setAuthMode('login');
            triggerToast('Account Suspended', serverUser?.error || 'Your account has been suspended by system administrators.', 'error');
          } else {
            setAuthMode('signup');
            triggerToast('Account Deleted', 'Your developer account was deleted. Please sign up to create a new account.', 'info');
          }
        }
      } catch (err) {
        console.warn('Failed to register active session with backend:', err);
      }
    };
    syncUserWithBackend();
  }, [user?.email, user?.id, triggerToast]);

  // Persist theme choice dynamically
  useEffect(() => {
    localStorage.setItem('codesyne_ide_theme', theme);
  }, [theme]);

  // Ensure current page is valid when user state changes and keep authenticated users locked
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      const hash = window.location.hash;
      const params = new URLSearchParams(search);
      const hashParams = new URLSearchParams(hash && hash.includes('?') ? hash.substring(hash.indexOf('?')) : '');

      const isContactOrPublicFlow = params.get('contact_verify_token') || 
                                   params.get('contactVerifyToken') || 
                                   params.get('contact_token') ||
                                   params.get('verifyToken') || 
                                   params.get('resetToken') || 
                                   hashParams.get('contact_verify_token') ||
                                   hashParams.get('contactVerifyToken') ||
                                   hash === '#contact' || 
                                   hash === '#features' ||
                                   hash === '#pricing' ||
                                   search.includes('page=contact');

      if (isContactOrPublicFlow && currentPage === 'landing') {
        return; // Retain landing page so contact verification or public modal can render smoothly
      }
    }

    if (user) {
      if (currentPage === 'landing' || currentPage === 'auth') {
        setCurrentPage('dashboard');
        try {
          window.history.replaceState({ page: 'dashboard' }, document.title, '/dashboard');
        } catch {}
      }
    } else {
      if (currentPage === 'dashboard' || currentPage === 'workspace') {
        setCurrentPage('landing');
      }
    }
  }, [currentPage, user]);

  // Global OAuth success listener (BroadcastChannel, postMessage, storage events)
  useEffect(() => {
    const handleOAuthSuccess = (authUser: any, token?: string) => {
      if (!authUser) return;
      const cleanUser = sanitizeUserProfile(authUser);
      if (token) {
        localStorage.setItem('ide_jwt_token', token);
      }
      localStorage.setItem('ide_session_user', JSON.stringify(cleanUser));
      const emailKey = getUserEmailKey(cleanUser.email, cleanUser.username, cleanUser.id);
      localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(cleanUser));
      
      // Only transition and trigger toast if user changed or was logged out
      if (!userRef.current || (userRef.current.email !== cleanUser.email && userRef.current.id !== cleanUser.id)) {
        handleAuthSuccess(cleanUser);
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
        handleOAuthSuccess(event.data.user, event.data.token);
      } else if (event.data?.type === 'LOGOUT') {
        setUser(null);
        setCurrentPage('landing');
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('codesyne_oauth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
            handleOAuthSuccess(event.data.user, event.data.token);
          } else if (event.data?.type === 'LOGOUT') {
            setUser(null);
            setCurrentPage('landing');
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel error in App:', e);
    }

    const checkSessionUser = () => {
      const session = localStorage.getItem('ide_session_user');
      if (session) {
        try {
          const uObj = JSON.parse(session);
          if (uObj && (uObj.email || uObj.username || uObj.id)) {
            const clean = sanitizeUserProfile(uObj);
            // Only update if no active user session or session user actually changed
            if (!userRef.current || (userRef.current.email !== clean.email && userRef.current.id !== clean.id)) {
              handleOAuthSuccess(uObj);
            }
          }
        } catch {}
      } else {
        // Session removed in localStorage - clear active user
        if (userRef.current) {
          setUser(null);
          setCurrentPage('landing');
        }
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'ide_session_user' || e.key === 'codesyne_oauth_signal') {
        checkSessionUser();
      }
    };

    const handleFocusOrVisibility = () => {
      checkSessionUser();
    };

    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    // Occasional poller to catch cross-tab updates without aggressive re-renders
    const sessionCheckInterval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        checkSessionUser();
      }
    }, 6000);

    return () => {
      window.removeEventListener('message', handleWindowMessage);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      clearInterval(sessionCheckInterval);
      if (bc) bc.close();
    };
  }, []);

  // Clean up URL token parameters on OAuth redirect from backend and handle browser history lock
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (search.includes('token=') || hash.includes('token=')) {
      try {
        window.history.replaceState({ page: 'dashboard' }, document.title, '/dashboard');
      } catch {}
    } else if (user && (currentPage === 'dashboard' || currentPage === 'workspace')) {
      try {
        window.history.replaceState({ page: currentPage }, document.title, `/${currentPage}`);
      } catch {}
    }

    // Handle browser back button to lock authenticated users inside dashboard/workspace
    const handlePopState = () => {
      if (userRef.current) {
        if (currentPage === 'workspace') {
          // Navigate back from workspace to dashboard cleanly
          setCurrentPage('dashboard');
          try {
            window.history.replaceState({ page: 'dashboard' }, document.title, '/dashboard');
          } catch {}
        } else {
          // Lock user inside dashboard - prevent returning to auth/landing pages
          setCurrentPage('dashboard');
          try {
            window.history.replaceState({ page: 'dashboard' }, document.title, '/dashboard');
          } catch {}
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentPage, user]);

  // Reset window scroll position on page transition to prevent shifted layouts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Active time tracking in seconds with auto-sync to backend database
  const [activeSeconds, setActiveSeconds] = useState<number>(0);
  const activeSecondsRef = useRef<number>(0);

  useEffect(() => {
    activeSecondsRef.current = activeSeconds;
  }, [activeSeconds]);

  // Projects data state loaded from local storage fallback (strictly user-owned, no dummy defaults)
  const [projects, setProjects] = useState<Project[]>(() => {
    const session = localStorage.getItem('ide_session_user');
    if (session) {
      try {
        let uObj = JSON.parse(session);
        if (typeof uObj === 'string') {
          try { uObj = JSON.parse(uObj); } catch {}
        }
        if (uObj && typeof uObj === 'object') {
          const emailKey = getUserEmailKey(uObj.email, uObj.username, uObj.id);
          const saved = localStorage.getItem(`codesyne_local_projects_${emailKey}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              return parsed.filter(p => !isDummyProject(p));
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse local user projects:', e);
      }
    }
    return [];
  });

  useEffect(() => {
    if (!user?.email) {
      setActiveSeconds(0);
      return;
    }
    const emailKey = getUserEmailKey(user.email, user.username, user.id);

    // If user has 0 projects (e.g. data deleted), reset active time clock to 0.0.0
    if (projects.length === 0) {
      localStorage.setItem(`codesyne_active_time_${emailKey}`, '0');
      setActiveSeconds(0);
      activeSecondsRef.current = 0;
    } else {
      const savedSecsStr = localStorage.getItem(`codesyne_active_time_${emailKey}`);
      let savedSecs = savedSecsStr && !isNaN(parseInt(savedSecsStr, 10)) ? parseInt(savedSecsStr, 10) : 0;
      if (savedSecs > 10000 && projects.length === 0) {
        savedSecs = 0;
        localStorage.setItem(`codesyne_active_time_${emailKey}`, '0');
      }
      setActiveSeconds(savedSecs);
    }

    // Tick active session counter only when user is actively in dashboard/workspace and tab is focused
    const timer = setInterval(() => {
      if ((currentPage === 'dashboard' || currentPage === 'workspace') && !document.hidden) {
        setActiveSeconds(prev => {
          const next = prev + 1;
          localStorage.setItem(`codesyne_active_time_${emailKey}`, next.toString());
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [user?.email, user?.id, projects.length === 0, currentPage]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const search = window.location.search;
        const hash = window.location.hash;
        const params = new URLSearchParams(hash ? hash.replace('#', '?') : search);
        const urlShare = params.get('share') || params.get('collab') || params.get('project') || params.get('p') || params.get('room');
        if (urlShare) return urlShare;
        return localStorage.getItem('codesyne_last_selected_project_id') || null;
      } catch {}
    }
    return null;
  });

  // Auto-accept team collaboration invitation if inviteToken is present in URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const search = window.location.search;
      const hash = window.location.hash;
      const params = new URLSearchParams(hash ? hash.replace('#', '?') : search);
      const inviteToken = params.get('inviteToken');

      if (inviteToken) {
        safeFetch('/api/projects/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteToken,
            userEmail: user?.email,
            userId: user?.id
          })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.project) {
              setSelectedProjectId(data.project.id);
              triggerToast('Joined Team Workspace! 👥', `You are now a collaborator on "${data.project.name}".`, 'success');
              if (window.history && window.history.replaceState) {
                const url = new URL(window.location.href);
                url.searchParams.delete('inviteToken');
                window.history.replaceState({}, document.title, url.toString());
              }
            } else if (data.error) {
              triggerToast('Invite Notice', data.error, 'info');
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, [user?.email, user?.id]);

  // Sync active seconds to database periodically (every 10s) and on tab close/unload
  useEffect(() => {
    if (!user?.email) return;

    const syncToDatabase = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const secsToSync = activeSecondsRef.current;
      if (secsToSync < 0) return;

      try {
        const calculatedLinesCoded = projects.reduce((total, p) => {
          if (p.files) {
            Object.values(p.files).forEach((fObj: any) => {
              if (typeof fObj === 'string') {
                total += fObj.split('\n').length;
              } else if (fObj && typeof fObj.content === 'string') {
                total += fObj.content.split('\n').length;
              }
            });
          }
          return total;
        }, 0);

        const response = await safeFetch('/api/user/sync-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            linesCoded: calculatedLinesCoded,
            projectsCount: projects.length
          })
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.stats) {
            setUser(prev => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                stats: {
                  ...prev.stats,
                  ...data.stats
                }
              };
              const emailKey = getUserEmailKey(prev.email, prev.username, prev.id);
              localStorage.setItem('ide_session_user', JSON.stringify(updated));
              localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updated));
              return updated;
            });
          }
        }
      } catch (err) {
        // Silently handle background network retry
      }
    };

    const syncTimer = setInterval(syncToDatabase, 10000);

    const handleBeforeUnload = () => {
      const email = user.email;
      const secs = activeSecondsRef.current;
      if (email && secs >= 0) {
        const payload = JSON.stringify({ email, activeSeconds: secs });
        navigator.sendBeacon('/api/user/sync-stats', new Blob([payload], { type: 'application/json' }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.email, projects.length]);

  const handleResetTimer = async () => {
    setActiveSeconds(0);
    activeSecondsRef.current = 0;
    if (user?.email) {
      const emailKey = getUserEmailKey(user.email, user.username, user.id);
      localStorage.setItem(`codesyne_active_time_${emailKey}`, '0');
      try {
        await safeFetch('/api/user/reset-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
        setUser(prev => {
          if (!prev) return null;
          const updated = {
            ...prev,
            stats: {
              ...prev.stats,
              linesCoded: prev.stats?.linesCoded || 0,
              activeHours: 0,
              projectsCount: prev.stats?.projectsCount || 0,
              commitsCount: prev.stats?.commitsCount || 0
            }
          };
          localStorage.setItem('ide_session_user', JSON.stringify(updated));
          localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updated));
          return updated;
        });
        triggerToast('Timer Reset', 'Active coding time reset to 00:00:00.', 'info');
      } catch (e) {
        console.error('Failed to reset stats:', e);
      }
    }
  };

  // Auto-persist projects state to local storage
  useEffect(() => {
    if (user) {
      const emailKey = getUserEmailKey(user.email, user.username, user.id);
      const cleanProjects = projects.filter(p => !isDummyProject(p));
      localStorage.setItem(`codesyne_local_projects_${emailKey}`, JSON.stringify(cleanProjects));
    }
  }, [projects, user]);

  const [globalError, setGlobalError] = useState<{ message: string; type: string } | null>(null);

  const registerUserOnServer = async (uObj: UserProfile): Promise<UserProfile> => {
    try {
      const emailKey = getUserEmailKey(uObj.email, uObj.username, uObj.id);
      const userEmail = uObj.email || `${emailKey}@codesyne.app`;
      const response = await safeFetch('/api/admin/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: uObj.username,
          email: userEmail,
          avatar: uObj.avatar,
          role: ((userEmail || '').toLowerCase() === 'nakulsharma02011@gmail.com') ? 'admin' : 'user',
          lastAction: 'Connected session sandbox'
        })
      });
      if (response.ok) {
        const serverUser = await response.json();
        if (serverUser && serverUser.id) {
          const updatedUser = {
            ...uObj,
            id: serverUser.id,
            role: serverUser.role || uObj.role,
            avatar: serverUser.avatar || uObj.avatar,
            whatsapp: serverUser.whatsapp || uObj.whatsapp
          };
          setUser(updatedUser);
          localStorage.setItem('ide_session_user', JSON.stringify(updatedUser));
          localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updatedUser));
          return updatedUser;
        }
      }
    } catch (e) {
      console.warn('[IDE Server Sync] Failed to register user session on backend:', e);
    }
    return uObj;
  };

  // Mount logic: Auto-login sync from local session storage
  useEffect(() => {
    const session = localStorage.getItem('ide_session_user');
    if (session) {
      try {
        let uObj = JSON.parse(session);
        if (typeof uObj === 'string') {
          try { uObj = JSON.parse(uObj); } catch {}
        }
        if (uObj && typeof uObj === 'object') {
          const emailKey = getUserEmailKey(uObj.email, uObj.username, uObj.id);
          const savedUserStr = localStorage.getItem(`ide_custom_user_${emailKey}`);
          if (savedUserStr) {
            try {
              const savedUser = JSON.parse(savedUserStr);
              uObj.avatar = savedUser.avatar || uObj.avatar;
              uObj.hasCustomAvatar = savedUser.hasCustomAvatar ?? uObj.hasCustomAvatar;
            } catch {}
          }
          if (!uObj.avatar) {
            uObj.avatar = getBotAvatarUrl(uObj.email || emailKey, uObj.username);
            uObj.hasCustomAvatar = true;
            localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(uObj));
            localStorage.setItem('ide_session_user', JSON.stringify(uObj));
          }
          setUser(uObj);
          
          // Background sync with server without re-triggering toasts or page flips
          registerUserOnServer(uObj).then((updatedUser) => {
            fetchProjectsFromServer(updatedUser.id, updatedUser.email);
          });
        }
      } catch (e) {
        localStorage.removeItem('ide_session_user');
      }
    }
  }, []);

  // Process shared project invitation links and import into user's account with strict checks & loading animation
  const processPendingSharedProject = async (activeUser: UserProfile, projectListOverride?: Project[]) => {
    if (typeof window === 'undefined') return;
    try {
      const search = window.location.search;
      const hash = window.location.hash;
      const params = new URLSearchParams(hash ? hash.replace('#', '?') : search);
      const shareParam = params.get('share') || params.get('collab') || params.get('project') || params.get('p') || params.get('room');
      const pendingShareId = shareParam || localStorage.getItem('codesyne_pending_share_project_id');

      if (!pendingShareId) return;

      const isCollabRequested = Boolean(
        params.get('collab') || 
        params.get('room') || 
        localStorage.getItem('codesyne_pending_is_collab') === 'true'
      );

      // 1. Check if user is signed in. If not, auto-create a Guest Collaborator session so they join immediately
      if (!activeUser) {
        const guestUser: UserProfile = {
          id: 'user_guest_' + Math.random().toString(36).substring(2, 9),
          username: 'Guest Collaborator',
          email: 'guest_' + Math.random().toString(36).substring(2, 7) + '@codesyne.app',
          role: 'user',
          avatar: getBotAvatarUrl('guest', 'Guest Collaborator'),
          bio: 'Guest Developer',
          achievements: [],
          stats: {
            linesCoded: 0,
            activeHours: 0,
            projectsCount: 0,
            commitsCount: 0
          }
        };
        setUser(guestUser);
        localStorage.setItem('ide_session_user', JSON.stringify(guestUser));
        activeUser = guestUser;
      }

      // Clean up URL parameters cleanly so browser address bar is clean
      if (window.history && window.history.replaceState) {
        window.history.replaceState({ page: 'workspace' }, document.title, '/workspace');
      }

      const emailKey = getUserEmailKey(activeUser.email, activeUser.username, activeUser.id);
      const targetList = projectListOverride || projects;

      // 2. CHECK WITH SERVER FIRST IF SESSION IS EXPIRED BEFORE ENTERING
      try {
        const checkRes = await safeFetch(`/api/projects/${pendingShareId}`);
        if (checkRes.status === 410) {
          const errData = await checkRes.json().catch(() => ({}));
          localStorage.removeItem('codesyne_pending_share_project_id');
          localStorage.removeItem('codesyne_pending_is_collab');
          setExpiredSessionInfo({
            isExpired: true,
            message: errData.message || 'This collaboration session has been ended by the room host. The share link is no longer active.'
          });
          setCurrentPage('dashboard');
          return;
        }
      } catch (e) {
        console.warn('Pre-check room status warning:', e);
      }

      // 3. CHECK IF PROJECT ALREADY EXISTS IN USER'S PROJECTS
      let existing = targetList.find(p => 
        p.id === pendingShareId || 
        (p as any).originalId === pendingShareId ||
        p.id === 'proj_' + pendingShareId
      );

      if (!existing) {
        const savedStr = localStorage.getItem(`codesyne_local_projects_${emailKey}`);
        if (savedStr) {
          try {
            const savedList: Project[] = JSON.parse(savedStr);
            if (Array.isArray(savedList)) {
              existing = savedList.find(p => p.id === pendingShareId || (p as any).originalId === pendingShareId);
              if (existing && !projects.some(p => p.id === existing!.id)) {
                setProjects(prev => [existing!, ...prev]);
              }
            }
          } catch {}
        }
      }

      // IF PROJECT ALREADY EXISTS: OPEN DIRECTLY WITHOUT DUPLICATING!
      if (existing) {
        localStorage.removeItem('codesyne_pending_share_project_id');
        localStorage.removeItem('codesyne_pending_is_collab');
        setSelectedProjectId(existing.id);
        setCurrentPage('workspace');
        triggerToast('Shared Workspace Opened 👥', `Opened project "${existing.name}". Connected to live collaboration!`, 'success');
        return;
      }

      // 3. PROJECT DOES NOT EXIST IN USER'S ACCOUNT -> JOIN & SYNC ORIGINAL WORKSPACE WITH LOADING ANIMATION!
      setCloningState({
        isCloning: true,
        title: 'Waking Server & Connecting to Collaboration Room 🚀',
        message: 'Backend server may be in sleep mode. Starting cloud instance and loading shared workspace...',
        step: 1
      });

      const timer1 = setTimeout(() => {
        setCloningState(prev => ({ ...prev, step: 2, message: 'Waking up cloud backend service & fetching workspace files...' }));
      }, 500);
      const timer2 = setTimeout(() => {
        setCloningState(prev => ({ ...prev, step: 3, message: 'Joining shared room & connecting real-time collaboration...' }));
      }, 1200);

      let targetProject: Project | null = null;

      // Attempt 1: Fetch original project from server directly
      try {
        const getRes = await safeFetch(`/api/projects/${pendingShareId}`);
        if (getRes.status === 410) {
          const errData = await getRes.json().catch(() => ({}));
          localStorage.removeItem('codesyne_pending_share_project_id');
          localStorage.removeItem('codesyne_pending_is_collab');
          setCloningState({ isCloning: false, title: '', message: '', step: 1 });
          setExpiredSessionInfo({
            isExpired: true,
            message: errData.message || 'This collaboration session has been ended by the room host. The link is no longer active.'
          });
          return;
        }

        if (getRes.ok) {
          const origProj = await getRes.json();
          if (origProj && (origProj.id || origProj._id)) {
            targetProject = {
              id: origProj.id || pendingShareId,
              name: origProj.name || 'Shared Project',
              description: origProj.description || 'Joined via shared project link',
              type: origProj.type || 'web',
              files: origProj.files || TEMPLATES[origProj.type as ProjectType]?.files || TEMPLATES.web.files,
              messages: origProj.messages || [],
              createdAt: origProj.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isFavorite: false,
              status: 'active',
              ownerId: origProj.ownerId || 'shared_creator', // KEEP ORIGINAL CREATOR AS OWNER!
              sharedWith: origProj.sharedWith || []
            };
          }
        }
      } catch (e) {
        console.warn('[Collab/Share Join] Attempt 1 error:', e);
      }

      // Retry Attempt 2 if backend was waking up from sleep
      if (!targetProject) {
        setCloningState(prev => ({ ...prev, step: 2, message: 'Server instance is waking up... Retrying connection...' }));
        await new Promise(r => setTimeout(r, 1000));
        try {
          const getRes = await safeFetch(`/api/projects/${pendingShareId}`);
          if (getRes.status === 410) {
            const errData = await getRes.json().catch(() => ({}));
            localStorage.removeItem('codesyne_pending_share_project_id');
            localStorage.removeItem('codesyne_pending_is_collab');
            setCloningState({ isCloning: false, title: '', message: '', step: 1 });
            setExpiredSessionInfo({
              isExpired: true,
              message: errData.message || 'This collaboration session has been ended by the room host. The link is no longer active.'
            });
            return;
          }

          if (getRes.ok) {
            const origProj = await getRes.json();
            if (origProj && (origProj.id || origProj._id)) {
              targetProject = {
                id: origProj.id || pendingShareId,
                name: origProj.name || 'Shared Project',
                description: origProj.description || 'Joined via shared project link',
                type: origProj.type || 'web',
                files: origProj.files || TEMPLATES[origProj.type as ProjectType]?.files || TEMPLATES.web.files,
                messages: origProj.messages || [],
                createdAt: origProj.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: false,
                status: 'active',
                ownerId: origProj.ownerId || 'shared_creator', // KEEP ORIGINAL CREATOR AS OWNER!
                sharedWith: origProj.sharedWith || []
              };
            }
          }
        } catch (e) {
          console.warn('[Collab/Share Join] Retry error:', e);
        }
      }

      // Fallback: If project not found on server, try fork endpoint or build collaborative room
      if (!targetProject) {
        try {
          const forkRes = await safeFetch(`/api/projects/${pendingShareId}/fork`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: activeUser.id, email: activeUser.email })
          });
          if (forkRes.ok) {
            const forked = await forkRes.json();
            if (forked && forked.id) {
              targetProject = {
                ...forked,
                originalId: pendingShareId
              };
            }
          }
        } catch (e) {}
      }

      clearTimeout(timer1);
      clearTimeout(timer2);

      // Final fallback if server could not find original: create local collaborative room entry
      if (!targetProject) {
        targetProject = {
          id: pendingShareId,
          name: 'Shared Collaborative Workspace',
          description: 'Joined via shared collaboration room link',
          type: 'web',
          files: TEMPLATES.web.files,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isFavorite: false,
          status: 'active',
          ownerId: 'original_owner',
          sharedWith: []
        };
      }

      setProjects(prev => {
        if (prev.some(p => p.id === targetProject!.id)) return prev;
        const updated = [targetProject!, ...prev];
        localStorage.setItem(`codesyne_local_projects_${emailKey}`, JSON.stringify(updated));
        return updated;
      });

      // Ensure project exists on backend server DB for seamless room join and is linked to joining user!
      try {
        safeFetch('/api/projects/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...targetProject,
            userId: activeUser.id,
            email: activeUser.email,
            sharedWith: Array.from(new Set([...(targetProject.sharedWith || []), activeUser.id, activeUser.email].filter(Boolean)))
          })
        }).catch(() => {});
      } catch (e) {}

      setSelectedProjectId(targetProject.id);
      localStorage.setItem('codesyne_last_selected_project_id', targetProject.id);
      setCurrentPage('workspace');

      localStorage.removeItem('codesyne_pending_share_project_id');
      localStorage.removeItem('codesyne_pending_is_collab');

      setCloningState({ isCloning: false, title: '', message: '', step: 0 });

      triggerToast(
        'Connected to Live Collaboration! 👥',
        `Successfully joined "${targetProject.name}". You are connected as Collaborator.`,
        'success'
      );
    } catch (err) {
      console.warn('Failed to process shared project link:', err);
      setCloningState({ isCloning: false, title: '', message: '', step: 0 });
    }
  };

  // Fetch from Express back-end
  const fetchProjectsFromServer = async (userId: string, email?: string) => {
    try {
      const emailQuery = email ? `&email=${encodeURIComponent(email)}` : '';
      const response = await safeFetch(`/api/projects?userId=${encodeURIComponent(userId)}${emailQuery}`);
      if (response.ok) {
        const serverProjects = await response.json();
        if (serverProjects && Array.isArray(serverProjects)) {
          // Merge template file states for complete load
          const parsed: Project[] = serverProjects
            .filter((p: any) => !isDummyProject(p))
            .map((p: any) => ({
              ...p,
              files: p.files || TEMPLATES[p.type as ProjectType]?.files || TEMPLATES.web.files,
              messages: p.messages || [],
              isFavorite: p.isFavorite || false,
              status: p.status || 'active',
              sharedWith: p.sharedWith || []
            }));

          setProjects(prev => {
            const mergedMap = new Map<string, Project>();
            
            // 1. Add current state / local storage projects
            prev.forEach(p => {
              if (p && p.id && !isDummyProject(p)) {
                mergedMap.set(p.id, p);
              }
            });

            // 2. Add/Override with server DB projects
            parsed.forEach(p => {
              if (p && p.id) {
                const existingLocal = mergedMap.get(p.id);
                mergedMap.set(p.id, {
                  ...existingLocal,
                  ...p,
                  files: p.files && Object.keys(p.files).length > 0 ? p.files : (existingLocal?.files || p.files)
                });
              }
            });

            const mergedList = Array.from(mergedMap.values());
            const emailKey = getUserEmailKey(email, undefined, userId);
            localStorage.setItem(`codesyne_local_projects_${emailKey}`, JSON.stringify(mergedList));

            // Sync any local projects up to server DB if server didn't have them
            mergedList.forEach(localProj => {
              if (!parsed.some(sp => sp.id === localProj.id)) {
                safeFetch('/api/projects/upsert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...localProj,
                    userId,
                    email,
                    sharedWith: Array.from(new Set([...(localProj.sharedWith || []), userId, email].filter(Boolean)))
                  })
                }).catch(() => {});
              }
            });

            return mergedList;
          });

          setGlobalError(null);
          if (userRef.current) {
            processPendingSharedProject(userRef.current, parsed);
          }
          return;
        }
      }
    } catch (e: any) {
      console.warn('[IDE Server Sync] Server offline or unreachable.', e);
    } finally {
      if (userRef.current) {
        processPendingSharedProject(userRef.current);
      }
    }
  };

  // Auth Complete
  const handleAuthSuccess = (loggedUser: UserProfile) => {
    const now = Date.now();
    if (now - lastAuthTimeRef.current < 2500 && userRef.current && (userRef.current.email === loggedUser.email || userRef.current.id === loggedUser.id)) {
      return;
    }
    lastAuthTimeRef.current = now;

    setUser(loggedUser);
    setCurrentPage('dashboard');
    try {
      window.history.replaceState({ page: 'dashboard' }, document.title, '/dashboard');
      window.history.pushState({ page: 'dashboard' }, document.title, '/dashboard');
    } catch {}
    triggerToast('Access Authorized', `Secure JWT token generated. Sandbox active!`, 'success');
    
    // Request browser notification permission politely on login
    requestNotificationPermission();
    sendBrowserNotification(
      `auth_welcome_${loggedUser.id}`,
      `Welcome to CodeSyne, ${loggedUser.username}! 🚀`,
      'Your collaborative cloud sandbox is active and ready for development.'
    );
    
    // Load local projects for this user instantly so they see them immediately
    const emailKey = getUserEmailKey(loggedUser.email, loggedUser.username, loggedUser.id);
    const saved = localStorage.getItem(`codesyne_local_projects_${emailKey}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(p => !isDummyProject(p));
          setProjects(clean);
        } else {
          setProjects([]);
        }
      } catch (e) {
        setProjects([]);
      }
    } else {
      setProjects([]);
    }

    registerUserOnServer(loggedUser).then((updatedUser) => {
      fetchProjectsFromServer(updatedUser.id, updatedUser.email);
    });
  };

  // Logout trigger
  const handleLogout = async () => {
    if (user?.email) {
      try {
        await safeFetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
      } catch (e) {
        console.warn('[IDE Server Sync] Failed to register logout on server:', e);
      }
    }

    // Clean up all local storage session items
    localStorage.removeItem('ide_session_user');
    localStorage.removeItem('ide_jwt_token');
    localStorage.removeItem('codesyne_oauth_signal');

    // Clean URL parameters to avoid token re-hydration from address bar
    try {
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {}

    // Broadcast logout event to other tabs/windows
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('codesyne_oauth_channel');
        bc.postMessage({ type: 'LOGOUT' });
        bc.close();
      }
    } catch {}

    userRef.current = null;
    setUser(null);
    setProjects([]); // Reset to empty array so user's projects don't leak on landing page
    setCurrentPage('landing');

    // If the user had opened the contact form flow on the landing page, redirect back to contact
    const isContactFlowActive = sessionStorage.getItem('codesyne_contact_flow_active') === 'true';
    if (isContactFlowActive) {
      try {
        window.location.hash = '#contact';
      } catch {}
    } else {
      // Normal sign out: ensure landing page shows clean home view with no stray subpage hash
      try {
        sessionStorage.removeItem('codesyne_active_subpage');
        sessionStorage.removeItem('codesyne_contact_flow_active');
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {}
    }

    triggerToast('Signed Out', 'Your sandbox workspace session has been cleared.', 'info');
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
    setUser(updatedUser);
    const emailKey = getUserEmailKey(updatedUser.email, updatedUser.username, updatedUser.id);
    localStorage.setItem('ide_session_user', JSON.stringify(updatedUser));
    localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updatedUser));
    
    try {
      await safeFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: updatedUser.username,
          bio: updatedUser.bio,
          githubUsername: updatedUser.githubUsername,
          avatar: updatedUser.avatar,
          whatsapp: updatedUser.whatsapp,
          password: updatedUser.password
        })
      });
      console.log('[IDE Server Sync] Synced profile details to the database successfully.');
    } catch (err) {
      console.warn('[IDE Server Sync] Profile sync failed:', err);
    }
  };

  // Create Project workspace handler
  const handleCreateProject = async (name: string, description: string, type: ProjectType, customFiles?: FileSystemState) => {
    const template = TEMPLATES[type] || TEMPLATES.web;
    const initialFiles = customFiles || { ...template.files };
    const newProj: Project = {
      id: 'proj_' + Math.random().toString(36).substr(2, 9),
      name,
      description,
      type,
      files: initialFiles,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFavorite: false,
      status: 'active',
      ownerId: user?.email || user?.id || 'guest',
      sharedWith: []
    };

    // Save to server
    try {
      const response = await safeFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          type,
          files: initialFiles,
          ownerId: user?.email || user?.id || 'guest'
        })
      });
      if (response.ok) {
        const serverCreated = await response.json();
        newProj.id = serverCreated.id || newProj.id;
        if (serverCreated.files) {
          newProj.files = serverCreated.files;
        }
      }
    } catch (e) {}

    setProjects(prev => [newProj, ...prev]);
    triggerToast('Workspace Launched', `"${name}" spun up successfully. Open sandbox to code!`, 'success');
    sendBrowserNotification(
      `proj_created_${newProj.id}`,
      'Workspace Spun Up ⚡',
      `Project "${name}" is initialized and ready for development.`
    );
  };

  // Delete project
  const handleDeleteProject = async (id: string) => {
    try {
      await safeFetch(`/api/projects/${id}`, { method: 'DELETE' });
    } catch (e) {}

    setProjects(prev => {
      const remaining = prev.filter(p => p.id !== id);
      if (remaining.length === 0 && user?.email) {
        const emailKey = getUserEmailKey(user.email, user.username, user.id);
        localStorage.setItem(`codesyne_active_time_${emailKey}`, '0');
        setActiveSeconds(0);
        activeSecondsRef.current = 0;
      }
      return remaining;
    });
    triggerToast('Project Deleted', 'Project directory deleted permanently.', 'info');
  };

  // Duplicate workspace copy
  const handleDuplicateProject = async (id: string) => {
    const orig = projects.find(p => p.id === id);
    if (!orig) return;

    const dupProj: Project = {
      ...orig,
      id: 'proj_' + Math.random().toString(36).substr(2, 9),
      name: `${orig.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFavorite: false
    };

    try {
      const response = await safeFetch(`/api/projects/${id}/duplicate`, { method: 'POST' });
      if (response.ok) {
        const serverDup = await response.json();
        dupProj.id = serverDup.id || dupProj.id;
      }
    } catch (e) {}

    setProjects(prev => [dupProj, ...prev]);
    triggerToast('Workspace Duplicated', 'Cloned full file directory structures cleanly!', 'success');
  };

  // Toggle favorite flag
  const handleToggleFavorite = async (p: Project) => {
    const nextVal = !p.isFavorite;
    setProjects(prev => prev.map(item => 
      item.id === p.id ? { ...item, isFavorite: nextVal } : item
    ));
    triggerToast(
      p.isFavorite ? 'Removed Favorite' : 'Added Favorite',
      `"${p.name}" status updated.`,
      'info'
    );
    try {
      await safeFetch(`/api/projects/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextVal })
      });
    } catch (e) {
      console.warn('Failed to save favorite toggle on server:', e);
    }
  };

  // Toggle archive status
  const handleToggleArchive = async (p: Project) => {
    const nextStatus = p.status === 'archived' ? 'active' : 'archived';
    setProjects(prev => prev.map(item => 
      item.id === p.id ? { ...item, status: nextStatus } : item
    ));
    triggerToast(
      p.status === 'archived' ? 'Unarchived' : 'Archived',
      `"${p.name}" directory status updated.`,
      'info'
    );
    try {
      await safeFetch(`/api/projects/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
    } catch (e) {
      console.warn('Failed to save archive toggle on server:', e);
    }
  };

  // Select project to launch IDE Workspace
  const handleSelectProject = async (projectId: string) => {
    const nowIso = new Date().toISOString();
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, updatedAt: nowIso } : p));
    setSelectedProjectId(projectId);
    localStorage.setItem('codesyne_last_selected_project_id', projectId);
    setCurrentPage('workspace');

    try {
      await safeFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedAt: nowIso })
      });
    } catch (e) {
      console.warn('Failed to save project last used time to database:', e);
    }
  };

  const handleReturnToDashboard = () => {
    setSelectedProjectId(null);
    localStorage.removeItem('codesyne_last_selected_project_id');
    setCurrentPage('dashboard');
  };

  const handleUpdateProjectFiles = (projectId: string, newFiles: FileSystemState) => {
    if (!projectId) return;

    setProjects(prev => {
      const targetIdStr = String(projectId).trim();
      const matchIndex = prev.findIndex(p => 
        p.id === targetIdStr || 
        (p as any).originalId === targetIdStr ||
        (targetIdStr && p.id.includes(targetIdStr)) ||
        (targetIdStr && targetIdStr.includes(p.id))
      );

      if (matchIndex !== -1) {
        return prev.map((p, idx) => 
          idx === matchIndex 
            ? { ...p, files: newFiles, updatedAt: new Date().toISOString() } 
            : p
        );
      } else {
        const baseName = selectedProject?.name || 'Shared Workspace';
        const cleanName = baseName.replace(/\s*\(Saved Session\)/gi, '').trim();

        const newSavedProject: Project = {
          id: targetIdStr,
          name: cleanName,
          description: selectedProject?.description || 'Saved live collaboration workspace',
          type: selectedProject?.type || 'web',
          files: newFiles,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isFavorite: false,
          status: 'active',
          ownerId: user?.id || user?.email || 'guest',
          sharedWith: []
        };
        
        // Deduplicate before adding
        const filtered = prev.filter(p => p.id !== targetIdStr && p.name !== cleanName);
        return [newSavedProject, ...filtered];
      }
    });

    // Also persist project and files to backend DB
    const syncName = (selectedProject?.name || 'Shared Workspace').replace(/\s*\(Saved Session\)/gi, '').trim();
    safeFetch(`/api/projects/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: syncName,
        description: selectedProject?.description || 'Saved live collaboration workspace',
        type: selectedProject?.type || 'web',
        ownerId: user?.id || user?.email || 'guest',
        files: newFiles
      })
    }).catch(e => console.warn('[Project Save Sync Failed]:', e));
  };

  const selectedProject = projects.find(p => 
    p.id === selectedProjectId || 
    (p as any).originalId === selectedProjectId ||
    (selectedProjectId && p.id.includes(selectedProjectId)) ||
    (selectedProjectId && selectedProjectId.includes(p.id))
  ) || (selectedProjectId ? {
    id: selectedProjectId,
    name: 'Collaborative Workspace',
    description: 'Joined live collaboration room',
    type: 'web' as ProjectType,
    files: TEMPLATES.web.files,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isFavorite: false,
    status: 'active' as const,
    ownerId: 'shared_creator',
    sharedWith: []
  } : (projects.length > 0 ? projects[0] : null));

  const isLightTheme = theme === 'light';
  const isCyberTheme = theme === 'cyberpunk';

  const rootBgClass = currentPage === 'landing'
    ? 'bg-[#03020c]'
    : isLightTheme
      ? 'bg-[#f1f5f9]'
      : isCyberTheme
        ? 'bg-[#05030d]'
        : 'bg-[#0a0a0f]';

  const rootTextClass = isLightTheme ? 'text-slate-800' : 'text-slate-300';

  return (
    <div 
      id="app_view_container" 
      className={`${rootBgClass} ${rootTextClass} relative font-sans flex flex-col ${
        currentPage === 'workspace' 
          ? 'h-full max-h-full overflow-hidden select-none' 
          : 'min-h-full overflow-x-hidden'
      }`}
    >
      
      {/* Mesh Background */}
      <div className={`absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden ${isLightTheme ? 'hidden' : ''}`}>
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/30 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-600/20 blur-[120px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[150px]"></div>
      </div>

      {/* Responsive Toast Alert Popups - Multi-Directional Swipeable */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            id="global_toast"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
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
                setToast(null);
              }
            }}
            className={`fixed top-4 left-4 right-4 sm:top-6 sm:right-6 sm:left-auto z-[9999] p-4 sm:p-5 rounded-2xl shadow-2xl flex items-start space-x-3 text-left w-auto max-w-full sm:max-w-md backdrop-blur-2xl border transition-colors cursor-grab active:cursor-grabbing select-none touch-none ${
              isLightTheme 
                ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/50' 
                : 'bg-slate-950/98 border-slate-800 text-slate-100 shadow-black/90'
            }`}
          >
            <div className="pt-0.5 shrink-0">
              <span className={`block w-2.5 h-2.5 rounded-full ${
                toast.type === 'success' ? 'bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50' :
                toast.type === 'error' ? 'bg-rose-500 animate-ping shadow-sm shadow-rose-500/50' :
                'bg-cyan-500 shadow-sm shadow-cyan-500/50'
              }`} />
            </div>
            <div className="flex-1 min-w-0 pr-1 space-y-1">
              <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${isLightTheme ? 'text-slate-900' : 'text-white'}`}>{toast.title}</h4>
              <p className={`text-xs sm:text-sm font-sans leading-relaxed break-words whitespace-normal ${isLightTheme ? 'text-slate-600' : 'text-slate-300'}`}>{toast.message}</p>
            </div>
            <button 
              type="button"
              onClick={() => setToast(null)}
              className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${isLightTheme ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-600' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}
              title="Dismiss Message"
            >
              <span className="text-sm font-bold">✕</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expired Collaboration Session Overlay */}
      {expiredSessionInfo && (
        <div 
          id="session_expired_overlay"
          className="fixed inset-0 z-[999999] bg-[#05050a]/95 backdrop-blur-2xl flex items-center justify-center p-4 overflow-y-auto select-none"
        >
          <div className="relative w-full max-w-sm sm:max-w-md bg-[#0f0f1d] border border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-rose-500/20 text-center flex flex-col items-center justify-center space-y-5 my-auto shrink-0">
            
            {/* Glow Accent */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Lock / Expired Shield Icon */}
            <div className="relative w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
              <Lock className="w-8 h-8 text-rose-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-white tracking-tight">
                Session Expired / Link Invalid 🔒
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm font-sans">
                {expiredSessionInfo.message || 'This live collaboration room session has been ended by the host. The share link is no longer active.'}
              </p>
            </div>

            <div className="pt-2 w-full flex flex-col sm:flex-row items-center justify-center gap-3">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setExpiredSessionInfo(null);
                    setSelectedProjectId('');
                    setCurrentPage('dashboard');
                    if (window.history && window.history.replaceState) {
                      window.history.replaceState({ page: 'dashboard' }, document.title, '/dashboard');
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-95"
                >
                  Go to My Dashboard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExpiredSessionInfo(null);
                    setSelectedProjectId('');
                    setCurrentPage('landing');
                    if (window.history && window.history.replaceState) {
                      window.history.replaceState({ page: 'landing' }, document.title, '/');
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-95"
                >
                  Go to Home Page
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Backend Wake-up & Project Cloning Loading Overlay */}
      {cloningState.isCloning && (
        <div 
          id="cloning_loading_overlay"
          className="fixed inset-0 z-[999999] bg-[#05050a]/92 backdrop-blur-2xl flex items-center justify-center p-4 overflow-y-auto select-none"
        >
          <div className="relative w-full max-w-sm sm:max-w-md bg-[#0d0d18] border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-500/20 text-center flex flex-col items-center space-y-6 my-auto shrink-0">
            
            {/* Ambient Background Glow */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Glowing Orb & Multi-Ring Animated Spinner */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
              <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-indigo-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border-b-2 border-l-2 border-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '2s' }} />
              <div className="p-3 bg-indigo-600/20 rounded-2xl border border-indigo-500/40 text-indigo-400">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
            </div>

            {/* Heading & Description */}
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {cloningState.title || 'Cloning Project Workspace'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-sans max-w-sm">
                {cloningState.message || 'Connecting to backend server & importing workspace files...'}
              </p>
            </div>

            {/* Step Indicators */}
            <div className="w-full bg-[#121224] border border-white/10 rounded-2xl p-4 space-y-3 text-left font-sans">
              <div className="flex items-center space-x-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  cloningState.step >= 1 ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/50' : 'bg-white/10 text-slate-400'
                }`}>
                  {cloningState.step >= 1 ? '✓' : '1'}
                </div>
                <span className={cloningState.step >= 1 ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                  Verifying project invitation & access link
                </span>
              </div>

              <div className="flex items-center space-x-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  cloningState.step >= 2 ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/50' : 'bg-indigo-500/30 text-indigo-300'
                }`}>
                  {cloningState.step >= 2 ? '✓' : '2'}
                </div>
                <span className={cloningState.step >= 2 ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                  Waking backend cloud instance (if in sleep mode)
                </span>
              </div>

              <div className="flex items-center space-x-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  cloningState.step >= 3 ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/50' : 'bg-white/10 text-slate-400'
                }`}>
                  {cloningState.step >= 3 ? '✓' : '3'}
                </div>
                <span className={cloningState.step >= 3 ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                  Cloning project files & initializing workspace
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden relative">
              <div 
                className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 h-full transition-all duration-500"
                style={{ width: `${cloningState.step === 1 ? 33 : cloningState.step === 2 ? 66 : 95}%` }}
              />
            </div>

          </div>
        </div>
      )}

      {/* Responsive Centralized Error Alert UI */}
      {globalError && (
        <div 
          id="global_error_banner" 
          className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto z-[9999] p-4 sm:p-5 w-auto max-w-full sm:max-w-md bg-slate-950/98 border border-rose-500/50 rounded-2xl shadow-2xl flex flex-col space-y-3 animate-fade-in accent-glow-rose backdrop-blur-2xl shadow-black/90"
        >
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-rose-500/10 rounded-xl shrink-0">
              <span className="text-rose-400 font-semibold text-lg font-mono">⚠️</span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Workspace Sync Alert</h4>
              <p className="text-xs sm:text-sm text-rose-300/90 font-medium leading-relaxed break-words whitespace-normal">{globalError.message}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 justify-end">
            <button 
              onClick={() => setGlobalError(null)}
              className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all border border-white/10 hover:border-white/20 cursor-pointer"
            >
              Dismiss fallback
            </button>
            <button 
              onClick={() => {
                setGlobalError(null);
                if (user) fetchProjectsFromServer(user.id);
              }}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all shadow-md shadow-rose-500/10 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Expired / Ended Collaboration Session Warning Modal */}
      {expiredSessionInfo && expiredSessionInfo.isExpired && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in font-sans">
          <div className="relative w-full max-w-md bg-[#0e0e1a] border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <LogOut className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Collaboration Session Ended</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {expiredSessionInfo.message || 'This room session has been ended by the room host. The share link is no longer active.'}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setExpiredSessionInfo(null);
                  setCurrentPage('dashboard');
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
              >
                Go to Project Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback session restoring indicator to prevent black screen */}
      {(currentPage === 'dashboard' || currentPage === 'workspace') && !user && (
        <div className="min-h-screen bg-[#08080c] flex flex-col items-center justify-center p-6 relative overflow-hidden">
          <div className="flex flex-col items-center space-y-4 relative z-10 text-center animate-fade-in max-w-sm w-full">
            <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/10 shadow-sm">
              <Sparkles className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">CodeSyne Cloud IDE</h3>
              <p className="text-xs text-slate-400 mt-1">Restoring session & loading sandbox...</p>
            </div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/[0.02] border border-white/10 rounded-full text-xs font-mono text-cyan-400">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-[11px] font-semibold tracking-wide">Connecting Session</span>
            </div>
          </div>
        </div>
      )}

      {/* Primary Page Router views */}
      {currentPage === 'landing' && (
        <LandingPage
          onGetStarted={() => { 
            if (user) {
              setCurrentPage('dashboard');
            } else {
              setAuthMode('login'); 
              setCurrentPage('auth'); 
            }
          }}
          onLogin={() => { 
            if (user) {
              setCurrentPage('dashboard');
            } else {
              setAuthMode('login'); 
              setCurrentPage('auth'); 
            }
          }}
          currentUser={user}
          onGoToDashboard={() => setCurrentPage('dashboard')}
        />
      )}

      {currentPage === 'auth' && !user && (
        <AuthPage
          onBack={() => setCurrentPage('landing')}
          onAuthSuccess={handleAuthSuccess}
          initialMode={authMode}
        />
      )}

      {currentPage === 'dashboard' && user && (
        <ErrorBoundary>
          <Dashboard
            user={user}
            projects={projects}
            onCreateProject={handleCreateProject}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
            onDuplicateProject={handleDuplicateProject}
            onToggleFavorite={handleToggleFavorite}
            onToggleArchive={handleToggleArchive}
            onLogout={handleLogout}
            onRefresh={async () => {
              const token = localStorage.getItem('ide_jwt_token');
              if (token) {
                try {
                  const res = await safeFetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data && data.user) {
                      const cleanUser = sanitizeUserProfile(data.user);
                      setUser(cleanUser);
                      localStorage.setItem('ide_session_user', JSON.stringify(cleanUser));
                    }
                  }
                } catch (e) {
                  console.warn('Failed to refresh user profile:', e);
                }
              }
              if (user?.id) {
                await fetchProjectsFromServer(user.id, user.email);
              }
            }}
            onShowToast={triggerToast}
            onUpdateUser={handleUpdateUser}
            activeSeconds={activeSeconds}
            onResetTimer={handleResetTimer}
            theme={theme}
            onChangeTheme={setTheme}
          />
        </ErrorBoundary>
      )}

      {currentPage === 'workspace' && user && (
        selectedProject ? (
          <ErrorBoundary>
            <Workspace
              user={user}
              project={selectedProject}
              onGoBack={handleReturnToDashboard}
              onShowToast={triggerToast}
              onUpdateUser={handleUpdateUser}
              onUpdateProjectFiles={handleUpdateProjectFiles}
              theme={theme as any}
              onChangeTheme={setTheme}
            />
          </ErrorBoundary>
        ) : (
          <div className="min-h-screen bg-[#08080c] flex flex-col items-center justify-center p-6 text-center text-white relative z-50">
            <div className="p-4 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl mb-4 animate-pulse">
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto" />
            </div>
            <h3 className="text-lg font-bold">Connecting to Collaborative Sandbox...</h3>
            <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
              Fetching project workspace files & establishing WebSocket collaboration room connection...
            </p>
            <div className="flex items-center space-x-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  if (user?.id) fetchProjectsFromServer(user.id, user.email);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                Retry Load
              </button>
              <button
                type="button"
                onClick={handleReturnToDashboard}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-slate-200 cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )
      )}

      <PWAManager currentPage={currentPage} />
      <StylusPointer />
    </div>
  );
}
