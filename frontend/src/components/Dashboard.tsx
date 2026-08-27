import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Star, Archive, Trash2, Copy, Share2, Download, 
  Settings, FolderKanban, Users, Shield, Cpu, ExternalLink, RefreshCw, 
  Trophy, LogOut, Clock, Code, Bell, CheckCircle, FileUp, FolderUp, ArrowLeft, KeyRound, Camera, X, Loader2,
  ShieldCheck, Eye, EyeOff, Check
} from 'lucide-react';
import JSZip from 'jszip';
import { Project, UserProfile, ProjectType, getSecureAvatarUrl, getBotAvatarUrl } from '@shared/types';
import AdminDashboard from './AdminDashboard';
import { safeFetch } from '../api';
import PermissionModal from './PermissionModal';

interface DashboardProps {
  user: UserProfile;
  projects: Project[];
  onCreateProject: (name: string, description: string, type: ProjectType, customFiles?: any) => void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onToggleFavorite: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onShowToast?: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
  onUpdateUser?: (updatedUser: UserProfile) => void;
  activeSeconds?: number;
  onResetTimer?: () => void;
  theme?: string;
  onChangeTheme?: (theme: string) => void;
}

export default function Dashboard({
  user,
  projects,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
  onDuplicateProject,
  onToggleFavorite,
  onToggleArchive,
  onLogout,
  onRefresh,
  onShowToast,
  onUpdateUser,
  activeSeconds = 0,
  onResetTimer,
  theme = 'midnight',
  onChangeTheme
}: DashboardProps) {

  // Calculate real total lines of code across all active project files
  const realLinesCoded = React.useMemo(() => {
    if (!projects || !Array.isArray(projects) || projects.length === 0) return 0;
    let total = 0;
    for (const p of projects) {
      if (p && p.files && typeof p.files === 'object') {
        for (const fileKey of Object.keys(p.files)) {
          const fileNode = p.files[fileKey];
          if (fileNode && fileNode.type === 'file' && typeof fileNode.content === 'string') {
            total += fileNode.content.split('\n').length;
          }
        }
      }
    }
    return total;
  }, [projects]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showJwtToken, setShowJwtToken] = useState(false);
  const [isGeneratingJwt, setIsGeneratingJwt] = useState(false);
  const [currentJwtToken, setCurrentJwtToken] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ide_jwt_token') || '';
    }
    return '';
  });

  const handleGenerateJWTToken = async () => {
    setIsGeneratingJwt(true);
    try {
      const existingToken = localStorage.getItem('ide_jwt_token') || '';
      const response = await safeFetch('/api/auth/refresh-jwt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(existingToken ? { Authorization: `Bearer ${existingToken}` } : {})
        }
      });
      const data = await response.json();
      if (response.ok && data.token) {
        localStorage.setItem('ide_jwt_token', data.token);
        setCurrentJwtToken(data.token);
        onShowToast?.(
          'JWT Token Generated Successfully',
          `New AES-256 encrypted bearer pass generated for @${user.username}. Session secured!`,
          'success'
        );
      } else {
        onShowToast?.('JWT Token Error', data.error || 'Failed to generate JWT token.', 'error');
      }
    } catch (err: any) {
      onShowToast?.('JWT Token Error', err.message || 'Server error generating token.', 'error');
    } finally {
      setIsGeneratingJwt(false);
    }
  };

  // Automatically prompt for Device File Access & Browser Notifications on dashboard load (like major apps)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const prompted = localStorage.getItem('codesyne_permissions_prompted');
      if (!prompted) {
        const timer = setTimeout(() => {
          setShowPermissionModal(true);
        }, 900);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleClosePermissionModal = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('codesyne_permissions_prompted', 'true');
    }
    setShowPermissionModal(false);
  };

  const handleSmoothRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      if (onShowToast) {
        onShowToast('Workspace Synced', 'Projects, user status, and session data refreshed successfully.', 'success');
      }
    } catch (e: any) {
      if (onShowToast) {
        onShowToast('Refresh Error', 'Failed to refresh workspace data.', 'error');
      }
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 600);
    }
  };

  const handleLogoutClick = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onLogout();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Format last used date with clean relative or concise date timestamp
  const formatLastUsed = (dateVal?: string | number) => {
    if (!dateVal) return 'Just now';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Just now';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Format real active time spent in current session & calculate total hours
  const formattedActiveTime = React.useMemo(() => {
    const totalSecs = activeSeconds || 0;
    if (totalSecs <= 0) return '0h 0m 0s';
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h}h ${m}m ${s}s`;
  }, [activeSeconds]);

  const totalCalculatedHours = React.useMemo(() => {
    const totalSecs = activeSeconds || 0;
    if (totalSecs <= 0) return '0.00';
    return (totalSecs / 3600).toFixed(2);
  }, [activeSeconds]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'favorites' | 'archived' | ProjectType>('all');
  const [adminTab, setAdminTab] = useState<'projects' | 'admin'>('projects');
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || 
    (navigator as any).standalone === true
  );
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [canInstall, setCanInstall] = useState(!isStandalone && typeof window !== 'undefined' && !!window.deferredPrompt);
  const [showInstallModal, setShowInstallModal] = useState(false);

  React.useEffect(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    setIsInstalled(isStandaloneMode);

    if (!isStandaloneMode && window.deferredPrompt) {
      setCanInstall(true);
    }

    const handlePwaState = (e: any) => {
      if (e.detail) {
        setCanInstall(e.detail.installable && !e.detail.installed);
        setIsInstalled(e.detail.installed);
      }
    };
    window.addEventListener('pwa-installable-state', handlePwaState);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setCanInstall(true);
      setIsInstalled(false);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setCanInstall(false);
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      setIsInstalled(isStandaloneMode);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('pwa-installable-state', handlePwaState);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = () => {
    if (canInstall || window.deferredPrompt) {
      window.dispatchEvent(new CustomEvent('pwa-trigger-install'));
    } else {
      setShowInstallModal(true);
    }
  };

  const isLightTheme = theme === 'light';
  const isCyberTheme = theme === 'cyberpunk';

  const textClass = isLightTheme ? 'text-slate-700' : 'text-slate-300';
  const textWhiteClass = isLightTheme ? 'text-slate-900' : 'text-white';
  const textSlateClass = isLightTheme ? 'text-slate-500' : 'text-slate-400';
  
  const cardClass = isLightTheme 
    ? 'bg-white border-slate-200/80 shadow-md hover:shadow-lg hover:border-slate-300' 
    : isCyberTheme 
      ? 'bg-[#0f0a24]/90 border-pink-500/20' 
      : 'bg-slate-950/40 border-white/5';

  const panelBgClass = isLightTheme 
    ? 'bg-white border-slate-200 shadow-xl' 
    : isCyberTheme 
      ? 'bg-[#0f0924]/90 border-pink-500/20' 
      : 'bg-slate-950/40 border-white/5';

  const inputClass = isLightTheme 
    ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white' 
    : 'bg-[#07070d] border-white/5 text-white placeholder-slate-600 focus:border-indigo-500/40';

  // User Profile Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user.username || '');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setUsernameInput(user.username || '');
  }, [user.username]);

  const handleDashboardUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      onShowToast?.('Invalid Username', 'Username cannot be blank.', 'error');
      return;
    }
    setIsSavingUsername(true);
    try {
      const token = localStorage.getItem('ide_jwt_token');
      const response = await safeFetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ username: usernameInput.trim() }),
        skipThrowOnNonOk: true
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.user) {
        if (onUpdateUser) onUpdateUser(data.user);
        onShowToast?.('Username Updated', `Your unique developer handle is now @${data.user.username}`, 'success');
      } else {
        onShowToast?.('Update Failed', data.error || 'Could not update username.', 'error');
      }
    } catch (err: any) {
      onShowToast?.('Error', err.message || 'Server error updating username.', 'error');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleDashboardPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateUser) return;

    if (newPassword.length < 5) {
      onShowToast?.('Weak Password', 'Your new security password must contain at least 5 characters.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      onShowToast?.('Mismatch Error', 'The new password and confirmation entries do not match.', 'error');
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const res = await safeFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword,
          newPassword
        })
      });
      
      const emailKey = (user.email || user.username || user.id || 'user').trim().toLowerCase();
      localStorage.setItem(`ide_user_password_${emailKey}`, newPassword);
      
      const updated = {
        ...user,
        password: newPassword
      };
      localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updated));
      onUpdateUser(updated);

      onShowToast?.('Credentials Updated', 'Your security password has been changed successfully in the database!', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
    } catch (err: any) {
      console.error('Password change error:', err);
      onShowToast?.('Security Error', err.message || 'The current password you provided is incorrect.', 'error');
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleUpdateWhatsapp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateUser) return;
    const emailKey = (user.email || user.username || user.id || 'user').trim().toLowerCase();
    const updated = {
      ...user,
      whatsapp: whatsapp
    };
    localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updated));
    onUpdateUser(updated);
    onShowToast?.('Contact Saved', 'Your WhatsApp contact number has been updated & saved successfully!', 'success');
  };

  const handleDashboardAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        onShowToast?.('Image Too Large', 'Please select an image file under 2MB.', 'error');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        if (onUpdateUser) {
          const emailKey = (user.email || user.username || user.id || 'user').trim().toLowerCase();
          const updated = {
            ...user,
            avatar: base64Data,
            hasCustomAvatar: true
          };
          localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updated));
          onUpdateUser(updated);
          onShowToast?.('Profile Photo Saved', 'Your custom profile photo has been updated & saved successfully!', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDashboardRandomizeAvatar = () => {
    if (onUpdateUser) {
      const randomSeed = Math.floor(Math.random() * 1000000);
      const newAvatar = getBotAvatarUrl(String(randomSeed), user.username);
      const emailKey = (user.email || user.username || user.id || 'user').trim().toLowerCase();
      const updated = {
        ...user,
        avatar: newAvatar,
        hasCustomAvatar: true
      };
      localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(updated));
      onUpdateUser(updated);
      onShowToast?.('Identity Swapped', 'A custom randomized robot has been assigned & saved!', 'success');
    }
  };
  
  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjType, setNewProjType] = useState<ProjectType>('web');

  // Share Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedShareProj, setSelectedShareProj] = useState<Project | null>(null);
  const [shareEmail, setShareEmail] = useState('');

  // Folder Upload Input Ref
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  // Notifications
  const [notifications] = useState([
    { id: 1, text: 'Sarah Connor joined project "Personal Dashboard"', time: '10 minutes ago' },
    { id: 2, text: 'Automated linter refactored class structures in main.py', time: '1 hour ago' },
    { id: 3, text: 'Version snapshot compiled securely for "Sorting Algorithmic Sandbox"', time: 'Yesterday' }
  ]);

  const getLanguageFromExt = (ext: string): string => {
    const map: { [key: string]: string } = {
      'html': 'html', 'css': 'css', 'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
      'ts': 'typescript', 'tsx': 'typescript', 'py': 'python', 'pyw': 'python', 'json': 'json', 
      'md': 'markdown', 'go': 'go', 'rs': 'rust', 'java': 'java', 'c': 'c', 
      'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'php': 'php', 'swift': 'swift',
      'kt': 'kotlin', 'kts': 'kotlin', 'rb': 'ruby', 'cs': 'csharp', 'dart': 'dart',
      'scala': 'scala', 'r': 'r'
    };
    return map[ext.toLowerCase()] || 'javascript';
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    onCreateProject(newProjName, newProjDesc, newProjType);
    setNewProjName('');
    setNewProjDesc('');
    setShowCreateModal(false);
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail || !selectedShareProj) return;

    const emailToSend = shareEmail.trim();
    if (!emailToSend.includes('@')) {
      if (onShowToast) onShowToast('Invalid Email', 'Please enter a valid colleague email address.', 'error');
      return;
    }

    if (onShowToast) {
      onShowToast('Sending Invitation...', `Dispatching workspace invitation email to ${emailToSend} via Brevo...`, 'info');
    }

    try {
      const token = localStorage.getItem('ide_jwt_token') || '';
      const response = await fetch('/api/projects/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId: selectedShareProj.id,
          recipientEmail: emailToSend,
          inviterName: user?.username || user?.email?.split('@')[0] || 'CodeSyne Developer'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (!selectedShareProj.sharedWith.includes(emailToSend)) {
          selectedShareProj.sharedWith.push(emailToSend);
        }
        if (onShowToast) {
          onShowToast('Invitation Sent! 📧', `Brevo email successfully sent to ${emailToSend}. They can click the link in their email to join!`, 'success');
        }
      } else {
        if (onShowToast) {
          onShowToast('Invitation Notice', data.error || 'Added user to project shared list.', 'info');
        }
      }
    } catch (err: any) {
      console.error('Error sending invite email:', err);
      if (onShowToast) {
        onShowToast('Error', 'Network error sending invitation email.', 'error');
      }
    }

    setShareEmail('');
    setShowShareModal(false);
  };

  // Real ZIP Upload and Extraction Handler
  const handleUploadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (onShowToast) {
      onShowToast('Importing ZIP', `Extracting workspace directory structure from "${file.name}"...`, 'info');
    }

    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      
      const filesState: any = {
        'root': { id: 'root', name: 'root', type: 'folder', parentId: null }
      };

      const folderMap: { [path: string]: string } = {};
      const relativePaths = Object.keys(loadedZip.files);
      const sortedPaths = relativePaths.sort((a, b) => a.split('/').length - b.split('/').length);

      for (const relPath of sortedPaths) {
        const normalizedRelPath = relPath.replace(/\\/g, '/');
        if (normalizedRelPath.includes('__MACOSX') || normalizedRelPath.includes('.DS_Store')) {
          continue; // skip OS junk
        }

        const zipEntry = loadedZip.files[relPath];
        const isDir = zipEntry.dir;
        const normalizedPath = normalizedRelPath.endsWith('/') ? normalizedRelPath.slice(0, -1) : normalizedRelPath;
        const parts = normalizedPath.split('/');
        
        let currentParentId = 'root';
        let currentPathAccumulator = '';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (!part) continue;

          currentPathAccumulator = currentPathAccumulator ? `${currentPathAccumulator}/${part}` : part;

          if (i === parts.length - 1 && !isDir) {
            // File
            const fileId = 'node_' + Math.random().toString(36).substr(2, 9);
            const ext = part.split('.').pop() || '';
            let content = '';
            
            try {
              content = await zipEntry.async('string');
            } catch (err) {
              content = '[Binary or Unreadable File]';
            }

            filesState[fileId] = {
              id: fileId,
              name: part,
              type: 'file',
              parentId: currentParentId,
              content,
              language: getLanguageFromExt(ext)
            };
          } else {
            // Folder
            if (!folderMap[currentPathAccumulator]) {
              const folderId = 'node_' + Math.random().toString(36).substr(2, 9);
              filesState[folderId] = {
                id: folderId,
                name: part,
                type: 'folder',
                parentId: currentParentId
              };
              folderMap[currentPathAccumulator] = folderId;
            }
            currentParentId = folderMap[currentPathAccumulator];
          }
        }
      }

      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
      const isPython = file.name.toLowerCase().includes('py');

      onCreateProject(
        nameWithoutExtension,
        `ZIP archive imported workspace: ${file.name}`,
        isPython ? 'python' : 'web',
        filesState
      );

      if (onShowToast) {
        onShowToast('Import Complete', `Successfully initialized workspace "${nameWithoutExtension}" with files!`, 'success');
      }
    } catch (error: any) {
      console.error('ZIP compilation error:', error);
      if (onShowToast) {
        onShowToast('ZIP Extract Failed', error.message || 'Error occurred parsing ZIP.', 'error');
      }
    }
    // Clear value to allow re-uploading same file
    e.target.value = '';
  };

  // Real Folder Upload Handler
  const handleUploadFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const filesArray = Array.from(importedFiles) as any[];
    
    // Determine target outer folder name
    let folderName = 'Uploaded Folder';
    if (filesArray[0] && filesArray[0].webkitRelativePath) {
      folderName = filesArray[0].webkitRelativePath.split('/')[0] || 'Uploaded Folder';
    }

    if (onShowToast) {
      onShowToast('Uploading Folder', `Mapping and processing ${filesArray.length} files from "${folderName}"...`, 'info');
    }

    try {
      const filesState: any = {
        'root': { id: 'root', name: 'root', type: 'folder', parentId: null }
      };

      const folderMap: { [path: string]: string } = {};

      for (const file of filesArray) {
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split('/');
        
        let currentParentId = 'root';
        let currentPathAccumulator = '';

        // Reconstruct folder path hierarchy
        for (let j = 0; j < parts.length - 1; j++) {
          const folderNamePart = parts[j];
          currentPathAccumulator = currentPathAccumulator ? `${currentPathAccumulator}/${folderNamePart}` : folderNamePart;

          if (!folderMap[currentPathAccumulator]) {
            const folderId = 'node_' + Math.random().toString(36).substr(2, 9);
            filesState[folderId] = {
              id: folderId,
              name: folderNamePart,
              type: 'folder',
              parentId: currentParentId
            };
            folderMap[currentPathAccumulator] = folderId;
          }
          currentParentId = folderMap[currentPathAccumulator];
        }

        // Add file node
        const fileName = parts[parts.length - 1];
        const ext = fileName.split('.').pop() || '';
        const fileId = 'node_' + Math.random().toString(36).substr(2, 9);

        // Binary check
        const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md', '.txt', '.xml', '.yml', '.yaml', '.svg', '.py', '.java', '.c', '.cpp', '.cc', '.rs', '.go', '.php'];
        const fileExt = '.' + ext.toLowerCase();
        const isBin = !textExtensions.includes(fileExt) && !file.type.startsWith('text/');

        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve(event.target?.result as string || '');
          };
          if (isBin) {
            reader.readAsDataURL(file);
          } else {
            reader.readAsText(file);
          }
        });

        filesState[fileId] = {
          id: fileId,
          name: fileName,
          type: 'file',
          parentId: currentParentId,
          content: text,
          language: getLanguageFromExt(ext)
        };
      }

      onCreateProject(
        folderName,
        `Folder imported workspace structure.`,
        folderName.toLowerCase().includes('py') ? 'python' : 'web',
        filesState
      );

      if (onShowToast) {
        onShowToast('Upload Successful', `Successfully initialized workspace with imported "${folderName}" folder!`, 'success');
      }
    } catch (error: any) {
      console.error('Folder upload error:', error);
      if (onShowToast) {
        onShowToast('Folder Upload Failed', error.message || 'Error occurred.', 'error');
      }
    }
    // Clear value to allow re-uploading same file
    e.target.value = '';
  };

  // Deduplicate Projects Array by ID for visual stability
  const uniqueProjects = React.useMemo(() => {
    if (!projects || !Array.isArray(projects)) return [];
    const seen = new Set<string>();
    return projects.filter(p => {
      if (!p || !p.id) return false;
      const cleanId = p.id.trim();
      if (seen.has(cleanId)) return false;
      seen.add(cleanId);
      return true;
    });
  }, [projects]);

  // Filtering Logic & Sort by Last Used
  const filteredProjects = uniqueProjects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filterType === 'all') return p.status === 'active';
    if (filterType === 'favorites') return p.isFavorite && p.status === 'active';
    if (filterType === 'archived') return p.status === 'archived';
    return p.type === filterType && p.status === 'active';
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div id="dashboard_root" className="min-h-full bg-transparent text-slate-300 p-4 sm:p-6 md:p-8 lg:p-10 pb-20 sm:pb-28 font-sans">
      <div className="max-w-[1600px] w-full mx-auto space-y-6 sm:space-y-8">
        
        {/* TOP PANEL: Brand & Profile details - 100% responsive across all devices */}
        <header className="p-4 sm:p-6 lg:p-7 rounded-2xl glass-panel border border-white/10 relative overflow-hidden bg-gradient-to-r from-[#0d0a1d]/95 via-[#120d2c]/95 to-[#0b081c]/95 backdrop-blur-xl shadow-2xl group">
          {/* Subtle background glow effect */}
          <div className="absolute -right-20 -top-20 w-60 h-60 rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none group-hover:bg-indigo-500/15 transition-all duration-700" />
          <div className="absolute -left-20 -bottom-20 w-60 h-60 rounded-full bg-fuchsia-500/5 blur-[80px] pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 sm:gap-6 lg:gap-8 relative z-10">
            {/* Left Column: Avatar + Welcome Back, Username + LEVEL PRO + Subtitle */}
            <div className="flex items-center space-x-3.5 sm:space-x-4 min-w-0 w-full lg:w-auto flex-1">
              <div className="relative shrink-0">
                <img 
                  src={user.avatar || getBotAvatarUrl(user.email, user.username)} 
                  alt={user.username} 
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-indigo-500/30 shadow-xl shadow-indigo-500/10 hover:scale-105 transition-transform duration-200" 
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = getBotAvatarUrl(user.email, user.username);
                  }}
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0d0a1d] rounded-full shadow-sm shadow-emerald-500/50" title="Connected to cloud sandbox" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap min-w-0">
                  <h1 className="text-base sm:text-xl md:text-2xl font-extrabold font-sans text-white tracking-tight truncate leading-snug" title={`Welcome Back, ${user.username}`}>
                    Welcome Back, <span className="text-indigo-200 font-bold">{user.username}</span>
                  </h1>
                  <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 text-[10px] font-extrabold rounded-md uppercase tracking-wider border border-indigo-500/30 shadow-sm shrink-0 inline-flex items-center justify-center leading-none select-none my-0.5">
                    LEVEL PRO
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 font-sans truncate max-w-full leading-relaxed mt-0.5">
                  {user.bio || (user.email ? `${user.email} • CodeSyne Sandbox Active` : 'CodeSyne Executive Administrator')}
                </p>
              </div>
            </div>

            {/* Symmetrical Responsive Action Buttons Row */}
            <div className="flex items-center gap-2.5 sm:gap-3 w-full lg:w-auto justify-start lg:justify-end flex-wrap pt-3 lg:pt-0 border-t lg:border-t-0 border-white/10 shrink-0">
              {/* New Project Button */}
              <button
                onClick={() => setShowCreateModal(true)}
                className="h-10 px-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 hover:from-indigo-400 hover:to-fuchsia-400 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/15 hover:scale-105 active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer shrink-0"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span className="whitespace-nowrap">New Project</span>
              </button>

              {/* Refresh / Sync Button - 100% Symmetrical Rotation & Center Alignment */}
              <button
                onClick={handleSmoothRefresh}
                disabled={isRefreshing}
                className={`h-10 w-10 sm:w-auto sm:px-3.5 bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 rounded-xl transition-all cursor-pointer flex items-center justify-center text-slate-200 hover:text-white shrink-0 shadow-md p-0 sm:px-3.5 ${isRefreshing ? 'opacity-75 cursor-wait' : ''}`}
                title="Refresh Workspace Data"
              >
                <div className="w-4 h-4 flex items-center justify-center shrink-0 origin-center">
                  <RefreshCw className={`w-4 h-4 text-cyan-400 shrink-0 origin-center ${isRefreshing ? 'animate-spin' : ''}`} />
                </div>
                <span className="text-xs font-semibold hidden sm:inline sm:ml-1.5">Sync</span>
              </button>

              {/* Logout Button - 100% Perfectly Centered Icon */}
              <button
                onClick={handleLogoutClick}
                disabled={isLoggingOut}
                className={`h-10 w-10 bg-rose-950/30 border border-rose-500/20 hover:bg-rose-900/40 active:scale-95 rounded-xl transition-all flex items-center justify-center text-rose-300 hover:text-rose-100 cursor-pointer shadow-md shrink-0 p-0 ${isLoggingOut ? 'opacity-70 cursor-wait' : ''}`}
                title="Sign Out of Session"
              >
                <div className="w-4 h-4 flex items-center justify-center shrink-0 origin-center">
                  {isLoggingOut ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-300 shrink-0 origin-center" />
                  ) : (
                    <LogOut className="w-4 h-4 text-rose-400 shrink-0 origin-center" />
                  )}
                </div>
              </button>
            </div>
          </div>

        </header>

        {/* WORKSPACE STATS GRID */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-white/10 transition-all duration-300 relative group overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 relative z-10 gap-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">Lines Coded</span>
              <div className="p-1 sm:p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                <Code className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-bold font-sans text-white mt-1.5 relative z-10 tracking-tight truncate">{realLinesCoded}</div>
            <p className="text-[10px] text-indigo-400 mt-1 relative z-10 flex items-center gap-1 font-medium truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              <span className="truncate">Codebase total</span>
            </p>
          </div>

          <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-white/10 transition-all duration-300 relative group overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 relative z-10 gap-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">Active Time</span>
              <div className="p-1 sm:p-1.5 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                <Clock className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-2xl font-bold font-mono text-white mt-1.5 relative z-10 tracking-tight truncate">
              {formattedActiveTime}
            </div>
            <p className="text-[10px] text-purple-400 mt-1 relative z-10 flex items-center gap-1.5 font-medium truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
              <span className="truncate">{totalCalculatedHours} hrs session</span>
            </p>
          </div>

          <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-white/10 transition-all duration-300 relative group overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 relative z-10 gap-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">Projects</span>
              <div className="p-1 sm:p-1.5 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 shrink-0">
                <FolderKanban className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-bold font-sans text-white mt-1.5 relative z-10 tracking-tight truncate">{projects.length}</div>
            <p className="text-[10px] text-fuchsia-400 mt-1 relative z-10 flex items-center gap-1 font-medium truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shrink-0" />
              <span className="truncate">Active Workspaces</span>
            </p>
          </div>

          <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-white/10 transition-all duration-300 relative group overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 relative z-10">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Sandbox</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Cpu className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-2xl font-bold font-sans text-emerald-400 mt-1.5 relative z-10 tracking-tight flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Online</span>
            </div>
            <p className="text-[10px] text-emerald-400 mt-1 relative z-10 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Cloud VM Ready</span>
            </p>
          </div>
        </section>

        {/* ADMIN TAB SWITCHER */}
        {((user.email || '').trim().toLowerCase() === 'nakulsharma02011@gmail.com' || user.role === 'admin') && (
          <div className="flex items-center space-x-2 bg-slate-950/40 p-1.5 rounded-2xl border border-white/5 max-w-md w-full">
            <button
              onClick={() => setAdminTab('projects')}
              className={`flex-1 py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold rounded-xl transition-all cursor-pointer ${
                adminTab === 'projects' 
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Developer Projects
            </button>
            <button
              onClick={() => setAdminTab('admin')}
              className={`flex-1 py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold rounded-xl transition-all cursor-pointer ${
                adminTab === 'admin' 
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Codesyne Administration
            </button>
          </div>
        )}

        {/* MAIN BODY LAYOUT */}
        {((user.email || '').trim().toLowerCase() === 'nakulsharma02011@gmail.com' || user.role === 'admin' || (user.email || '').trim().toLowerCase().includes('nakulsharma')) && adminTab === 'admin' ? (
          <AdminDashboard currentUser={user} onShowToast={onShowToast || (() => {})} onBackToProjects={() => setAdminTab('projects')} />
        ) : (
          <div className="flex flex-col space-y-8 items-start w-full">
          
            {/* Project list & Management Section (Full Width) */}
            <div className="space-y-4 sm:space-y-6 w-full min-w-0">
              
              {/* Filter Toolbar - Sticky with zero top gap */}
              <div className="sticky top-3 z-30 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 glass-panel p-3 sm:p-4 rounded-2xl border border-white/10 shadow-2xl bg-[#090715]/90 backdrop-blur-xl transition-all duration-300">
                <div className="flex items-center space-x-1 sm:space-x-1.5 text-xs font-semibold text-slate-400 overflow-x-auto w-full md:w-auto scrollbar-hide pb-1.5 md:pb-0">
                  {[
                    { type: 'all', label: 'All Active' },
                    { type: 'favorites', label: 'Favorites' },
                    { type: 'web', label: 'HTML/CSS' },
                    { type: 'python', label: 'Python' },
                    { type: 'archived', label: 'Archived' }
                  ].map((btn) => (
                    <button
                      key={btn.type}
                      onClick={() => setFilterType(btn.type as any)}
                      className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap text-[11px] sm:text-xs font-bold shrink-0 ${
                        filterType === btn.type 
                          ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shadow-sm' 
                          : 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search project title or stack..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#0a0a0f]/40 border border-white/5 focus:border-indigo-500/30 rounded-xl pl-9 pr-4 py-2 sm:py-2.5 text-[11px] sm:text-xs text-white placeholder-slate-500 outline-none transition-all focus:ring-1 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {/* Quick import toolbar */}
              <div className="p-3 sm:p-4 bg-gradient-to-r from-slate-950/40 to-slate-900/10 border border-white/5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span className="text-[10px] sm:text-xs text-slate-300 font-semibold uppercase tracking-wider">Quick Import Utilities:</span>
                </div>
                <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                  <label className="flex-1 sm:flex-none px-3 py-2 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 rounded-xl flex items-center justify-center space-x-1.5 font-bold transition-all text-slate-300 hover:text-white cursor-pointer text-[10px] sm:text-xs">
                    <FileUp className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>Upload ZIP</span>
                    <input type="file" accept=".zip" onChange={handleUploadZip} className="hidden" />
                  </label>
                  <button 
                    onClick={() => folderInputRef.current?.click()} 
                    className="flex-1 sm:flex-none px-3 py-2 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 rounded-xl flex items-center justify-center space-x-1.5 font-bold transition-all text-slate-300 hover:text-white cursor-pointer text-[10px] sm:text-xs"
                  >
                    <FolderUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span>Upload Folder</span>
                  </button>
                  <input
                    type="file"
                    ref={folderInputRef}
                    {...{ webkitdirectory: "", directory: "" }}
                    multiple
                    className="hidden"
                    onChange={handleUploadFolder}
                  />
                </div>
              </div>

              {/* PROJECTS LIST GRID - Prominent PC Sizing & Edge-to-Edge Grid Coverage */}
              {filteredProjects.length === 0 ? (
                <div className="p-8 sm:p-14 text-center rounded-2xl border border-dashed border-white/10 glass-card flex flex-col items-center justify-center">
                  <div className="p-3 sm:p-4 bg-slate-950/40 rounded-2xl border border-white/5 mb-3">
                    <FolderKanban className="h-6 w-6 sm:h-8 sm:w-8 text-slate-500" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-200">No projects found</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 max-w-xs mx-auto mt-1.5 leading-relaxed">Create a workspace, upload a local folder, or import a ZIP archive.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 items-stretch w-full">
                  {filteredProjects.map((p) => (
                    <div 
                      key={p.id}
                      id={`project_card_${p.id}`}
                      className="p-5 sm:p-6 rounded-2xl glass-card border border-white/10 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group cursor-pointer relative overflow-hidden h-full min-h-[210px] w-full"
                      onClick={() => onSelectProject(p.id)}
                    >
                      {/* Glowing Accent Top Line */}
                      <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div className="flex-1 flex flex-col justify-between">
                        {/* Card Heading */}
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold font-mono uppercase tracking-wider border shrink-0 ${
                            p.type === 'web' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
                            p.type === 'python' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                            'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                          }`}>
                            {p.type}
                          </span>

                          <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 opacity-90 group-hover:opacity-100 transition-all shrink-0 ml-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); onToggleFavorite(p); }}
                              className={`p-1 sm:p-1.5 rounded-lg hover:bg-white/10 transition-colors ${p.isFavorite ? 'text-yellow-400' : 'text-slate-400 hover:text-white'}`}
                              title="Favorite Project"
                            >
                              <Star className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${p.isFavorite ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onToggleArchive(p); }}
                              className={`p-1 sm:p-1.5 rounded-lg hover:bg-white/10 transition-colors ${p.status === 'archived' ? 'text-violet-400' : 'text-slate-400 hover:text-white'}`}
                              title={p.status === 'archived' ? 'Unarchive' : 'Archive'}
                            >
                              <Archive className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedShareProj(p); setShowShareModal(true); }}
                              className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors"
                              title="Share Workspace link"
                            >
                              <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDuplicateProject(p.id); }}
                              className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-colors"
                              title="Duplicate Workspace Copy"
                            >
                              <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                              className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Delete Sandbox Permanently"
                            >
                              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div className="my-3 min-w-0">
                          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight group-hover:text-indigo-300 transition-colors line-clamp-1 truncate">{p.name}</h3>
                          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 line-clamp-2 leading-relaxed min-h-[2.5rem]">{p.description || 'No description provided.'}</p>
                        </div>
                      </div>

                      {/* Footer Info */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between mt-3 pt-3 border-t border-white/5 relative z-10 shrink-0 gap-2 min-w-0 w-full">
                        <div className="flex items-center space-x-1.5 text-[10px] text-cyan-300 font-mono font-medium truncate min-w-0">
                          <Clock className="h-3 w-3 text-cyan-400 shrink-0" />
                          <span className="truncate">Last used: <strong className="text-white">{formatLastUsed(p.updatedAt)}</strong></span>
                        </div>
                        
                        <div className="flex items-center space-x-2 shrink-0 ml-auto">
                          {p.sharedWith.length > 0 && (
                            <div className="flex -space-x-1 overflow-hidden shrink-0">
                              {p.sharedWith.map((em, s_idx) => (
                                <div 
                                  key={s_idx} 
                                  className="w-4 h-4 rounded-full bg-indigo-600 text-[8px] font-bold text-white flex items-center justify-center border border-[#0a0a0f] uppercase"
                                  title={`Shared with ${em}`}
                                >
                                  {em[0]}
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectProject(p.id); }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02] active:scale-[0.98] text-white text-[10px] font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer shadow-sm shadow-indigo-600/20 shrink-0"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LOWER SECTION: Activity & Notifications & Achievements (3-Column Grid) */}
            <div className="w-full pt-6 border-t border-white/10 space-y-4">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider font-sans">
                  Account & Workspace Hub
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 items-start w-full">
              
              {/* Interactive Settings & Profile Panel */}
              <div className="p-6 glass-card rounded-2xl border border-white/5 shadow-md space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
                    <Settings className="h-4 w-4 text-indigo-400" />
                    <span>Codesyne Profile Settings</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-bold font-mono uppercase tracking-wider border border-emerald-500/20">Synced</span>
                </div>

                {/* Theme selection row */}
                {onChangeTheme && (
                  <div className="flex flex-col space-y-1.5 pt-1 border-b border-white/5 pb-3">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Workspace Theme</label>
                    <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-white/5">
                      {[
                        { id: 'midnight', label: 'Midnight', emoji: '🌌' },
                        { id: 'cyberpunk', label: 'Cyber', emoji: '✨' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => onChangeTheme(t.id as any)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            theme === t.id
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>{t.emoji}</span>
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Avatar change & randomization section */}
                <div className="flex items-center space-x-4 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="relative group/dash-avatar cursor-pointer shrink-0">
                    <div className="w-14 h-14 rounded-xl ring-2 ring-indigo-500/30 overflow-hidden relative shadow-lg bg-slate-900 group-hover/dash-avatar:ring-indigo-500/60 transition-all">
                      <img 
                        src={user.avatar} 
                        alt={user.username} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover/dash-avatar:opacity-100 flex items-center justify-center transition-opacity"
                        title="Upload New Profile Photo"
                      >
                        <Camera className="h-4 w-4 text-indigo-400 animate-bounce" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">{user.username}</h4>
                    <p className="text-[10px] text-slate-500 font-mono truncate">{user.email}</p>
                    
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-[9px] font-bold rounded-md transition-all cursor-pointer"
                      >
                        Upload Photo
                      </button>
                      <button
                        type="button"
                        onClick={handleDashboardRandomizeAvatar}
                        className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-md transition-all cursor-pointer"
                      >
                        Random Avatar
                      </button>
                    </div>
                  </div>

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleDashboardAvatarUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                {/* Unique Username change input */}
                <form onSubmit={handleDashboardUpdateUsername} className="space-y-1.5 pt-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Unique Handle / Username</label>
                  <div className="flex space-x-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">@</span>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="Enter unique username"
                        className="w-full pl-8 pr-3 py-1.5 bg-[#07070d] border border-white/5 focus:border-indigo-500/40 rounded-xl text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSavingUsername}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-extrabold rounded-xl transition-all cursor-pointer shrink-0"
                    >
                      {isSavingUsername ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>

                {/* WhatsApp configuration input */}
                <form onSubmit={handleUpdateWhatsapp} className="space-y-1.5 pt-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">WhatsApp Contact Number</label>
                  <div className="flex space-x-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">💬</span>
                      <input
                        type="text"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="e.g. +91 9876543210"
                        className="w-full pl-8 pr-3 py-1.5 bg-[#07070d] border border-white/5 focus:border-indigo-500/40 rounded-xl text-xs text-white placeholder-slate-600 outline-none transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-extrabold rounded-xl transition-all cursor-pointer shrink-0"
                    >
                      Save
                    </button>
                  </div>
                </form>

                {/* Password modification form toggle */}
                <div className="border-t border-white/5 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center space-x-1.5 shrink min-w-0">
                      <KeyRound className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-400 truncate">Security Credentials</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsChangingPassword(!isChangingPassword)}
                      className="text-[9px] px-2.5 py-1 bg-indigo-500/15 hover:bg-indigo-500/25 active:scale-95 text-indigo-300 rounded-lg font-extrabold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 border border-indigo-500/20 cursor-pointer flex items-center justify-center my-auto"
                    >
                      {isChangingPassword ? 'Cancel' : 'Change Password'}
                    </button>
                  </div>

                  {isChangingPassword && (
                    <form onSubmit={handleDashboardPasswordSubmit} className="space-y-3 pt-3 animate-fade-in text-left border-t border-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Current Password</label>
                          <input
                            type="password"
                            required
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Current password"
                            className="w-full px-3 py-1.5 bg-[#07070d] border border-white/5 focus:border-indigo-500/40 rounded-xl text-xs text-white placeholder-slate-600 outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">New Password</label>
                          <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min 5 chars"
                            className="w-full px-3 py-1.5 bg-[#07070d] border border-white/5 focus:border-indigo-500/40 rounded-xl text-xs text-white placeholder-slate-600 outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Verify Password</label>
                          <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm password"
                            className="w-full px-3 py-1.5 bg-[#07070d] border border-white/5 focus:border-indigo-500/40 rounded-xl text-xs text-white placeholder-slate-600 outline-none transition-all"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingPassword}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/70 text-white rounded-xl text-[10px] font-extrabold transition-all shadow-md cursor-pointer active:scale-95 uppercase tracking-wider mt-1 flex items-center justify-center gap-2"
                      >
                        {isSubmittingPassword ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>Update Credentials</span>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Achievements */}
              <div className="p-6 glass-card rounded-2xl border border-white/5 shadow-md">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-2">
                  <Trophy className="h-4.5 w-4.5 text-amber-400" />
                  <span>My Achievements</span>
                </h3>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {user.achievements && user.achievements.length > 0 ? (
                    user.achievements.map((ach, idx) => (
                      <div key={idx} className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center space-x-3 hover:bg-white/[0.08] transition-colors">
                        <span className="text-lg">🏆</span>
                        <div>
                          <h4 className="text-xs font-bold text-white">{ach}</h4>
                          <p className="text-[9px] text-slate-500">Unlocked during platform use</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">No achievements unlocked yet.</p>
                  )}
                </div>
              </div>

              {/* Notifications panel */}
              <div className="p-6 glass-card rounded-2xl border border-white/5 shadow-md">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-2">
                  <Bell className="h-4.5 w-4.5 text-cyan-400" />
                  <span>System Activity Log</span>
                </h3>
                <div className="space-y-4 max-h-[240px] overflow-y-auto pr-1">
                  {notifications.map((n) => (
                    <div key={n.id} className="flex items-start space-x-3 text-xs border-b border-white/5 pb-3 last:border-0 last:pb-0">
                      <div className="p-1 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-300 leading-normal font-sans text-xs">{n.text}</p>
                        <span className="text-[10px] text-slate-500 mt-1 block font-mono">{n.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              </div>
            </div>
          </div>
        )}

        {/* PROJECT DASHBOARD FOOTER */}
        <footer className="mt-8 sm:mt-10 py-5 sm:py-6 px-4 sm:px-6 border-t border-white/10 rounded-2xl glass-panel bg-[#080811]/90 backdrop-blur-xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

          {/* Clean Footer Grid */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 relative z-10 text-center md:text-left">
            {/* Brand & Platform Info - Side Adjusted for PC & Landscape */}
            <div className="space-y-1 sm:space-y-1.5 flex flex-col items-center md:items-start">
              <div className="flex items-center space-x-2.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center text-white font-bold text-[10px] shadow-sm shadow-indigo-500/20">
                  ⚡
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  CodeSyne IDE <span className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono font-normal">v3.4.0</span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 font-sans max-w-sm">
                Cloud Development Environment & Web Sandbox
              </p>
            </div>

            {/* Status Badges */}
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Database Synced
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-medium">
                ⚡ Latency &lt; 12ms
              </span>
            </div>
          </div>

          {/* Bottom Copyright Bar */}
          <div className="mt-4 pt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-500 relative z-10">
            <span>© 2026 CodeSyne IDE. All rights reserved.</span>
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-slate-400">Developer: <strong className="text-white">@{user.username}</strong></span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="text-emerald-400 font-medium">Session Active</span>
            </div>
          </div>
        </footer>

        {/* Thin sleek bottom accent buffer bar to ensure footer card is never cut off */}
        <div className="pt-3 pb-8 flex items-center justify-center">
          <div className="w-16 sm:w-28 h-[2px] rounded-full bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        </div>

      </div>

      {/* MODAL: CREATE PROJECT */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#0a0a0f]/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl relative accent-glow-indigo"
          >
            <div className="flex items-center space-x-2">
              <button 
                type="button" 
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer mr-1"
                title="Go Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h3 className="text-lg font-bold text-white tracking-tight">Create Workspace</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 ml-9">Spin up an instant cloud workspace environment.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Title</label>
                <input
                  type="text"
                  placeholder="e.g. My Next API Service"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-xs placeholder-slate-500 outline-none transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brief Description</label>
                <textarea
                  placeholder="Optional notes..."
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-xs placeholder-slate-500 outline-none transition-all h-20 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stack Template</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                  {[
                    { value: 'web', label: 'HTML/CSS/JS', icon: '🌐' },
                    { value: 'javascript', label: 'NodeJS Script', icon: '⚡' },
                    { value: 'typescript', label: 'TypeScript', icon: '🦕' },
                    { value: 'python', label: 'Python Script', icon: '🐍' },
                    { value: 'java', label: 'Java', icon: '☕' },
                    { value: 'c', label: 'C Compiler', icon: '💎' },
                    { value: 'cpp', label: 'C++', icon: '🚀' },
                    { value: 'golang', label: 'Go Lang', icon: '🐹' },
                    { value: 'rust', label: 'Rust', icon: '🦀' },
                    { value: 'php', label: 'PHP Script', icon: '🐘' },
                    { value: 'swift', label: 'Swift App', icon: '🦅' },
                    { value: 'kotlin', label: 'Kotlin Script', icon: '💜' },
                    { value: 'ruby', label: 'Ruby Script', icon: '💎' },
                    { value: 'csharp', label: 'C# / .NET', icon: '🎯' },
                    { value: 'dart', label: 'Dart Lang', icon: '🎯' },
                    { value: 'scala', label: 'Scala App', icon: '🔴' },
                    { value: 'r', label: 'R Script', icon: '📊' }
                  ].map((tpl) => (
                    <button
                      key={tpl.value}
                      type="button"
                      onClick={() => setNewProjType(tpl.value as ProjectType)}
                      className={`p-3 rounded-xl text-left border flex items-center space-x-2 transition-all cursor-pointer ${
                        newProjType === tpl.value 
                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300 font-semibold' 
                          : 'border-white/5 bg-white/5 text-slate-400 hover:border-white/10'
                      }`}
                    >
                      <span className="text-sm shrink-0">{tpl.icon}</span>
                      <span className="text-[11px] truncate">{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 glass-panel glass-panel-hover rounded-lg text-xs text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white font-bold rounded-lg text-xs shadow-md shadow-indigo-500/15 hover:scale-105 transition-all cursor-pointer"
                >
                  Launch Workspace
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}



      {/* MODAL: SHARE */}
      {showShareModal && selectedShareProj && (
        <div className="fixed inset-0 bg-[#0a0a0f]/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl relative accent-glow-indigo"
          >
            <div className="flex items-center space-x-2">
              <button 
                type="button" 
                onClick={() => { setShowShareModal(false); setSelectedShareProj(null); }}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer mr-1"
                title="Go Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <Share2 className="h-5 w-5 text-indigo-400" />
                <span>Share Project Workspace</span>
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">Share this project link with developers. Unauthenticated users will be prompted to log in/sign up and the project will automatically import into their account.</p>

            <div className="mt-5 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
              <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">Shareable Project Link</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/?share=${selectedShareProj.id}`}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300 select-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/?share=${selectedShareProj.id}`;
                    navigator.clipboard.writeText(shareUrl);
                    onShowToast('Link Copied! 🔗', 'Share link copied to clipboard. Anyone with this link can open and import this project.', 'success');
                  }}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center space-x-1 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
              <span className="relative bg-[#0d0d16] px-2 text-[10px] uppercase font-bold text-slate-500">Or Invite via Email</span>
            </div>

            <form onSubmit={handleShareSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Colleague Email</label>
                <input
                  type="email"
                  placeholder="colleague@example.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-xs placeholder-slate-500 outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowShareModal(false); setSelectedShareProj(null); }}
                  className="px-4 py-2 glass-panel glass-panel-hover rounded-lg text-xs text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow-md shadow-indigo-500/15"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Permissions Modal Dialog */}
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={handleClosePermissionModal}
      />

    </div>
  );
}

