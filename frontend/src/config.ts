// Global Production & Development Auto-detection Configuration

const backendUrlEnv = (import.meta as any).env?.VITE_BACKEND_URL || '';

export const API_BASE_URL = (() => {
  // 1. Prioritize user custom local storage override if configured in Settings
  if (typeof window !== 'undefined') {
    const customOverride = localStorage.getItem('codesyne_backend_url');
    if (customOverride) {
      let url = customOverride.trim();
      return url.endsWith('/') ? url.slice(0, -1) : url;
    }
  }

  // 2. If an explicit backend URL is provided in the environment variables, use it
  if (backendUrlEnv) {
    let url = backendUrlEnv.endsWith('/') ? backendUrlEnv.slice(0, -1) : backendUrlEnv;
    // Auto-upgrade to secure HTTPS connection if frontend is secure and we point to non-localhost (e.g. Render/other endpoints)
    // This blocks Mixed Content errors in the user's deployed app.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        url = url.replace('http:', 'https:');
      }
    }
    return url;
  }

  // Detect environment in browser
  if (typeof window !== 'undefined') {
    const { hostname, protocol, port } = window.location;
    
    // Check if we are running locally (on localhost or 127.0.0.1)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // If frontend is running on 5173 (Vite standalone development),
      // the backend is running on 5000 as requested.
      if (port === '5173') {
        return 'http://localhost:5000';
      }
      // If running on any other port locally (e.g. 3000 in unified full-stack), use the current host
      return `${protocol}//${hostname}:${port}`;
    }

    // Direct production Vercel-to-Render backend resolution to bypass Vercel 15s proxy timeout
    if (hostname.includes('vercel.app')) {
      return backendUrlEnv || 'https://codesyne.onrender.com';
    }

    // In AI Studio workspace dev or share previews (e.g. *.run.app), we must use relative paths
    if (hostname.includes('.run.app') || hostname.includes('aistudio')) {
      return '';
    }

    // Default to relative path for unified hosting (e.g. Render serving static files)
    return '';
  }

  return '';
})();

import { getDeviceInfo } from './utils/deviceDetector';

export function getWebSocketUrl(projectId: string, user?: { id?: string; username?: string; avatar?: string; email?: string }, connectionId?: string): string {
  const userId = encodeURIComponent(user?.id || user?.email || ('user_' + Math.random().toString(36).substring(2, 8)));
  const username = encodeURIComponent(user?.username || 'Collaborator');
  const avatar = encodeURIComponent(user?.avatar || '');
  const connId = encodeURIComponent(connectionId || ('conn_' + Math.random().toString(36).substring(2, 8)));
  const deviceInfo = getDeviceInfo();
  const device = encodeURIComponent(deviceInfo.label);
  const os = encodeURIComponent(deviceInfo.os);
  const browser = encodeURIComponent(deviceInfo.browser);

  const queryParams = `projectId=${projectId}&userId=${userId}&username=${username}&name=${username}&avatar=${avatar}&connectionId=${connId}&device=${device}&os=${os}&browser=${browser}`;

  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return `wss://codesyne.onrender.com/ws?${queryParams}`;
  }
  if (API_BASE_URL) {
    // Replace http/https with ws/wss for the backend server URL
    const wsBase = API_BASE_URL.replace(/^http/, 'ws');
    return `${wsBase}/ws?${queryParams}`;
  }
  // Standard relative websocket path
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws?${queryParams}`;
}
