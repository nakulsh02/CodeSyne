import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Trash2, Play, Cpu, Zap, Copy, Check, Square, Globe, Send, Plus, X } from 'lucide-react';
import { ExecutionResult, FileSystemState } from '@shared/types';
import { simulateCodeExecutionClient, hasInteractiveStdin } from '../../utils/codeSimulator';
import { safeFetch } from '../../api';

export interface TerminalLine {
  text: string;
  type: 'prompt' | 'input' | 'error' | 'success' | 'info' | 'system' | 'default' | 'help';
  promptPrefix?: string;
  helpCmd?: string;
  helpDesc?: string;
}

interface TerminalPanelProps {
  execution: ExecutionResult | null;
  onClearOutput: () => void;
  onRunActiveFile: () => void;
  onStopExecution?: () => void;
  activeFileName: string;
  files: FileSystemState;
  isRunning?: boolean;
  terminalHistory: TerminalLine[];
  setTerminalHistory: React.Dispatch<React.SetStateAction<TerminalLine[]>>;
  projectId?: string;
  onOpenWebPreview?: () => void;
  isPreviewVisible?: boolean;
  isWaitingForInput?: boolean;
  setIsWaitingForInput?: React.Dispatch<React.SetStateAction<boolean>>;
  activeStdinResolverRef?: React.MutableRefObject<((input: string) => void) | null>;
  onSendTerminalCommand?: (command: string) => void;
  userRole?: 'Owner' | 'Editor' | 'Viewer';
  collaborators?: any[];
}

export default function TerminalPanel({
  execution,
  onClearOutput,
  onRunActiveFile,
  onStopExecution,
  activeFileName,
  files,
  isRunning = false,
  terminalHistory,
  setTerminalHistory,
  projectId,
  onOpenWebPreview,
  isPreviewVisible,
  isWaitingForInput: isWaitingProp,
  setIsWaitingForInput: setIsWaitingProp,
  activeStdinResolverRef: parentResolverRef,
  onSendTerminalCommand,
  userRole = 'Editor',
  collaborators = []
}: TerminalPanelProps) {
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [tempInput, setTempInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Multiple terminal systems state
  const defaultBanner: TerminalLine[] = [
    { text: 'Codesyne Workspace Container (Linux x86_64)', type: 'system' },
    { text: 'Type "help" or "ls" to list files. Keyboard controls active.', type: 'info' }
  ];

  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([
    { id: 'term-1', name: 'bash' }
  ]);
  const [activeTermId, setActiveTermId] = useState<string>('term-1');

  // Independent state per terminal ID
  const [terminalHistories, setTerminalHistoriesState] = useState<Record<string, TerminalLine[]>>({
    'term-1': terminalHistory && terminalHistory.length > 0 ? terminalHistory : defaultBanner
  });
  const [terminalCommandHistories, setTerminalCommandHistories] = useState<Record<string, string[]>>({
    'term-1': []
  });
  const [terminalInputs, setTerminalInputs] = useState<Record<string, string>>({
    'term-1': ''
  });

  // Current active terminal state accessors
  const currentHistory = terminalHistories[activeTermId] || defaultBanner;
  const commandHistory = terminalCommandHistories[activeTermId] || [];
  const cliInput = terminalInputs[activeTermId] || '';

  const setCliInput = (val: string) => {
    setTerminalInputs(prev => ({ ...prev, [activeTermId]: val }));
  };

  const setCommandHistory = (updater: string[] | ((prev: string[]) => string[])) => {
    setTerminalCommandHistories(prev => {
      const oldHist = prev[activeTermId] || [];
      const newHist = typeof updater === 'function' ? updater(oldHist) : updater;
      return { ...prev, [activeTermId]: newHist };
    });
  };

  const updateActiveTerminalHistory = (
    updater: TerminalLine[] | ((prev: TerminalLine[]) => TerminalLine[])
  ) => {
    setTerminalHistoriesState(prev => {
      const oldHist = prev[activeTermId] || defaultBanner;
      const newHist = typeof updater === 'function' ? updater(oldHist) : updater;
      if (setTerminalHistory) {
        setTerminalHistory(newHist);
      }
      return { ...prev, [activeTermId]: newHist };
    });
  };

  const addTerminal = () => {
    const nextNum = terminals.length + 1;
    const newId = `term-${Date.now()}`;
    const newTermName = nextNum === 2 ? 'node' : nextNum === 3 ? 'npm' : `bash (${nextNum})`;
    const newTerm = { id: newId, name: newTermName };

    setTerminals(prev => [...prev, newTerm]);
    setActiveTermId(newId);

    const initialLines: TerminalLine[] = [
      { text: `Codesyne Terminal Session [${newTermName}]`, type: 'system' },
      { text: `Independent environment active for ${newTermName}. Type "help" or "ls".`, type: 'info' }
    ];

    setTerminalHistoriesState(prev => ({ ...prev, [newId]: initialLines }));
    setTerminalCommandHistories(prev => ({ ...prev, [newId]: [] }));
    setTerminalInputs(prev => ({ ...prev, [newId]: '' }));
  };

  const closeTerminal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (terminals.length <= 1) return;
    const filtered = terminals.filter(t => t.id !== id);
    setTerminals(filtered);
    if (activeTermId === id) {
      setActiveTermId(filtered[filtered.length - 1].id);
    }
  };

  // STDIN interactive process state (local or passed from parent)
  const [localIsWaiting, setLocalIsWaiting] = useState(false);
  const isWaitingForInput = isWaitingProp !== undefined ? isWaitingProp : localIsWaiting;
  const setIsWaitingForInput = (val: boolean) => {
    setLocalIsWaiting(val);
    if (setIsWaitingProp) setIsWaitingProp(val);
  };

  const prevTerminalHistoryRef = useRef<TerminalLine[]>(terminalHistory);
  const prevActiveTermIdRef = useRef<string>(activeTermId);

  // Synchronize terminal history state safely on tab switch or when parent updates execution output
  useEffect(() => {
    // If active tab changed (tab switch)
    if (prevActiveTermIdRef.current !== activeTermId) {
      prevActiveTermIdRef.current = activeTermId;
      const targetHistory = terminalHistories[activeTermId] || defaultBanner;
      if (setTerminalHistory) {
        setTerminalHistory(targetHistory);
      }
      prevTerminalHistoryRef.current = targetHistory;
      return;
    }

    // If external execution appended new lines to parent terminalHistory prop while on current tab
    if (terminalHistory && terminalHistory !== prevTerminalHistoryRef.current) {
      prevTerminalHistoryRef.current = terminalHistory;
      setTerminalHistoriesState(prev => {
        if (prev[activeTermId] !== terminalHistory) {
          return { ...prev, [activeTermId]: terminalHistory };
        }
        return prev;
      });
    }
  }, [terminalHistory, activeTermId, terminalHistories, setTerminalHistory]);

  const [activeProgram, setActiveProgram] = useState<string | null>(null);
  const activeInputResolverRef = useRef<((input: string) => void) | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);

  const createStdinReader = (progName: string) => {
    return () => {
      setIsWaitingForInput(true);
      setActiveProgram(progName);
      // Ensure input field is focused for user input
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      return new Promise<string>((resolve) => {
        activeInputResolverRef.current = (userVal: string) => {
          setIsWaitingForInput(false);
          activeInputResolverRef.current = null;
          resolve(userVal);
        };
      });
    };
  };

  // Auto Scroll
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentHistory, isRunning]);

  // Focus terminal input on mount ONLY on desktop non-touch devices without scrolling
  useEffect(() => {
    const isTouchOrSmallDevice = window.innerWidth <= 1024 || 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    if (!isTouchOrSmallDevice && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, []);

  // Click terminal body to focus input (disabled on tablet/mobile touch devices to prevent keyboard popups unless tapping input directly)
  const handleTerminalClick = (e: React.MouseEvent) => {
    const isTouchOrSmallDevice = window.innerWidth <= 1024 || 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    if (isTouchOrSmallDevice) return;
    if (window.getSelection()?.toString()) return; // don't steal focus when selecting text
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;

      if (historyIndex === -1) {
        setTempInput(cliInput);
        const newIdx = commandHistory.length - 1;
        setHistoryIndex(newIdx);
        setCliInput(commandHistory[newIdx]);
      } else if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setCliInput(commandHistory[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;

      if (historyIndex === commandHistory.length - 1) {
        setHistoryIndex(-1);
        setCliInput(tempInput);
      } else {
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        setCliInput(commandHistory[newIdx]);
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      // SIGINT cancel current command or running program STDIN
      e.preventDefault();
      if (isWaitingForInput && activeInputResolverRef.current) {
        const resolver = activeInputResolverRef.current;
        activeInputResolverRef.current = null;
        setIsWaitingForInput(false);
        setActiveProgram(null);
        updateActiveTerminalHistory(prev => [
          ...prev,
          { text: cliInput + ' ^C', type: 'error' },
          { text: '[Process terminated by user (SIGINT)]', type: 'system' }
        ]);
        setCliInput('');
        resolver('');
        return;
      }
      updateActiveTerminalHistory(prev => [
        ...prev,
        { text: cliInput + ' ^C', type: 'prompt', promptPrefix: 'codesyne:~$ ' },
        { text: '', type: 'default' }
      ]);
      setCliInput('');
      setHistoryIndex(-1);
    } else if (e.key === 'l' && e.ctrlKey) {
      // Clear terminal history
      e.preventDefault();
      updateActiveTerminalHistory([{ text: 'Terminal cleared.', type: 'system' }, { text: '', type: 'default' }]);
      setCliInput('');
      setHistoryIndex(-1);
    }
  };

  const handleHelpClick = (rawCmd: string) => {
    let commandText = rawCmd;
    if (commandText.includes('<') && activeFileName) {
      commandText = commandText.replace(/<file(name)?>/gi, activeFileName);
    }
    if (commandText.includes('<')) {
      // Still has unresolved placeholder, put in input box for user to edit
      setCliInput(commandText);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    } else {
      executeCommand(commandText);
    }
  };

  const executeCommand = async (commandText: string) => {
    if (userRole === 'Viewer') {
      updateActiveTerminalHistory(prev => [
        ...prev,
        { text: commandText, type: 'prompt', promptPrefix: 'codesyne@sandbox:~$ ' },
        { text: '[PERMISSION DENIED]: Viewers cannot execute commands in the shared terminal.', type: 'error' }
      ]);
      setCliInput('');
      return;
    }

    const trimmed = commandText.trim();
    if (!trimmed) {
      updateActiveTerminalHistory(prev => [...prev, { text: '', type: 'prompt', promptPrefix: 'codesyne@sandbox:~$ ' }]);
      return;
    }

    // Broadcast terminal command to room collaborators
    if (onSendTerminalCommand) {
      onSendTerminalCommand(trimmed);
    }

    // Save history
    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);

    const parts = trimmed.split(' ');
    const baseCmd = parts[0].toLowerCase();
    const outputLines: TerminalLine[] = [];

    const runnerCmds = [
      'node', 'python', 'python3', 'go', 'golang', 'java', 'gcc', 'g++', 'rustc', 
      'ruby', 'php', 'swift', 'kotlin', 'kotlinc', 'dart', 'scala', 'rscript', 'run', 'exec'
    ];

    if (baseCmd === 'help') {
      const activeName = activeFileName || 'main.go';
      outputLines.push(
        { text: 'Codesyne Shell Command Matrix (Touch or click any command to execute):', type: 'info' },
        { text: 'ls -la', helpCmd: 'ls -la', helpDesc: 'List all files & details in workspace', type: 'help' },
        { text: `cat ${activeName}`, helpCmd: `cat ${activeName}`, helpDesc: 'Display file contents in terminal', type: 'help' },
        { text: 'clear', helpCmd: 'clear', helpDesc: 'Clear terminal logs buffer', type: 'help' },
        { text: 'git status', helpCmd: 'git status', helpDesc: 'Show working tree status & modified files', type: 'help' },
        { text: 'npm run build', helpCmd: 'npm run build', helpDesc: 'Compile and bundle production web assets', type: 'help' },
        { text: 'sysinfo', helpCmd: 'sysinfo', helpDesc: 'Display sandbox CPU, memory & kernel specs', type: 'help' },
        { text: `node ${activeName}`, helpCmd: `node ${activeName}`, helpDesc: 'Execute JavaScript or TypeScript script', type: 'help' },
        { text: `python ${activeName}`, helpCmd: `python ${activeName}`, helpDesc: 'Evaluate Python file in sandbox', type: 'help' },
        { text: `go run ${activeName}`, helpCmd: `go run ${activeName}`, helpDesc: 'Compile and execute Go program', type: 'help' }
      );
    } else if (baseCmd === 'clear') {
      updateActiveTerminalHistory([{ text: '', type: 'default' }]);
      setCliInput('');
      return;
    } else if (baseCmd === 'ls') {
      const showAll = parts.includes('-la') || parts.includes('-a');
      const rootFiles = Object.values(files).filter(f => f.name !== 'root' && f.parentId === 'root');
      
      if (rootFiles.length === 0) {
        outputLines.push({ text: 'total 0 (Empty project root)', type: 'system' });
      } else {
        if (showAll) {
          outputLines.push(
            { text: 'drwxr-xr-x  3 codesyne  staff   4096 Jul 10 01:48 .', type: 'info' },
            { text: 'drwxr-xr-x 12 codesyne  staff   4096 Jul 10 01:48 ..', type: 'info' }
          );
        }
        rootFiles.forEach(f => {
          const isDir = f.type === 'folder';
          const mode = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
          const size = isDir ? ' 4096' : ` ${f.content?.length || 0}`;
          const date = 'Jul 10 01:48';
          const type = isDir ? 'info' : f.name.endsWith('.html') ? 'success' : f.name.endsWith('.js') ? 'info' : 'default';
          outputLines.push({ text: `${mode}  1 codesyne  staff  ${size} ${date} ${f.name}`, type });
        });
      }
    } else if (baseCmd === 'cat') {
      const filename = parts[1];
      if (!filename) {
        outputLines.push({ text: 'cat: missing file argument. Usage: cat <filename>', type: 'error' });
      } else {
        const fileNode = Object.values(files).find(
          f => f.type === 'file' && f.parentId === 'root' && f.name.toLowerCase() === filename.toLowerCase()
        );
        if (fileNode) {
          outputLines.push({ text: fileNode.content || '// Empty file', type: 'success' });
        } else {
          outputLines.push({ text: `cat: ${filename}: No such file in workspace root directory.`, type: 'error' });
        }
      }
    } else if (baseCmd === 'git' && parts[1] === 'status') {
      outputLines.push(
        { text: 'On branch main', type: 'success' },
        { text: 'Your branch is up to date with "origin/main".', type: 'default' },
        { text: '', type: 'default' },
        { text: 'Changes not staged for commit:', type: 'default' },
        { text: '  (use "git add <file>..." to update what will be committed)', type: 'system' },
        { text: '  (use "git restore <file>..." to discard changes in working directory)', type: 'system' },
        { text: `\tmodified:   ${activeFileName || 'main.go'}`, type: 'error' },
        { text: '', type: 'default' },
        { text: 'no changes added to commit (use "git add" and/or "git commit -a")', type: 'default' }
      );
    } else if (trimmed === 'npm run build') {
      outputLines.push(
        { text: '> codesyne-app@1.0.0 build', type: 'info' },
        { text: '> vite build', type: 'info' },
        { text: 'transforming modules...', type: 'system' },
        { text: '✓ 142 modules transformed and fully linked.', type: 'success' },
        { text: 'dist/index.html                     0.85 kB │ gzip: 0.43 kB', type: 'success' },
        { text: 'dist/assets/index-D77c8e.js        142.10 kB │ gzip: 48.12 kB', type: 'success' },
        { text: 'dist/assets/index-C3e0b2.css        12.45 kB │ gzip: 3.10 kB', type: 'success' },
        { text: '✓ build completed in 1.25s.', type: 'success' }
      );
    } else if (baseCmd === 'sysinfo') {
      outputLines.push(
        { text: 'Codesyne Workspace Allocation Matrix:', type: 'info' },
        { text: '  Kernel Version : Linux 6.1.0-21-amd64 (Debian GNU/Linux)', type: 'success' },
        { text: '  Sandbox VCPU   : 2x AMD EPYC 7B12 @ 2.60GHz (Shared)', type: 'success' },
        { text: '  Heap Memory    : 1.84 GB / 2.00 GB Allocated (92%)', type: 'success' },
        { text: '  File Handles   : 1024 Max File Descriptors', type: 'success' }
      );
    } else if (runnerCmds.includes(baseCmd)) {
      let filename = parts[1];
      if (baseCmd === 'go' && parts[1] === 'run') {
        filename = parts[2] || activeFileName;
      } else if (!filename || filename.startsWith('-')) {
        filename = activeFileName;
      }

      const fileNode = Object.values(files).find(
        f => f.type === 'file' && f.name.toLowerCase() === (filename || '').toLowerCase()
      ) || (activeFileName ? Object.values(files).find(f => f.type === 'file' && f.name === activeFileName) : null);

      if (fileNode) {
        const ext = '.' + (fileNode.name.split('.').pop() || '').toLowerCase();
        
        updateActiveTerminalHistory(prev => [
          ...prev,
          { text: trimmed, type: 'prompt', promptPrefix: 'codesyne:~$ ' },
          { text: `[Executing ${fileNode.name} (${baseCmd})...]`, type: 'info' }
        ]);
        setCliInput('');

        const stdinReader = createStdinReader(fileNode.name);
        const onOutputLine = (line: string, type: 'default' | 'error' | 'info' = 'default') => {
          updateActiveTerminalHistory(prev => [...prev, { text: line, type: type === 'default' ? 'success' : type }]);
        };

        const isInteractive = hasInteractiveStdin(fileNode.content);

        let executedViaServer = false;
        if (projectId && !isInteractive) {
          try {
            const resp = await safeFetch(`/api/projects/${projectId}/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId: fileNode.id, filesState: files }),
              skipThrowOnNonOk: true
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.output) {
                data.output.split('\n').forEach((line: string) => {
                  updateActiveTerminalHistory(prev => [...prev, { text: line, type: 'success' }]);
                });
              }
              if (data.errors) {
                data.errors.split('\n').forEach((line: string) => {
                  updateActiveTerminalHistory(prev => [...prev, { text: line, type: 'error' }]);
                });
              }
              executedViaServer = true;
            }
          } catch (e) {
            console.warn('Backend execution connection error:', e);
          }
        }

        if (!executedViaServer) {
          await simulateCodeExecutionClient(fileNode.content, ext, stdinReader, onOutputLine);
        }

        setIsWaitingForInput(false);
        setActiveProgram(null);
        updateActiveTerminalHistory(prev => [...prev, { text: '', type: 'default' }]);
        return;
      } else {
        outputLines.push({ text: `bash: ${baseCmd}: target file not found in project workspace.`, type: 'error' });
      }
    } else {
      outputLines.push(
        { text: `bash: ${trimmed}: command not found.`, type: 'error' },
        { text: 'Type "help" to view available shell utilities.', type: 'system' }
      );
    }

    updateActiveTerminalHistory(prev => [
      ...prev,
      { text: trimmed, type: 'prompt', promptPrefix: 'codesyne:~$ ' },
      ...outputLines,
      { text: '', type: 'default' }
    ]);
    setCliInput('');
  };

  const handleCliSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Check if running program is waiting for STDIN input
    if (isWaitingForInput && (activeInputResolverRef.current || (parentResolverRef && parentResolverRef.current))) {
      const userInputValue = cliInput;
      updateActiveTerminalHistory(prev => [
        ...prev,
        { text: userInputValue, type: 'input', promptPrefix: '❯ ' }
      ]);
      setCliInput('');
      const resolver = activeInputResolverRef.current || (parentResolverRef ? parentResolverRef.current : null);
      activeInputResolverRef.current = null;
      if (parentResolverRef) parentResolverRef.current = null;
      setIsWaitingForInput(false);
      if (resolver) resolver(userInputValue);
      return;
    }

    await executeCommand(cliInput);
  };

  const handleCopyHistory = () => {
    const rawText = terminalHistory.map(line => {
      const prefix = line.promptPrefix || '';
      return `${prefix}${line.text}`;
    }).join('\n');

    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div 
      id="sandbox_terminal" 
      className="glass-card border border-white/5 rounded-2xl overflow-hidden flex flex-col justify-between h-full flex-1 min-h-0 min-w-0 bg-[#06060a]/95 shadow-2xl relative"
    >
      {/* Top controls header */}
      <div className="flex items-center justify-between gap-1 px-2 sm:px-3 py-1.5 bg-[#0a0a0f]/90 border-b border-white/5 shrink-0 select-none min-w-0 w-full max-w-full box-border overflow-x-auto scrollbar-none">
        <div className="flex items-center space-x-1 min-w-0 overflow-x-auto scrollbar-none flex-1 pr-1">
          {/* Multi-terminal tab bar */}
          <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none max-w-full py-0.5">
            {terminals.map((term) => (
              <div
                key={term.id}
                onClick={() => setActiveTermId(term.id)}
                className={`group flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-mono cursor-pointer transition-all border shrink-0 ${
                  term.id === activeTermId
                    ? 'bg-slate-800 text-cyan-300 border-cyan-500/50 font-bold shadow-md shadow-cyan-500/10'
                    : 'bg-slate-900/60 text-slate-400 border-white/5 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Terminal className="h-3 w-3 shrink-0 text-cyan-400" />
                <span className="truncate max-w-[70px] sm:max-w-[100px]">{term.name}</span>
                {terminals.length > 1 && (
                  <button
                    onClick={(e) => closeTerminal(term.id, e)}
                    className="p-0.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors ml-0.5"
                    title="Close terminal"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTerminal}
              className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 border border-white/10 transition-all cursor-pointer shrink-0"
              title="Add New Terminal"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {userRole === 'Viewer' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-semibold shrink-0">
              Read-only
            </span>
          )}
        </div>

        {/* Action triggers */}
        <div className="flex items-center space-x-1 shrink-0 ml-auto whitespace-nowrap pl-1">
          {execution && (
            <div className="hidden xl:flex items-center space-x-2 text-[10px] font-mono text-slate-500 mr-1 border-r border-white/5 pr-2 shrink-0">
              <span className="flex items-center space-x-1">
                <Zap className="h-3 w-3 text-amber-400" />
                <span>{execution.executionTime}ms</span>
              </span>
              <span className="flex items-center space-x-1">
                <Cpu className="h-3 w-3 text-indigo-400" />
                <span>{execution.memoryUsage}MB</span>
              </span>
            </div>
          )}

          {!isPreviewVisible && onOpenWebPreview && (
            <button
              onClick={onOpenWebPreview}
              className="p-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/30 text-cyan-300 border border-indigo-500/30 transition-all cursor-pointer shrink-0 active:scale-95"
              title="Open / Restore Live Web Preview Split"
            >
              <Globe className="h-3.5 w-3.5 text-cyan-400" />
            </button>
          )}

          {isRunning || isWaitingForInput ? (
            <button
              onClick={() => {
                if (activeInputResolverRef.current) {
                  activeInputResolverRef.current('');
                  activeInputResolverRef.current = null;
                }
                setIsWaitingForInput(false);
                setActiveProgram(null);
                if (onStopExecution) onStopExecution();
              }}
              className="px-2 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg flex items-center space-x-1 transition-all shadow-md active:scale-95 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-rose-600/20 animate-pulse shrink-0"
              title="Stop / Cancel Code Execution"
            >
              <Square className="h-3 w-3 fill-current shrink-0" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={onRunActiveFile}
              className="px-2 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg flex items-center space-x-1 transition-all shadow-md active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-600/10 shrink-0"
              title="Execute Active File (Run/Compile)"
            >
              <Play className="h-3 w-3 fill-current shrink-0" />
              <span>Run</span>
            </button>
          )}

          <button
            onClick={handleCopyHistory}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="Copy entire terminal log content"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          
          <button
            onClick={() => {
              onClearOutput();
              updateActiveTerminalHistory([{ text: 'Console buffer cleared.', type: 'system' }, { text: '', type: 'default' }]);
            }}
            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-400 bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 transition-all cursor-pointer shrink-0"
            title="Clear Outputs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Display logs container */}
      <div 
        ref={terminalBodyRef}
        onClick={handleTerminalClick}
        className="flex-1 p-3 sm:p-4 bg-[#050508] text-left font-mono text-[12px] md:text-[13px] overflow-y-auto overflow-x-hidden space-y-1.5 select-text scrollbar-thin scrollbar-thumb-indigo-500/40 hover:scrollbar-thumb-indigo-400 scrollbar-track-white/5 min-h-0 min-w-0 cursor-text leading-relaxed"
      >
        {currentHistory.map((line, idx) => {
          if (line.type === 'help' && line.helpCmd) {
            return (
              <div 
                key={idx} 
                onClick={() => handleHelpClick(line.helpCmd!)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 py-2 px-3 my-1 rounded-xl bg-white/[0.03] hover:bg-cyan-950/40 border border-white/5 hover:border-cyan-500/40 active:scale-[0.98] transition-all font-mono text-[11px] sm:text-[12px] cursor-pointer shadow-sm select-none"
                title={`Touch or click to execute "${line.helpCmd}"`}
              >
                <div className="font-bold text-cyan-300 flex items-center space-x-2 shrink-0 sm:w-48">
                  <span className="text-indigo-400 group-hover:text-cyan-400 font-normal transition-colors">›</span>
                  <span className="bg-indigo-950/80 group-hover:bg-cyan-950 text-cyan-300 group-hover:text-cyan-200 px-2 py-0.5 rounded-md border border-indigo-500/30 group-hover:border-cyan-500/50 font-mono tracking-tight text-[11px] sm:text-xs shadow-inner flex items-center gap-1">
                    {line.helpCmd}
                  </span>
                </div>
                <div className="text-slate-300 sm:text-slate-400 group-hover:text-slate-200 leading-relaxed break-words flex-1 min-w-0 sm:text-right font-sans sm:font-mono flex items-center justify-between sm:justify-end gap-2">
                  <span>{line.helpDesc}</span>
                  <span className="text-[10px] text-cyan-300 group-hover:text-cyan-200 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/30 shrink-0 font-sans font-bold transition-all shadow-sm">
                    Touch to run ↵
                  </span>
                </div>
              </div>
            );
          }

          let lineClass = 'text-emerald-400 font-semibold leading-relaxed font-mono';
          if (line.type === 'error') lineClass = 'text-rose-400 font-semibold font-mono';
          else if (line.type === 'success') lineClass = 'text-emerald-400 font-bold leading-relaxed font-mono';
          else if (line.type === 'info') lineClass = 'text-sky-400 font-medium font-mono';
          else if (line.type === 'system') lineClass = 'text-indigo-400/80 italic font-mono';
          else if (line.type === 'input') lineClass = 'text-cyan-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded-lg border border-cyan-500/40 inline-block my-1 shadow-sm font-mono';

          return (
            <div key={idx} className={`${lineClass} whitespace-pre-wrap break-all md:break-words leading-relaxed font-mono`}>
              {line.promptPrefix ? (
                line.promptPrefix === '❯ ' || line.type === 'input' ? (
                  <span className="text-cyan-300 font-bold bg-cyan-950/90 px-2 py-0.5 rounded-md border border-cyan-500/40 text-[10px] sm:text-xs mr-2 shrink-0 font-mono tracking-wide inline-flex items-center gap-1 shadow-sm">
                    <span>[INPUT]</span>
                    <span className="text-cyan-300">❯</span>
                  </span>
                ) : (
                  <>
                    <span className="text-emerald-400 font-bold hidden min-[380px]:inline">codesyne</span>
                    <span className="text-emerald-400 font-bold inline min-[380px]:hidden">cs</span>
                    <span className="text-slate-400">:</span>
                    <span className="text-sky-400 font-medium mr-1.5">~$</span>
                  </>
                )
              ) : null}
              {line.text}
            </div>
          );
        })}
        {isRunning && !isWaitingForInput && (
          <div className="text-amber-400 font-mono text-[12px] md:text-[13px] animate-pulse flex items-center space-x-2 select-none py-1.5 px-0.5 border-t border-b border-amber-500/10 my-1 min-w-0 overflow-hidden">
            <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center mx-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="font-semibold tracking-wide truncate max-w-[220px] sm:max-w-none" title={activeFileName}>Running {activeFileName}...</span>
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* STDIN Active Status Bar */}
      {isWaitingForInput && (
        <div className="flex flex-row items-center justify-between gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-cyan-950/80 via-[#0a0f1d] to-cyan-950/80 border-t border-cyan-500/30 text-cyan-200 text-xs font-mono shrink-0 shadow-sm select-none min-w-0 w-full">
          <div className="flex items-center space-x-2 min-w-0 flex-1 truncate">
            <div className="p-0.5 shrink-0 flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)] shrink-0" />
            </div>
            <span className="truncate font-medium text-cyan-200 text-[11px] sm:text-xs">
              STDIN: <span className="text-white font-semibold">{activeProgram || 'Program'}</span> is waiting for input
            </span>
          </div>
          <span className="text-[10px] text-cyan-300/80 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 shrink-0 font-sans font-medium flex items-center gap-1">
            <span>Press Send</span>
            <span className="text-cyan-400">↵</span>
          </span>
        </div>
      )}

      {/* Input prompt with Send button */}
      <form 
        onSubmit={handleCliSubmit} 
        className={`flex items-center gap-1.5 sm:gap-2 border-t transition-all px-2.5 sm:px-4 py-2 font-mono text-xs sm:text-sm select-none shrink-0 min-w-0 w-full box-border ${
          isWaitingForInput 
            ? 'bg-[#070b14]/95 border-cyan-500/40 ring-1 ring-cyan-500/20' 
            : 'bg-[#08080d]/90 border-white/5'
        }`}
        onClick={handleTerminalClick}
      >
        {isWaitingForInput ? (
          <div className="flex items-center space-x-1.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 px-2 py-1 rounded-lg text-xs font-semibold shrink-0 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span>STDIN</span>
          </div>
        ) : (
          <div className="flex items-center text-xs font-medium shrink-0">
            <span className="text-emerald-400 font-bold hidden min-[380px]:inline">codesyne</span>
            <span className="text-emerald-400 font-bold inline min-[380px]:hidden">cs</span>
            <span className="text-slate-400">:</span>
            <span className="text-sky-400 font-medium ml-0.5 mr-1">~$</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={cliInput}
          onKeyDown={handleKeyDown}
          onChange={(e) => setCliInput(e.target.value)}
          placeholder={isWaitingForInput ? "Enter input here..." : "Type command..."}
          className="flex-1 w-0 min-w-0 bg-transparent border-none outline-none text-white placeholder-slate-500 font-mono text-xs sm:text-sm py-0.5"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />

        {/* Perfectly Centered Send Button */}
        <button
          type="submit"
          onClick={handleCliSubmit}
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-md min-w-[28px] sm:min-w-[32px] ${
            cliInput.trim() || isWaitingForInput
              ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-95 shadow-cyan-500/25'
              : 'bg-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/15'
          }`}
          title={isWaitingForInput ? "Send STDIN Input" : "Execute Command"}
        >
          <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-current shrink-0" strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}
