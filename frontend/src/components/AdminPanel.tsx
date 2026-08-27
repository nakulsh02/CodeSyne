import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Users, Shield, Cpu, Database, Activity, RefreshCw, 
  Trash2, ShieldAlert, CheckCircle, Search, Terminal,
  Sliders, Server, AlertTriangle, KeyRound
} from 'lucide-react';
import { UserProfile, getSecureAvatarUrl } from '@shared/types';

interface AdminPanelProps {
  currentUser: UserProfile;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

interface MockUser {
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
}

interface AuditLog {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  status: 'success' | 'warning' | 'info';
}

export default function AdminPanel({ currentUser, onShowToast }: AdminPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Mock users database
  const [users, setUsers] = useState<MockUser[]>([
    {
      id: 'u_1',
      username: 'nakulsharma',
      email: 'nakulsharma02011@gmail.com',
      avatar: getSecureAvatarUrl('nakulsharma02011@gmail.com', 'nakulsharma'),
      role: 'admin',
      status: 'active',
      lastAction: 'Accessed Admin Dashboard',
      activeProjects: 5,
      cpuUsage: 1.2,
      memoryUsage: 35.4
    },
    {
      id: 'u_2',
      username: 'sarah_connor',
      email: 'sarah@codesyne.dev',
      avatar: getSecureAvatarUrl('sarah@codesyne.dev', 'sarah_connor'),
      role: 'user',
      status: 'active',
      lastAction: 'Compiled server.ts sandbox',
      activeProjects: 3,
      cpuUsage: 12.5,
      memoryUsage: 88.2
    },
    {
      id: 'u_3',
      username: 'david_architect',
      email: 'david@codesyne.dev',
      avatar: getSecureAvatarUrl('david@codesyne.dev', 'david_architect'),
      role: 'user',
      status: 'active',
      lastAction: 'Pushed master branch staging',
      activeProjects: 4,
      cpuUsage: 4.8,
      memoryUsage: 45.1
    },
    {
      id: 'u_4',
      username: 'alice_mit',
      email: 'alice@codesyne.dev',
      avatar: getSecureAvatarUrl('alice@codesyne.dev', 'alice_mit'),
      role: 'user',
      status: 'active',
      lastAction: 'Executed python main.py',
      activeProjects: 1,
      cpuUsage: 0.0,
      memoryUsage: 12.8
    },
    {
      id: 'u_5',
      username: 'bob_chen',
      email: 'bob@codesyne.dev',
      avatar: getSecureAvatarUrl('bob@codesyne.dev', 'bob_chen'),
      role: 'user',
      status: 'suspended',
      lastAction: 'Triggered excessive rate-limits',
      activeProjects: 2,
      cpuUsage: 0.0,
      memoryUsage: 0.0
    }
  ]);

  // Audit Logs database
  const [logs, setLogs] = useState<AuditLog[]>([
    { id: 'log_1', timestamp: '2 mins ago', userEmail: 'nakulsharma02011@gmail.com', action: 'Compiled Node.js sandbox entrypoint', status: 'success' },
    { id: 'log_2', timestamp: '8 mins ago', userEmail: 'nakulsharma02011@gmail.com', action: 'Failed authentication rate limit rules', status: 'warning' },
    { id: 'log_3', timestamp: '15 mins ago', userEmail: 'nakulsharma02011@gmail.com', action: 'Authenticated Executive Admin role', status: 'info' },
    { id: 'log_4', timestamp: '1 hour ago', userEmail: 'nakulsharma02011@gmail.com', action: 'Cloned git repository https://github.com/codesyne-dev/calculator', status: 'success' },
    { id: 'log_5', timestamp: '2 hours ago', userEmail: 'nakulsharma02011@gmail.com', action: 'Created project Python Data Analyzer', status: 'success' },
    { id: 'log_6', timestamp: '4 hours ago', userEmail: 'nakulsharma02011@gmail.com', action: 'Collaborative WebSocket session closed (stale client)', status: 'info' }
  ]);

  // System status states
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [turboMode, setTurboMode] = useState(true);
  const [isGCRunning, setIsGCRunning] = useState(false);

  const handleToggleMaintenance = () => {
    setMaintenanceMode(!maintenanceMode);
    onShowToast(
      maintenanceMode ? 'System Live' : 'System Locked',
      maintenanceMode ? 'Codesyne public workspaces are now fully accessible.' : 'Maintenance mode enabled. Only admins can access IDE environments.',
      maintenanceMode ? 'success' : 'info'
    );
    
    // Add log
    const newLog: AuditLog = {
      id: 'log_' + Math.random(),
      timestamp: 'Just Now',
      userEmail: currentUser.email,
      action: `Toggled System Maintenance Mode: ${!maintenanceMode ? 'ON' : 'OFF'}`,
      status: !maintenanceMode ? 'warning' : 'success'
    };
    setLogs([newLog, ...logs]);
  };

  const handleToggleTurbo = () => {
    setTurboMode(!turboMode);
    onShowToast(
      'Performance Adjusted',
      turboMode ? 'Standard mode configured. Nodes scaled back.' : 'Turbo Mode enabled! Containers assigned maximum memory caps.',
      'success'
    );
  };

  const handleRunGC = () => {
    setIsGCRunning(true);
    setTimeout(() => {
      setIsGCRunning(false);
      onShowToast(
        'Garbage Collector Complete',
        'Purged 1,420 unreferenced block chunks. Cleaned up 42.8MB cache directories.',
        'success'
      );
      
      const newLog: AuditLog = {
        id: 'log_' + Math.random(),
        timestamp: 'Just Now',
        userEmail: currentUser.email,
        action: 'Triggered global garbage collection process',
        status: 'success'
      };
      setLogs([newLog, ...logs]);
    }, 1500);
  };

  const handleToggleUserStatus = (userId: string) => {
    setUsers(users.map(u => {
      if (u.id === userId) {
        const nextStatus = u.status === 'active' ? 'suspended' : 'active';
        onShowToast(
          'User Status Modified',
          `User ${u.username} is now ${nextStatus}.`,
          nextStatus === 'suspended' ? 'error' : 'success'
        );
        return { ...u, status: nextStatus };
      }
      return u;
    }));
  };

  const handleRevokeToken = (username: string) => {
    onShowToast(
      'Session Terminated',
      `Revoked JWT session tokens and cleared persistent websockets for @${username}.`,
      'info'
    );
  };

  const handlePromoteAdmin = (userId: string) => {
    setUsers(users.map(u => {
      if (u.id === userId) {
        onShowToast('Role Promoted', `Promoted ${u.username} to Platform Administrator.`, 'success');
        return { ...u, role: 'admin' };
      }
      return u;
    }));
  };

  const filteredUsers = users.filter(u => 
    (u.username || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
    (u.email || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* ADMIN CONTROLS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Memory/CPU Status */}
        <div className="p-5 rounded-2xl glass-card relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider">Cloud Engine Core</span>
            <Server className="h-4.5 w-4.5 text-cyan-400" />
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-medium">
                <span className="text-slate-400">Memory Cap (Global Nodes)</span>
                <span className="text-cyan-400 font-mono">1.84 GB / 4.00 GB (46%)</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full transition-all duration-500" style={{ width: '46%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-medium">
                <span className="text-slate-400">CPU Usage Capacity</span>
                <span className="text-indigo-400 font-mono">18.2% (Node-Standard-4)</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: '18.2%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="p-5 rounded-2xl glass-card">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider">System Toggles</span>
            <Sliders className="h-4.5 w-4.5 text-fuchsia-400" />
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white">Maintenance Mode</h4>
                <p className="text-[10px] text-slate-500">Block public workspaces</p>
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
                <p className="text-[10px] text-slate-500">Assign priority CPU cores</p>
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

        {/* Maintenance Actions */}
        <div className="p-5 rounded-2xl glass-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider">Admin Utilities</span>
              <Cpu className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Force trigger low-level garbage collection to sweep inactive sandbox directories and recycle stale container sessions.
            </p>
          </div>
          
          <button
            onClick={handleRunGC}
            disabled={isGCRunning}
            className="w-full mt-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 text-purple-400 ${isGCRunning ? 'animate-spin' : ''}`} />
            <span>{isGCRunning ? 'Sweeping Blocks...' : 'Run Garbage Collector'}</span>
          </button>
        </div>
      </div>

      {/* DETAILED USER DIRECTORY */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-cyan-500/10 rounded-xl">
              <Users className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Active Container User Directory</h3>
              <p className="text-[11px] text-slate-500">View registered node profiles and execute direct administrator interventions.</p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search user email or profile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/40 text-slate-400 font-bold tracking-wider border-b border-white/5 text-[10px] uppercase font-mono">
                <th className="p-4">Developer</th>
                <th className="p-4">Authorization</th>
                <th className="p-4">Projects</th>
                <th className="p-4">Sandbox Stats</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/10">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-4 flex items-center space-x-3">
                    <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-xl object-cover border border-slate-800" />
                    <div>
                      <h4 className="font-bold text-white text-xs">@{u.username}</h4>
                      <p className="text-[10px] text-slate-500 font-sans">{u.email}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider ${
                      u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-white/5'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 font-mono font-bold text-slate-300">
                    {u.activeProjects} active
                  </td>
                  <td className="p-4">
                    <div className="flex items-center space-x-4">
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-mono">CPU</span>
                        <span className="font-mono text-slate-300 font-bold">{u.cpuUsage}%</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-mono">RAM</span>
                        <span className="font-mono text-slate-300 font-bold">{u.memoryUsage}MB</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                      u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span>{u.status}</span>
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handlePromoteAdmin(u.id)}
                        className="px-2 py-1 bg-indigo-600/10 hover:bg-indigo-600 hover:text-white text-indigo-400 border border-indigo-500/20 rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                        title="Promote to admin"
                      >
                        Promote
                      </button>
                    )}
                    <button
                      onClick={() => handleRevokeToken(u.username)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                      title="Clear session variables"
                    >
                      Revoke JWT
                    </button>
                    {u.email !== 'nakulsharma02011@gmail.com' && (
                      <button
                        onClick={() => handleToggleUserStatus(u.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          u.status === 'active' 
                            ? 'bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-400 border border-rose-500/20' 
                            : 'bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {u.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SYSTEM ACTIONS & AUDIT STREAM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Live Audit Log Stream */}
        <div className="md:col-span-2 glass-panel rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/5 bg-slate-950/20 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Activity className="h-4.5 w-4.5 text-rose-400 animate-pulse" />
              <span>Real-Time Audit & Activity Log Stream</span>
            </h3>
            <span className="text-[9px] text-slate-500 font-mono">LIVE FEED ON PORT 3000</span>
          </div>

          <div className="p-4 space-y-3 max-h-[250px] overflow-y-auto font-mono text-[11px] scrollbar-hide">
            {logs.map((log) => (
              <div key={log.id} className="p-2.5 bg-slate-950/40 border border-white/5 rounded-xl flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-indigo-400 font-semibold">@{log.userEmail.split('@')[0]}</span>
                  <span className="text-slate-500 mx-1.5">›</span>
                  <span className="text-slate-300">{log.action}</span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[10px] text-slate-500">{log.timestamp}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    log.status === 'success' ? 'bg-emerald-400' :
                    log.status === 'warning' ? 'bg-amber-400 animate-ping' :
                    'bg-cyan-400'
                  }`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Server Specs Details */}
        <div className="glass-panel rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-2">
              <KeyRound className="h-4 w-4 text-cyan-400" />
              <span>Secure Environment Keys</span>
            </h3>

            <div className="space-y-3 text-[11px] leading-relaxed">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Deployment Config</span>
                <span className="text-emerald-400 font-bold font-mono">PROD-ACTIVE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Multi-Cloud Target</span>
                <span className="text-indigo-400 font-mono">Render & Vercel</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Session Security</span>
                <span className="text-slate-300 font-mono">Local JWT persistent</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Container Isolations</span>
                <span className="text-purple-400 font-semibold">Docker sandboxed</span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-4">
            <span className="text-[10px] text-amber-500 font-semibold flex items-center space-x-1">
              <AlertTriangle className="h-3 w-3" />
              <span>Executive admin commands enabled.</span>
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
