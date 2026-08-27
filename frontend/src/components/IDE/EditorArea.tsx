import React, { useRef, useState, useEffect } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import { 
  X, ZoomIn, ZoomOut, Save, Code, FileCode, CheckCircle2, 
  Copy, Info, Trash2, Eye, MoreVertical, ClipboardPaste, MousePointerClick, Clock
} from 'lucide-react';
import { FileNode, FileSystemState, OpenTab, CollabUser } from '@shared/types';
import { autoFixPythonIndentation, sanitizeAndFixCode } from '../../utils/codeFixer';

// Safe Monaco Web Worker configuration using inline data URIs to bypass CORS and blob: protocol errors
if (typeof window !== 'undefined') {
  (window as any).MonacoEnvironment = {
    getWorker: function (_workerId: string, label: string) {
      const getWorkerModule = (moduleUrl: string) => {
        try {
          return new Worker(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(
              `importScripts('${moduleUrl}');`
            )}`,
            { type: 'module' }
          );
        } catch (e) {
          return new Worker(moduleUrl);
        }
      };

      if (label === 'json') {
        return getWorkerModule('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/language/json/json.worker.js');
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return getWorkerModule('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/language/css/css.worker.js');
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return getWorkerModule('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/language/html/html.worker.js');
      }
      if (label === 'typescript' || label === 'javascript') {
        return getWorkerModule('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/language/typescript/ts.worker.js');
      }
      return getWorkerModule('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/base/worker/workerMain.js');
    }
  };
}

interface EditorAreaProps {
  files: FileSystemState;
  openTabs: OpenTab[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: () => void;
  onFileContentChange: (id: string, content: string) => void;
  theme: 'midnight' | 'cyberpunk' | 'light';
  fontSize: number;
  onChangeFontSize: (size: number) => void;
  autoSave: boolean;
  onSaveFile: (id: string) => void;
  projectId?: string;
  roomId?: string;
  collaborators?: CollabUser[];
  userRole?: 'Owner' | 'Editor' | 'Viewer';
  onCursorMove?: (lineNumber: number, column: number, selection?: any) => void;
  onTypingStateChange?: (isTyping: boolean) => void;
}

export default function EditorArea({
  files,
  openTabs,
  activeFileId,
  onSelectFile,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onFileContentChange,
  theme,
  fontSize,
  onChangeFontSize,
  autoSave,
  onSaveFile,
  projectId,
  roomId,
  collaborators = [],
  userRole = 'Editor',
  onCursorMove,
  onTypingStateChange
}: EditorAreaProps) {
  
  const editorRef = useRef<any>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const lastLocalTypingTimeRef = useRef<number>(0);
  const activeFile = activeFileId ? files[activeFileId] : null;

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'tab' | 'editor';
    targetFileId?: string;
  } | null>(null);

  const [propertiesFileId, setPropertiesFileId] = useState<string | null>(null);
  const [pasteModalFileId, setPasteModalFileId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');

  const activeFileIdRef = useRef(activeFileId);
  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  // Close context menu on click elsewhere
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Set up a ResizeObserver to manually trigger Monaco's .layout() when the container size changes
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    });

    resizeObserver.observe(editorContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeFileId]);

  // Dynamically generate cursor and selection CSS styles for active room collaborators
  useEffect(() => {
    let styleEl = document.getElementById('codesyne-remote-cursors-css') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'codesyne-remote-cursors-css';
      document.head.appendChild(styleEl);
    }

    const PALETTE = [
      { hex: '#6366f1', name: 'indigo' },
      { hex: '#10b981', name: 'emerald' },
      { hex: '#f59e0b', name: 'amber' },
      { hex: '#f43f5e', name: 'rose' },
      { hex: '#06b6d4', name: 'cyan' },
      { hex: '#d946ef', name: 'fuchsia' },
      { hex: '#8b5cf6', name: 'violet' },
      { hex: '#84cc16', name: 'lime' }
    ];

    let cssRules = '';

    collaborators.forEach((collab, index) => {
      const cleanId = collab.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const colorObj = PALETTE[index % PALETTE.length];
      const colorHex = collab.color || colorObj.hex;
      const nameLabel = collab.name || collab.username || 'Collaborator';

      cssRules += `
        .monaco-editor .view-overlays,
        .monaco-editor .view-lines,
        .monaco-editor .view-line {
          overflow: visible !important;
        }
        .remote-cursor-caret-${cleanId} {
          border-left: 2px solid ${colorHex} !important;
          position: absolute;
          z-index: 50;
          pointer-events: none;
        }
        .remote-cursor-caret-${cleanId}::before {
          content: '${nameLabel.replace(/'/g, "\\'")}';
          position: absolute;
          top: -21px;
          left: 0px;
          background-color: ${colorHex};
          color: #ffffff;
          font-size: 10px;
          line-height: 1.2;
          font-weight: 700;
          font-family: system-ui, -apple-system, sans-serif;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          z-index: 1000 !important;
        }
        .remote-selection-${cleanId} {
          background-color: ${colorHex}33 !important;
          border-radius: 2px;
        }
      `;
    });

    styleEl.innerHTML = cssRules;
  }, [collaborators]);

  // Render multiplayer collaborator cursors in Monaco Editor
  useEffect(() => {
    if (!editorRef.current || !activeFileId) return;
    const monacoObj = (window as any).monaco;
    if (!monacoObj) return;

    try {
      const newDecorations: any[] = [];
      collaborators.forEach(collab => {
        if (collab.cursor && collab.cursor.fileId === activeFileId) {
          const line = Math.max(1, collab.cursor.lineNumber || 1);
          const col = Math.max(1, collab.cursor.column || 1);
          const cleanId = collab.id.replace(/[^a-zA-Z0-9_-]/g, '_');

          // Cursor Caret & Name Tag decoration
          newDecorations.push({
            range: new monacoObj.Range(line, col, line, col + 1),
            options: {
              className: `remote-cursor-caret-${cleanId}`,
              hoverMessage: { value: `**${collab.name || collab.username || 'Collaborator'}** is editing line ${line}, col ${col}` }
            }
          });

          // Text selection decoration
          if (collab.cursor.selectionStartLineNumber && collab.cursor.endLineNumber) {
            const startLine = collab.cursor.selectionStartLineNumber;
            const startCol = collab.cursor.selectionStartColumn || 1;
            const endLine = collab.cursor.endLineNumber;
            const endCol = collab.cursor.endColumn || 1;

            if (startLine !== endLine || startCol !== endCol) {
              newDecorations.push({
                range: new monacoObj.Range(startLine, startCol, endLine, endCol),
                options: {
                  className: `remote-selection-${cleanId}`,
                  hoverMessage: { value: `Selected by **${collab.name || 'Collaborator'}**` }
                }
              });
            }
          }
        }
      });

      decorationsRef.current = editorRef.current.deltaDecorations(
        decorationsRef.current,
        newDecorations
      );
    } catch (e) {
      // Ignore if editor model unmounted
    }
  }, [collaborators, activeFileId]);

  // Real-time synchronization of remote content updates without resetting cursor or interrupting local typing
  useEffect(() => {
    if (!editorRef.current || !activeFile) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    // Skip remote model override if user is actively typing locally
    if (Date.now() - lastLocalTypingTimeRef.current < 500) {
      return;
    }

    const currentModelValue = model.getValue();
    const targetContent = activeFile.content || '';

    if (currentModelValue !== targetContent) {
      const selection = editor.getSelection();
      const viewState = editor.saveViewState();

      editor.executeEdits('remote-collaborator-update', [
        {
          range: model.getFullModelRange(),
          text: targetContent,
          forceMoveMarkers: true
        }
      ]);

      if (viewState) {
        editor.restoreViewState(viewState);
      }
      if (selection) {
        editor.setSelection(selection);
      }
    }
  }, [activeFile?.content, activeFileId]);

  const handleEditorChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      if (userRole === 'Viewer') return; // Read-only mode for Viewers
      lastLocalTypingTimeRef.current = Date.now();
      onFileContentChange(activeFileId, value);
      
      if (onTypingStateChange) {
        onTypingStateChange(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          if (onTypingStateChange) onTypingStateChange(false);
        }, 1500);
      }
    }
  };

  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;

    // Track Cursor Movements and Selection Ranges for Multiplayer Live Share Session & Cat Companion tracking
    editor.onDidChangeCursorSelection((e: any) => {
      if (onCursorMove && e.selection) {
        const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = e.selection;
        onCursorMove(positionLineNumber, positionColumn, {
          selectionStartLineNumber,
          selectionStartColumn,
          endLineNumber: positionLineNumber,
          endColumn: positionColumn
        });
      }

      // Notify screen cat of typing/caret coordinate in editor
      try {
        if (typeof window !== 'undefined' && e.selection) {
          const coords = editor.getScrolledVisiblePosition({
            lineNumber: e.selection.positionLineNumber,
            column: e.selection.positionColumn
          });
          if (coords && editorContainerRef.current) {
            const rect = editorContainerRef.current.getBoundingClientRect();
            const targetX = rect.left + coords.left;
            const targetY = rect.top + coords.top;
            window.dispatchEvent(new CustomEvent('codesyne-cat-target', {
              detail: { x: targetX, y: targetY }
            }));
          }
        }
      } catch {}
    });
    
    // Customize Monaco themes
    monaco.editor.defineTheme('midnight-custom', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'a5b4fc', fontStyle: 'bold' },
        { token: 'string', foreground: 'f472b6' },
        { token: 'number', foreground: '38bdf8' }
      ],
      colors: {
        'editor.background': '#0a0a12',
        'editor.foreground': '#cbd5e1',
        'editorCursor.foreground': '#818cf8',
        'editor.lineHighlightBackground': '#181825',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#818cf8'
      }
    });

    monaco.editor.defineTheme('cyberpunk-custom', {
      base: 'hc-black',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5c5c5c', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff007f', fontStyle: 'bold' },
        { token: 'string', foreground: 'ffff00' },
        { token: 'number', foreground: '00ffff' }
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#ff00ff',
        'editorCursor.foreground': '#ffff00',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editorLineNumber.foreground': '#ff00ff',
        'editorLineNumber.activeForeground': '#ffff00'
      }
    });

    monaco.editor.setTheme(
      theme === 'midnight' ? 'midnight-custom' : theme === 'cyberpunk' ? 'cyberpunk-custom' : 'vs-light'
    );

    // AUTO-CLOSING HTML / JSX / TSX / XML TAGS & CLOSING SLASH LISTENER
    // When typing '>' after '<tagname', auto-insert '</tagname>' and place cursor in middle
    // When typing '/' after '<', auto-complete closing tag
    editor.onDidChangeModelContent((e: any) => {
      if (e.changes && e.changes.length === 1) {
        const change = e.changes[0];
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!model || !position) return;

        const lineContent = model.getLineContent(position.lineNumber);

        if (change.text === '>') {
          const textBeforeCursor = lineContent.substring(0, position.column - 1);

          // Match opening tag e.g. <title or <div class="foo" or <Component.Sub
          const tagMatch = textBeforeCursor.match(/<([a-zA-Z0-9\-_:.]+)(?:\s+[^>]*)*$/);
          if (tagMatch) {
            const tagName = tagMatch[1];
            // Skip self-closing tags or tags that ended with '/' e.g. <img />
            if (!textBeforeCursor.trim().endsWith('/')) {
              const voidTags = ['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr', 'path', 'circle', 'rect'];
              if (!voidTags.includes(tagName.toLowerCase())) {
                const closingTag = `</${tagName}>`;
                
                // Ensure we aren't already immediately followed by closing tag
                const textAfterCursor = lineContent.substring(position.column - 1);
                if (!textAfterCursor.startsWith(closingTag)) {
                  editor.executeEdits('auto-close-tag', [
                    {
                      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                      text: closingTag,
                      forceMoveMarkers: true
                    }
                  ]);
                  // Set cursor right after '>' (before '</tag>')
                  editor.setPosition(position);
                }
              }
            }
          }
        } else if (change.text === '/') {
          // Check if typing '/' right after '<'
          const textBeforeCursor = lineContent.substring(0, position.column - 1);
          if (textBeforeCursor.endsWith('<')) {
            // Find preceding open tag in model
            const fullText = model.getValue();
            const offset = model.getOffsetAt(position);
            const textUpToCursor = fullText.substring(0, offset - 2); // Exclude '</'
            
            const openTagsMatches = Array.from(textUpToCursor.matchAll(/<([a-zA-Z0-9\-_:.]+)(?:\s+[^>]*)*>/g));
            const closeTagsMatches = Array.from(textUpToCursor.matchAll(/<\/([a-zA-Z0-9\-_:.]+)\s*>/g));
            
            if (openTagsMatches.length > 0) {
              const openStack: string[] = [];
              const voidTags = ['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr', 'path', 'circle', 'rect'];
              
              openTagsMatches.forEach((m: any) => {
                const tag = m[1];
                if (!voidTags.includes(tag.toLowerCase()) && !m[0].endsWith('/>')) {
                  openStack.push(tag);
                }
              });

              closeTagsMatches.forEach((m: any) => {
                const tag = m[1];
                const idx = openStack.lastIndexOf(tag);
                if (idx !== -1) {
                  openStack.splice(idx, 1);
                }
              });

              const lastUnclosedTag = openStack.pop();
              if (lastUnclosedTag) {
                const insertText = `${lastUnclosedTag}>`;
                const textAfterCursor = lineContent.substring(position.column - 1);
                if (!textAfterCursor.startsWith(insertText)) {
                  editor.executeEdits('auto-close-slash-tag', [
                    {
                      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                      text: insertText,
                      forceMoveMarkers: true
                    }
                  ]);
                  const newPos = new monaco.Position(position.lineNumber, position.column + insertText.length);
                  editor.setPosition(newPos);
                }
              }
            }
          }
        }
      }
    });

    // Register custom actions into Monaco's native right-click context menu
    editor.addAction({
      id: 'custom-select-all',
      label: 'Select All Code',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 1,
      run: (ed: any) => {
        ed.focus();
        const model = ed.getModel();
        if (model) {
          const range = model.getFullModelRange();
          ed.setSelection(range);
        }
      }
    });

    editor.addAction({
      id: 'custom-copy-all',
      label: 'Copy All Code',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 2,
      run: (ed: any) => {
        const content = ed.getValue();
        navigator.clipboard.writeText(content);
      }
    });

    editor.addAction({
      id: 'custom-paste-all',
      label: 'Paste & Replace All',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 3,
      run: async (ed: any) => {
        const fileId = activeFileIdRef.current;
        if (!fileId) return;
        try {
          const text = await navigator.clipboard.readText();
          if (text !== undefined) {
            onFileContentChange(fileId, text);
          }
        } catch (err) {
          console.warn('Clipboard read access blocked inside iframe, showing modal.', err);
          setPasteText('');
          setPasteModalFileId(fileId);
        }
      }
    });

    editor.addAction({
      id: 'custom-clear-contents',
      label: 'Clear All Contents',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 4,
      run: (ed: any) => {
        const fileId = activeFileIdRef.current;
        if (fileId) {
          onFileContentChange(fileId, '');
        }
      }
    });

    editor.addAction({
      id: 'custom-copy-file-path',
      label: 'Copy File Path',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: () => {
        const fileId = activeFileIdRef.current;
        if (fileId) {
          const path = getNodePath(fileId);
          navigator.clipboard.writeText(path);
        }
      }
    });

    editor.addAction({
      id: 'custom-file-properties',
      label: 'File Properties',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      run: () => {
        const fileId = activeFileIdRef.current;
        if (fileId) {
          setPropertiesFileId(fileId);
        }
      }
    });
  };

  // Adjust theme dynamically when theme prop updates
  useEffect(() => {
    if (editorRef.current) {
      const monacoTheme = theme === 'midnight' ? 'midnight-custom' : theme === 'cyberpunk' ? 'cyberpunk-custom' : 'vs-light';
      const monacoObj = (window as any).monaco;
      if (monacoObj) {
        monacoObj.editor.setTheme(monacoTheme);
      }
    }
  }, [theme]);

  // Retrieve breadcrumbs e.g., project / src / App.tsx
  const getBreadcrumbs = () => {
    if (!activeFile) return 'No File Selected';
    
    const crumbs = [activeFile.name];
    let curr = activeFile;
    while (curr.parentId && curr.parentId !== 'root' && files[curr.parentId]) {
      curr = files[curr.parentId];
      crumbs.unshift(curr.name);
    }
    
    return crumbs.join('  ›  ');
  };

  // Resolve file path
  const getNodePath = (id: string): string => {
    const node = files[id];
    if (!node || id === 'root') return '';
    const parts = [node.name];
    let curr = node;
    while (curr.parentId && curr.parentId !== 'root' && files[curr.parentId]) {
      curr = files[curr.parentId];
      parts.unshift(curr.name);
    }
    return parts.join('/');
  };

  // Tab right click context menu handler
  const handleTabContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 160;
    const menuHeight = 180;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({ x, y, type: 'tab', targetFileId: fileId });
  };

  // Editor Area right click context menu
  const handleEditorContextMenu = (e: React.MouseEvent) => {
    // If the click is inside Monaco editor, let Monaco's native context menu handle it
    const target = e.target as HTMLElement;
    if (target && (target.closest('.monaco-editor') || target.closest('.monaco-mouse-cursor-text'))) {
      return;
    }

    if (!activeFileId) return;
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 280;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({ x, y, type: 'editor', targetFileId: activeFileId });
  };

  const handleToolbarMenuClick = (e: React.MouseEvent) => {
    if (!activeFileId) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = window.innerWidth < 768 ? 140 : 180;
    let x = rect.left - (window.innerWidth < 768 ? 110 : 130);
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    x = Math.max(10, x);

    setContextMenu({
      x,
      y: rect.bottom + 5,
      type: 'editor',
      targetFileId: activeFileId
    });
  };

  const handleSelectAll = () => {
    if (editorRef.current) {
      editorRef.current.focus();
      const model = editorRef.current.getModel();
      if (model) {
        const range = model.getFullModelRange();
        editorRef.current.setSelection(range);
      }
    }
  };

  const handlePasteAll = async (fileId: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text !== undefined) {
        const target = files[fileId];
        const formattedText = target 
          ? sanitizeAndFixCode(text, target.name || target.language || '') 
          : text;
        onFileContentChange(fileId, formattedText);
      }
    } catch (err) {
      console.warn('Clipboard read access blocked by security sandbox inside iframe, falling back to modal dialog input.', err);
      setPasteText('');
      setPasteModalFileId(fileId);
    }
  };

  // Menu action triggers
  const handleCopyPath = (fileId: string) => {
    const path = getNodePath(fileId);
    navigator.clipboard.writeText(path || files[fileId]?.name || '');
  };

  const handleCopyContent = (fileId: string) => {
    const node = files[fileId];
    if (node && node.content) {
      navigator.clipboard.writeText(node.content);
    }
  };

  const handleClearContent = (fileId: string) => {
    onFileContentChange(fileId, '');
  };

  return (
    <div 
      id="editor_area_pane" 
      className="h-full flex flex-col glass-card border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative select-none min-w-0 min-h-0"
    >
      
      {/* Dynamic Tab Selector strip */}
      <div className="flex items-center justify-between bg-[#0a0a0f]/40 border-b border-white/5 shrink-0 select-none min-w-0 overflow-hidden">
        <div className="flex-1 flex items-center overflow-x-auto touch-pan-x scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {openTabs.map((tab) => {
            const file = files[tab.fileId];
            if (!file) return null;
            const isTabActive = activeFileId === tab.fileId;
            
            return (
              <div
                key={tab.fileId}
                id={`tab_file_${tab.fileId}`}
                onClick={() => onSelectFile(tab.fileId)}
                onContextMenu={(e) => handleTabContextMenu(e, tab.fileId)}
                className={`group px-4 py-3 flex items-center space-x-2 border-r border-white/5 cursor-pointer text-xs font-semibold font-mono transition-all relative shrink-0 ${
                  isTabActive 
                    ? 'bg-white/5 text-white font-bold' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                <FileCode className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate max-w-[100px]">{file.name}</span>
                
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); onCloseTab(tab.fileId); }}
                  className="p-0.5 rounded-full hover:bg-white/10 text-slate-600 hover:text-white transition-colors shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>

                {isTabActive && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
                )}
              </div>
            );
          })}
        </div>

        {/* Toolbar controls */}
        <div className="flex items-center space-x-1.5 px-2 text-slate-500 shrink-0 border-l border-white/5 bg-[#0a0a0f]/45 h-full py-1.5">
          <div className="hidden sm:flex items-center space-x-1.5">
            <button
              onClick={() => onChangeFontSize(Math.max(12, fontSize - 1))}
              className="p-1 hover:bg-white/5 rounded-md hover:text-slate-300 transition-colors"
              title="Zoom Out font"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-mono font-semibold text-slate-400">{fontSize}px</span>
            <button
              onClick={() => onChangeFontSize(Math.min(24, fontSize + 1))}
              className="p-1 hover:bg-white/5 rounded-md hover:text-slate-300 transition-colors"
              title="Zoom In font"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            
            <div className="w-[1px] h-3.5 bg-white/10 mx-0.5" />
          </div>

          <button
            onClick={() => setShowShortcutsModal(true)}
            className="p-1 hover:bg-white/5 rounded-md hover:text-indigo-300 text-slate-400 transition-colors cursor-pointer flex items-center justify-center"
            title="IDE Keyboard Shortcuts"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>

          {activeFileId && !autoSave && (
            <button
              onClick={() => onSaveFile(activeFileId)}
              className="px-2 py-1 glass-panel hover:bg-indigo-600 hover:text-white border-0 rounded-lg text-[10px] font-bold text-slate-300 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <Save className="h-3 w-3" />
              <span>Save</span>
            </button>
          )}

          {activeFileId && (
            <button
              onClick={handleToolbarMenuClick}
              className="p-1 hover:bg-white/5 rounded-md hover:text-slate-300 transition-colors cursor-pointer flex items-center justify-center text-slate-400"
              title="Editor Actions & Clipboard"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumbs pathway line & Viewer / Typing status banners */}
      <div className="hidden md:flex px-4 py-1.5 bg-[#0a0a0f]/20 border-b border-white/5 items-center justify-between text-[10px] text-slate-400 font-mono shrink-0 select-none text-left">
        <div className="flex items-center space-x-2">
          <span className="text-indigo-400 font-bold uppercase">active file</span>
          <span>/</span>
          <span className="truncate">{getBreadcrumbs()}</span>
        </div>

        {userRole === 'Viewer' ? (
          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[9px] font-bold">
            🔒 Read-Only Viewer Mode
          </span>
        ) : collaborators.some(c => c.isTyping) ? (
          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[9px] font-bold animate-pulse">
            ✍️ {collaborators.filter(c => c.isTyping).map(c => c.name).join(', ')} typing...
          </span>
        ) : null}
      </div>

      {/* Monaco text Editor render element */}
      <div 
        ref={editorContainerRef}
        className="flex-1 min-h-0 min-w-0 relative overflow-hidden" 
        onContextMenu={handleEditorContextMenu}
      >
        {activeFile ? (
          <Editor
            height="100%"
            language={activeFile.language || 'javascript'}
            value={activeFile.content || ''}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            options={{
              readOnly: userRole === 'Viewer',
              fontSize: fontSize,
              fontFamily: '"JetBrains Mono", Fira Code, Courier, monospace',
              minimap: { enabled: true, side: 'right', renderCharacters: true },
              wordWrap: 'on',
              lineNumbers: 'on',
              lineNumbersMinChars: 3,
              lineDecorationsWidth: 4,
              glyphMargin: false,
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              autoClosingBrackets: 'always',
              autoClosingQuotes: 'always',
              autoSurround: 'languageDefined',
              scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false },
              tabSize: activeFile?.language === 'python' ? 4 : 2,
              insertSpaces: true,
              detectIndentation: false,
              autoIndent: 'full',
              formatOnPaste: false,
              formatOnType: false,
              trimAutoWhitespace: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              renderWhitespace: 'selection',
              padding: { top: 8, bottom: 8 },
              automaticLayout: true,
              contextmenu: true,
              // IntelliSense, Suggestions & Hover
              quickSuggestions: { other: true, comments: true, strings: true },
              suggestOnTriggerCharacters: true,
              parameterHints: { enabled: true },
              hover: { enabled: true, delay: 200 },
              links: true,
              // Folding, Sticky Scroll & Markers
              folding: true,
              foldingStrategy: 'indentation',
              showFoldingControls: 'mouseover',
              stickyScroll: { enabled: true },
              renderValidationDecorations: 'on',
              // Multi-cursor
              multiCursorModifier: 'alt',
              // Performance optimizations for large copy-paste & large files
              maxTokenizationLineLength: 20000,
              largeFileOptimizations: true
            }}
          />
        ) : (
          <div className="h-full flex flex-col justify-center items-center text-center p-8 bg-[#0a0a0f]/40 select-none">
            <Code className="h-10 w-10 text-slate-700 animate-pulse mb-4" />
            <h3 className="text-sm font-semibold text-slate-400">No active files in memory</h3>
            <p className="text-xs text-slate-500 max-w-xs mt-2 leading-relaxed">
              Select or double-click any item from the Explorer tab to start editing code side-by-side with your teammate.
            </p>
          </div>
        )}
      </div>

      {/* Editor Status line - Fully Responsive Clean Single Row */}
      <div className="px-3 sm:px-4 py-1.5 border-t border-white/5 bg-[#0a0a0f]/80 text-[10px] text-slate-400 font-mono flex items-center justify-between gap-2 shrink-0 select-none overflow-x-auto whitespace-nowrap scrollbar-none">
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <span className="text-slate-300 font-medium">Lang: <span className="text-cyan-400 font-bold uppercase">{activeFile?.language || 'plain_text'}</span></span>
          <span className="text-slate-700">•</span>
          <span>Chars: <strong className="text-slate-300 font-semibold">{activeFile?.content?.length || 0}</strong></span>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {autoSave ? (
            <span className="flex items-center space-x-1 text-indigo-400 font-medium">
              <CheckCircle2 className="h-3 w-3 text-indigo-400 shrink-0" />
              <span>Autosave</span>
            </span>
          ) : (
            <span className="text-slate-500">Manual Save</span>
          )}
        </div>
      </div>

      {/* Context Menu for Tab and Editor right-clicks */}
      {contextMenu && (
        <div 
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed bg-[#09090f]/95 backdrop-blur-md border border-white/10 rounded-xl py-1 md:py-1.5 shadow-2xl z-50 min-w-[130px] md:min-w-[160px] font-sans text-[10px] md:text-xs animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'tab' && contextMenu.targetFileId && (
            <>
              <button 
                onClick={() => { onCloseTab(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <X className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Close Tab</span>
              </button>
              <button 
                onClick={() => { onCloseOthers(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Close Others</span>
              </button>
              <button 
                onClick={() => { onCloseAll(); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Close All</span>
              </button>
              <div className="border-t border-white/5 my-1" />
              <button 
                onClick={() => { handleCopyPath(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Copy className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Copy Path</span>
              </button>
              <button 
                onClick={() => { onSelectFile(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-indigo-400 hover:text-indigo-300 flex items-center space-x-1.5 md:space-x-2"
              >
                <Eye className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Reveal in Explorer</span>
              </button>
              <button 
                onClick={() => { setPropertiesFileId(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Info className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Properties</span>
              </button>
            </>
          )}

          {contextMenu.type === 'editor' && contextMenu.targetFileId && (
            <>
              <button 
                onClick={() => { handleSelectAll(); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <MousePointerClick className="h-3 w-3 md:h-3.5 md:w-3.5 text-indigo-400" /> <span>Select All</span>
              </button>
              <button 
                onClick={() => { handleCopyContent(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Copy className="h-3 w-3 md:h-3.5 md:w-3.5 text-emerald-400" /> <span>Copy All</span>
              </button>
              <button 
                onClick={() => { handlePasteAll(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <ClipboardPaste className="h-3 w-3 md:h-3.5 md:w-3.5 text-fuchsia-400" /> <span>Paste All</span>
              </button>
              <button 
                onClick={() => { handleClearContent(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2 text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5" /> <span>Clear Contents</span>
              </button>
              <div className="border-t border-white/5 my-1" />
              <button 
                onClick={() => { handleCopyPath(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Copy className="h-3 w-3 md:h-3.5 md:w-3.5 text-slate-500" /> <span>Copy File Path</span>
              </button>
              <button 
                onClick={() => { setPropertiesFileId(contextMenu.targetFileId!); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-1.5 md:space-x-2"
              >
                <Info className="h-3 w-3 md:h-3.5 md:w-3.5 text-slate-500" /> <span>File Properties</span>
              </button>
              <button 
                onClick={() => { setShowShortcutsModal(true); setContextMenu(null); }}
                className="w-full text-left px-2.5 md:px-3 py-1 md:py-1.5 hover:bg-white/5 text-indigo-300 hover:text-indigo-200 flex items-center space-x-1.5 md:space-x-2"
              >
                <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-indigo-400" /> <span>Keyboard Shortcuts</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Elegant floating Properties dialog modal */}
      {propertiesFileId && files[propertiesFileId] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-text font-sans">
          <div className="bg-[#0b0b11] border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left">
            <h4 className="text-sm font-bold text-white mb-4 border-b border-white/5 pb-2 flex items-center space-x-2">
              <Info className="h-4 w-4 text-indigo-400" />
              <span>File Metadata Properties</span>
            </h4>
            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="text-white font-semibold">{files[propertiesFileId].name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Relative Path:</span>
                <span className="text-slate-300 select-all truncate max-w-[200px]" title={getNodePath(propertiesFileId)}>/ {getNodePath(propertiesFileId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Character Count:</span>
                <span className="text-slate-300">{files[propertiesFileId].content?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Programming Language:</span>
                <span className="text-emerald-400 font-semibold">{files[propertiesFileId].language || 'plain_text'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">File Node ID:</span>
                <span className="text-slate-500 text-[10px]">{propertiesFileId}</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setPropertiesFileId(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Paste All Modal Fallback */}
      {pasteModalFileId && files[pasteModalFileId] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-text font-sans">
          <div className="bg-[#0b0b11] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left flex flex-col max-h-[80vh]">
            <h4 className="text-sm font-bold text-white mb-2 border-b border-white/5 pb-2 flex items-center space-x-2">
              <ClipboardPaste className="h-4 w-4 text-indigo-400" />
              <span>Paste & Replace Content</span>
            </h4>
            <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
              Your browser blocks direct clipboard read access inside this iframe frame. Paste your text content here using <kbd className="px-1 py-0.5 bg-white/10 rounded">Ctrl+V</kbd> or <kbd className="px-1 py-0.5 bg-white/10 rounded">Cmd+V</kbd> to replace everything inside <strong>{files[pasteModalFileId].name}</strong>.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste files content here..."
              className="flex-1 w-full min-h-[180px] p-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-slate-300 outline-none focus:border-indigo-500/50 resize-none"
              autoFocus
            />
            <div className="mt-4 flex justify-end space-x-2 shrink-0">
              <button 
                onClick={() => { setPasteModalFileId(null); setPasteText(''); }}
                className="px-4 py-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const target = files[pasteModalFileId];
                  const formattedText = target 
                    ? sanitizeAndFixCode(pasteText, target.name || target.language || '') 
                    : pasteText;
                  onFileContentChange(pasteModalFileId, formattedText);
                  setPasteModalFileId(null);
                  setPasteText('');
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[9999] p-4 select-text font-sans">
          <div className="bg-[#0c0c16] border border-indigo-500/30 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 shrink-0">
              <div className="flex items-center space-x-2">
                <Code className="h-5 w-5 text-indigo-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">Codesyne IDE Keyboard Shortcuts</h3>
              </div>
              <button 
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs font-mono text-slate-300">
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider font-sans">Editing & Auto-Completion</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Auto-Close Brackets</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-emerald-300 font-bold">( ) [ ] &#123; &#125;</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Auto-Close Tags</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-emerald-300 font-bold">&lt;tag&gt;&lt;/tag&gt;</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Auto-Complete</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">Ctrl + Space</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Save File</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">Ctrl + S</kbd>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider font-sans">Code Navigation & Tools</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Find in File</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">Ctrl + F</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Replace in File</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">Ctrl + H</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Go to Definition</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">F12</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Rename Symbol</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">F2</kbd>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider font-sans">Terminal & View</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Interrupt Terminal Process</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-rose-300 font-bold">Ctrl + C</kbd>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Clear Terminal Logs</span>
                    <kbd className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-bold">Ctrl + L</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex justify-end shrink-0">
              <button 
                onClick={() => setShowShortcutsModal(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
