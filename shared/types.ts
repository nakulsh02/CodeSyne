export type ProjectType = 'web' | 'javascript' | 'typescript' | 'python' | 'golang' | 'rust' | 'java' | 'c' | 'cpp' | 'php' | 'swift' | 'kotlin' | 'ruby' | 'csharp' | 'dart' | 'scala' | 'r';

export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  status: 'active' | 'archived';
  ownerId: string;
  sharedWith: string[];
  files?: FileSystemState;
  messages?: ChatMessage[];
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content?: string;
  language?: string;
}

export interface FileSystemState {
  [id: string]: FileNode;
}

export interface OpenTab {
  fileId: string;
  isDirty?: boolean;
}

export interface ChatMessage {
  id: string;
  projectId?: string;
  senderId?: string;
  senderName: string;
  senderEmail: string;
  senderAvatar: string;
  text: string;
  timestamp: string | number;
  isSystem?: boolean;
}

export interface WorkspaceStats {
  linesCoded: number;
  activeHours: number;
  projectsCount: number;
  commitsCount: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  bio: string;
  avatar: string;
  githubUsername?: string;
  achievements: string[];
  stats: WorkspaceStats;
  role?: 'admin' | 'user';
  hasCustomAvatar?: boolean;
  password?: string;
  whatsapp?: string;
}

export interface GitCommit {
  id: string;
  message: string;
  author: string;
  timestamp: string | number;
  hash: string;
  additions: number;
  deletions: number;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  commits: GitCommit[];
}

export interface GitState {
  branches: GitBranch[];
  stagedFiles: string[]; // fileIds
  unstagedFiles: string[]; // fileIds
}

export interface VersionSnapshot {
  id: string;
  timestamp: string | number;
  description: string;
  fileSystem: FileSystemState;
}

export interface ExecutionResult {
  output: string;
  errors: string;
  executionTime: number;
  memoryUsage: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

export interface CollabUser {
  id: string;
  name: string;
  username?: string;
  connectionId?: string;
  color: string;
  avatar: string;
  role?: 'Owner' | 'Editor' | 'Viewer';
  cursor?: {
    fileId: string;
    lineNumber: number;
    column: number;
    selectionStartLineNumber?: number;
    selectionStartColumn?: number;
    endLineNumber?: number;
    endColumn?: number;
  };
  isTyping?: boolean;
}

export interface FileAccessLog {
  id: string;
  projectId: string;
  fileId: string;
  fileName: string;
  filePath: string;
  userEmail: string;
  username: string;
  device: string;
  openedAt: string;
}

export function getBotAvatarUrl(seed: string, username?: string): string {
  const cleanSeed = (seed || username || 'bot').trim().toLowerCase();
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanSeed)}`;
}

export function getSecureAvatarUrl(email: string, username?: string): string {
  return getBotAvatarUrl(email, username);
}
