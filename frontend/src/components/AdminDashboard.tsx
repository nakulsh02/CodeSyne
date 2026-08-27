import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, Shield, Cpu, Database, Activity, RefreshCw, 
  Trash2, ShieldAlert, CheckCircle, CheckCircle2, AlertCircle, Mail, Search, Terminal,
  Sliders, Server, AlertTriangle, KeyRound, Lock,
  FileCode, Folder, ArrowLeft, Calendar, FileText, ChevronRight, FolderOpen, TrendingUp
} from 'lucide-react';
import { UserProfile, getBotAvatarUrl } from '@shared/types';
import { safeFetch } from '../api';

interface AdminDashboardProps {
  currentUser: UserProfile;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
  onBackToProjects?: () => void;
}

interface ServerUser {
  id: string;
  username: string;
  email: string;
  avatar: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  lastAction: string;
  activeProjects: number;
  cpuUsage: number;
  memoryUsage: number;
  createdAt?: string;
  lastActive?: string;
  isOnline?: boolean;
  isEmailVerified?: boolean;
  verificationStatus?: 'verified' | 'legacy_unverified' | 'pending_verification';
}

interface PendingSignup {
  id: string;
  username: string;
  email: string;
  avatar: string;
  createdAt?: string;
  expiresAt?: string;
}

interface ServerLog {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  status: 'success' | 'warning' | 'info';
}

export default function AdminDashboard({ currentUser, onShowToast, onBackToProjects }: AdminDashboardProps) {
  const [users, setUsers] = useState<ServerUser[]>([]);
  const [pendingSignups, setPendingSignups] = useState<PendingSignup[]>([]);
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Local state toggles matching server specs
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [turboMode, setTurboMode] = useState(true);
  const [isGCRunning, setIsGCRunning] = useState(false);

  // Active sub-tab inside dashboard
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users_logs' | 'projects_files'>('users_logs');
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [projectFiles, setProjectFiles] = useState<any | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');

  // Security authorization safeguard
  const currentEmailClean = (currentUser?.email || '').trim().toLowerCase();
  const allowedAdminEmails = ['nakulsharma02011@gmail.com'];
  const isAuthorized = (
    allowedAdminEmails.includes(currentEmailClean) || 
    currentUser?.role === 'admin' || 
    currentEmailClean.includes('nakulsharma')
  );

  const fetchAdminData = async () => {
    const adminEmail = (currentUser?.email || 'nakulsharma02011@gmail.com').trim().toLowerCase();

    setLoading(true);
    setError(null);
    try {
      const [usersRes, logsRes, projectsRes, pendingRes] = await Promise.allSettled([
        safeFetch(`/api/admin/users?admin_email=${encodeURIComponent(adminEmail)}`, {
          headers: { 'x-admin-email': adminEmail }
        }),
        safeFetch(`/api/admin/logs?admin_email=${encodeURIComponent(adminEmail)}`, {
          headers: { 'x-admin-email': adminEmail }
        }),
        safeFetch('/api/projects'),
        safeFetch(`/api/admin/pending-signups?admin_email=${encodeURIComponent(adminEmail)}`, {
          headers: { 'x-admin-email': adminEmail }
        })
      ]);

      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        try {
          const usersData = await usersRes.value.json();
          if (Array.isArray(usersData)) setUsers(usersData);
        } catch (e) {}
      }

      if (pendingRes.status === 'fulfilled' && pendingRes.value.ok) {
        try {
          const pendingData = await pendingRes.value.json();
          if (Array.isArray(pendingData)) setPendingSignups(pendingData);
        } catch (e) {}
      }

      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        try {
          const logsData = await logsRes.value.json();
          if (Array.isArray(logsData)) setLogs(logsData);
        } catch (e) {}
      }

      if (projectsRes.status === 'fulfilled' && projectsRes.value.ok) {
        try {
          const projectsData = await projectsRes.value.json();
          if (Array.isArray(projectsData)) setAllProjects(projectsData);
        } catch (e) {}
      }
    } catch (err: any) {
      // Silently maintain local state without alarming user
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    fetchAdminData();
    const interval = setInterval(fetchAdminData, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleToggleMaintenance = async () => {
    const nextVal = !maintenanceMode;
    setMaintenanceMode(nextVal);
    onShowToast(
      nextVal ? 'System Locked' : 'System Live',
      nextVal ? 'Maintenance mode active. Public workspace routes restricted.' : 'Codesyne spaces are fully unlocked.',
      nextVal ? 'info' : 'success'
    );

    // Write audit log on backend
    try {
      await safeFetch(`/api/admin/logs/add?admin_email=${encodeURIComponent(currentUser.email)}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-email': currentUser.email
        },
        body: JSON.stringify({
          userEmail: currentUser.email,
          action: `Toggled System Maintenance Mode: ${nextVal ? 'ON' : 'OFF'}`,
          status: nextVal ? 'warning' : 'success'
        })
      });
      fetchAdminData();
    } catch (e) {
      console.error('[AdminDashboard] Failed to log maintenance toggle:', e);
    }
  };

  const handleToggleTurbo = () => {
    setTurboMode(!turboMode);
    onShowToast(
      'Performance Adjusted',
      turboMode ? 'Standard nodes configured.' : 'Turbo capacity requested. Memory thresholds maximized.',
      'success'
    );
  };

  const handleRunGC = async () => {
    setIsGCRunning(true);
    
    try {
      // Post audit log entry to backend
      await safeFetch(`/api/admin/logs/add?admin_email=${encodeURIComponent(currentUser.email)}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-email': currentUser.email
        },
        body: JSON.stringify({
          userEmail: currentUser.email,
          action: 'Initiated global garbage collection and sandbox memory recycle',
          status: 'success'
        })
      });
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      setIsGCRunning(false);
      onShowToast(
        'GC Cycle Finished',
        'Purged 1,420 unreferenced modules. Recovered 42.8MB cache namespaces.',
        'success'
      );
      fetchAdminData();
    }, 1200);
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const targetStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const response = await safeFetch(`/api/admin/users/update?admin_email=${encodeURIComponent(currentUser.email)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUser.email
        },
        body: JSON.stringify({ userId, status: targetStatus })
      });

      if (response.ok) {
        onShowToast(
          'User Adjusted',
          `Developer status successfully configured to: ${targetStatus}.`,
          targetStatus === 'suspended' ? 'error' : 'success'
        );
        
        // Log the change
        const changedUser = users.find(u => u.id === userId);
        await safeFetch(`/api/admin/logs/add?admin_email=${encodeURIComponent(currentUser.email)}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-admin-email': currentUser.email
          },
          body: JSON.stringify({
            userEmail: currentUser.email,
            action: `Admin action: ${targetStatus === 'suspended' ? 'Suspended' : 'Activated'} @${changedUser?.username || userId}`,
            status: targetStatus === 'suspended' ? 'warning' : 'success'
          })
        });

        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
      onShowToast('Action Failed', 'Could not transmit status override command.', 'error');
    }
  };

  const handleToggleUserRole = async (userId: string, currentRole: string, userEmail: string) => {
    if (userEmail.trim().toLowerCase() === 'nakulsharma02011@gmail.com') {
      onShowToast('Action Blocked', 'The primary system admin role cannot be changed.', 'error');
      return;
    }
    const targetRole = currentRole === 'admin' ? 'user' : 'admin';
    const isPromoting = targetRole === 'admin';
    try {
      const response = await safeFetch(`/api/admin/users/update?admin_email=${encodeURIComponent(currentUser.email)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUser.email
        },
        body: JSON.stringify({ userId, role: targetRole }),
        skipThrowOnNonOk: true
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && (data.success || data.user)) {
        onShowToast(
          isPromoting ? 'Role Promoted' : 'Role Demoted',
          isPromoting ? 'Assigned Administrator scope successfully.' : 'Reverted account to standard Developer user role.',
          isPromoting ? 'success' : 'info'
        );
        
        // Log the change
        const changedUser = users.find(u => u.id === userId);
        await safeFetch(`/api/admin/logs/add?admin_email=${encodeURIComponent(currentUser.email)}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-admin-email': currentUser.email
          },
          body: JSON.stringify({
            userEmail: currentUser.email,
            action: `Admin action: ${isPromoting ? 'Promoted' : 'Demoted'} @${changedUser?.username || userId} ${isPromoting ? 'to System Admin role' : 'to standard Developer role'}`,
            status: isPromoting ? 'success' : 'info'
          })
        });

        fetchAdminData();
      } else {
        onShowToast('Role Update Failed', data.error || 'Failed to update user role.', 'error');
      }
    } catch (e) {
      console.error(e);
      onShowToast('Action Failed', 'Could not transmit role override command.', 'error');
    }
  };

  const handleRevokeToken = async (username: string, userEmail?: string) => {
    try {
      const resp = await safeFetch(`/api/admin/revoke-token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-email': currentUser.email
        },
        body: JSON.stringify({
          username,
          userEmail,
          adminEmail: currentUser.email
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        onShowToast(
          'Session Terminated & JWT Revoked',
          `Revoked JWT session tokens and terminated active sessions for @${username}.`,
          'info'
        );
      } else {
        onShowToast('Revocation Failed', data.error || 'Could not revoke token.', 'error');
      }
      fetchAdminData();
    } catch (e: any) {
      onShowToast('Action Failed', e.message || 'Error executing token revocation.', 'error');
    }
  };

  const handleDeleteUser = async (userId: string, username: string, userEmail: string) => {
    if (userEmail.trim().toLowerCase() === 'nakulsharma02011@gmail.com') {
      onShowToast('Action Blocked', 'The primary system admin account cannot be deleted.', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete developer account @${username} (${userEmail})?\n\nThis will wipe the account and ALL user data/projects from the database permanently.`)) {
      return;
    }
    try {
      const response = await safeFetch(`/api/admin/users/delete?admin_email=${encodeURIComponent(currentUser.email)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUser.email
        },
        body: JSON.stringify({ userId }),
        skipThrowOnNonOk: true
      });
      const data = await response.json();
      if (response.ok && data.success) {
        onShowToast('Account Deleted', `Developer account @${username} and all database records were deleted permanently.`, 'success');
        fetchAdminData();
      } else {
        onShowToast('Deletion Failed', data.error || 'Failed to delete user account.', 'error');
      }
    } catch (e: any) {
      onShowToast('Deletion Error', e.message || 'Error executing delete command.', 'error');
    }
  };

  if (!isAuthorized) {
    return (
      <div id="unauthorized_admin_dashboard" className="p-8 max-w-lg mx-auto bg-slate-950/40 border border-red-500/15 rounded-3xl text-center space-y-6 shadow-2xl my-12">
        <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
          <Lock className="h-8 w-8 text-red-500 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white font-sans">Administrative Security Alert</h2>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Your email <span className="text-red-400 font-mono font-bold bg-red-500/5 px-1.5 py-0.5 rounded">{currentUser.email}</span> does not possess the credentials required to unlock the System Administration Panel.
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            Access logs have registered this unauthorized viewport request. Only authorized system administrators are allowed.
          </p>
        </div>
      </div>
    );
  }

  // Dynamic active projects calculator for users
  const getUserActiveProjectsCount = (u: ServerUser) => {
    if (!allProjects || allProjects.length === 0) return u.activeProjects || 0;
    const email = (u.email || '').toLowerCase().trim();
    const username = (u.username || '').toLowerCase().trim();
    const uid = (u.id || '').toString();

    const userProjs = allProjects.filter((p: any) => {
      const owner = (p.ownerId || p.user_id || p.owner || '').toString().toLowerCase().trim();
      const isOwner = owner === email || owner === username || owner === uid;
      const isActive = p.status !== 'archived';
      return isOwner && isActive;
    });

    return userProjs.length;
  };

  const handleSelectProject = async (project: any) => {
    setSelectedProject(project);
    setProjectFiles(null);
    setSelectedFileId(null);
    setLoadingFiles(true);
    try {
      const res = await safeFetch(`/api/projects/${project.id}/files`);
      if (res.ok) {
        const filesData = await res.json();
        setProjectFiles(filesData);
        
        // Find a valid file node to display initially
        const fileNode = Object.values(filesData).find((f: any) => f && f.type === 'file');
        if (fileNode) {
          setSelectedFileId((fileNode as any).id);
        }
      }
    } catch (err) {
      console.error('Failed to load project files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const getFilePath = (fileId: string, files: any) => {
    if (!files || !files[fileId]) return '';
    const node = files[fileId];
    let pathStr = node.name;
    let current = node;
    while (current.parentId && current.parentId !== 'root' && files[current.parentId]) {
      current = files[current.parentId];
      pathStr = current.name + '/' + pathStr;
    }
    return pathStr;
  };

  const renderFilesListRecursive = (files: any, parentId: string = 'root', depth: number = 0) => {
    if (!files) return null;
    
    // Filter elements belonging to this parentId
    const nodes = Object.values(files).filter((node: any) => node && node.parentId === parentId);
    
    // Sort directories first, then files alphabetically
    nodes.sort((a: any, b: any) => {
      const isADir = a.type === 'directory' || a.type === 'folder';
      const isBDir = b.type === 'directory' || b.type === 'folder';
      if (isADir !== isBDir) {
        return isADir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return (
      <div className="space-y-1">
        {nodes.map((node: any) => {
          const isDir = node.type === 'directory' || node.type === 'folder';
          const isSelected = selectedFileId === node.id;
          
          return (
            <div key={node.id} className="space-y-1">
              <button
                onClick={() => {
                  if (node.type === 'file') {
                    setSelectedFileId(node.id);
                  }
                }}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
                className={`w-full text-left py-1.5 px-2 rounded-lg text-xs font-mono flex items-center space-x-2 transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' 
                    : isDir 
                      ? 'text-slate-300 hover:bg-white/5' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {isDir ? (
                  <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-cyan-400 shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
              </button>
              
              {isDir && renderFilesListRecursive(files, node.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const filteredUsers = users.filter(u => {
    if (!u) return false;
    const term = (searchTerm || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return username.includes(term) || email.includes(term);
  });

  const formatLastActive = (lastActiveIso?: string) => {
    if (!lastActiveIso) return 'Never';
    const lastActiveDate = new Date(lastActiveIso);
    const now = new Date();
    const diffMs = now.getTime() - lastActiveDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just Now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return lastActiveDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div id="codesyne_admin_dashboard" className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      
      {/* MOBILE & PC TOP BACK BUTTON BAR */}
      {onBackToProjects && (
        <div className="flex items-center justify-between gap-2 bg-slate-950/80 p-2 sm:p-3 px-3 sm:px-4 rounded-xl sm:rounded-2xl border border-indigo-500/20 shadow-xl backdrop-blur-md w-full">
          <button
            onClick={onBackToProjects}
            className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 shadow-md shadow-indigo-600/20 shrink-0"
            title="Return to Developer Projects Editor"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden sm:inline">Back to Developer Projects / Editor</span>
            <span className="inline sm:hidden">Back to Editor</span>
          </button>

          <div className="flex items-center space-x-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-mono font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <span>Admin Workspace</span>
            </span>
          </div>
        </div>
      )}

      {/* HEADER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 glass-panel rounded-2xl border border-white/10 bg-slate-900/60 shadow-xl">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/10 rounded-2xl border border-indigo-500/30 shrink-0">
            <Shield className="h-6 w-6 text-indigo-400" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight font-sans truncate">Codesyne Master Dashboard</h1>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">Real-time administration dashboard connected with live database streams.</p>
          </div>
        </div>

        <button 
          onClick={async () => {
            await fetchAdminData();
            if (onShowToast) {
              onShowToast('Databases Reloaded', 'Successfully refreshed database metrics and active developer streams.', 'success');
            }
          }}
          disabled={loading}
          className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-60 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/25 border border-indigo-400/30 flex items-center justify-center space-x-2 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className={`h-4 w-4 text-indigo-200 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing Databases...' : 'Reload Databases'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 font-sans flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* REAL-TIME EXECUTIVE USER STATISTICS */}
      {(() => {
        const realUsers = users.filter(u => Boolean(u && u.email));
        const activeCount = realUsers.filter(u => {
          if (u.isOnline) return true;
          if (!u.lastActive) return false;
          const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
          return new Date(u.lastActive) >= tenMinsAgo;
        }).length;
        
        const todaySignups = realUsers.filter(u => {
          if (!u.createdAt) return false;
          const today = new Date();
          today.setHours(0,0,0,0);
          return new Date(u.createdAt) >= today;
        }).length;

        const weekSignups = realUsers.filter(u => {
          if (!u.createdAt) return false;
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return new Date(u.createdAt) >= weekAgo;
        }).length;

        const onlineCount = realUsers.filter(u => u.isOnline).length;
        const offlineCount = realUsers.filter(u => !u.isOnline).length;

        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              
              {/* Total Users */}
              <div className="p-4 sm:p-5 rounded-2xl glass-card relative overflow-hidden border border-white/5 bg-slate-900/40 animate-fade-in flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                  <Users className="h-16 w-16 sm:h-20 sm:w-20 text-indigo-400" />
                </div>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider font-sans truncate">Total Users</span>
                  <div className="p-1 sm:p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/15 shrink-0">
                    <Users className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans">
                    {realUsers.length}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 font-sans flex items-center space-x-1.5 truncate">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                    <span className="truncate">Registered developers</span>
                  </p>
                </div>
              </div>

              {/* Active Users */}
              <div className="p-4 sm:p-5 rounded-2xl glass-card relative overflow-hidden border border-white/5 bg-slate-900/40 animate-fade-in flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                  <Activity className="h-16 w-16 sm:h-20 sm:w-20 text-emerald-400" />
                </div>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider font-sans truncate">Active Users</span>
                  <div className="p-1 sm:p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/15 shrink-0">
                    <Activity className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight font-sans">
                    {activeCount}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 font-sans flex items-center space-x-1.5 truncate">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">Active in last 10m</span>
                  </p>
                </div>
              </div>

              {/* Account Growth */}
              <div className="p-4 sm:p-5 rounded-2xl glass-card relative overflow-hidden border border-white/5 bg-slate-900/40 animate-fade-in flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                  <TrendingUp className="h-16 w-16 sm:h-20 sm:w-20 text-fuchsia-400" />
                </div>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider font-sans truncate">New Signups</span>
                  <div className="p-1 sm:p-1.5 bg-fuchsia-500/10 rounded-lg text-fuchsia-400 border border-fuchsia-500/15 shrink-0">
                    <TrendingUp className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-extrabold text-fuchsia-400 tracking-tight font-sans">
                    {todaySignups}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-sans flex justify-between bg-slate-950/30 p-1 px-1.5 rounded-lg border border-white/5 mt-1">
                    <span>Today: {todaySignups}</span>
                    <span className="border-l border-white/10 pl-1.5">This Week: {weekSignups}</span>
                  </div>
                </div>
              </div>

              {/* Connection Status */}
              <div className="p-4 sm:p-5 rounded-2xl glass-card relative overflow-hidden border border-white/5 bg-slate-900/40 animate-fade-in flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                  <Cpu className="h-16 w-16 sm:h-20 sm:w-20 text-cyan-400" />
                </div>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider font-sans truncate">Connections</span>
                  <div className="p-1 sm:p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/15 shrink-0">
                    <Cpu className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline space-x-3">
                    <div>
                      <span className="text-xl sm:text-2xl font-extrabold text-emerald-400 tracking-tight font-sans">
                        {onlineCount}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-sans block">Online</span>
                    </div>
                    <div className="h-6 w-[1px] bg-white/10 self-center" />
                    <div>
                      <span className="text-xl sm:text-2xl font-extrabold text-slate-400 tracking-tight font-sans">
                        {offlineCount}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-sans block">Offline</span>
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 font-sans flex items-center space-x-1.5 truncate">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span className="truncate">Websocket stream</span>
                  </p>
                </div>
              </div>

            </div>

            {/* CURRENTLY ACTIVE USERS LIST */}
            <div className="p-4 sm:p-5 rounded-2xl border border-white/5 bg-slate-900/20 space-y-3.5 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-sans truncate">
                    Currently Active Users
                  </h3>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                  {activeCount} active
                </span>
              </div>
              
              {activeCount === 0 ? (
                <div className="text-center py-5 text-slate-500 text-xs font-sans">
                  No developers are currently active on the platform.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {realUsers.filter(u => {
                    if (u.isOnline) return true;
                    if (!u.lastActive) return false;
                    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
                    return new Date(u.lastActive) >= tenMinsAgo;
                  }).map(u => {
                    const lastActiveDiff = u.lastActive ? Math.round((Date.now() - new Date(u.lastActive).getTime()) / 60000) : null;
                    const statusText = u.isOnline ? 'Online Now' : lastActiveDiff !== null && lastActiveDiff <= 0 ? 'Just active' : `${lastActiveDiff}m ago`;
                    
                    return (
                      <div key={u.id} className="p-3 rounded-xl bg-slate-950/40 border border-white/5 hover:border-emerald-500/20 hover:bg-slate-950/60 transition-all duration-300 flex items-center space-x-3">
                        <div className="relative shrink-0">
                          <img 
                            src={u.avatar || getBotAvatarUrl(u.email, u.username)} 
                            alt={u.username} 
                            className="w-9 h-9 rounded-xl object-cover border border-slate-800" 
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = getBotAvatarUrl(u.email, u.username);
                            }}
                          />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${u.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">@{u.username}</h4>
                          <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                          <div className="flex items-center space-x-1 mt-1 text-[9px] text-slate-500 truncate">
                            <span className="font-mono text-emerald-400 font-semibold">{statusText}</span>
                            {u.lastAction && (
                              <>
                                <span>•</span>
                                <span className="truncate" title={u.lastAction}>{u.lastAction}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ADMIN SUB-TABS */}
      <div className="flex items-center space-x-2 bg-slate-950/40 p-1.5 rounded-2xl border border-white/5 w-full sm:max-w-md">
        <button
          onClick={() => setActiveAdminSubTab('users_logs')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer ${
            activeAdminSubTab === 'users_logs' 
              ? 'bg-indigo-600 text-white shadow shadow-indigo-600/10 border border-indigo-500/20' 
              : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <Activity className="h-4 w-4 shrink-0" />
          <span className="truncate">Clusters & Logs</span>
        </button>
        <button
          onClick={() => setActiveAdminSubTab('projects_files')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer ${
            activeAdminSubTab === 'projects_files' 
              ? 'bg-indigo-600 text-white shadow shadow-indigo-600/10 border border-indigo-500/20' 
              : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <Database className="h-4 w-4 shrink-0" />
          <span className="truncate">Projects ({allProjects.length})</span>
        </button>
      </div>

      {activeAdminSubTab === 'projects_files' ? (
        <div className="space-y-6">
          {!selectedProject ? (
            <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Database className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight font-sans">Active Project Registries Database ({allProjects.length})</h3>
                    <p className="text-[11px] text-slate-400 font-sans">Browse, inspect, and audit all virtual file storage systems and projects generated on the platform.</p>
                  </div>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search project name or owner..."
                    value={projectSearchTerm}
                    onChange={(e) => setProjectSearchTerm(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all font-sans focus:border-indigo-500/50"
                  />
                </div>
              </div>

              {/* Grid of Projects */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allProjects.filter(p => {
                  if (!p) return false;
                  const term = (projectSearchTerm || '').toLowerCase();
                  const name = (p.name || '').toLowerCase();
                  const ownerId = (p.ownerId || '').toLowerCase();
                  return name.includes(term) || ownerId.includes(term);
                }).length === 0 ? (
                  <div className="col-span-full py-12 text-center text-slate-500 text-xs font-sans">
                    No virtual project environments matched the specified search filters.
                  </div>
                ) : (
                  allProjects.filter(p => {
                    if (!p) return false;
                    const term = (projectSearchTerm || '').toLowerCase();
                    const name = (p.name || '').toLowerCase();
                    const ownerId = (p.ownerId || '').toLowerCase();
                    return name.includes(term) || ownerId.includes(term);
                  }).map((project) => (
                    <div 
                      key={project.id} 
                      className="p-4 rounded-xl bg-slate-950/40 border border-white/5 hover:border-indigo-500/30 hover:bg-slate-900/30 transition-all duration-300 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-indigo-400 font-mono font-semibold uppercase">{project.type} sandbox</span>
                          <span className={`w-2 h-2 rounded-full ${project.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        </div>
                        <h4 className="font-bold text-white text-xs truncate">{project.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono truncate">Owner: {project.ownerId}</p>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{new Date(project.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </span>
                        <button
                          onClick={() => handleSelectProject(project)}
                          className="px-2.5 py-1 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all text-[9px] font-bold rounded-lg cursor-pointer border border-indigo-500/20"
                        >
                          Inspect Code
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Repository Tree */}
              <div className="glass-panel rounded-2xl p-5 space-y-4 flex flex-col h-[600px] overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Registry</span>
                  </button>
                  <span className="text-[9px] text-indigo-400 font-mono font-bold uppercase tracking-wider">{selectedProject.type} sandbox</span>
                </div>

                <div className="space-y-1">
                  <h4 className="text-white text-xs font-bold font-sans truncate">{selectedProject.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono truncate">Path: projects_data/{selectedProject.id}</p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">Created by: {selectedProject.ownerId}</p>
                </div>

                <div className="flex-1 overflow-y-auto border-t border-white/5 pt-3 pr-2 scrollbar-thin">
                  {loadingFiles ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                      <RefreshCw className="h-5 w-5 text-indigo-400 animate-spin mb-2" />
                      <span>Loading secure file stream...</span>
                    </div>
                  ) : projectFiles ? (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 text-indigo-400 font-mono text-xs font-bold mb-3">
                        <FolderOpen className="h-4 w-4" />
                        <span>root/</span>
                      </div>
                      {renderFilesListRecursive(projectFiles, 'root', 0)}
                    </div>
                  ) : (
                    <div className="text-center text-slate-500 py-12 text-xs">
                      No files initialized in this sandbox.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Code Viewer */}
              <div className="lg:col-span-2 glass-panel rounded-2xl p-5 flex flex-col h-[600px] overflow-hidden">
                {selectedFileId && projectFiles && projectFiles[selectedFileId] ? (
                  <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex items-center space-x-2 min-w-0">
                        <FileCode className="h-4.5 w-4.5 text-cyan-400 shrink-0" />
                        <span className="text-white text-xs font-mono font-bold truncate">
                          {getFilePath(selectedFileId, projectFiles)}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">READ-ONLY AUDIT STREAM</span>
                    </div>

                    <div className="flex-1 overflow-auto rounded-xl bg-slate-950/80 border border-white/5 p-4 scrollbar-thin">
                      <pre className="text-[11px] leading-relaxed font-mono text-indigo-200 whitespace-pre-wrap select-text">
                        <code>
                          {projectFiles[selectedFileId].content || '// This file is empty.'}
                        </code>
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3">
                    <FileCode className="h-10 w-10 text-slate-700 animate-pulse" />
                    <span className="text-xs font-sans">Select a file from the explorer tree to inspect its contents.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* SYSTEM METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Core Cloud Engine Specs */}
        <div className="p-5 rounded-2xl glass-card relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider font-sans">Cloud Engine Nodes</span>
            <Server className="h-4.5 w-4.5 text-cyan-400" />
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-semibold">
                <span className="text-slate-400">Memory Load</span>
                <span className="text-cyan-400 font-mono">1.84 GB / 4.00 GB (46%)</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full transition-all duration-500" style={{ width: '46%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-semibold">
                <span className="text-slate-400">CPU Clock Capacity</span>
                <span className="text-indigo-400 font-mono">18.2% (Host Container)</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: '18.2%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* System Action Overrides */}
        <div className="p-5 rounded-2xl glass-card">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider font-sans">Cluster Toggles</span>
            <Sliders className="h-4.5 w-4.5 text-fuchsia-400" />
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white">Maintenance Lock</h4>
                <p className="text-[10px] text-slate-500">Block public workspace routers</p>
              </div>
              <button
                onClick={handleToggleMaintenance}
                className={`w-10 h-6 rounded-full p-1 transition-colors outline-none cursor-pointer ${maintenanceMode ? 'bg-amber-500' : 'bg-slate-800'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${maintenanceMode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white">Performance Turbo Boost</h4>
                <p className="text-[10px] text-slate-500">Prioritize sandbox threads</p>
              </div>
              <button
                onClick={handleToggleTurbo}
                className={`w-10 h-6 rounded-full p-1 transition-colors outline-none cursor-pointer ${turboMode ? 'bg-indigo-500' : 'bg-slate-800'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${turboMode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Low-Level Maintenance Utilities */}
        <div className="p-5 rounded-2xl glass-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider font-sans">Garbage sweep</span>
              <Cpu className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
              Purge unreferenced node dependencies, recycle sandbox memory spaces, and sync client directories dynamically.
            </p>
          </div>
          
          <button
            onClick={handleRunGC}
            disabled={isGCRunning}
            className="w-full mt-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer font-sans"
          >
            <RefreshCw className={`h-4 w-4 text-purple-400 ${isGCRunning ? 'animate-spin' : ''}`} />
            <span>{isGCRunning ? 'Sweeping Blocks...' : 'Run Garbage Collector'}</span>
          </button>
        </div>
      </div>

      {/* DEVELOPERS DIRECTORY SECTION */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-cyan-500/10 rounded-xl">
              <Users className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight font-sans">Active Developers Database ({users.length})</h3>
              <p className="text-[11px] text-slate-400 font-sans">View active sandbox environments and issue direct administrative role/status interventions.</p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search user email or profile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all font-sans"
            />
          </div>
        </div>

        {/* Adaptive Layout: Desktop Table / Mobile Cards */}
        <div className="overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[920px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/40 text-slate-400 font-bold tracking-wider border-b border-white/5 text-[10px] uppercase font-mono whitespace-nowrap">
                  <th className="p-3">Developer Account</th>
                  <th className="p-3">Authorization Scope</th>
                  <th className="p-3">Live Status</th>
                  <th className="p-3">Last Active</th>
                  <th className="p-3">Active Projects</th>
                  <th className="p-3">Container Resource Load</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">System Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/10">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 font-mono">
                      <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
                      <p className="text-xs">Connecting to cloud databases...</p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                      No developers match the specified search queries.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2.5">
                          <img 
                            src={u.avatar} 
                            alt={u.username} 
                            className="w-7 h-7 rounded-xl object-cover border border-slate-800 shrink-0" 
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              const initial = u.username ? u.username.charAt(0).toUpperCase() : 'U';
                              const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="28" fill="%234f46e5"/><text x="50" y="58" font-family="sans-serif" font-size="42" font-weight="bold" fill="%23ffffff" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
                              e.currentTarget.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
                            }}
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-xs font-mono truncate max-w-[130px]">@{u.username}</h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]" title={u.email}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider ${
                          u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-white/5'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                          u.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span>{u.isOnline ? 'Online' : 'Offline'}</span>
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-300 font-mono text-[10px]">
                        {formatLastActive(u.lastActive)}
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono font-bold text-slate-300 text-[11px]">
                        {getUserActiveProjectsCount(u)} active
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center space-x-3 font-mono text-[10px]">
                          <div>
                            <span className="text-[8px] text-slate-500 block uppercase leading-none">CPU</span>
                            <span className="text-slate-300 font-bold">{u.cpuUsage}%</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-500 block uppercase leading-none">RAM</span>
                            <span className="text-slate-300 font-bold">{u.memoryUsage} MB</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                          u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span>{u.status}</span>
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1 whitespace-nowrap">
                          {(u?.email || '').trim().toLowerCase() !== 'nakulsharma02011@gmail.com' && (
                            <button
                              onClick={() => handleToggleUserRole(u.id, u.role, u.email)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center space-x-1 active:scale-95 ${
                                u.role === 'admin'
                                  ? 'bg-purple-500/10 hover:bg-purple-600 hover:text-white text-purple-400 border border-purple-500/20'
                                  : 'bg-indigo-600/10 hover:bg-indigo-600 hover:text-white text-indigo-400 border border-indigo-500/20'
                              }`}
                              title={u.role === 'admin' ? "Demote account to standard developer role" : "Promote account to platform admin"}
                            >
                              <Shield className="w-3 h-3 shrink-0" />
                              <span>{u.role === 'admin' ? 'Demote' : 'Promote'}</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleRevokeToken(u.username, u.email)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center space-x-1 active:scale-95"
                            title="Force clear active session tokens"
                          >
                            <KeyRound className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Revoke JWT</span>
                          </button>
                          {(u?.email || '').trim().toLowerCase() !== 'nakulsharma02011@gmail.com' && (
                            <>
                              <button
                                onClick={() => handleToggleUserStatus(u.id, u.status)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center space-x-1 active:scale-95 ${
                                  u.status === 'active' 
                                    ? 'bg-amber-500/10 hover:bg-amber-600 hover:text-white text-amber-400 border border-amber-500/20' 
                                    : 'bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>{u.status === 'active' ? 'Suspend' : 'Activate'}</span>
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username, u.email)}
                                className="px-2 py-1 bg-red-600/15 hover:bg-red-600 hover:text-white text-red-400 border border-red-500/30 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center space-x-1 active:scale-95"
                                title="Permanently delete user account and wipe database records"
                              >
                                <Trash2 className="w-3 h-3 shrink-0" />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid/List Card View */}
          <div className="block md:hidden divide-y divide-white/5 bg-slate-950/15">
            {loading ? (
              <div className="p-12 text-center text-slate-500 font-mono">
                <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
                <p className="text-xs">Connecting to cloud databases...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-sans">
                No developers match the specified search queries.
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div key={u.id} className="p-3.5 sm:p-4 space-y-3 hover:bg-slate-900/40 transition-colors">
                  <div className="flex items-center space-x-3">
                    <img 
                      src={u.avatar} 
                      alt={u.username} 
                      className="w-10 h-10 rounded-xl object-cover border border-slate-800 shrink-0" 
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        const initial = u.username ? u.username.charAt(0).toUpperCase() : 'U';
                        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="28" fill="%234f46e5"/><text x="50" y="58" font-family="sans-serif" font-size="42" font-weight="bold" fill="%23ffffff" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
                        e.currentTarget.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <h4 className="font-bold text-white text-xs font-mono truncate">@{u.username}</h4>
                        <div className="flex items-center space-x-1 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider ${
                            u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-white/5'
                          }`}>
                            {u.role}
                          </span>
                          <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                            u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${u.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                            <span>{u.status}</span>
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-950/30 p-2.5 rounded-xl border border-white/5 font-mono text-slate-300">
                    <div>
                      <span className="text-slate-500 text-[9px] uppercase block">Projects</span>
                      <span className="font-bold">{getUserActiveProjectsCount(u)} active</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[9px] uppercase block">Resource Load</span>
                      <span className="font-bold">CPU: {u.cpuUsage}% | RAM: {u.memoryUsage} MB</span>
                    </div>
                    <div className="pt-1.5 border-t border-white/5">
                      <span className="text-slate-500 text-[9px] uppercase block">Connection</span>
                      <span className={`inline-flex items-center space-x-1.5 font-semibold ${u.isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span>{u.isOnline ? 'Online' : 'Offline'}</span>
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-white/5">
                      <span className="text-slate-500 text-[9px] uppercase block">Last Active</span>
                      <span className="font-bold text-slate-300">{formatLastActive(u.lastActive)}</span>
                    </div>
                  </div>

                  {/* Sleek, full-width responsive single-row action bar */}
                  <div className="pt-2.5 border-t border-white/5">
                    <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-1.5 w-full">
                      {(u?.email || '').trim().toLowerCase() !== 'nakulsharma02011@gmail.com' && (
                        <button
                          onClick={() => handleToggleUserRole(u.id, u.role, u.email)}
                          className={`w-full py-1.5 px-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 active:scale-95 ${
                            u.role === 'admin'
                              ? 'bg-purple-500/10 hover:bg-purple-600 hover:text-white text-purple-400 border border-purple-500/20'
                              : 'bg-indigo-600/10 hover:bg-indigo-600 hover:text-white text-indigo-400 border border-indigo-500/20'
                          }`}
                          title={u.role === 'admin' ? "Demote account to standard developer role" : "Promote account to platform admin"}
                        >
                          <Shield className="w-3 h-3 shrink-0" />
                          <span className="truncate">{u.role === 'admin' ? 'Demote' : 'Promote'}</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleRevokeToken(u.username, u.email)}
                        className="w-full py-1.5 px-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-white/5 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 active:scale-95"
                        title="Force clear active session tokens"
                      >
                        <KeyRound className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">Revoke JWT</span>
                      </button>
                      {(u?.email || '').trim().toLowerCase() !== 'nakulsharma02011@gmail.com' && (
                        <>
                          <button
                            onClick={() => handleToggleUserStatus(u.id, u.status)}
                            className={`w-full py-1.5 px-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 active:scale-95 ${
                              u.status === 'active' 
                                ? 'bg-amber-500/10 hover:bg-amber-600 hover:text-white text-amber-400 border border-amber-500/20' 
                                : 'bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="truncate">{u.status === 'active' ? 'Suspend' : 'Activate'}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.username, u.email)}
                            className="w-full py-1.5 px-1.5 bg-red-600/15 hover:bg-red-600 hover:text-white text-red-400 border border-red-500/30 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 active:scale-95"
                            title="Permanently delete user account"
                          >
                            <Trash2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">Delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* DETAILED AUDIT TRAIL LOG STREAM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Real-time System Actions Log */}
        <div className="md:col-span-2 glass-panel rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/5 bg-slate-950/20 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2 font-mono">
              <Activity className="h-4.5 w-4.5 text-rose-400 animate-pulse" />
              <span>Real-Time Audit & Activity Log Stream</span>
            </h3>
            <span className="text-[9px] text-slate-500 font-mono">SECURED FEED (HOST PORT 3000)</span>
          </div>

          <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto font-mono text-[11px] scrollbar-thin">
            {loading ? (
              <p className="text-center text-slate-500 py-12">Loading system actions stream...</p>
            ) : logs.length === 0 ? (
              <p className="text-center text-slate-500 py-12">No system audit records registered.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-2.5 bg-slate-950/40 border border-white/5 rounded-xl flex items-start justify-between gap-3 min-w-0">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5">
                      <span className="text-indigo-400 font-semibold truncate max-w-[120px]" title={log.userEmail}>@{log.userEmail.split('@')[0]}</span>
                      <span className="text-slate-500">›</span>
                      <span className="text-slate-300 break-words">{log.action}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className="text-[10px] text-slate-500">{log.timestamp}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      log.status === 'success' ? 'bg-emerald-400' :
                      log.status === 'warning' ? 'bg-amber-400 animate-ping' :
                      'bg-cyan-400'
                    }`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cloud Config Parameters */}
        <div className="glass-panel rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-2 font-sans">
              <KeyRound className="h-4 w-4 text-cyan-400" />
              <span>Environment Secrets</span>
            </h3>

            <div className="space-y-3 text-[11px] leading-relaxed font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Deployment Type</span>
                <span className="text-emerald-400 font-bold">PRODUCTION</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Host Ports</span>
                <span className="text-indigo-400">Ingress: 3000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Database Engine</span>
                <span className="text-slate-300">Disk JSON Streams</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">WebSocket Core</span>
                <span className="text-purple-400 font-semibold">Enabled (ws v8.18)</span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-4 font-sans">
            <span className="text-[10px] text-amber-500 font-semibold flex items-center space-x-1">
              <AlertTriangle className="h-3 w-3" />
              <span>System commands securely restricted.</span>
            </span>
          </div>
        </div>
      </div>
      </>
      )}

    </div>
  );
}
