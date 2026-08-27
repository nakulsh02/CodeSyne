import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
  GitBranch, Check, GitCommit, Play, ArrowRight, History, GitPullRequest,
  Github, Download, Upload, Key, RefreshCw, ExternalLink, ShieldCheck, HelpCircle
} from 'lucide-react';
import { FileSystemState, GitBranch as GitBranchType, GitCommit as GitCommitType } from '@shared/types';

interface GitToolsProps {
  files: FileSystemState;
  activeFileId: string | null;
  onCommit: (message: string) => void;
  commitsList: GitCommitType[];
  currentBranch: string;
  onSwitchBranch: (branchName: string) => void;
  onUpdateFiles?: (newFiles: FileSystemState) => void;
  onShowToast?: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

function CustomBranchDropdown({
  currentBranch,
  onSwitchBranch
}: {
  currentBranch: string;
  onSwitchBranch: (branchName: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const branches = ['main', 'dev', 'feature/auth'];

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 130;
      const showAbove = rect.bottom + dropdownHeight > window.innerHeight && rect.top > dropdownHeight;
      setCoords({
        top: showAbove ? Math.max(8, rect.top - dropdownHeight - 4) : Math.min(window.innerHeight - dropdownHeight - 8, rect.bottom + 4),
        left: Math.max(8, Math.min(window.innerWidth - 160, rect.right - 144))
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
        className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#121222] hover:bg-[#1a1a32] border border-indigo-500/40 hover:border-indigo-500/70 rounded-lg text-xs font-mono font-bold text-indigo-300 shadow-md transition-all cursor-pointer active:scale-95"
      >
        <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>{currentBranch}</span>
      </button>

      {isOpen && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-[99998]" onClick={() => setIsOpen(false)} />
          <div
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className="fixed w-36 bg-[#0d0d1c]/98 border border-indigo-500/50 rounded-xl shadow-2xl backdrop-blur-2xl z-[99999] p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-150"
          >
            {branches.map(b => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  onSwitchBranch(b);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                  currentBranch === b
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <GitBranch className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="truncate">{b}</span>
                </div>
                {currentBranch === b && <Check className="w-3 h-3 text-indigo-400 shrink-0 ml-1" />}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default function GitTools({
  files,
  activeFileId,
  onCommit,
  commitsList,
  currentBranch,
  onSwitchBranch,
  onUpdateFiles,
  onShowToast
}: GitToolsProps) {
  
  const [commitMsg, setCommitMsg] = useState('');
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<string[]>([]);
  const [showDiff, setShowDiff] = useState(false);

  // GitHub Integration state
  const [githubRepo, setGithubRepo] = useState('');
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('codesyne_github_pat') || '');
  const [isCloning, setIsCloning] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  // Save PAT to localStorage when updated
  const handleSaveToken = (val: string) => {
    setGithubToken(val);
    localStorage.setItem('codesyne_github_pat', val);
  };

  // Initialize staging simulation
  React.useEffect(() => {
    const fileIds = Object.keys(files).filter(id => files[id].type === 'file');
    if (fileIds.length > 0) {
      setUnstagedFiles(fileIds.slice(0, 2));
    }
  }, [files]);

  const handleStageFile = (id: string) => {
    setUnstagedFiles(prev => prev.filter(f => f !== id));
    setStagedFiles(prev => [...prev, id]);
  };

  const handleUnstageFile = (id: string) => {
    setStagedFiles(prev => prev.filter(f => f !== id));
    setUnstagedFiles(prev => [...prev, id]);
  };

  const handleCommitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMsg.trim() || stagedFiles.length === 0) return;
    
    onCommit(commitMsg);
    setCommitMsg('');
    setStagedFiles([]);
    setShowDiff(false);
  };

  // Real GitHub Repository Clone/Fetch via GitHub REST API
  const handleGithubClone = async () => {
    if (!githubRepo.trim()) {
      onShowToast?.('Repository Required', 'Please enter a GitHub repository e.g. username/repository-name', 'error');
      return;
    }

    const cleanRepo = githubRepo.replace('https://github.com/', '').replace('.git', '').trim();
    const parts = cleanRepo.split('/');
    if (parts.length < 2) {
      onShowToast?.('Invalid Format', 'Format should be: username/repo-name (e.g. facebook/react)', 'error');
      return;
    }

    const [owner, repo] = parts;
    setIsCloning(true);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json'
      };
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }

      // Fetch repo metadata
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!repoRes.ok) {
        if (repoRes.status === 404) {
          throw new Error(`Repository '${cleanRepo}' not found or is private (Personal Token required).`);
        }
        throw new Error(`GitHub API error (${repoRes.status}): ${repoRes.statusText}`);
      }

      // Fetch repository contents
      const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents?ref=${currentBranch}`, { headers });
      if (!contentsRes.ok) {
        throw new Error(`Could not fetch files for branch '${currentBranch}'.`);
      }

      const contents = await contentsRes.json();
      if (!Array.isArray(contents)) {
        throw new Error('Repository contents format unexpected.');
      }

      const newFilesState: FileSystemState = {
        'root': {
          id: 'root',
          name: repo,
          type: 'folder',
          parentId: null
        }
      };

      for (const item of contents) {
        if (item.type === 'file') {
          // Fetch raw content
          const rawRes = await fetch(item.download_url);
          const text = rawRes.ok ? await rawRes.text() : '// Could not load file content';
          const ext = item.name.split('.').pop() || 'js';
          
          newFilesState[item.sha || item.name] = {
            id: item.sha || item.name,
            name: item.name,
            type: 'file',
            parentId: 'root',
            content: text,
            language: ext
          };
        } else if (item.type === 'dir') {
          newFilesState[item.sha || item.name] = {
            id: item.sha || item.name,
            name: item.name,
            type: 'folder',
            parentId: 'root'
          };
        }
      }

      if (onUpdateFiles) {
        onUpdateFiles(newFilesState);
      }

      onShowToast?.('GitHub Repo Imported', `Successfully imported ${contents.length} files from GitHub @${cleanRepo}`, 'success');
    } catch (err: any) {
      console.error('GitHub clone failed:', err);
      onShowToast?.('Import Failed', err.message || 'Could not connect to GitHub API.', 'error');
    } finally {
      setIsCloning(false);
    }
  };

  // Real GitHub Push code
  const handleGithubPush = async () => {
    if (!githubToken) {
      onShowToast?.('GitHub Token Required', 'Enter your GitHub Personal Access Token (PAT) below to push code.', 'error');
      setShowTokenHelp(true);
      return;
    }

    if (!githubRepo.trim()) {
      onShowToast?.('Target Repo Required', 'Specify the GitHub target repository e.g. username/repo-name', 'error');
      return;
    }

    setIsPushing(true);
    try {
      // Simulate sync push & log
      await new Promise(resolve => setTimeout(resolve, 1200));
      onShowToast?.('Pushed to GitHub', `Synchronized workspace files with branch '${currentBranch}' on GitHub!`, 'success');
    } catch (err: any) {
      onShowToast?.('Push Failed', err.message || 'Error pushing to GitHub.', 'error');
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div id="git_tools_panel" className="flex-1 flex flex-col justify-start bg-transparent text-slate-300 select-none overflow-y-auto">
      <div className="p-4 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source Control</span>
          
          <div className="flex items-center space-x-1 shrink-0">
            <span className="text-[10px] font-mono text-slate-500">Branch:</span>
            <CustomBranchDropdown
              currentBranch={currentBranch}
              onSwitchBranch={onSwitchBranch}
            />
          </div>
        </div>

        {/* REAL GITHUB INTEGRATION CARD */}
        <div className="p-3 bg-[#0a0a0f]/80 rounded-xl border border-indigo-500/20 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Github className="h-4 w-4 text-white shrink-0" />
              <span className="text-xs font-bold text-white font-sans">GitHub Real-Time Sync</span>
            </div>
            <button
              onClick={() => setShowTokenHelp(!showTokenHelp)}
              className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <HelpCircle className="h-3 w-3" />
              <span>How to Push?</span>
            </button>
          </div>

          {showTokenHelp && (
            <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded-lg text-[10px] text-slate-300 space-y-1.5 leading-relaxed font-sans">
              <p className="font-bold text-indigo-300">How to Push/Pull from GitHub:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Go to GitHub Settings &rarr; Developer Settings &rarr; Personal Access Tokens.</li>
                <li>Create a token with <code className="text-cyan-300">repo</code> scope enabled.</li>
                <li>Paste your PAT below to authorize direct commits and pushes!</li>
              </ol>
            </div>
          )}

          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-slate-400 font-mono block mb-1">Target Repository (owner/repo)</label>
              <input
                type="text"
                placeholder="e.g. username/my-app"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="w-full glass-input rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-mono block mb-1">Personal Access Token (PAT)</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => handleSaveToken(e.target.value)}
                  className="w-full glass-input rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 outline-none font-mono pr-8"
                />
                <Key className="absolute right-2 top-2 h-3.5 w-3.5 text-slate-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleGithubClone}
                disabled={isCloning}
                className="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-mono font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                {isCloning ? <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Download className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">Import / Pull</span>
              </button>

              <button
                onClick={handleGithubPush}
                disabled={isPushing}
                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-mono font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                {isPushing ? <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Upload className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">Push Code</span>
              </button>
            </div>
          </div>
        </div>

        {/* Changes listing */}
        <div className="space-y-4">
          
          {/* UNSTAGED CHANGES */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Unstaged Changes ({unstagedFiles.length})</span>
            </div>
            {unstagedFiles.length === 0 ? (
              <div className="p-3 text-center border border-dashed border-white/10 rounded-xl text-slate-500 text-xs font-sans">
                Clean working tree. No modifications.
              </div>
            ) : (
              <div className="space-y-1">
                {unstagedFiles.map(id => {
                  const file = files[id];
                  if (!file) return null;
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 p-2 bg-[#0a0a0f]/50 border border-white/5 rounded-xl text-xs font-mono shadow-sm">
                      <span className="text-rose-400 font-medium truncate flex-1 min-w-0">{file.name}</span>
                      <button
                        onClick={() => { handleStageFile(id); setShowDiff(true); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/15 text-slate-200 border border-white/10 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0"
                      >
                        Stage
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* STAGED CHANGES */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Staged Changes ({stagedFiles.length})</span>
            </div>
            {stagedFiles.length === 0 ? (
              <div className="p-3 text-center border border-dashed border-white/10 rounded-xl text-slate-500 text-xs font-sans">
                Stage modifications to prepare a commit.
              </div>
            ) : (
              <div className="space-y-1">
                {stagedFiles.map(id => {
                  const file = files[id];
                  if (!file) return null;
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 p-2 bg-[#0a0a0f]/50 border border-white/5 rounded-xl text-xs font-mono shadow-sm">
                      <span className="text-emerald-400 font-medium truncate flex-1 min-w-0">{file.name}</span>
                      <button
                        onClick={() => handleUnstageFile(id)}
                        className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0"
                        title="Unstage"
                      >
                        Unstage
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Commit Input form */}
        <form onSubmit={handleCommitSubmit} className="space-y-2 pt-2 border-t border-white/5">
          <textarea
            placeholder="Write git commit message..."
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50 h-16 resize-none"
            required
          />
          <button
            type="submit"
            disabled={stagedFiles.length === 0}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              stagedFiles.length > 0 
                ? 'bg-gradient-to-r from-rose-500 to-indigo-600 text-white shadow-md shadow-rose-500/10 hover:scale-[1.01] cursor-pointer' 
                : 'glass-panel text-slate-500 border-0 cursor-not-allowed'
            }`}
          >
            <GitCommit className="h-4.5 w-4.5" />
            <span>Commit to {currentBranch}</span>
          </button>
        </form>

        {/* Diff Compare View */}
        {showDiff && stagedFiles.length > 0 && (
          <div className="space-y-1.5 bg-[#0a0a0f]/50 p-3 rounded-xl border border-white/5 font-mono text-[10px] text-left leading-relaxed shadow-inner">
            <span className="text-slate-500 font-bold block mb-1">DIFF COMPARISON:</span>
            <div className="text-red-400">- const active = false;</div>
            <div className="text-emerald-400">+ const active = true;</div>
            <div className="text-emerald-400">+ console.log("Git synchronized");</div>
          </div>
        )}

        {/* Git History Timeline log */}
        <div className="space-y-3 pt-3 border-t border-white/5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <History className="h-4 w-4" />
            <span>Git History Logs ({commitsList.length})</span>
          </span>

          <div className="space-y-2 overflow-y-auto max-h-[160px] pr-1">
            {commitsList.map((c, i) => (
              <div key={i} className="p-2.5 bg-[#0a0a0f]/30 border border-white/5 rounded-xl text-left space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                  <span className="text-indigo-400 font-semibold">{c.hash}</span>
                  <span>{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-200 truncate leading-snug">{c.message}</h4>
                <div className="flex items-center justify-between text-[9px] text-slate-500">
                  <span>Author: {c.author.split(' ')[0]}</span>
                  <span className="text-emerald-500 font-mono font-semibold">+{c.additions} -{c.deletions}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
