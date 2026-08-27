import React from 'react';
import { History, Calendar, RefreshCw, Plus, CheckCircle, Clock, Smartphone, Monitor, FileCode, User, Eye } from 'lucide-react';
import { VersionSnapshot, FileSystemState, FileAccessLog } from '@shared/types';

interface VersionToolsProps {
  snapshots: VersionSnapshot[];
  fileAccessLogs?: FileAccessLog[];
  onTakeSnapshot: (description: string) => void;
  onRestoreSnapshot: (snapshot: VersionSnapshot) => void;
  onSelectFile?: (fileId: string) => void;
}

export default function VersionTools({
  snapshots,
  fileAccessLogs = [],
  onTakeSnapshot,
  onRestoreSnapshot,
  onSelectFile
}: VersionToolsProps) {
  
  const [activeSubTab, setActiveSubTab] = React.useState<'snapshots' | 'history'>('history');
  const [descInput, setDescInput] = React.useState('');

  const handleCapture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descInput.trim()) return;
    onTakeSnapshot(descInput);
    setDescInput('');
  };

  const formatRelativeTime = (dateVal: string | Date) => {
    if (!dateVal) return 'Just now';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Just now';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 30) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div id="version_tools_panel" className="h-full flex flex-col justify-between bg-transparent text-slate-300 select-none">
      <div className="p-4 space-y-4">
        
        {/* Header Navigation Tabs */}
        <div className="flex items-center space-x-1 p-1 bg-[#0f111a] border border-white/5 rounded-xl">
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>File Access ({fileAccessLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('snapshots')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeSubTab === 'snapshots'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Snapshots ({snapshots.length})</span>
          </button>
        </div>

        {activeSubTab === 'history' ? (
          /* Live Cross-Device File Access Logs */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                <Clock className="h-3.5 w-3.5 text-indigo-400" />
                <span>Cross-Device Open History</span>
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
                DB Synced
              </span>
            </div>

            {fileAccessLogs.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-white/10 rounded-xl bg-white/5 text-slate-400 text-xs space-y-2">
                <Smartphone className="h-6 w-6 text-slate-500 mx-auto animate-pulse" />
                <p>No file access events recorded yet.</p>
                <p className="text-[10px] text-slate-500">Open any file on mobile or desktop to test cross-device tracking!</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                {fileAccessLogs.map((log) => {
                  const isMobile = log.device && log.device.toLowerCase() === 'mobile';
                  return (
                    <div
                      key={log.id}
                      onClick={() => log.fileId && onSelectFile && onSelectFile(log.fileId)}
                      className="p-2.5 bg-[#0d0e17] hover:bg-[#151726] border border-white/5 hover:border-indigo-500/30 rounded-xl text-left transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                          <FileCode className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                          <span className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                            {log.fileName}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 font-semibold flex-shrink-0 ml-2 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          {formatRelativeTime(log.openedAt)}
                        </span>
                      </div>

                      {log.filePath && (
                        <div className="text-[10px] text-slate-500 truncate mt-1 font-mono">
                          {log.filePath}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5 text-[10px] text-slate-400">
                        <span className="flex items-center space-x-1">
                          <User className="h-3 w-3 text-slate-500" />
                          <span className="font-medium text-slate-300">{log.username || log.userEmail}</span>
                        </span>

                        <span className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          isMobile
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {isMobile ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                          <span>{log.device || 'Desktop'}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Snapshot Management */
          <div className="space-y-4">
            {/* Capture Snapshot Form */}
            <form onSubmit={handleCapture} className="space-y-2">
              <input
                type="text"
                placeholder="Label this snapshot (e.g. before API integration)..."
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
                className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                required
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                <Plus className="h-4 w-4" />
                <span>Create Sandbox Snapshot</span>
              </button>
            </form>

            {/* Timeline List */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>Restore Timeline Snapshots ({snapshots.length})</span>
              </span>

              {snapshots.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-xl bg-white/5 text-slate-500 text-xs">
                  No historical file tree snapshots captured.
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[300px] md:max-h-[calc(100vh-250px)] pr-1">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="p-3 bg-[#0a0a0f]/30 border border-white/5 rounded-xl text-left relative flex flex-col justify-between shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(snap.timestamp).toLocaleDateString()}</span>
                        </span>
                        <span>{new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-200 mt-1 leading-normal">
                        {snap.description}
                      </h4>

                      <div className="flex items-center justify-between mt-4 pt-2 border-t border-white/5">
                        <span className="text-[9px] text-slate-500">
                          Files count: {Object.keys(snap.fileSystem).length - 1} items
                        </span>
                        <button
                          onClick={() => onRestoreSnapshot(snap)}
                          className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded hover:scale-105 transition-all cursor-pointer shadow-sm shadow-indigo-600/10"
                        >
                          Restore Trees
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      <div className="p-4 border-t border-white/5 text-[10px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <CheckCircle className="h-3.5 w-3.5 text-indigo-400" />
          <span>Database persistence active</span>
        </div>
      </div>
    </div>
  );
}
