import React, { useState, useRef, useEffect } from 'react';
import { 
  FileCode, Folder, FolderOpen, Plus, FilePlus, FolderPlus, 
  Trash2, Edit, Copy, Clipboard, FileUp, Download, Eye, FileJson, 
  Terminal, ChevronDown, ChevronRight, FileCode2, Info, FolderUp,
  Scissors, Loader2, RefreshCw
} from 'lucide-react';
import { FileNode, FileSystemState } from '@shared/types';
import JSZip from 'jszip';

interface FileExplorerProps {
  files: FileSystemState;
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onUpdateFiles: (newFiles: FileSystemState) => void;
  onDownloadProject: () => void;
  onShowToast?: (title: string, msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function FileExplorer({
  files,
  activeFileId,
  onSelectFile,
  onUpdateFiles,
  onDownloadProject,
  onShowToast
}: FileExplorerProps) {
  
  const [expandedFolders, setExpandedFolders] = useState<{ [id: string]: boolean }>({ 'root': true });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  // Selection and Clipboard States
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [clipboardNodeIds, setClipboardNodeIds] = useState<string[]>([]);
  const [clipboardAction, setClipboardAction] = useState<'copy' | 'cut' | null>(null);

  // Overlays & Progress Bars for long running operations (prevent freezes)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [operationProgress, setOperationProgress] = useState<{ title: string; current: number; total: number } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [propertiesNodeId, setPropertiesNodeId] = useState<string | null>(null);
  
  // Custom dialogs states
  const [deleteConfirmNodeIds, setDeleteConfirmNodeIds] = useState<string[] | null>(null);
  const [moveNodeId, setMoveNodeId] = useState<string | null>(null);
  const [movePathInput, setMovePathInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Close context menu on global click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Global Keyboard Shortcuts for OS-native File Operations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if the user is typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' || 
        document.activeElement?.hasAttribute('contenteditable')
      ) {
        return;
      }

      // We need at least one selected item to perform file operations
      if (selectedNodeIds.length === 0) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + C to Copy
      if (modKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy(selectedNodeIds);
      }
      // Ctrl/Cmd + X to Cut
      else if (modKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCut(selectedNodeIds);
      }
      // Ctrl/Cmd + V to Paste
      else if (modKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        // Paste into the first selected node if it's a folder, or into its parent
        const targetId = selectedNodeIds[0];
        if (targetId) {
          const targetNode = files[targetId];
          const destId = targetNode?.type === 'folder' ? targetId : (targetNode?.parentId || 'root');
          handlePaste(destId);
        }
      }
      // Delete or Backspace to Delete items
      else if (e.key === 'Delete' || (isMac && e.key === 'Backspace' && e.metaKey)) {
        e.preventDefault();
        triggerDeleteConfirm(selectedNodeIds);
      }
      // F2 to Rename
      else if (e.key === 'F2' && selectedNodeIds.length === 1) {
        e.preventDefault();
        const id = selectedNodeIds[0];
        startRename(id, files[id]?.name || '');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, files, clipboardNodeIds, clipboardAction]);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getLanguageFromExt = (ext: string): string => {
    const map: { [key: string]: string } = {
      'html': 'html', 'css': 'css', 'js': 'javascript', 'jsx': 'javascript',
      'ts': 'typescript', 'tsx': 'typescript', 'py': 'python', 'json': 'json', 
      'md': 'markdown', 'go': 'go', 'rs': 'rust', 'java': 'java', 'c': 'c', 
      'cpp': 'cpp', 'cc': 'cpp', 'php': 'php'
    };
    return map[ext.toLowerCase()] || 'javascript';
  };

  // Helper to determine if a file is binary based on ext or type
  const isBinary = (file: File): boolean => {
    const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md', '.txt', '.xml', '.yml', '.yaml', '.svg', '.py', '.java', '.c', '.cpp', '.cc', '.rs', '.go', '.php'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (textExtensions.includes(ext)) return false;
    
    if (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'image/svg+xml') {
      return false;
    }
    return true;
  };

  // VS Code Style Naming Conflicts Resolution
  const getUniqueName = (name: string, parentId: string, isFolder: boolean, currentFiles: FileSystemState): string => {
    let baseName = name;
    let ext = '';
    if (!isFolder) {
      const parts = name.split('.');
      if (parts.length > 1) {
        ext = '.' + parts.pop();
        baseName = parts.join('.');
      }
    }
    
    let candidate = name;
    let counter = 1;
    
    const hasCollision = (testName: string) => {
      return (Object.values(currentFiles) as FileNode[]).some(
        node => node.parentId === parentId && node.name.toLowerCase() === testName.toLowerCase()
      );
    };
    
    while (hasCollision(candidate)) {
      if (counter === 1) {
        candidate = isFolder ? `${baseName} copy` : `${baseName} copy${ext}`;
      } else {
        candidate = isFolder ? `${baseName} copy ${counter}` : `${baseName} copy ${counter}${ext}`;
      }
      counter++;
    }
    return candidate;
  };

  // Simple Name Validator
  const validateName = (name: string): string | null => {
    if (!name || !name.trim()) return "File name cannot be empty.";
    if (name.length > 255) return "File name is too long.";
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(name)) return "File name contains invalid characters: \\ / : * ? \" < > |";
    return null;
  };

  // Create single file or folder node
  const createNode = (type: 'file' | 'folder', parentId: string = 'root') => {
    const id = 'node_' + Math.random().toString(36).substr(2, 9);
    const defaultName = type === 'file' ? 'untitled_file.js' : 'new_folder';
    const uniqueName = getUniqueName(defaultName, parentId, type === 'folder', files);
    const ext = uniqueName.split('.').pop() || 'js';

    const newNode: FileNode = {
      id,
      name: uniqueName,
      type,
      parentId,
      content: type === 'file' ? `// Code file created on ${new Date().toLocaleDateString()}\n\n` : undefined,
      language: type === 'file' ? getLanguageFromExt(ext) : undefined
    };

    const updated = { ...files, [id]: newNode };
    onUpdateFiles(updated);
    
    // Auto start renaming
    setEditingNodeId(id);
    setEditName(uniqueName);

    if (parentId !== 'root') {
      setExpandedFolders(prev => ({ ...prev, [parentId]: true }));
    }
  };

  const startRename = (id: string, name: string) => {
    setEditingNodeId(id);
    setEditName(name);
  };

  const saveRename = (id: string) => {
    const validationError = validateName(editName);
    if (validationError) {
      alert(validationError);
      setEditingNodeId(null);
      return;
    }
    
    const node = files[id];
    if (!node) return;

    if (editName.trim() === node.name) {
      setEditingNodeId(null);
      return;
    }

    // Check collision under the same parent
    const hasCollision = (Object.values(files) as FileNode[]).some(
      f => f.parentId === node.parentId && f.id !== id && f.name.toLowerCase() === editName.trim().toLowerCase()
    );

    if (hasCollision) {
      alert(`A file or folder named "${editName.trim()}" already exists in this folder.`);
      setEditingNodeId(null);
      return;
    }

    const ext = editName.split('.').pop() || '';
    const updatedNode = {
      ...node,
      name: editName.trim(),
      language: node.type === 'file' ? getLanguageFromExt(ext) : undefined
    };

    onUpdateFiles({ ...files, [id]: updatedNode });
    if (onShowToast) {
      onShowToast('Item Renamed', `Successfully renamed to "${editName.trim()}"`, 'success');
    }
    setEditingNodeId(null);
  };

  const triggerDeleteConfirm = (ids: string[]) => {
    const validIds = ids.filter(id => id !== 'root' && files[id]);
    if (validIds.length > 0) {
      setDeleteConfirmNodeIds(validIds);
    }
  };

  const moveNodeToPath = (nodeId: string, newPath: string) => {
    let cleanPath = newPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanPath) return;

    const parts = cleanPath.split('/');
    const node = files[nodeId];
    if (!node) return;

    let currentParentId = 'root';
    let updated = { ...files };

    if (node.type === 'file') {
      const fileName = parts[parts.length - 1];
      if (!fileName) return;

      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        let folder = (Object.values(updated) as FileNode[]).find(
          f => f.type === 'folder' && f.name === folderName && f.parentId === currentParentId
        );

        if (!folder) {
          const folderId = 'node_' + Math.random().toString(36).substr(2, 9);
          folder = {
            id: folderId,
            name: folderName,
            type: 'folder',
            parentId: currentParentId
          };
          updated[folderId] = folder;
        }
        currentParentId = folder.id;
      }

      const hasCollision = (Object.values(updated) as FileNode[]).some(
        f => f.parentId === currentParentId && f.id !== nodeId && f.name.toLowerCase() === fileName.toLowerCase()
      );

      if (hasCollision) {
        if (onShowToast) {
          onShowToast('Collision Warning', `A file named "${fileName}" already exists there.`, 'error');
        } else {
          alert(`A file named "${fileName}" already exists in the destination folder.`);
        }
        return;
      }

      const ext = fileName.split('.').pop() || '';
      updated[nodeId] = {
        ...node,
        parentId: currentParentId,
        name: fileName,
        language: getLanguageFromExt(ext)
      };
    } else {
      const folderName = parts[parts.length - 1];
      if (!folderName) return;

      for (let i = 0; i < parts.length - 1; i++) {
        const parentName = parts[i];
        let folder = (Object.values(updated) as FileNode[]).find(
          f => f.type === 'folder' && f.name === parentName && f.parentId === currentParentId
        );

        if (!folder) {
          const folderId = 'node_' + Math.random().toString(36).substr(2, 9);
          folder = {
            id: folderId,
            name: parentName,
            type: 'folder',
            parentId: currentParentId
          };
          updated[folderId] = folder;
        }
        currentParentId = folder.id;
      }

      const isDescendant = (nodeIdToCheck: string, potentialParentId: string): boolean => {
        let curr = updated[potentialParentId];
        while (curr) {
          if (curr.id === nodeIdToCheck) return true;
          curr = curr.parentId ? updated[curr.parentId] : null;
        }
        return false;
      };

      if (nodeId === currentParentId || isDescendant(nodeId, currentParentId)) {
        if (onShowToast) {
          onShowToast('Loop Forbidden', 'Cannot move a folder inside itself.', 'error');
        } else {
          alert("Cannot move a folder inside itself or its own subfolders.");
        }
        return;
      }

      const hasCollision = (Object.values(updated) as FileNode[]).some(
        f => f.parentId === currentParentId && f.id !== nodeId && f.name.toLowerCase() === folderName.toLowerCase()
      );

      if (hasCollision) {
        if (onShowToast) {
          onShowToast('Collision Warning', `A folder named "${folderName}" already exists there.`, 'error');
        } else {
          alert(`A folder named "${folderName}" already exists in the destination folder.`);
        }
        return;
      }

      updated[nodeId] = {
        ...node,
        parentId: currentParentId,
        name: folderName
      };
    }

    onUpdateFiles(updated);
    
    if (onShowToast) {
      onShowToast('Path Updated', `Moved item to "/${cleanPath}" successfully`, 'success');
    }
  };

  // Delete nodes recursively with chunked processing for very large folders
  const deleteNodes = async (ids: string[]) => {
    if (ids.length === 0) return;
    
    const count = ids.filter(id => id !== 'root').length;
    if (count === 0) return;

    setOperationProgress({ title: 'Deleting items...', current: 0, total: 100 });
    
    let updated = { ...files };
    let deletionQueue = [...ids];

    const collectDescendants = (parentId: string) => {
      Object.keys(files).forEach(childId => {
        if (files[childId].parentId === parentId) {
          deletionQueue.push(childId);
          if (files[childId].type === 'folder') {
            collectDescendants(childId);
          }
        }
      });
    };

    ids.forEach(id => {
      if (id !== 'root' && files[id]) {
        if (files[id].type === 'folder') {
          collectDescendants(id);
        }
      }
    });

    const uniqueDeletionQueue = Array.from(new Set(deletionQueue)).filter(id => id !== 'root');
    
    // Process deletion in chunks of 50 to prevent freezing
    const chunkSize = 50;
    for (let i = 0; i < uniqueDeletionQueue.length; i += chunkSize) {
      const chunk = uniqueDeletionQueue.slice(i, i + chunkSize);
      chunk.forEach(id => {
        delete updated[id];
      });
      setOperationProgress({ 
        title: `Deleting items...`, 
        current: Math.min(i + chunkSize, uniqueDeletionQueue.length), 
        total: uniqueDeletionQueue.length 
      });
      await new Promise(r => setTimeout(r, 5));
    }

    onUpdateFiles(updated);
    if (onShowToast) {
      onShowToast('Deleted Permanently', `Successfully deleted ${uniqueDeletionQueue.length} item(s) from workspace.`, 'success');
    }
    setSelectedNodeIds([]);
    setOperationProgress(null);
  };

  // Duplicate Selected files/folders
  const duplicateNodes = async (ids: string[]) => {
    if (ids.length === 0) return;
    const targetIds = ids.filter(id => id !== 'root' && files[id]);
    if (targetIds.length === 0) return;

    setOperationProgress({ title: 'Duplicating items...', current: 0, total: targetIds.length });

    let updated = { ...files };

    const cloneNodeRecursive = (nodeId: string, newParentId: string | null, customName?: string): string => {
      const originalNode = files[nodeId];
      if (!originalNode) return '';

      const newId = 'node_' + Math.random().toString(36).substr(2, 9);
      const uniqueName = customName || getUniqueName(originalNode.name, newParentId || 'root', originalNode.type === 'folder', updated);

      const cloned: FileNode = {
        ...originalNode,
        id: newId,
        parentId: newParentId,
        name: uniqueName
      };
      
      updated[newId] = cloned;

      // Duplicate descendants recursively
      if (originalNode.type === 'folder') {
        Object.keys(files).forEach(childId => {
          if (files[childId].parentId === nodeId) {
            cloneNodeRecursive(childId, newId);
          }
        });
      }

      return newId;
    };

    // Duplicate each item
    for (let i = 0; i < targetIds.length; i++) {
      const id = targetIds[i];
      const source = files[id];
      if (source) {
        cloneNodeRecursive(id, source.parentId);
      }
      setOperationProgress({ title: 'Duplicating items...', current: i + 1, total: targetIds.length });
      await new Promise(r => setTimeout(r, 5));
    }

    onUpdateFiles(updated);
    setOperationProgress(null);
  };

  // Clipboard Copiers
  const handleCopy = (ids: string[]) => {
    const validIds = ids.filter(id => id !== 'root' && files[id]);
    if (validIds.length > 0) {
      setClipboardNodeIds(validIds);
      setClipboardAction('copy');
      if (onShowToast) {
        onShowToast('Copied to Clipboard', `Copied ${validIds.length} item(s) to clipboard. Click a folder or root and paste.`, 'success');
      }
    }
  };

  const handleCut = (ids: string[]) => {
    const validIds = ids.filter(id => id !== 'root' && files[id]);
    if (validIds.length > 0) {
      setClipboardNodeIds(validIds);
      setClipboardAction('cut');
      if (onShowToast) {
        onShowToast('Cut to Clipboard', `Cut ${validIds.length} item(s) to clipboard. Ready to move.`, 'info');
      }
    }
  };

  // Advanced Clipboard Paste with VS Code conflicts checking and chunked execution
  const handlePaste = async (targetFolderId: string) => {
    if (clipboardNodeIds.length === 0 || !clipboardAction) return;

    const actualTargetFolderId = files[targetFolderId]?.type === 'folder' ? targetFolderId : (files[targetFolderId]?.parentId || 'root');
    setOperationProgress({ title: 'Pasting items...', current: 0, total: clipboardNodeIds.length });

    let updated = { ...files };

    const cloneNodeRecursive = (nodeId: string, newParentId: string | null, customName?: string): string => {
      const originalNode = files[nodeId];
      if (!originalNode) return '';

      const newId = 'node_' + Math.random().toString(36).substr(2, 9);
      const uniqueName = customName || getUniqueName(originalNode.name, newParentId || 'root', originalNode.type === 'folder', updated);

      const cloned: FileNode = {
        ...originalNode,
        id: newId,
        parentId: newParentId,
        name: uniqueName
      };
      
      updated[newId] = cloned;

      if (originalNode.type === 'folder') {
        Object.keys(files).forEach(childId => {
          if (files[childId].parentId === nodeId) {
            cloneNodeRecursive(childId, newId);
          }
        });
      }

      return newId;
    };

    // Paste items
    for (let i = 0; i < clipboardNodeIds.length; i++) {
      const id = clipboardNodeIds[i];
      const source = files[id];
      if (!source) continue;

      if (clipboardAction === 'copy') {
        cloneNodeRecursive(id, actualTargetFolderId);
      } else if (clipboardAction === 'cut') {
        // Cut is simple reparenting unless it would create a self-loop
        const isDescendant = (nodeId: string, parentId: string): boolean => {
          let curr = files[parentId];
          while (curr) {
            if (curr.id === nodeId) return true;
            curr = curr.parentId ? files[curr.parentId] : null;
          }
          return false;
        };

        if (id !== actualTargetFolderId && !(source.type === 'folder' && isDescendant(id, actualTargetFolderId))) {
          const uniqueName = getUniqueName(source.name, actualTargetFolderId, source.type === 'folder', updated);
          updated[id] = {
            ...source,
            parentId: actualTargetFolderId,
            name: uniqueName
          };
        }
      }

      setOperationProgress({ title: 'Pasting items...', current: i + 1, total: clipboardNodeIds.length });
      await new Promise(r => setTimeout(r, 5));
    }

    onUpdateFiles(updated);
    
    if (onShowToast) {
      onShowToast('Pasted Items', `Successfully pasted ${clipboardNodeIds.length} item(s) to folder.`, 'success');
    }
    
    // Clear clipboard if cut
    if (clipboardAction === 'cut') {
      setClipboardNodeIds([]);
      setClipboardAction(null);
    }
    
    setOperationProgress(null);
    setExpandedFolders(prev => ({ ...prev, [actualTargetFolderId]: true }));
  };

  // Binary/Text safe Download Single File
  const handleDownloadSingleFile = (id: string) => {
    const file = files[id];
    if (!file || file.type !== 'file') return;

    let content: any = file.content || '';
    let mime = 'text/plain';

    if (typeof content === 'string' && content.startsWith('data:') && content.includes(';base64,')) {
      const parts = content.split(';base64,');
      mime = parts[0].split(':')[1]?.split(';')[0] || 'application/octet-stream';
      if (parts[1]) {
        const binaryString = atob(parts[1]);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        content = new Blob([bytes], { type: mime });
      }
    } else {
      content = new Blob([content], { type: mime });
    }

    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download Folder recursively as a ZIP
  const handleDownloadFolder = async (folderId: string) => {
    const folderNode = files[folderId];
    if (!folderNode || folderNode.type !== 'folder') return;

    try {
      setOperationProgress({ title: 'Preparing folder files...', current: 0, total: 100 });
      const zip = new JSZip();

      const getRelativePath = (nodeId: string, currentFolderId: string): string => {
        const parts: string[] = [];
        let curr = files[nodeId];
        while (curr && curr.id !== currentFolderId) {
          parts.unshift(curr.name);
          curr = curr.parentId ? files[curr.parentId] : null;
        }
        return parts.join('/');
      };

      const childrenNodes: string[] = [];
      const collectChildren = (id: string) => {
        Object.keys(files).forEach(childId => {
          if (files[childId].parentId === id) {
            childrenNodes.push(childId);
            if (files[childId].type === 'folder') {
              collectChildren(childId);
            }
          }
        });
      };
      collectChildren(folderId);

      for (let i = 0; i < childrenNodes.length; i++) {
        const childId = childrenNodes[i];
        const node = files[childId];
        if (!node) continue;
        const relPath = getRelativePath(childId, folderId);
        if (node.type === 'file') {
          const nodeNameLower = (node.name || '').toLowerCase();
          if (nodeNameLower === 'dockerfile' || nodeNameLower === '.dockerignore' || nodeNameLower === 'vercel.json') {
            continue;
          }
          let content: any = node.content || '';
          if (typeof content === 'string' && content.startsWith('data:') && content.includes(';base64,')) {
            const parts = content.split(';base64,');
            if (parts[1]) {
              const binaryString = atob(parts[1]);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              content = bytes.buffer;
            }
          }
          zip.file(relPath, content);
        } else if (node.type === 'folder') {
          zip.folder(relPath);
        }
        
        setOperationProgress({ 
          title: 'Collecting files...', 
          current: Math.round(((i + 1) / childrenNodes.length) * 50), 
          total: 100 
        });
        if (i % 20 === 0) await new Promise(r => setTimeout(r, 2));
      }

      setOperationProgress({ title: 'Generating ZIP archive...', current: 75, total: 100 });
      const blobContent = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blobContent);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderNode.name}_folder.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setOperationProgress(null);
    } catch (err) {
      console.error('Download folder failed:', err);
      setOperationProgress(null);
    }
  };

  // Highly responsive Upload Folder (using chunks and webkitRelativePath)
  const handleFolderImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const filesArray: File[] = Array.from(importedFiles);
    setUploadProgress({ current: 0, total: filesArray.length, filename: filesArray[0].name });

    let currentFiles = { ...files };
    const chunkSize = 5; // process 5 files at a time to prevent UI blocks
    
    for (let i = 0; i < filesArray.length; i += chunkSize) {
      const chunk = filesArray.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (file: any) => {
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split('/');
        let currentParentId = 'root';

        // Reconstruct folder path hierarchy
        for (let j = 0; j < parts.length - 1; j++) {
          const folderName = parts[j];
          let folder = (Object.values(currentFiles) as FileNode[]).find(
            node => node.type === 'folder' && node.name === folderName && node.parentId === currentParentId
          );

          if (!folder) {
            const folderId = 'node_' + Math.random().toString(36).substr(2, 9);
            folder = {
              id: folderId,
              name: folderName,
              type: 'folder',
              parentId: currentParentId
            };
            currentFiles[folderId] = folder;
          }
          currentParentId = folder.id;
        }

        // Add file node
        const fileName = parts[parts.length - 1];
        const ext = fileName.split('.').pop() || '';
        const fileId = 'node_' + Math.random().toString(36).substr(2, 9);

        // Binary safe upload
        const isBin = isBinary(file);
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

        const fileNode: FileNode = {
          id: fileId,
          name: fileName,
          type: 'file',
          parentId: currentParentId,
          content: text,
          language: getLanguageFromExt(ext)
        };
        
        currentFiles[fileId] = fileNode;
      }));

      setUploadProgress({
        current: Math.min(i + chunkSize, filesArray.length),
        total: filesArray.length,
        filename: chunk[chunk.length - 1].name
      });

      // Yield back to main thread
      await new Promise(resolve => setTimeout(resolve, 15));
    }

    // Re-expand all newly imported folders automatically
    const extraExpanded: { [id: string]: boolean } = {};
    (Object.values(currentFiles) as FileNode[]).forEach(f => {
      if (f.type === 'folder') {
        extraExpanded[f.id] = true;
      }
    });
    setExpandedFolders(prev => ({ ...prev, ...extraExpanded }));
    onUpdateFiles(currentFiles);
    setUploadProgress(null);
  };

  // Upload Multiple Files with chunked loading
  const handleFilesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const filesArray: File[] = Array.from(importedFiles);
    setUploadProgress({ current: 0, total: filesArray.length, filename: filesArray[0].name });

    let currentFiles = { ...files };
    const chunkSize = 5;

    for (let i = 0; i < filesArray.length; i += chunkSize) {
      const chunk = filesArray.slice(i, i + chunkSize);

      await Promise.all(chunk.map(async (file: any) => {
        const id = 'node_' + Math.random().toString(36).substr(2, 9);
        const ext = file.name.split('.').pop() || '';
        
        const isBin = isBinary(file);
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

        const newNode: FileNode = {
          id,
          name: file.name,
          type: 'file',
          parentId: 'root',
          content: text,
          language: getLanguageFromExt(ext)
        };
        
        currentFiles[id] = newNode;
      }));

      setUploadProgress({
        current: Math.min(i + chunkSize, filesArray.length),
        total: filesArray.length,
        filename: chunk[chunk.length - 1].name
      });

      await new Promise(resolve => setTimeout(resolve, 15));
    }

    onUpdateFiles(currentFiles);
    setUploadProgress(null);
  };

  // Drag and Drop files/folders from Desktop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropFromDesktop = async (e: React.DragEvent, parentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dtFiles = e.dataTransfer.files;
    
    if (dtFiles && dtFiles.length > 0) {
      const filesArray: File[] = Array.from(dtFiles);
      setUploadProgress({ current: 0, total: filesArray.length, filename: filesArray[0].name });

      let currentFiles = { ...files };
      const chunkSize = 5;

      for (let i = 0; i < filesArray.length; i += chunkSize) {
        const chunk = filesArray.slice(i, i + chunkSize);

        await Promise.all(chunk.map(async (file: any) => {
          const id = 'node_' + Math.random().toString(36).substr(2, 9);
          const ext = file.name.split('.').pop() || 'js';

          const isBin = isBinary(file);
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

          const newNode: FileNode = {
            id,
            name: file.name,
            type: 'file',
            parentId,
            content: text,
            language: getLanguageFromExt(ext)
          };

          currentFiles[id] = newNode;
        }));

        setUploadProgress({
          current: Math.min(i + chunkSize, filesArray.length),
          total: filesArray.length,
          filename: chunk[chunk.length - 1].name
        });

        await new Promise(resolve => setTimeout(resolve, 15));
      }

      onUpdateFiles(currentFiles);
      setUploadProgress(null);
    }
  };

  // Drag-and-drop hierarchy re-ordering (Drag Node)
  const handleNodeDragStart = (e: React.DragEvent, nodeId: string) => {
    e.stopPropagation();
    let targets = [...selectedNodeIds];
    if (!targets.includes(nodeId)) {
      targets = [nodeId];
      setSelectedNodeIds([nodeId]);
    }
    e.dataTransfer.setData('application/json-nodes', JSON.stringify(targets));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleNodeDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const raw = e.dataTransfer.getData('application/json-nodes');
      if (!raw) {
        // Fallback to desktop drops
        handleDropFromDesktop(e, targetFolderId);
        return;
      }

      const draggedIds = JSON.parse(raw) as string[];
      if (!Array.isArray(draggedIds)) return;

      const isDescendant = (nodeId: string, parentId: string): boolean => {
        let curr = files[parentId];
        while (curr) {
          if (curr.id === nodeId) return true;
          curr = curr.parentId ? files[curr.parentId] : null;
        }
        return false;
      };

      const validMovedIds = draggedIds.filter(id => {
        if (id === targetFolderId) return false;
        if (files[id]?.type === 'folder' && isDescendant(id, targetFolderId)) return false;
        return true;
      });

      if (validMovedIds.length === 0) return;

      let updated = { ...files };
      validMovedIds.forEach(id => {
        const node = files[id];
        if (node) {
          const uniqueName = getUniqueName(node.name, targetFolderId, node.type === 'folder', updated);
          updated[id] = {
            ...node,
            parentId: targetFolderId,
            name: uniqueName
          };
        }
      });

      onUpdateFiles(updated);
      setSelectedNodeIds(validMovedIds);
      setExpandedFolders(prev => ({ ...prev, [targetFolderId]: true }));
    } catch (err) {
      console.error('Node drop error:', err);
    }
  };

  // Selection visual tree flattener (Shift Range helper)
  const getFlatVisibleNodes = (parentId: string = 'root'): string[] => {
    const list: string[] = [];
    const children = (Object.values(files) as FileNode[])
      .filter(f => f.parentId === parentId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      
    children.forEach(child => {
      list.push(child.id);
      if (child.type === 'folder' && expandedFolders[child.id]) {
        list.push(...getFlatVisibleNodes(child.id));
      }
    });
    return list;
  };

  // Keyboard navigation & clicks
  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      setSelectedNodeIds(prev => 
        prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
      );
    } else if (e.shiftKey && selectedNodeIds.length > 0) {
      const visible = getFlatVisibleNodes('root');
      const lastSelected = selectedNodeIds[selectedNodeIds.length - 1];
      const idxA = visible.indexOf(lastSelected);
      const idxB = visible.indexOf(nodeId);
      if (idxA !== -1 && idxB !== -1) {
        const start = Math.min(idxA, idxB);
        const end = Math.max(idxA, idxB);
        const range = visible.slice(start, end + 1);
        setSelectedNodeIds(Array.from(new Set([...selectedNodeIds, ...range])));
      }
    } else {
      setSelectedNodeIds([nodeId]);
      if (files[nodeId]?.type === 'file') {
        onSelectFile(nodeId);
      } else {
        toggleFolder(nodeId);
      }
    }
  };

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

  const handleCopyPath = (id: string) => {
    const path = getNodePath(id);
    navigator.clipboard.writeText(path);
  };

  // Right-click Trigger Context menu
  const handleContextMenu = (e: React.MouseEvent, nodeId: string | null) => {
    e.preventDefault();
    e.stopPropagation();

    if (nodeId && !selectedNodeIds.includes(nodeId)) {
      setSelectedNodeIds([nodeId]);
    }

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

    setContextMenu({ x, y, nodeId });
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'html': return <FileCode2 className="h-4 w-4 text-cyan-400 shrink-0" />;
      case 'css': return <FileCode className="h-4 w-4 text-indigo-400 shrink-0" />;
      case 'js': return <FileCode className="h-4 w-4 text-amber-400 shrink-0" />;
      case 'ts': return <FileCode className="h-4 w-4 text-sky-400 shrink-0" />;
      case 'py': return <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />;
      case 'json': return <FileJson className="h-4 w-4 text-violet-400 shrink-0" />;
      case 'md': return <Info className="h-4 w-4 text-amber-500 shrink-0" />;
      default: return <FileCode className="h-4 w-4 text-slate-400 shrink-0" />;
    }
  };

  // Recursively Render the workspace tree
  const renderTree = (folderId: string, depth: number) => {
    const children = (Object.values(files) as FileNode[])
      .filter(f => {
        if (f.parentId !== folderId) return false;
        const name = f.name ? f.name.toLowerCase() : '';
        return name !== 'dockerfile' && name !== 'vercel.json';
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return children.map((node) => {
      const isFolder = node.type === 'folder';
      const isOpen = expandedFolders[node.id];
      const isEditing = editingNodeId === node.id;
      const isActive = activeFileId === node.id;
      const isSelected = selectedNodeIds.includes(node.id);
      const isCut = clipboardNodeIds.includes(node.id) && clipboardAction === 'cut';

      return (
        <div 
          key={node.id} 
          className="select-none font-mono min-w-0 overflow-hidden"
          style={{ paddingLeft: `${Math.min(depth * 8, 32)}px` }}
        >
          {/* Node Row */}
          <div 
            id={`file_node_${node.id}`}
            onClick={(e) => handleNodeClick(e, node.id)}
            onDoubleClick={(e) => { e.stopPropagation(); startRename(node.id, node.name); }}
            onContextMenu={(e) => handleContextMenu(e, node.id)}
            draggable
            onDragStart={(e) => handleNodeDragStart(e, node.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => isFolder && handleNodeDrop(e, node.id)}
            className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-all border max-w-full overflow-hidden min-w-0 ${
              isSelected 
                ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/40 shadow-md shadow-indigo-500/5' 
                : isActive 
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'
            } ${isCut ? 'opacity-40 border-dashed border-slate-500' : ''}`}
          >
            <div className="flex items-center space-x-1.5 flex-1 min-w-0 overflow-hidden">
              {isFolder ? (
                isOpen ? <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-500 shrink-0" />
              ) : (
                <span className="w-3 shrink-0" />
              )}

              {isFolder ? (
                isOpen ? <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" /> : <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
              ) : (
                <span className="shrink-0 flex items-center">{getFileIcon(node.name)}</span>
              )}

              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveRename(node.id)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRename(node.id)}
                  className="glass-input rounded px-1 text-[11px] text-white outline-none w-full min-w-0"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate min-w-0 text-[11px] font-mono">{node.name}</span>
              )}
            </div>

            {/* Hover Actions Bar */}
            {!isEditing && (
              <div className={`${
                isSelected || isActive 
                  ? 'flex' 
                  : 'flex md:hidden md:group-hover:flex'
              } items-center space-x-0.5 shrink-0 ml-1`}>
                {isFolder && (
                  <button
                    onClick={(e) => { e.stopPropagation(); createNode('file', node.id); }}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-indigo-400 cursor-pointer shrink-0"
                    title="New File Inside"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(node.id, node.name); }}
                  className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-amber-400 cursor-pointer shrink-0"
                  title="Rename"
                >
                  <Edit className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); triggerDeleteConfirm([node.id]); }}
                  className="p-1 hover:bg-red-500/10 rounded text-slate-400 hover:text-red-400 cursor-pointer shrink-0"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Children block */}
          {isFolder && isOpen && (
            <div className="space-y-0.5 mt-0.5">
              {renderTree(node.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div 
      id="file_explorer_tab" 
      className="h-full flex flex-col justify-between bg-transparent text-slate-300 select-none relative min-h-0 min-w-0 overflow-hidden"
      onContextMenu={(e) => handleContextMenu(e, null)}
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        
        {/* Explorer toolbar */}
        <div className="flex items-center justify-between px-2.5 sm:px-3 py-1.5 border-b border-white/5 shrink-0 min-w-0 w-full overflow-x-auto touch-pan-x scrollbar-none gap-2 select-none">
          <div className="flex items-center space-x-1 shrink-0 w-full justify-between whitespace-nowrap py-0.5">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={handleFilesImport}
            />
            <input
              type="file"
              ref={folderInputRef}
              {...{ webkitdirectory: "", directory: "" }}
              multiple
              className="hidden"
              onChange={handleFolderImport}
            />

            <div className="flex items-center space-x-1">
              <button
                onClick={() => createNode('file')}
                className="p-1 sm:p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer active:scale-95 shrink-0"
                title="Add File to Root"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => createNode('folder')}
                className="p-1 sm:p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer active:scale-95 shrink-0"
                title="Add Folder to Root"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              {clipboardNodeIds.length > 0 && (
                <button
                  onClick={() => handlePaste('root')}
                  className="p-1 sm:p-1.5 hover:bg-indigo-500/10 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer animate-pulse active:scale-95 shrink-0"
                  title="Paste Clipboard items to Root"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 sm:p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer active:scale-95 shrink-0"
                title="Import Files"
              >
                <FileUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="p-1 sm:p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer active:scale-95 shrink-0"
                title="Import Folder Structure"
              >
                <FolderUp className="h-3.5 w-3.5 text-cyan-400" />
              </button>
              <button
                onClick={onDownloadProject}
                className="p-1 sm:p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer active:scale-95 shrink-0"
                title="Export workspace as ZIP"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Compact Drag and Drop area */}
        <div 
          onDragOver={handleDragOver}
          onDrop={(e) => handleDropFromDesktop(e, 'root')}
          className="px-2 py-1 mx-2 my-1.5 border border-dashed border-white/10 rounded-lg bg-white/5 text-center cursor-pointer hover:border-indigo-500/30 transition-all shrink-0"
        >
          <span className="text-[9px] text-slate-400 font-sans block truncate">
            Drag & drop files or folders here to import
          </span>
        </div>

        {/* Tree Render area */}
        <div className="px-2 py-3 space-y-1 overflow-y-auto flex-1 min-h-0 min-w-0">
          {renderTree('root', 0)}
        </div>

      </div>

      {/* Progress Bars overlays */}
      {uploadProgress && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-50 text-center">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-3" />
          <span className="text-xs font-bold text-white mb-1">Uploading Files</span>
          <span className="text-[10px] text-slate-400 truncate max-w-[200px] mb-3">{uploadProgress.filename}</span>
          <div className="w-40 bg-white/10 rounded-full h-1.5 mb-2 overflow-hidden">
            <div 
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-150" 
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-mono">{uploadProgress.current} / {uploadProgress.total}</span>
        </div>
      )}

      {operationProgress && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-50 text-center">
          <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mb-3" />
          <span className="text-xs font-bold text-white mb-3">{operationProgress.title}</span>
          <div className="w-40 bg-white/10 rounded-full h-1.5 mb-2 overflow-hidden">
            <div 
              className="bg-cyan-400 h-1.5 rounded-full transition-all duration-150" 
              style={{ width: `${(operationProgress.current / operationProgress.total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {Math.round((operationProgress.current / operationProgress.total) * 100)}%
          </span>
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed bg-[#09090f]/95 backdrop-blur-md border border-white/10 rounded-xl py-1.5 shadow-2xl z-50 min-w-[160px] font-sans text-xs animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.nodeId ? (
            // Context menu for a file or folder
            <>
              {files[contextMenu.nodeId]?.type === 'folder' && (
                <>
                  <button 
                    onClick={() => { createNode('file', contextMenu.nodeId!); setContextMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
                  >
                    <Plus className="h-3.5 w-3.5" /> <span>New File</span>
                  </button>
                  <button 
                    onClick={() => { createNode('folder', contextMenu.nodeId!); setContextMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
                  >
                    <FolderPlus className="h-3.5 w-3.5" /> <span>New Folder</span>
                  </button>
                  <div className="border-t border-white/5 my-1" />
                </>
              )}
              <button 
                onClick={() => { handleCopy(selectedNodeIds); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Copy className="h-3.5 w-3.5" /> <span>Copy</span>
              </button>
              <button 
                onClick={() => { handleCut(selectedNodeIds); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Scissors className="h-3.5 w-3.5" /> <span>Cut</span>
              </button>
              
              {files[contextMenu.nodeId]?.type === 'folder' && (
                <button 
                  disabled={clipboardNodeIds.length === 0}
                  onClick={() => { if (clipboardNodeIds.length > 0) { handlePaste(contextMenu.nodeId!); setContextMenu(null); } }}
                  className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 ${
                    clipboardNodeIds.length === 0 
                      ? 'opacity-40 cursor-not-allowed text-slate-600 hover:bg-transparent' 
                      : 'hover:bg-white/5 text-indigo-400 hover:text-indigo-300'
                  }`}
                >
                  <Clipboard className="h-3.5 w-3.5" /> <span>Paste Inside</span>
                </button>
              )}

              <div className="border-t border-white/5 my-1" />
              <button 
                onClick={() => { startRename(contextMenu.nodeId!, files[contextMenu.nodeId!]?.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Edit className="h-3.5 w-3.5" /> <span>Rename</span>
              </button>
              <button 
                onClick={() => { duplicateNodes(selectedNodeIds); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Copy className="h-3.5 w-3.5 text-slate-500" /> <span>Duplicate</span>
              </button>
              <button 
                onClick={() => { handleCopyPath(contextMenu.nodeId!); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <FileCode className="h-3.5 w-3.5" /> <span>Copy Path</span>
              </button>
              <button 
                onClick={() => { 
                  if (files[contextMenu.nodeId!]?.type === 'folder') {
                    handleDownloadFolder(contextMenu.nodeId!);
                  } else {
                    handleDownloadSingleFile(contextMenu.nodeId!);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Download className="h-3.5 w-3.5" /> <span>Download</span>
              </button>
              <button 
                onClick={() => { setPropertiesNodeId(contextMenu.nodeId!); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Info className="h-3.5 w-3.5" /> <span>Properties</span>
              </button>
              <button 
                onClick={() => { 
                  setMoveNodeId(contextMenu.nodeId!); 
                  setMovePathInput(getNodePath(contextMenu.nodeId!)); 
                  setContextMenu(null); 
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <RefreshCw className="h-3.5 w-3.5 text-indigo-400 animate-spin-slow" /> <span>Move / Change Path</span>
              </button>
              
              <div className="border-t border-white/5 my-1" />
              <button 
                onClick={() => { triggerDeleteConfirm(selectedNodeIds); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-red-400 hover:bg-red-500/10 flex items-center space-x-2"
              >
                <Trash2 className="h-3.5 w-3.5" /> <span>Delete</span>
              </button>
            </>
          ) : (
            // Context menu for the empty space (root action)
            <>
              <button 
                onClick={() => { createNode('file', 'root'); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <FilePlus className="h-3.5 w-3.5" /> <span>New File</span>
              </button>
              <button 
                onClick={() => { createNode('folder', 'root'); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <FolderPlus className="h-3.5 w-3.5" /> <span>New Folder</span>
              </button>
              
              <button 
                disabled={clipboardNodeIds.length === 0}
                onClick={() => { if (clipboardNodeIds.length > 0) { handlePaste('root'); setContextMenu(null); } }}
                className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 ${
                  clipboardNodeIds.length === 0 
                    ? 'opacity-40 cursor-not-allowed text-slate-600 hover:bg-transparent' 
                    : 'hover:bg-white/5 text-indigo-400 hover:text-indigo-300'
                }`}
              >
                <Clipboard className="h-3.5 w-3.5" /> <span>Paste Here</span>
              </button>

              <div className="border-t border-white/5 my-1" />
              <button 
                onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <FileUp className="h-3.5 w-3.5" /> <span>Upload Files</span>
              </button>
              <button 
                onClick={() => { folderInputRef.current?.click(); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <FolderUp className="h-3.5 w-3.5" /> <span>Upload Folder</span>
              </button>
              <button 
                onClick={() => { onDownloadProject(); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-slate-300 hover:text-white flex items-center space-x-2"
              >
                <Download className="h-3.5 w-3.5" /> <span>Export ZIP</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Elegant floating Properties dialog modal */}
      {propertiesNodeId && files[propertiesNodeId] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-text font-sans">
          <div className="bg-[#0b0b11] border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left">
            <h4 className="text-sm font-bold text-white mb-4 border-b border-white/5 pb-2 flex items-center space-x-2">
              <Info className="h-4 w-4 text-indigo-400" />
              <span>Explorer Item Properties</span>
            </h4>
            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Name:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-white font-semibold">{files[propertiesNodeId].name}</span>
                  <button 
                    onClick={() => {
                      const name = files[propertiesNodeId].name;
                      setPropertiesNodeId(null);
                      startRename(propertiesNodeId, name);
                    }}
                    className="p-1 hover:bg-white/10 rounded text-[10px] text-indigo-400 hover:text-indigo-300"
                    title="Rename"
                  >
                    Rename
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Type:</span>
                <span className="text-indigo-300 uppercase font-semibold">{files[propertiesNodeId].type}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Relative Path:</span>
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-slate-300 select-all truncate max-w-[140px]" title={getNodePath(propertiesNodeId)}>/ {getNodePath(propertiesNodeId)}</span>
                  <button 
                    onClick={() => {
                      setMoveNodeId(propertiesNodeId);
                      setMovePathInput(getNodePath(propertiesNodeId));
                      setPropertiesNodeId(null);
                    }}
                    className="p-1 hover:bg-white/10 rounded text-[10px] text-indigo-400 hover:text-indigo-300 shrink-0"
                    title="Move Path"
                  >
                    Move
                  </button>
                </div>
              </div>
              {files[propertiesNodeId].type === 'file' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Size:</span>
                    <span className="text-slate-300">{(files[propertiesNodeId].content?.length || 0)} chars</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Language:</span>
                    <span className="text-emerald-400">{files[propertiesNodeId].language || 'plain_text'}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Node ID:</span>
                <span className="text-slate-500 text-[10px]">{propertiesNodeId}</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setPropertiesNodeId(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move & Change Path Modal */}
      {moveNodeId && files[moveNodeId] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-text font-sans">
          <div className="bg-[#0b0b11] border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left">
            <h4 className="text-sm font-bold text-white mb-3 border-b border-white/5 pb-2 flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 text-indigo-400" />
              <span>Move & Change Path</span>
            </h4>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Moving item: <strong className="text-indigo-300">/{getNodePath(moveNodeId)}</strong>
            </p>
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Destination Relative Path
              </label>
              <input
                type="text"
                value={movePathInput}
                onChange={(e) => setMovePathInput(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500/50 transition-all font-mono"
                placeholder="e.g. src/components/Button.tsx"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    moveNodeToPath(moveNodeId, movePathInput);
                    setMoveNodeId(null);
                  }
                }}
              />
              <span className="text-[10px] text-slate-500 block leading-normal mt-1">
                Tip: Enter the new path. Missing parent folders will be created automatically.
              </span>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button 
                onClick={() => setMoveNodeId(null)}
                className="px-4 py-1.5 hover:bg-white/5 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  moveNodeToPath(moveNodeId, movePathInput);
                  setMoveNodeId(null);
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-lg shadow-indigo-600/20"
              >
                Apply Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmNodeIds && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none font-sans">
          <div className="bg-[#0b0b11] border border-red-500/20 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-left">
            <h4 className="text-sm font-bold text-red-400 mb-3 border-b border-white/5 pb-2 flex items-center space-x-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              <span>Confirm Permanent Deletion</span>
            </h4>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white font-semibold">
                {deleteConfirmNodeIds.length === 1
                  ? `"${files[deleteConfirmNodeIds[0]]?.name || 'this item'}"`
                  : `${deleteConfirmNodeIds.length} selected items`}
              </strong>{' '}
              and all of their contents? This operation is irreversible.
            </p>
            <div className="flex justify-end space-x-2">
              <button 
                onClick={() => setDeleteConfirmNodeIds(null)}
                className="px-4 py-1.5 hover:bg-white/5 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  deleteNodes(deleteConfirmNodeIds);
                  setDeleteConfirmNodeIds(null);
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-lg shadow-red-600/20"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace footnote */}
      <div className="p-4 border-t border-white/5 bg-transparent text-[10px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
          <span>Connected: local-compiler-v3</span>
        </div>
        {selectedNodeIds.length > 0 && (
          <span className="text-[10px] text-indigo-400 font-mono font-semibold">
            {selectedNodeIds.length} item{selectedNodeIds.length > 1 ? 's' : ''} selected
          </span>
        )}
      </div>

    </div>
  );
}
