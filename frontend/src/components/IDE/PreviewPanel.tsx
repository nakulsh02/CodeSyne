import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Monitor, Tablet, Smartphone, ShieldAlert, AlertTriangle, ExternalLink, ChevronDown, Terminal } from 'lucide-react';
import { FileNode, FileSystemState } from '@shared/types';

interface PreviewPanelProps {
  activeFile: FileNode | null;
  filesState: FileSystemState;
  onSelectFile?: (id: string) => void;
  onOpenTerminal?: () => void;
  isTerminalVisible?: boolean;
}

// Robust relative path resolver for virtual filesState
function resolvePath(currentFolderId: string | null, relativePath: string, files: FileSystemState): FileNode | null {
  const cleanPath = relativePath.split('?')[0].split('#')[0].trim();
  if (!cleanPath) return null;

  const parts = cleanPath.split('/');
  let currentDirId: string = currentFolderId || 'root';

  let startIndex = 0;
  if (parts[0] === '') {
    currentDirId = 'root';
    startIndex = 1;
  }

  for (let i = startIndex; i < parts.length; i++) {
    const part = parts[i];
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..') {
      if (currentDirId === 'root') {
        currentDirId = 'root';
      } else {
        const parent = files[currentDirId];
        currentDirId = parent ? parent.parentId || 'root' : 'root';
      }
      continue;
    }

    // Find child node with name matching 'part' under currentDirId
    const foundNode = Object.values(files).find(
      (node) => node.parentId === currentDirId && node.name.toLowerCase() === part.toLowerCase()
    );

    if (!foundNode) {
      return null;
    }

    if (i === parts.length - 1) {
      return foundNode; // Found target file/folder
    } else {
      if (foundNode.type === 'folder') {
        currentDirId = foundNode.id;
      } else {
        return null; // Can't traverse through a file
      }
    }
  }

  return null;
}

export default function PreviewPanel({ activeFile, filesState, onSelectFile, onOpenTerminal, isTerminalVisible }: PreviewPanelProps) {
  const [layoutMode, setLayoutMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [currentPreviewFileId, setCurrentPreviewFileId] = useState<string | null>(null);

  // Determine which HTML file to show in preview
  const allNodes = Object.values(filesState) as FileNode[];
  const htmlFiles = allNodes.filter(f => f.type === 'file' && f.name.endsWith('.html'));

  let previewFile: FileNode | null = null;

  // 1. If activeFile is an HTML file, use it
  if (activeFile && activeFile.name.endsWith('.html')) {
    previewFile = activeFile;
  } 
  // 2. Otherwise, if we had a previously active preview file that still exists, keep it
  else if (currentPreviewFileId && filesState[currentPreviewFileId]) {
    previewFile = filesState[currentPreviewFileId];
  } 
  // 3. Fallback to index.html or first HTML file in workspace
  else {
    const indexNode = htmlFiles.find(f => f.name === 'index.html');
    previewFile = indexNode || htmlFiles[0] || null;
  }

  // Update current preview file ID when resolved
  useEffect(() => {
    if (previewFile && previewFile.id !== currentPreviewFileId) {
      setCurrentPreviewFileId(previewFile.id);
    }
  }, [previewFile, currentPreviewFileId]);

  // Handle preview links navigation
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PREVIEW_NAVIGATE' && onSelectFile && previewFile) {
        const href = event.data.href;
        const resolved = resolvePath(previewFile.parentId, href, filesState);
        if (resolved && resolved.type === 'file') {
          onSelectFile(resolved.id);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewFile, filesState, onSelectFile]);

  // Compile active HTML file and its linked assets (CSS/JS/Images)
  useEffect(() => {
    let activeBlobUrl = '';
    
    const timer = setTimeout(() => {
      if (!previewFile || !previewFile.content) {
        setIframeSrc('data:text/html,<html><body style="font-family:sans-serif;color:%23cbd5e1;background:%2309090e;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><div><h3>No HTML files active.</h3><p style="color:%2364748b;font-size:12px;">Create or select an HTML file to view instant visual web previews.</p></div></body></html>');
        setMissingFiles([]);
        return;
      }

      const htmlContent = previewFile.content;
      const htmlParentId = previewFile.parentId;
      const missingList: string[] = [];

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // 1. Resolve relative Stylesheets
        const linkElements = doc.querySelectorAll('link[rel="stylesheet"]');
        linkElements.forEach((link) => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('http') && !href.startsWith('//')) {
            const cssNode = resolvePath(htmlParentId, href, filesState);
            if (cssNode && cssNode.content) {
              const styleTag = doc.createElement('style');
              styleTag.textContent = cssNode.content;
              link.parentNode?.replaceChild(styleTag, link);
            } else {
              missingList.push(href);
            }
          }
        });

        // 2. Resolve relative JavaScript tags
        const scriptElements = doc.querySelectorAll('script[src]');
        scriptElements.forEach((script) => {
          const src = script.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('//')) {
            const jsNode = resolvePath(htmlParentId, src, filesState);
            if (jsNode && jsNode.content) {
              const inlineScript = doc.createElement('script');
              inlineScript.textContent = jsNode.content;
              // Copy over async, defer attributes if present
              if (script.hasAttribute('async')) inlineScript.setAttribute('async', '');
              if (script.hasAttribute('defer')) inlineScript.setAttribute('defer', '');
              script.parentNode?.replaceChild(inlineScript, script);
            } else {
              missingList.push(src);
            }
          }
        });

        // 3. Resolve relative Images
        const imgElements = doc.querySelectorAll('img[src]');
        imgElements.forEach((img) => {
          const src = img.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
            const imgNode = resolvePath(htmlParentId, src, filesState);
            if (imgNode && imgNode.content) {
              img.setAttribute('src', imgNode.content); // Base64 or string URL
            } else {
              missingList.push(src);
            }
          }
        });

        // 4. Inject script to capture relative links click
        const clickScript = doc.createElement('script');
        clickScript.textContent = `
          (function() {
            document.addEventListener('click', function(e) {
              var link = e.target.closest('a');
              if (link) {
                var href = link.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                  e.preventDefault();
                  window.parent.postMessage({
                    type: 'PREVIEW_NAVIGATE',
                    href: href
                  }, '*');
                }
              }
            });
          })();
        `;
        doc.body.appendChild(clickScript);

        // 5. Inject CSS for clear, high-contrast, fully visible scrollbars inside web preview
        const themeScrollbarStyle = doc.createElement('style');
        themeScrollbarStyle.textContent = `
          html, body { 
            min-height: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            overflow-y: auto !important; 
            overflow-x: auto !important; 
            scroll-behavior: smooth;
            scrollbar-width: auto !important; 
            scrollbar-color: #6366f1 #0f172a !important; 
          }
          ::-webkit-scrollbar { 
            width: 9px !important; 
            height: 9px !important; 
            display: block !important;
          }
          ::-webkit-scrollbar-track { 
            background: #0f172a !important; 
          }
          ::-webkit-scrollbar-thumb { 
            background: #6366f1 !important; 
            border-radius: 4px !important; 
            border: 1px solid rgba(255,255,255,0.1) !important;
          }
          ::-webkit-scrollbar-thumb:hover { 
            background: #818cf8 !important; 
          }
        `;
        doc.head ? doc.head.appendChild(themeScrollbarStyle) : doc.body.appendChild(themeScrollbarStyle);

        const compiledHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        const blob = new Blob([compiledHtml], { type: 'text/html;charset=utf-8' });
        activeBlobUrl = URL.createObjectURL(blob);
        setIframeSrc(activeBlobUrl);
        setMissingFiles(missingList);
      } catch (err) {
        console.error('Failed to parse and compile preview:', err);
      }
    }, 400); // Debounce preview rebuild slightly for better typing performance

    return () => {
      clearTimeout(timer);
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [filesState, previewFile, reloadKey]);

  const handleRefresh = () => {
    setReloadKey(prev => prev + 1);
  };

  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const deviceBtnRef = useRef<HTMLButtonElement>(null);

  const getWidthClass = () => {
    switch (layoutMode) {
      case 'tablet': return 'w-[600px] max-w-full border-x-8 border-t-8 border-white/10 rounded-t-3xl shadow-xl h-full';
      case 'mobile': return 'w-[360px] max-w-full border-x-8 border-t-8 border-white/10 rounded-t-3xl shadow-xl h-full';
      default: return 'w-full h-full border border-white/5 rounded-t-xl';
    }
  };

  const currentDeviceLabel = () => {
    switch (layoutMode) {
      case 'tablet': return { label: 'Tablet', sub: '600px', icon: Tablet };
      case 'mobile': return { label: 'Mobile', sub: '360px', icon: Smartphone };
      default: return { label: 'Computer', sub: '100%', icon: Monitor };
    }
  };

  const ActiveIcon = currentDeviceLabel().icon;

  return (
    <div id="visual_live_preview" className="glass-card border border-white/5 rounded-2xl flex flex-col justify-between h-full flex-1 min-h-0 min-w-0 relative">
      
      {/* Symmetrical Top Browser Address & Device Control Bar */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 bg-[#06050c]/90 border-b border-white/10 shrink-0 select-none relative z-[100] min-w-0 w-full max-w-full box-border rounded-t-2xl overflow-x-auto scrollbar-thin scrollbar-thumb-indigo-500/50 hover:scrollbar-thumb-indigo-400 scrollbar-track-white/5">
        {/* Custom Theme-Matched Device Viewport Selector Dropdown */}
        <div className="flex items-center space-x-1 shrink-0 relative z-50 min-w-max">
          <button
            ref={deviceBtnRef}
            type="button"
            onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
            className="flex items-center space-x-1 sm:space-x-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-slate-200 text-xs font-medium rounded-lg px-1.5 sm:px-2 py-1 cursor-pointer transition-all font-sans active:scale-95 shadow-sm max-w-[95px] xs:max-w-[130px] sm:max-w-none min-w-0"
            title="Select Device Viewport Size"
          >
            <ActiveIcon className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-200 font-semibold text-[11px] sm:text-xs truncate">{currentDeviceLabel().label}</span>
            <span className="hidden xl:inline text-[10px] text-slate-400 shrink-0">({currentDeviceLabel().sub})</span>
            <ChevronDown className={`h-3 w-3 text-slate-400 shrink-0 transition-transform duration-200 ${isDeviceDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Custom Glass Popover Menu */}
          {isDeviceDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-[99998]" 
                onClick={() => setIsDeviceDropdownOpen(false)} 
              />
              <div 
                className="fixed max-h-[300px] overflow-y-auto w-52 bg-[#0a081a]/98 border border-indigo-500/40 rounded-xl shadow-2xl backdrop-blur-2xl z-[99999] p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150"
                style={{
                  top: deviceBtnRef.current ? Math.min(window.innerHeight - 200, deviceBtnRef.current.getBoundingClientRect().bottom + 6) : 60,
                  left: deviceBtnRef.current ? Math.max(8, Math.min(window.innerWidth - 220, deviceBtnRef.current.getBoundingClientRect().left)) : 8
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setLayoutMode('desktop');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    layoutMode === 'desktop' 
                      ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30' 
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Monitor className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span>Computer (100%)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLayoutMode('tablet');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    layoutMode === 'tablet' 
                      ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30' 
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Tablet className="h-4 w-4 text-purple-400 shrink-0" />
                  <span>Tablet (600px)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLayoutMode('mobile');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    layoutMode === 'mobile' 
                      ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30' 
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Smartphone className="h-4 w-4 text-pink-400 shrink-0" />
                  <span>Mobile (360px)</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Center: Clean spacing filler */}
        <div className="flex-1 min-w-0" />

        {/* Right: Actions (Terminal restore, Refresh & Open in New Tab - Strictly Box Bounded) */}
        <div className="flex items-center space-x-1 shrink-0 ml-auto z-40 overflow-visible">
          {!isTerminalVisible && onOpenTerminal && (
            <button
              onClick={onOpenTerminal}
              className="p-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer shrink-0 active:scale-95"
              title="Open / Restore Terminal Split"
            >
              <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            </button>
          )}

          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/30 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Force Reload Preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => {
              if (iframeSrc) {
                window.open(iframeSrc, '_blank');
              }
            }}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/30 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Open in External Browser (New Tab)"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Warning banner for missing linked files */}
      {missingFiles.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-[10px] text-amber-400 flex items-start space-x-2 shrink-0 select-none text-left">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Missing Linked Assets:</span>
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-slate-400 font-mono">
              {missingFiles.map((f, i) => (
                <span key={i} className="bg-white/5 px-1 rounded">{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Embedded Iframe Container with Custom Styled Scrollbars */}
      <div className="flex-1 bg-transparent p-1 sm:p-2 flex justify-center items-start overflow-auto min-h-0 w-full h-full scrollbar-thin scrollbar-thumb-indigo-500 hover:scrollbar-thumb-indigo-400 scrollbar-track-slate-900/60">
        {!previewFile || !previewFile.content ? (
          <div className="flex flex-col items-center justify-center text-center p-6 my-auto max-w-sm mx-auto space-y-4 animate-fade-in select-none">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Monitor className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white tracking-tight">No HTML files active</h3>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Create or select an HTML file in the explorer to see an instant real-time visual web preview of your code.
              </p>
            </div>
          </div>
        ) : (
          <div className={`bg-[#0a0a0f] ${getWidthClass()} relative min-h-0 max-h-full h-full w-full overflow-auto shadow-2xl scrollbar-thin scrollbar-thumb-indigo-500 hover:scrollbar-thumb-indigo-400 scrollbar-track-slate-900/60`}>
            <iframe
              key={reloadKey}
              src={iframeSrc || undefined}
              title="Sandbox Runtime Preview"
              scrolling="yes"
              className="w-full h-full min-h-full bg-white border-none outline-none block"
              style={{ touchAction: 'auto', overscrollBehavior: 'contain', overflow: 'auto' }}
              sandbox="allow-scripts"
            />
          </div>
        )}
      </div>

      {/* Frame details Footer - Minimalist & hidden on small windows */}
      <div className="px-3 py-1.5 border-t border-white/5 bg-[#0a0a0f]/40 text-[10px] text-slate-500 hidden sm:flex items-center justify-between shrink-0 select-none font-mono">
        <span>Render Mode: Sandbox Frame</span>
        <span className="flex items-center space-x-1.5 text-slate-400">
          <span>Active Compiler</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </span>
      </div>

    </div>
  );
}
