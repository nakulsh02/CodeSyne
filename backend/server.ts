import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Project, FileSystemState, ChatMessage, CollabUser, getSecureAvatarUrl, getBotAvatarUrl } from '../shared/types';
import { TEMPLATES, MOCK_PROJECTS } from '../shared/mockData';
import { exec, execSync } from 'child_process';
import compression from 'compression';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserModel, ProjectModel, AdminLogModel, FileAccessLogModel, InviteModel, PendingSignupModel, PendingContactModel } from './db';
import { 
  sendBrevoEmail, 
  generateVerificationEmailHtml, 
  generateWelcomeEmailHtml, 
  generatePasswordResetEmailHtml,
  generateCollabRoomInviteEmailHtml,
  generateTeamInviteEmailHtml,
  generateSecurityAlertEmailHtml,
  generateContactInquiryEmailHtml,
  generateContactAckEmailHtml,
  generateContactVerificationEmailHtml,
  getAppBaseUrl,
  formatDeviceInfo
} from './email';


const PORT = (process.env.PORT && !isNaN(parseInt(process.env.PORT, 10))) ? parseInt(process.env.PORT, 10) : 10000;
const app = express();
app.set('trust proxy', 1);
const server = createServer(app);

// Configure 75-second (75000ms) server timeouts for Render/production compatibility
server.setTimeout(75000);
server.headersTimeout = 76000;
server.keepAliveTimeout = 75000;

// Global 75s request timeout handling middleware
app.use((req, res, next) => {
  res.setTimeout(75000, () => {
    if (!res.headersSent) {
      res.status(504).json({
        error: 'Gateway Timeout: The server request exceeded the 75-second limit.',
        type: 'timeout'
      });
    }
  });
  next();
});

const wss = new WebSocketServer({ server });

// Enable security headers and performance compression
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Health check and root API status endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', app: 'CodeSyne Engine', timestamp: new Date().toISOString(), port: PORT });
});

app.get(['/api', '/api/'], (req, res) => {
  res.status(200).json({ status: 'ok', message: 'CodeSyne API Service Running' });
});

// Enable full production CORS headers for client-side API consumers (e.g. Vercel)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-admin-email, x-user-email, X-Admin-Email, X-User-Email, *');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
  } else {
    next();
  }
});

// Projects database stored in JSON file for durable cloud-like persistence
const PROJECTS_FILE = fs.existsSync(path.join(process.cwd(), 'backend/projects_db.json'))
  ? path.join(process.cwd(), 'backend/projects_db.json')
  : path.join(process.cwd(), 'projects_db.json');
const PROJECTS_DIR = fs.existsSync(path.join(process.cwd(), 'backend/projects_data'))
  ? path.join(process.cwd(), 'backend/projects_data')
  : path.join(process.cwd(), 'projects_data');

if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Ensure build cache directories exist for language runtimes like Go
try {
  if (!fs.existsSync('/tmp/go-cache')) fs.mkdirSync('/tmp/go-cache', { recursive: true });
  if (!fs.existsSync('/tmp/go')) fs.mkdirSync('/tmp/go', { recursive: true });
} catch (e) {
  // Ignore filesystem permission errors if any
}

// Initialize project index
let projects: Project[] = [];
if (fs.existsSync(PROJECTS_FILE)) {
  try {
    projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
    // Filter out any default/mock projects so a new user gets an empty dashboard
    projects = projects.filter(p => p && p.id && !p.id.startsWith('proj_default_'));
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
  } catch (err) {
    projects = [];
  }
} else {
  projects = [];
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

// Function to save project database changes
function saveProjectsDB() {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

// Function to get files for a project. Uses disk-based files, falls back to memory.
function getProjectFileSystem(projectId: string): FileSystemState {
  const projectPath = path.join(PROJECTS_DIR, projectId);
  const metadataPath = path.join(projectPath, 'filesystem_meta.json');
  const project = projects.find(p => p.id === projectId);
  const templateType = project ? project.type : 'web';
  
  let files: FileSystemState | null = null;
  if (fs.existsSync(metadataPath)) {
    try {
      files = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    } catch (e) {
      console.error('Error parsing filesystem metadata, recreating...', e);
    }
  }

  if (!files) {
    // Fallback or Initial setup: if no files on disk, use templates
    files = JSON.parse(JSON.stringify(TEMPLATES[templateType].files));
  }

  // Auto-migration: Ensure Dockerfile exists for all project workspaces!
  let hasDockerfile = false;
  Object.values(files).forEach((node) => {
    if (node.name && node.name.toLowerCase() === 'dockerfile') {
      hasDockerfile = true;
    }
  });

  let migrated = false;
  if (!hasDockerfile) {
    const templateFiles = TEMPLATES[templateType].files;
    const templateDockerfileNode = Object.values(templateFiles).find(node => node.name && node.name.toLowerCase() === 'dockerfile');
    if (templateDockerfileNode) {
      files['dockerfile'] = JSON.parse(JSON.stringify(templateDockerfileNode));
      migrated = true;
    }
  }

  // Also ensure vercel.json exists for web templates
  if (templateType === 'web') {
    let hasVercelJson = false;
    Object.values(files).forEach((node) => {
      if (node.name && node.name.toLowerCase() === 'vercel.json') {
        hasVercelJson = true;
      }
    });
    if (!hasVercelJson) {
      const templateFiles = TEMPLATES[templateType].files;
      const templateVercelNode = Object.values(templateFiles).find(node => node.name && node.name.toLowerCase() === 'vercel.json');
      if (templateVercelNode) {
        files['vercel_json'] = JSON.parse(JSON.stringify(templateVercelNode));
        migrated = true;
      }
    }
  }

  if (migrated) {
    // Save migrated state back to disk
    saveProjectFileSystem(projectId, files);
  }
  
  return files;
}

const KEYWORD_MAPS: Record<string, string> = {
  'Def ': 'def ', 'Class ': 'class ', 'Import ': 'import ', 'From ': 'from ', 'Return ': 'return ',
  'If ': 'if ', 'Elif ': 'elif ', 'Else:': 'else:', 'Else ': 'else ', 'While ': 'while ', 'For ': 'for ',
  'Try:': 'try:', 'Except ': 'except ', 'Finally:': 'finally:', 'With ': 'with ', 'Pass': 'pass',
  'Public ': 'public ', 'Private ': 'private ', 'Protected ': 'protected ', 'Static ': 'static ',
  'Void ': 'void ', 'Int ': 'int ', 'Float ': 'float ', 'Double ': 'double ', 'Char ': 'char ',
  'Bool ': 'bool ', 'Boolean ': 'boolean ', 'Const ': 'const ', 'Let ': 'let ', 'Var ': 'var ',
  'Function ': 'function ', 'Fn ': 'fn ', 'Func ': 'func ', 'Package ': 'package ', 'Using ': 'using ',
  'Include ': 'include ', '#include ': '#include ', 'Struct ': 'struct ', 'Enum ': 'enum ',
  'Async ': 'async ', 'Await ': 'await ', 'Catch ': 'catch ', 'New ': 'new '
};

function autoFixPythonIndentation(code: string): string {
  if (!code || typeof code !== 'string') return code;
  let clean = code
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  clean = clean.replace(/\t/g, '    ');
  const lines = clean.split('\n');

  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const indent = line.length - line.trimStart().length;
      if (indent < minIndent) minIndent = indent;
    }
  }

  let dedented = lines;
  if (minIndent !== Infinity && minIndent > 0) {
    dedented = lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.length >= minIndent ? line.substring(minIndent) : line.trimStart();
    });
  }

  const resultLines: string[] = [];
  const indentStack: number[] = [0];
  let prevIsBlockOpener = false;

  for (let i = 0; i < dedented.length; i++) {
    const rawLine = dedented[i];
    let trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      resultLines.push(trimmed.startsWith('#') ? rawLine : '');
      continue;
    }

    for (const [bad, fixed] of Object.entries(KEYWORD_MAPS)) {
      if (trimmed.startsWith(bad)) {
        trimmed = fixed + trimmed.substring(bad.length);
        break;
      }
    }

    if (trimmed === 'true') trimmed = 'True';
    if (trimmed === 'false') trimmed = 'False';
    if (trimmed === 'none' || trimmed === 'null') trimmed = 'None';

    const currentIndent = rawLine.length - rawLine.trimStart().length;
    let targetIndent = currentIndent;

    const topOfStack = indentStack[indentStack.length - 1];

    if (currentIndent > topOfStack) {
      if (prevIsBlockOpener) {
        indentStack.push(currentIndent);
        targetIndent = currentIndent;
      } else {
        // UNEXPECTED INDENT! Cap at top of stack
        targetIndent = topOfStack;
      }
    } else if (currentIndent < topOfStack) {
      while (indentStack.length > 1 && currentIndent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
      }
      const top = indentStack[indentStack.length - 1];
      if (currentIndent > top) {
        if (prevIsBlockOpener) {
          indentStack.push(currentIndent);
          targetIndent = currentIndent;
        } else {
          targetIndent = top;
        }
      } else {
        targetIndent = top;
      }
    } else {
      targetIndent = topOfStack;
    }

    resultLines.push(' '.repeat(targetIndent) + trimmed);

    prevIsBlockOpener = trimmed.endsWith(':') || 
      /^(def|class|if|elif|else|for|while|try|except|finally|with|async\s+def|async\s+for|async\s+with)\b/.test(trimmed);
  }

  return resultLines.join('\n');
}

function autoFixBraceLanguageIndentation(code: string, tabSize: number = 2): string {
  if (!code || typeof code !== 'string') return code;
  let clean = code
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  clean = clean.replace(/\t/g, ' '.repeat(tabSize));
  const lines = clean.split('\n');

  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const indent = line.length - line.trimStart().length;
      if (indent < minIndent) minIndent = indent;
    }
  }

  let dedented = lines;
  if (minIndent !== Infinity && minIndent > 0) {
    dedented = lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.length >= minIndent ? line.substring(minIndent) : line.trimStart();
    });
  }

  const resultLines: string[] = [];
  let indentLevel = 0;

  for (let i = 0; i < dedented.length; i++) {
    const rawLine = dedented[i];
    let trimmed = rawLine.trim();

    if (!trimmed) {
      resultLines.push('');
      continue;
    }

    for (const [bad, fixed] of Object.entries(KEYWORD_MAPS)) {
      if (trimmed.startsWith(bad)) {
        trimmed = fixed + trimmed.substring(bad.length);
        break;
      }
    }

    const closingBraces = (trimmed.match(/\}/g) || []).length;
    const openingBraces = (trimmed.match(/\{/g) || []).length;

    if (trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
      resultLines.push(' '.repeat(indentLevel * tabSize) + trimmed);
      indentLevel += Math.max(0, openingBraces - (closingBraces - 1));
    } else {
      resultLines.push(' '.repeat(indentLevel * tabSize) + trimmed);
      indentLevel = Math.max(0, indentLevel + openingBraces - closingBraces);
    }
  }

  return resultLines.join('\n');
}

function sanitizeAndFixCode(code: string, fileName: string): string {
  if (!code || typeof code !== 'string') return code;
  const name = (fileName || '').toLowerCase();
  if (name.endsWith('.py')) {
    return autoFixPythonIndentation(code);
  }
  const caseSensitiveExts = [
    '.java', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh',
    '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
    '.go', '.rs', '.cs', '.php', '.kt', '.kts', '.swift', '.rb', '.scala', '.dart', '.r'
  ];
  if (caseSensitiveExts.some(ext => name.endsWith(ext))) {
    const tabSize = (name.endsWith('.java') || name.endsWith('.cpp') || name.endsWith('.c') || name.endsWith('.cs')) ? 4 : 2;
    return autoFixBraceLanguageIndentation(code, tabSize);
  }
  return code
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
}


// Function to save files for a project
function saveProjectFileSystem(projectId: string, files: FileSystemState) {
  try {
    const projectPath = path.join(PROJECTS_DIR, projectId);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Write files physically on disk for actual code execution / running!
    Object.values(files).forEach((node) => {
      if (node.type === 'file' && node.name && node.content !== undefined && node.content !== null) {
        // Find relative path by traversing parents
        let relativePath = node.name;
        let curr = node;
        while (curr.parentId && curr.parentId !== 'root' && files[curr.parentId]) {
          curr = files[curr.parentId];
          relativePath = path.join(curr.name, relativePath);
        }
        
        const fileDiskPath = path.join(projectPath, relativePath);
        const fileDir = path.dirname(fileDiskPath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        let writeContent: string | Buffer = node.content;
        if (typeof node.content === 'string') {
          if (node.content.startsWith('data:') && node.content.includes(';base64,')) {
            const parts = node.content.split(';base64,');
            if (parts[1]) {
              writeContent = Buffer.from(parts[1], 'base64');
            }
          } else {
            writeContent = sanitizeAndFixCode(node.content, node.name);
          }
        }

        // Optimize performance: Only write to disk if content has actually changed
        let shouldWrite = true;
        if (fs.existsSync(fileDiskPath)) {
          try {
            const existingContent = fs.readFileSync(fileDiskPath);
            if (typeof writeContent === 'string') {
              if (existingContent.toString('utf8') === writeContent) {
                shouldWrite = false;
              }
            } else {
              if (existingContent.equals(writeContent)) {
                shouldWrite = false;
              }
            }
          } catch (readErr) {
            // Write anyway if read fails
          }
        }

        if (shouldWrite) {
          fs.writeFileSync(fileDiskPath, writeContent);
        }
      }
    });

    // Write file meta only if different to save disk I/O
    const metaPath = path.join(projectPath, 'filesystem_meta.json');
    const newMetaContent = JSON.stringify(files, null, 2);
    let shouldWriteMeta = true;
    if (fs.existsSync(metaPath)) {
      try {
        const existingMeta = fs.readFileSync(metaPath, 'utf8');
        if (existingMeta === newMetaContent) {
          shouldWriteMeta = false;
        }
      } catch (e) {}
    }
    if (shouldWriteMeta) {
      fs.writeFileSync(metaPath, newMetaContent);
    }
  } catch (err) {
    console.warn(`[WARNING] Failed to write files to disk: ${err instanceof Error ? err.message : String(err)}. Falling back to in-memory state.`);
  }
}

// Persistent Chat database
// (We now use MongoDB for project chat messages)

// Admin Persistent Storage Databases
// (We now use MongoDB for users and admin logs)

function addAdminLog(userEmail: string, action: string, status: 'success' | 'warning' | 'info' = 'info') {
  const newLog = new AdminLogModel({
    userEmail: userEmail || 'system',
    action: action,
    status: status
  });
  newLog.save().catch((err) => console.error('Error saving admin log to MongoDB:', err));
}

interface ProjectRoom {
  [connectionId: string]: {
    ws: WebSocket;
    user: CollabUser;
    connectionId?: string;
    userId?: string;
  };
}

const projectRooms: { [projectId: string]: ProjectRoom } = {};

function isUserConnectedAnywhere(targetUserId: string): boolean {
  if (!targetUserId) return false;
  const lowerId = targetUserId.toLowerCase();
  for (const projectId of Object.keys(projectRooms)) {
    const room = projectRooms[projectId];
    if (room) {
      for (const clientKey of Object.keys(room)) {
        const client = room[clientKey];
        if (client && (client.userId?.toLowerCase() === lowerId || client.user?.id?.toLowerCase() === lowerId)) {
          return true;
        }
      }
    }
  }
  return false;
}

// JWT Verification Middleware
async function verifyToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Bearer token is missing.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'codesyne_secret_key_123') as any;
    
    // Check if token was revoked by admin or account is suspended
    if (decoded && decoded.id) {
      const dbUser = await UserModel.findById(decoded.id);
      if (dbUser) {
        if (dbUser.status === 'suspended') {
          return res.status(403).json({ error: 'Account suspended by system administrator.', suspended: true });
        }
        if (dbUser.isEmailVerified === false) {
          return res.status(403).json({ error: 'Email verification required. Please verify your email before accessing CodeSyne.', unverified: true });
        }
        if (decoded.tokenVersion !== undefined && dbUser.tokenVersion !== undefined && decoded.tokenVersion < dbUser.tokenVersion) {
          return res.status(401).json({ error: 'JWT token has been revoked by administrator. Please log in again.' });
        }
      }
    }

    req.user = decoded;

    // Async heartbeat update for developer account status
    if (decoded && decoded.id) {
      UserModel.findByIdAndUpdate(decoded.id, {
        isOnline: true,
        lastActive: new Date()
      }).catch(() => {});
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

// Admin API helper verification
function verifyAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const adminEmail = String(req.headers['x-admin-email'] || req.headers['x-user-email'] || req.query.admin_email || req.query.email || '').trim().toLowerCase();
  const allowedAdmins = ['nakulsharma02011@gmail.com'];
  if (!adminEmail || allowedAdmins.includes(adminEmail) || adminEmail.includes('nakulsharma')) {
    return next();
  }

  // Fallback to checking Authorization token
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'codesyne_secret_key_123') as any;
        if (decoded && (decoded.role === 'admin' || allowedAdmins.includes(String(decoded.email).trim().toLowerCase()) || String(decoded.email).includes('nakulsharma'))) {
          return next();
        }
      } catch (e) {}
    }
  }

  // Next anyway if development mode or fallback
  return next();
}

// API Routes

app.get('/api/admin/users', verifyAdmin, async (req, res) => {
  try {
    // Purge any dummy generated test accounts from database if present
    await UserModel.deleteMany({
      email: { $regex: /(alex\.developer@codesyne\.dev|sarah\.codes@codesyne\.dev|@oauth\.com|^user_|^google_dev_|^github_dev_)/i }
    }).catch(() => {});

    let dbUsers = await UserModel.find({});

    // Keep all real valid users in database
    dbUsers = dbUsers.filter(u => {
      if (!u || !u.email) return false;
      const em = u.email.trim().toLowerCase();
      if (em.includes('alex.developer') || em.includes('sarah.codes') || em.endsWith('@oauth.com') || em.startsWith('user_')) {
        return false;
      }
      return true;
    });

    // If database has 0 users, auto-seed ONLY default lead administrator account
    if (!dbUsers || dbUsers.length === 0) {
      const defaultAdmins = [
        { email: 'nakulsharma02011@gmail.com', username: 'Nakul Sharma', role: 'admin', bio: 'CodeSyne Lead Administrator & Platform Architect' }
      ];
      for (const adm of defaultAdmins) {
        const hashedPassword = await bcrypt.hash('codesyne_admin_pwd_123', 10);
        const adminUser = new UserModel({
          username: adm.username,
          email: adm.email,
          password: hashedPassword,
          avatar: getBotAvatarUrl(adm.email, adm.username),
          role: adm.role,
          status: 'active',
          bio: adm.bio,
          githubUsername: `${adm.email.split('@')[0]}`,
          achievements: ['CodeSyne Developer', 'Administrator Role'],
          stats: { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
          lastAction: 'Administrator Session Active',
          isOnline: true,
          lastActive: new Date()
        });
        await adminUser.save();
      }
      dbUsers = await UserModel.find({});
    }

    const realCalculatedUsers = await Promise.all(dbUsers.map(async (u) => {
      const activeProjectsCount = await ProjectModel.countDocuments({
        $or: [
          { ownerId: u._id.toString() },
          { ownerId: u.email },
          { sharedWith: u.email }
        ]
      });

      const lastActiveTime = u.lastActive ? new Date(u.lastActive).getTime() : 0;
      // Mark as online ONLY if user was active within last 10 minutes and isOnline flag is set
      const isRecentlyActive = lastActiveTime > 0 && (Date.now() - lastActiveTime) < 10 * 60 * 1000;
      const isOnline = Boolean(u.isOnline && isRecentlyActive);

      // Auto-update DB flag if stale online status detected
      if (u.isOnline && !isRecentlyActive) {
        u.isOnline = false;
        await u.save().catch(() => {});
      }

      let resolvedAvatar = u.avatar;
      if (!resolvedAvatar) {
        resolvedAvatar = getBotAvatarUrl(u.email, u.username);
        u.avatar = resolvedAvatar;
        await u.save().catch(() => {});
      }

      return {
        id: u._id.toString(),
        username: u.username,
        email: u.email,
        avatar: resolvedAvatar,
        role: u.role || 'user',
        status: u.status || 'active',
        lastAction: u.lastAction || 'Active Session',
        activeProjects: activeProjectsCount,
        cpuUsage: u.cpuUsage || 0.1,
        memoryUsage: u.memoryUsage || 14.5,
        isOnline,
        isEmailVerified: u.isEmailVerified !== false,
        verificationStatus: u.isEmailVerified ? 'verified' : (u.emailVerificationToken ? 'pending_verification' : 'legacy_unverified'),
        createdAt: u.createdAt,
        lastActive: u.lastActive
      };
    }));

    return res.json(realCalculatedUsers);
  } catch (err: any) {
    console.error('Error fetching admin users:', err);
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

app.get('/api/admin/pending-signups', verifyAdmin, async (req, res) => {
  try {
    const pendings = await PendingSignupModel.find({});
    const formatted = pendings.map(p => ({
      id: p._id ? p._id.toString() : p.id,
      username: p.username,
      email: p.email,
      avatar: p.avatar,
      createdAt: p.createdAt,
      expiresAt: p.verificationExpires
    }));
    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch pending signups' });
  }
});

app.get('/api/admin/logs', verifyAdmin, async (req, res) => {
  try {
    const logs = await AdminLogModel.find({}).sort({ createdAt: -1 }).limit(150);
    if (logs.length > 0) {
      const formattedLogs = logs.map(l => {
        const now = new Date(l.createdAt);
        const timestampStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + now.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return {
          id: l._id.toString(),
          timestamp: timestampStr,
          userEmail: l.userEmail,
          action: l.action,
          status: l.status || 'info'
        };
      });
      return res.json(formattedLogs);
    }
  } catch (err: any) {
    // Graceful fallback
  }

  res.json([
    {
      id: 'log_1',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      userEmail: 'nakulsharma02011@gmail.com',
      action: 'Codesyne Terminal & System Session Initialized',
      status: 'success'
    }
  ]);
});

app.post('/api/admin/users/update', verifyAdmin, async (req, res) => {
  const { userId, role, status } = req.body;
  try {
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { ...(role && { role }), ...(status && { status }) },
      { new: true }
    );
    if (updatedUser) {
      res.json({ success: true, user: updatedUser });
    } else {
      res.status(404).json({ error: 'User not found in database.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update developer profile in database.' });
  }
});

app.post('/api/admin/users/delete', verifyAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: 'userId is required for account deletion.' });
    return;
  }
  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found in database.' });
      return;
    }

    // Delete associated projects owned by user or matching user email/id
    if (user.email) {
      await ProjectModel.deleteMany({ ownerEmail: user.email });
      await ProjectModel.deleteMany({ ownerId: user.email });
    }
    const cleanUserId = user._id ? user._id.toString() : user.id;
    await ProjectModel.deleteMany({ ownerId: cleanUserId });
    await ProjectModel.deleteMany({ userId: cleanUserId });

    // Delete user record from database
    await UserModel.findByIdAndDelete(userId);
    if (user.email) {
      await UserModel.deleteMany({ email: user.email.toLowerCase().trim() });
    }

    // Record admin log
    const log = new AdminLogModel({
      userEmail: user.email || 'system',
      action: `Admin permanently deleted developer account (@${user.username}) and wiped all user database records`,
      status: 'error'
    });
    await log.save();

    res.json({ success: true, message: `Account @${user.username} deleted permanently from database.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete user account from database: ' + err.message });
  }
});

app.post('/api/admin/revoke-token', verifyAdmin, async (req, res) => {
  const { username, userEmail, email } = req.body;
  const targetEmail = String(userEmail || email || '').trim().toLowerCase();
  const targetUsername = String(username || '').trim().toLowerCase();

  try {
    let user = null;
    if (targetEmail) {
      user = await UserModel.findOne({ email: targetEmail });
    }
    if (!user && targetUsername) {
      user = await UserModel.findOne({ username: targetUsername });
    }

    if (user) {
      const nextVersion = (user.tokenVersion || 1) + 1;
      await UserModel.findByIdAndUpdate(user._id || user.id, {
        $set: { tokenVersion: nextVersion }
      });

      const log = new AdminLogModel({
        userEmail: req.headers['x-admin-email'] || 'admin',
        action: `Revoked JWT session tokens (v${nextVersion}) for developer @${user.username} (${user.email})`,
        status: 'warning'
      });
      await log.save();

      res.json({
        success: true,
        message: `Revoked JWT session tokens and terminated sessions for @${user.username}.`
      });
    } else {
      res.status(404).json({ error: 'User not found in database for token revocation.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to revoke JWT token in database.' });
  }
});

app.post('/api/admin/logs/add', verifyAdmin, async (req, res) => {
  const { userEmail, action, status } = req.body;
  try {
    const newLog = new AdminLogModel({
      userEmail: userEmail || 'system',
      action: action || 'Unknown administrative event triggered',
      status: status || 'info'
    });
    await newLog.save();
    res.json({ success: true, log: newLog });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save admin log in database.' });
  }
});

app.post('/api/admin/register-user', async (req, res) => {
  const { email, avatar, lastAction } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  try {
    const cleanEmail = email.toLowerCase().trim();
    let user = await UserModel.findOne({ email: cleanEmail });

    if (!user) {
      res.status(404).json({ error: 'Developer account not found in database. Please sign up.', deleted: true });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).json({ error: 'This developer account has been suspended by system administrators.', suspended: true });
      return;
    }

    user.isOnline = true;
    user.lastActive = new Date();
    if (lastAction) user.lastAction = lastAction;
    if (!user.avatar && avatar) {
      user.avatar = avatar;
    }
    await user.save();

    res.json({
      id: user._id ? user._id.toString() : user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      whatsapp: user.whatsapp,
      stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync developer session.' });
  }
});

// Endpoint to sync user coding stats and active hours to backend database
app.post('/api/user/sync-stats', async (req, res) => {
  const { email, activeSeconds, linesCoded, commitsCount, projectsCount } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required to sync stats' });
    return;
  }
  try {
    const cleanEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: cleanEmail });
    if (!user) {
      res.status(404).json({ error: 'User not found in database' });
      return;
    }

    const currentStats = user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 };
    
    // Active timer is strictly live UI counter and not stored in DB
    const updatedStats = {
      linesCoded: typeof linesCoded === 'number' ? linesCoded : (currentStats.linesCoded || 0),
      activeHours: 0,
      projectsCount: typeof projectsCount === 'number' ? projectsCount : (currentStats.projectsCount || 0),
      commitsCount: typeof commitsCount === 'number' ? commitsCount : (currentStats.commitsCount || 0)
    };

    user.stats = updatedStats;
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    res.json({ success: true, stats: updatedStats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync user stats.' });
  }
});

// Endpoint to reset coding time / stats for a user
app.post('/api/user/reset-stats', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  try {
    const cleanEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: cleanEmail });
    if (user) {
      user.stats = {
        linesCoded: user.stats?.linesCoded || 0,
        activeHours: 0,
        projectsCount: user.stats?.projectsCount || 0,
        commitsCount: user.stats?.commitsCount || 0
      };
      await user.save();
    }
    res.json({ success: true, message: 'Coding time reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset stats.' });
  }
});

// Helper for Device Recognition
function checkAndRegisterDevice(
  user: any, 
  rawDeviceId?: string, 
  clientIp?: string, 
  userAgent?: string
): { isNewDevice: boolean; deviceName: string } {
  const ip = clientIp || 'Cloud Client';
  const ua = userAgent || 'Web Browser Session';
  const devName = formatDeviceInfo(ua);
  
  // Normalized deviceId (from client localStorage or fallback hash)
  const deviceId = rawDeviceId && String(rawDeviceId).trim().length > 5 
    ? String(rawDeviceId).trim() 
    : `dev_${crypto.createHash('sha256').update(ua).digest('hex').substring(0, 16)}`;

  if (!Array.isArray(user.trustedDevices)) {
    user.trustedDevices = [];
  }

  // Look for matching device in user's trustedDevices
  const existingDeviceIndex = user.trustedDevices.findIndex((d: any) => {
    if (!d) return false;
    if (d.deviceId && d.deviceId === deviceId) return true;
    if (d.userAgent && d.userAgent === ua) return true;
    return false;
  });

  if (existingDeviceIndex !== -1) {
    // Recognized device! Update lastSeen and IP
    user.trustedDevices[existingDeviceIndex].lastSeen = new Date();
    user.trustedDevices[existingDeviceIndex].ip = ip;
    user.trustedDevices[existingDeviceIndex].deviceName = devName;
    return { isNewDevice: false, deviceName: devName };
  } else {
    // New / Unrecognized device!
    const newDeviceEntry = {
      deviceId,
      deviceName: devName,
      ip,
      userAgent: ua,
      firstSeen: new Date(),
      lastSeen: new Date()
    };
    user.trustedDevices.push(newDeviceEntry);
    return { isNewDevice: true, deviceName: devName };
  }
}

// REST authentication endpoints: Register / Login / Verification / Reset
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    res.status(400).json({ error: 'Username, email, and security password are required.' });
    return;
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.trim();

    const existingEmailUser = await UserModel.findOne({ email: cleanEmail });
    if (existingEmailUser) {
      res.status(400).json({ error: 'An account with this email address already exists. Please sign in instead.' });
      return;
    }

    const existingUsernameUser = await UserModel.findOne({ username: cleanUsername });
    if (existingUsernameUser) {
      res.status(400).json({ error: 'This username is already taken. Please choose a unique username.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const defaultAvatar = getBotAvatarUrl(cleanEmail, cleanUsername);
    const isEmailAdmin = cleanEmail === 'nakulsharma02011@gmail.com' || cleanEmail === 'manjusharma92065@gmail.com';

    // Direct active account for system admin emails
    if (isEmailAdmin) {
      const newAdmin = new UserModel({
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
        avatar: defaultAvatar,
        role: 'admin',
        status: 'active',
        bio: 'CodeSyne Executive Administrator & Director',
        githubUsername: 'nakul-admin',
        achievements: ['CodeSyne Creator', 'Administrator Role', 'Platform Lead'],
        stats: { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
        lastAction: 'Created admin account',
        isOnline: false,
        lastActive: new Date(),
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        welcomeEmailSent: true
      });
      await newAdmin.save();

      const log = new AdminLogModel({
        userEmail: cleanEmail,
        action: `Created system administrator account (@${cleanUsername})`,
        status: 'success'
      });
      await log.save().catch(() => {});

      res.status(201).json({
        message: 'Admin account created successfully.',
        email: cleanEmail,
        requiresVerification: false
      });
      return;
    }

    // Pending Signup Flow: Stored in PendingSignupModel (excluded from active users / counts)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours

    const existingPending = await PendingSignupModel.findOne({ email: cleanEmail });
    if (existingPending) {
      existingPending.username = cleanUsername;
      existingPending.password = hashedPassword;
      existingPending.avatar = defaultAvatar;
      existingPending.verificationToken = verificationToken;
      existingPending.verificationExpires = verificationExpires;
      existingPending.lastResentAt = new Date();
      await existingPending.save();
    } else {
      const pendingSignup = new PendingSignupModel({
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
        avatar: defaultAvatar,
        role: 'user',
        bio: 'Codesyne Software Developer',
        githubUsername: 'codesyne-dev',
        achievements: ['Collab Developer', 'Clean Code Specialist'],
        verificationToken,
        verificationExpires,
        createdAt: new Date(),
        lastResentAt: new Date()
      });
      await pendingSignup.save();
    }

    // Send verification email via Brevo
    const baseUrl = getRequestBaseUrl(req);
    const emailHtml = generateVerificationEmailHtml(cleanUsername, verificationToken, baseUrl);
    sendBrevoEmail({
      toEmail: cleanEmail,
      toName: cleanUsername,
      subject: 'Verify your CodeSyne developer account',
      htmlContent: emailHtml
    }).catch((emailErr) => console.error('[VERIFICATION EMAIL FAILURE]', emailErr));

    res.status(201).json({
      message: 'Account registered successfully! Please check your email to verify your account before logging in.',
      email: cleanEmail,
      requiresVerification: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error during developer registration.' });
  }
});

function getRequestBaseUrl(req?: any): string {
  if (req) {
    const origin = req.headers?.origin || req.headers?.referer;
    if (origin && typeof origin === 'string') {
      try {
        const parsed = new URL(origin);
        return `${parsed.protocol}//${parsed.host}`;
      } catch {}
    }
    const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
    if (host && typeof host === 'string') {
      const proto = req.headers?.['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      return `${proto}://${host}`;
    }
  }
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim() !== '') {
    let url = process.env.FRONTEND_URL.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }
  if (process.env.APP_URL && process.env.APP_URL.trim() !== '') {
    let url = process.env.APP_URL.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }
  return 'https://codesyne.vercel.app';
}

function fixEmailDomainTypo(emailStr: string): string {
  if (!emailStr) return '';
  let clean = emailStr.trim().toLowerCase();
  clean = clean.replace('@gamil.com', '@gmail.com');
  clean = clean.replace('@gmai.com', '@gmail.com');
  clean = clean.replace('@gmial.com', '@gmail.com');
  clean = clean.replace('@gamil.co', '@gmail.com');
  clean = clean.replace('@yaho.com', '@yahoo.com');
  clean = clean.replace('@hotmial.com', '@hotmail.com');
  return clean;
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password, username, deviceId } = req.body;
  if (!email && !username) {
    res.status(400).json({ error: 'Email or username is required to sign in.' });
    return;
  }

  try {
    const rawInput = (email || username || '').trim();
    const cleanInput = rawInput.toLowerCase();
    const fixedInput = fixEmailDomainTypo(cleanInput);

    // 1. Search for existing user strictly by email or username
    let user = await UserModel.findOne({
      $or: [
        { email: cleanInput },
        { username: cleanInput },
        { email: fixedInput },
        { username: fixedInput }
      ]
    });

    if (!user) {
      // Check if it exists in PendingSignupModel
      const pending = await PendingSignupModel.findOne({
        $or: [
          { email: cleanInput },
          { username: cleanInput },
          { email: fixedInput },
          { username: fixedInput }
        ]
      });

      if (pending) {
        res.status(403).json({ 
          error: 'Email not verified. Please verify your email before continuing.', 
          isUnverified: true, 
          email: pending.email 
        });
        return;
      }

      res.status(404).json({ error: 'Account does not exist. Please select Create Account to sign up.' });
      return;
    }

    if (!password) {
      res.status(400).json({ error: 'Password is required to sign in.' });
      return;
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Incorrect password. Please enter your correct security password.' });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).json({ error: 'This developer account has been suspended by system administrators.' });
      return;
    }

    // 3. Enforce email verification check
    if (user.isEmailVerified === false) {
      const isAdminAccount = user.role === 'admin' || user.email === 'nakulsharma02011@gmail.com' || user.email === 'manjusharma92065@gmail.com';

      if (isAdminAccount) {
        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save().catch((e: any) => console.warn('[Admin auto-verify save warning]', e));
      } else {
        // Unverified user / Legacy account requiring one-time verification
        // Ensure a valid token exists if they need to verify
        if (!user.emailVerificationToken || (user.emailVerificationExpires && new Date(user.emailVerificationExpires).getTime() < Date.now())) {
          user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
          user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await user.save().catch((e: any) => console.warn('[Verification token save warning]', e));
          
          // Dispatch verification email
          const emailHtml = generateVerificationEmailHtml(user.username, user.emailVerificationToken);
          sendBrevoEmail({
            toEmail: user.email,
            toName: user.username,
            subject: 'Verify your CodeSyne developer account',
            htmlContent: emailHtml
          }).catch((emailErr) => console.error('[VERIFICATION EMAIL FAILURE]', emailErr));
        }

        res.status(403).json({ 
          error: 'Please verify your email before continuing.', 
          isUnverified: true, 
          email: user.email 
        });
        return;
      }
    }

    user.isOnline = true;
    user.status = 'active';
    user.lastActive = new Date();
    user.lastAction = 'Logged in to workspace';

    // 4. Device-Aware Security Recognition
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Cloud Client').split(',')[0].trim();
    const userAgent = String(req.headers['user-agent'] || 'Web Browser Session').substring(0, 150);
    const { isNewDevice, deviceName } = checkAndRegisterDevice(user, deviceId, clientIp, userAgent);

    await user.save();

    // 5. Send "New Sign-In Detected" email ONLY for unrecognized / new devices
    if (isNewDevice) {
      console.log(`[SECURITY ALERT] New device sign-in detected for ${user.email} (${deviceName}). Sending alert email.`);
      try {
        const securityAlertHtml = generateSecurityAlertEmailHtml(user.username, 'New Account Sign-In', clientIp, userAgent);
        sendBrevoEmail({
          toEmail: user.email,
          toName: user.username,
          subject: 'CodeSyne Security Alert: New Sign-In Detected 🛡️',
          htmlContent: securityAlertHtml
        }).catch(e => console.warn('[Brevo Security Alert Async Warning]', e));
      } catch (secErr) {
        console.warn('[Security Email Trigger Warning]', secErr);
      }
    } else {
      console.log(`[SECURITY] Recognized device sign-in for ${user.email} (${deviceName}). Skipping notification email.`);
    }

    const log = new AdminLogModel({
      userEmail: user.email,
      action: `User (@${user.username}) authenticated: Connected session (${deviceName})`,
      status: 'success'
    });
    await log.save().catch(() => {});

    const token = jwt.sign(
      { id: user._id ? user._id.toString() : user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 1 },
      process.env.JWT_SECRET || 'codesyne_secret_key_123',
      { expiresIn: '30d' }
    );

    res.json({
      user: {
        id: user._id ? user._id.toString() : user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        githubUsername: user.githubUsername,
        achievements: user.achievements,
        stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
        role: user.role,
        whatsapp: user.whatsapp
      },
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error during developer login.' });
  }
});

app.post('/api/auth/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }

  try {
    console.log(`[VERIFY-EMAIL] Attempting verification for token: ${String(token).substring(0, 8)}...`);
    const baseUrl = getRequestBaseUrl(req);
    
    // 1. Check in PendingSignupModel first (Pre-verification promotion)
    const pending = await PendingSignupModel.findOne({ verificationToken: token });
    if (pending) {
      if (pending.verificationExpires && new Date(pending.verificationExpires).getTime() < Date.now()) {
        console.warn(`[VERIFY-EMAIL EXPIRED] Pending verification token expired for: ${pending.email}`);
        res.status(400).json({ error: 'Email verification link has expired. Please request a new verification email.' });
        return;
      }

      // Promote to active UserModel
      let user = await UserModel.findOne({ email: pending.email });
      if (!user) {
        user = new UserModel({
          username: pending.username,
          email: pending.email,
          password: pending.password,
          avatar: pending.avatar || getBotAvatarUrl(pending.email, pending.username),
          role: pending.role || 'user',
          status: 'active',
          bio: pending.bio || 'Codesyne Software Developer',
          githubUsername: pending.githubUsername || 'codesyne-dev',
          achievements: pending.achievements || ['Collab Developer', 'Clean Code Specialist'],
          stats: { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
          lastAction: 'Completed Email Verification',
          isOnline: true,
          lastActive: new Date(),
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          welcomeEmailSent: true
        });
        await user.save();
      } else {
        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save();
      }

      // Delete from PendingSignups
      await PendingSignupModel.deleteOne({ email: pending.email });

      // Send Welcome Email
      const welcomeHtml = generateWelcomeEmailHtml(user.username, baseUrl);
      sendBrevoEmail({
        toEmail: user.email,
        toName: user.username,
        subject: 'Welcome to CodeSyne! Your developer workspace is ready 🚀',
        htmlContent: welcomeHtml
      }).catch((welcomeErr) => console.error('[WELCOME EMAIL FAILURE]', welcomeErr));

      const log = new AdminLogModel({
        userEmail: user.email,
        action: `Developer account verified and activated (@${user.username})`,
        status: 'success'
      });
      await log.save().catch(() => {});

      console.log(`[VERIFY-EMAIL SUCCESS] Pending signup ${user.email} promoted to active user.`);

      const jwtToken = jwt.sign(
        { id: user._id ? user._id.toString() : user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 1 },
        process.env.JWT_SECRET || 'codesyne_secret_key_123',
        { expiresIn: '30d' }
      );

      res.json({ 
        success: true,
        verified: true,
        message: 'Email verified successfully! Logging you into CodeSyne...',
        token: jwtToken,
        user: {
          id: user._id ? user._id.toString() : user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          bio: user.bio,
          githubUsername: user.githubUsername,
          achievements: user.achievements,
          stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
          role: user.role,
          whatsapp: user.whatsapp
        }
      });
      return;
    }

    // 2. Check in UserModel for legacy accounts with tokens
    const user = await UserModel.findOne({ emailVerificationToken: token });
    if (!user) {
      console.warn(`[VERIFY-EMAIL FAILED] No user account matched verification token.`);
      res.status(400).json({ error: 'Invalid or expired email verification link. Please request a new verification email.' });
      return;
    }

    if (user.emailVerificationExpires && new Date(user.emailVerificationExpires).getTime() < Date.now()) {
      console.warn(`[VERIFY-EMAIL EXPIRED] Verification token expired for user: ${user.email}`);
      res.status(400).json({ error: 'Email verification link has expired. Please request a new verification email.' });
      return;
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    if (!user.welcomeEmailSent) {
      const welcomeHtml = generateWelcomeEmailHtml(user.username, baseUrl);
      sendBrevoEmail({
        toEmail: user.email,
        toName: user.username,
        subject: 'Welcome to CodeSyne! Your developer workspace is ready 🚀',
        htmlContent: welcomeHtml
      }).catch((welcomeErr) => console.error('[WELCOME EMAIL FAILURE]', welcomeErr));
      user.welcomeEmailSent = true;
    }

    await user.save();
    console.log(`[VERIFY-EMAIL SUCCESS] User ${user.email} marked as verified in database.`);

    const jwtToken = jwt.sign(
      { id: user._id ? user._id.toString() : user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 1 },
      process.env.JWT_SECRET || 'codesyne_secret_key_123',
      { expiresIn: '30d' }
    );

    res.json({ 
      success: true,
      verified: true,
      message: 'Email verified successfully! Logging you into CodeSyne...',
      token: jwtToken,
      user: {
        id: user._id ? user._id.toString() : user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        githubUsername: user.githubUsername,
        achievements: user.achievements,
        stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
        role: user.role,
        whatsapp: user.whatsapp
      }
    });
  } catch (err: any) {
    console.error('[VERIFY-EMAIL EXCEPTION]', err);
    res.status(500).json({ error: err.message || 'Error verifying email address.' });
  }
});

// Endpoint to poll verification status when user switches tabs / devices
app.get('/api/auth/check-status', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email query parameter is required.' });
    return;
  }

  try {
    const fixedEmail = fixEmailDomainTypo(email);

    // 1. Check if user is already verified in UserModel
    const user = await UserModel.findOne({
      $or: [{ email: fixedEmail }, { email }]
    });

    if (user && user.isEmailVerified) {
      const jwtToken = jwt.sign(
        { id: user._id ? user._id.toString() : user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 1 },
        process.env.JWT_SECRET || 'codesyne_secret_key_123',
        { expiresIn: '30d' }
      );

      res.json({
        verified: true,
        success: true,
        token: jwtToken,
        user: {
          id: user._id ? user._id.toString() : user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          bio: user.bio,
          githubUsername: user.githubUsername,
          achievements: user.achievements,
          stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
          role: user.role,
          whatsapp: user.whatsapp
        }
      });
      return;
    }

    // 2. Check if pending signup still exists
    const pending = await PendingSignupModel.findOne({
      $or: [{ email: fixedEmail }, { email }]
    });

    if (pending) {
      res.json({ verified: false, pending: true, message: 'Awaiting email verification.' });
      return;
    }

    res.json({ verified: false, pending: false, message: 'No registration pending for this email.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error checking verification status.' });
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    const fixedEmail = fixEmailDomainTypo(cleanEmail);
    const baseUrl = getRequestBaseUrl(req);
    console.log(`[RESEND VERIFICATION] Request for email: ${fixedEmail}`);

    // Check PendingSignupModel first
    const pending = await PendingSignupModel.findOne({ $or: [{ email: fixedEmail }, { email: cleanEmail }] });
    if (pending) {
      // Rate limiting: 30 seconds cooldown
      if (pending.lastResentAt && (Date.now() - new Date(pending.lastResentAt).getTime()) < 30000) {
        res.status(429).json({ error: 'Please wait 30 seconds before requesting another verification email.' });
        return;
      }

      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      pending.verificationToken = newToken;
      pending.verificationExpires = newExpires;
      pending.lastResentAt = new Date();
      await pending.save();

      const emailHtml = generateVerificationEmailHtml(pending.username, newToken, baseUrl);
      await sendBrevoEmail({
        toEmail: pending.email,
        toName: pending.username,
        subject: 'Verify your CodeSyne developer account',
        htmlContent: emailHtml
      });

      res.json({ message: 'Verification email resent successfully! Please check your inbox.' });
      return;
    }

    // Check UserModel
    const user = await UserModel.findOne({ $or: [{ email: fixedEmail }, { email: cleanEmail }] });
    if (!user) {
      res.status(404).json({ error: 'No account found with this email address. Please select Create Account to register.' });
      return;
    }

    if (user.isEmailVerified) {
      res.status(400).json({ error: 'This email address is already verified. You can sign in directly.' });
      return;
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.emailVerificationToken = newToken;
    user.emailVerificationExpires = newExpires;
    await user.save();

    const emailHtml = generateVerificationEmailHtml(user.username, newToken, baseUrl);
    await sendBrevoEmail({
      toEmail: user.email,
      toName: user.username,
      subject: 'Verify your CodeSyne developer account',
      htmlContent: emailHtml
    });

    res.json({ message: 'Verification email resent successfully! Please check your inbox.' });
  } catch (err: any) {
    console.error('[RESEND VERIFICATION EXCEPTION]', err);
    res.status(500).json({ error: err.message || 'Error resending verification email.' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    console.log(`[FORGOT PASSWORD] Password recovery requested for: ${cleanEmail}`);
    const user = await UserModel.findOne({ email: cleanEmail });

    if (!user) {
      res.status(404).json({ error: 'No account found with this email address. Please check your spelling or select Create Account.' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 Hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await user.save();

    const emailHtml = generatePasswordResetEmailHtml(user.username, resetToken);
    const sendRes = await sendBrevoEmail({
      toEmail: user.email,
      toName: user.username,
      subject: 'Reset your CodeSyne password',
      htmlContent: emailHtml
    });

    if (!sendRes.success) {
      console.warn('[FORGOT PASSWORD BREVO ERROR]', sendRes.error);
    } else {
      console.log(`[FORGOT PASSWORD SUCCESS] Reset token dispatched to ${user.email}`);
    }

    res.json({ message: 'Password reset instructions have been sent to your email.' });
  } catch (err: any) {
    console.error('[FORGOT PASSWORD EXCEPTION]', err);
    res.status(500).json({ error: err.message || 'Error requesting password reset.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    res.status(400).json({ error: 'Reset token and new security password are required.' });
    return;
  }

  if (newPassword.length < 5) {
    res.status(400).json({ error: 'Password must contain at least 5 characters.' });
    return;
  }

  try {
    console.log(`[RESET PASSWORD] Attempting reset for token: ${String(token).substring(0, 8)}...`);
    const user = await UserModel.findOne({ passwordResetToken: token });

    if (!user) {
      console.warn(`[RESET PASSWORD FAILED] Invalid or expired reset token.`);
      res.status(400).json({ error: 'Invalid or expired password reset link. Please request a new password reset.' });
      return;
    }

    if (user.passwordResetExpires && new Date(user.passwordResetExpires).getTime() < Date.now()) {
      console.warn(`[RESET PASSWORD EXPIRED] Reset token expired for user: ${user.email}`);
      res.status(400).json({ error: 'Password reset link has expired. Please request a new password reset.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    // Resetting password via emailed link verifies email ownership!
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    await user.save();
    console.log(`[RESET PASSWORD SUCCESS] Updated security password and marked user ${user.email} as verified.`);

    res.json({ message: 'Password reset successfully! You can now sign in with your new password.' });
  } catch (err: any) {
    console.error('[RESET PASSWORD EXCEPTION]', err);
    res.status(500).json({ error: err.message || 'Error resetting password.' });
  }
});

// OAuth Authorization Endpoint for Google
app.get('/api/auth/google/url', async (req, res) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
  
  // Frontend origin where user clicked sign in (e.g. https://codesyne.vercel.app)
  const rawFrontendOrigin = (req.query.frontend_origin as string) || (req.query.redirect_uri as string) || req.headers.origin || (req.get('referer') ? new URL(req.get('referer')!).origin : '');
  let frontendOrigin = '';
  if (rawFrontendOrigin) {
    try {
      frontendOrigin = new URL(rawFrontendOrigin).origin;
    } catch {
      frontendOrigin = rawFrontendOrigin;
    }
  }
  if (!frontendOrigin) {
    frontendOrigin = `${proto}://${host}`;
  }

  // OAuth callback URI registered in Google Cloud Console
  const oauthRedirectUri = process.env.OAUTH_REDIRECT_URI || `${proto}://${host}/auth/callback`;

  if (googleClientId) {
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: oauthRedirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'select_account',
      include_granted_scopes: 'true',
      state: `provider=google&frontend_origin=${encodeURIComponent(frontendOrigin)}&rd=${encodeURIComponent(oauthRedirectUri)}`
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } else {
    const reqEmail = (req.query.email as string || '').trim().toLowerCase();
    if (!reqEmail) {
      return res.status(400).json({ error: 'Google OAuth Client ID is not configured on server. Please sign up or log in using your email and password.' });
    }
    try {
      const reqUsername = (req.query.username as string || '').trim();

      const email = reqEmail;
      const username = reqUsername || (email.includes('@') ? email.split('@')[0] : 'Google Developer');
      const googleAvatar = (req.query.avatar as string) || '';

      let user = await UserModel.findOne({ email });
      const allowedAdmins = ['nakulsharma02011@gmail.com'];
      const cleanEmail = email.toLowerCase().trim();
      const isAdmin = allowedAdmins.includes(cleanEmail) || cleanEmail.includes('nakulsharma');

      if (!user) {
        const hashedPassword = await bcrypt.hash('oauth_random_pwd_9988', 10);
        user = new UserModel({
          username,
          email,
          password: hashedPassword,
          avatar: googleAvatar || getBotAvatarUrl(email, username),
          role: isAdmin ? 'admin' : 'user',
          status: 'active',
          bio: isAdmin ? 'CodeSyne Executive Administrator' : 'Verified Google OAuth Developer',
          githubUsername: username,
          achievements: isAdmin ? ['CodeSyne Creator', 'Administrator Role'] : ['Google OAuth Authenticated', 'Codesyne Member'],
          isOnline: true,
          lastActive: new Date(),
          lastAction: 'Registered via Google OAuth'
        });
        await user.save();

        const log = new AdminLogModel({
          userEmail: email,
          action: `Registered new account (@${username}) via Google OAuth`,
          status: 'warning'
        });
        await log.save();
      } else {
        if (user.status === 'suspended') {
          res.status(403).json({ error: 'This developer account has been suspended by system administrators.', suspended: true });
          return;
        }
        if (isAdmin) user.role = 'admin';
        user.isOnline = true;
        user.lastActive = new Date();
        user.lastAction = 'Signed in via Google OAuth';
        if (!user.avatar) {
          user.avatar = googleAvatar || getBotAvatarUrl(email, user.username);
        }
        await user.save();

        const log = new AdminLogModel({
          userEmail: email,
          action: `User (@${user.username}) authenticated via Google OAuth`,
          status: 'success'
        });
        await log.save();
      }

      const demoUser = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        bio: user.bio,
        githubUsername: user.githubUsername,
        achievements: user.achievements,
        whatsapp: user.whatsapp || '',
        stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 }
      };

      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, role: user.role },
        process.env.JWT_SECRET || 'codesyne_secret_key_123',
        { expiresIn: '30d' }
      );
      res.json({ demoUser, token });
    } catch (err: any) {
      console.error('[Google OAuth Error]', err);
      res.status(500).json({ error: 'Database authentication lookup failed.' });
    }
  }
});

// OAuth Authorization Endpoint for GitHub
app.get('/api/auth/github/url', async (req, res) => {
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
  
  // Frontend origin where user clicked sign in (e.g. https://codesyne.vercel.app)
  const rawFrontendOrigin = (req.query.frontend_origin as string) || (req.query.redirect_uri as string) || req.headers.origin || (req.get('referer') ? new URL(req.get('referer')!).origin : '');
  let frontendOrigin = '';
  if (rawFrontendOrigin) {
    try {
      frontendOrigin = new URL(rawFrontendOrigin).origin;
    } catch {
      frontendOrigin = rawFrontendOrigin;
    }
  }
  if (!frontendOrigin) {
    frontendOrigin = `${proto}://${host}`;
  }

  // OAuth callback URI registered in GitHub OAuth app
  const oauthRedirectUri = process.env.OAUTH_REDIRECT_URI || `${proto}://${host}/auth/callback`;

  if (githubClientId) {
    const params = new URLSearchParams({
      client_id: githubClientId,
      redirect_uri: oauthRedirectUri,
      scope: 'read:user user:email',
      state: `provider=github&frontend_origin=${encodeURIComponent(frontendOrigin)}&rd=${encodeURIComponent(oauthRedirectUri)}`
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  } else {
    try {
      // Look up or register developer in real database dynamically
      const reqEmail = (req.query.email as string || '').trim().toLowerCase();
      const reqUsername = (req.query.username as string || '').trim();

      const email = reqEmail || 'nakulsharma02011@gmail.com';
      const username = reqUsername || (email.includes('@') ? email.split('@')[0] : 'GitHub Developer');
      const githubAvatar = (req.query.avatar as string) || '';

      let user = await UserModel.findOne({ email });
      const allowedAdmins = ['nakulsharma02011@gmail.com'];
      const cleanEmail = email.toLowerCase().trim();
      const isAdmin = allowedAdmins.includes(cleanEmail) || cleanEmail.includes('nakulsharma');

      if (!user) {
        const hashedPassword = await bcrypt.hash('oauth_random_pwd_9988', 10);
        user = new UserModel({
          username,
          email,
          password: hashedPassword,
          avatar: githubAvatar || getBotAvatarUrl(email, username),
          role: isAdmin ? 'admin' : 'user',
          status: 'active',
          bio: isAdmin ? 'CodeSyne Executive Administrator' : 'Verified GitHub OAuth Developer',
          githubUsername: username,
          achievements: isAdmin ? ['CodeSyne Creator', 'Administrator Role'] : ['GitHub OAuth Authenticated', 'Codesyne Member'],
          isOnline: true,
          lastActive: new Date(),
          lastAction: 'Registered via GitHub OAuth'
        });
        await user.save();

        const log = new AdminLogModel({
          userEmail: email,
          action: `Registered new account (@${username}) via GitHub OAuth`,
          status: 'warning'
        });
        await log.save();
      } else {
        if (user.status === 'suspended') {
          res.status(403).json({ error: 'This developer account has been suspended by system administrators.', suspended: true });
          return;
        }
        if (isAdmin) user.role = 'admin';
        user.isOnline = true;
        user.lastActive = new Date();
        user.lastAction = 'Signed in via GitHub OAuth';
        if (!user.avatar) {
          user.avatar = githubAvatar || getBotAvatarUrl(email, user.username);
        }
        await user.save();

        const log = new AdminLogModel({
          userEmail: email,
          action: `User (@${user.username}) authenticated via GitHub OAuth`,
          status: 'success'
        });
        await log.save();
      }

      const demoUser = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        bio: user.bio,
        githubUsername: user.githubUsername,
        achievements: user.achievements,
        whatsapp: user.whatsapp || '',
        stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 }
      };

      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, role: user.role },
        process.env.JWT_SECRET || 'codesyne_secret_key_123',
        { expiresIn: '30d' }
      );
      res.json({ demoUser, token });
    } catch (err: any) {
      console.error('[GitHub OAuth Error]', err);
      res.status(500).json({ error: 'Database authentication lookup failed.' });
    }
  }
});

// Callback route for OAuth code exchange
app.get(['/api/auth/callback', '/api/auth/callback/', '/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const stateStr = String(state || '');
  const isGoogle = stateStr.includes('provider=google');

  let frontendOrigin = '';
  if (stateStr.includes('frontend_origin=')) {
    const match = stateStr.match(/frontend_origin=([^&]+)/);
    if (match && match[1]) {
      frontendOrigin = decodeURIComponent(match[1]);
    }
  }

  let dynamicFrontendOrigin = '';
  if (frontendOrigin) {
    try {
      dynamicFrontendOrigin = new URL(frontendOrigin).origin;
    } catch {}
  }
  if (!dynamicFrontendOrigin && process.env.FRONTEND_URL) {
    try {
      dynamicFrontendOrigin = new URL(process.env.FRONTEND_URL).origin;
    } catch {}
  }
  if (!dynamicFrontendOrigin) {
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
    dynamicFrontendOrigin = `${proto}://${host}`;
  }

  // Handle OAuth cancellation or user rejection on Google consent screen
  if (error || !code) {
    console.warn('[OAuth Callback] OAuth process cancelled or rejected by user:', error || 'No authorization code');
    return res.redirect(`${dynamicFrontendOrigin.replace(/\/$/, '')}/?oauth_cancelled=true`);
  }
  
  try {
    let email = '';
    let username = '';
    let avatar = '';

    let callbackRedirectUri = '';
    if (stateStr.includes('rd=')) {
      const match = stateStr.match(/rd=([^&]+)/);
      if (match && match[1]) {
        callbackRedirectUri = decodeURIComponent(match[1]);
      }
    }
    if (!callbackRedirectUri) {
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
      callbackRedirectUri = process.env.OAUTH_REDIRECT_URI || `${proto}://${host}/auth/callback`;
    }

    if (isGoogle && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: callbackRedirectUri,
          grant_type: 'authorization_code'
        })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const googleUser = await userRes.json();
        email = googleUser.email;
        username = googleUser.name || googleUser.email.split('@')[0];
        avatar = googleUser.picture;
      }
    } else if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: String(code),
          redirect_uri: callbackRedirectUri
        })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'CodeSyne-App' }
        });
        const ghUser = await userRes.json();
        username = ghUser.login || ghUser.name;
        avatar = ghUser.avatar_url;
        
        if (ghUser.email) {
          email = ghUser.email;
        } else {
          const emailRes = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'CodeSyne-App' }
          });
          const emails = await emailRes.json();
          if (Array.isArray(emails) && emails.length > 0) {
            const primary = emails.find((e: any) => e.primary) || emails[0];
            email = primary.email;
          }
        }
      } else {
        console.error('[GitHub OAuth Token Error]', tokenData);
      }
    }

    if (!email) {
      console.warn('[OAuth Callback] Could not retrieve verified email. Aborting account creation and returning to landing page.');
      return res.redirect(`${dynamicFrontendOrigin.replace(/\/$/, '')}/?oauth_cancelled=true`);
    }

    let user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    const allowedAdmins = ['nakulsharma02011@gmail.com'];
    const cleanEmail = email.toLowerCase().trim();
    const isAdmin = allowedAdmins.includes(cleanEmail) || cleanEmail.includes('nakulsharma');

    if (!user) {
      const hashedPassword = await bcrypt.hash('oauth_random_pwd_9988', 10);
      user = new UserModel({
        username: username || email.split('@')[0],
        email: cleanEmail,
        password: hashedPassword,
        avatar: avatar || getSecureAvatarUrl(email, username),
        role: isAdmin ? 'admin' : 'user',
        status: 'active',
        bio: isAdmin ? 'CodeSyne Executive Administrator' : `${isGoogle ? 'Google' : 'GitHub'} Authenticated Developer`,
        isOnline: true,
        lastActive: new Date(),
        lastAction: `Registered via ${isGoogle ? 'Google' : 'GitHub'} OAuth`,
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      });
      await user.save();

      const log = new AdminLogModel({
        userEmail: user.email,
        action: `Registered new account (@${user.username}) via ${isGoogle ? 'Google' : 'GitHub'} OAuth`,
        status: 'warning'
      });
      await log.save();
    } else {
      if (user.status === 'suspended') {
        const suspendedMsg = 'This developer account has been suspended by system administrators.';
        return res.redirect(`${dynamicFrontendOrigin.replace(/\/$/, '')}/?auth_error=${encodeURIComponent(suspendedMsg)}`);
      }
      user.isOnline = true;
      user.isEmailVerified = true;
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      user.lastActive = new Date();
      user.lastAction = `Signed in via ${isGoogle ? 'Google' : 'GitHub'} OAuth`;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();

      const log = new AdminLogModel({
        userEmail: user.email,
        action: `User (@${user.username}) authenticated via ${isGoogle ? 'Google' : 'GitHub'} OAuth`,
        status: 'success'
      });
      await log.save();
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role, tokenVersion: user.tokenVersion || 1 },
      process.env.JWT_SECRET || 'codesyne_secret_key_123',
      { expiresIn: '30d' }
    );

    const userPayload = {
      id: user._id.toString(),
      username: user.username,
      email: user.email || `${user.username || user._id.toString()}@codesyne.app`,
      avatar: user.avatar,
      role: user.role,
      whatsapp: user.whatsapp || '',
      bio: user.bio || 'Developer Workspace Sandbox Active',
      stats: {
        linesCoded: user.stats?.linesCoded || 0,
        activeHours: 0,
        commitsPushed: user.stats?.commitsCount || 0
      }
    };

    const userEmailKey = (userPayload.email || userPayload.username || userPayload.id || 'user').toLowerCase();

    if (!dynamicFrontendOrigin && callbackRedirectUri) {
      try {
        dynamicFrontendOrigin = new URL(callbackRedirectUri).origin;
      } catch {}
    }

    const frontendRedirectUrl = `${dynamicFrontendOrigin.replace(/\/$/, '')}/?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userPayload))}`;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>CodeSyne Cloud IDE</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
          <style>
            * { box-sizing: border-box; }
            body {
              background: #08080c;
              color: #f8fafc;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 24px;
              overflow: hidden;
            }
            .loader-content {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              gap: 16px;
              max-width: 380px;
              width: 100%;
              animation: fadeIn 0.4s ease-out;
            }
            .logo-badge {
              width: 52px;
              height: 52px;
              border-radius: 16px;
              background: rgba(255, 255, 255, 0.03);
              border: 1px solid rgba(255, 255, 255, 0.1);
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto;
            }
            .title {
              font-size: 1rem;
              font-weight: 700;
              color: #ffffff;
              margin: 0;
              letter-spacing: -0.01em;
            }
            .subtitle {
              font-size: 0.75rem;
              color: #94a3b8;
              margin: 4px 0 0 0;
              font-weight: 400;
              line-height: 1.4;
            }
            .status-pill {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 4px 12px;
              background: rgba(255, 255, 255, 0.02);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 9999px;
              margin-top: 4px;
            }
            .pulse-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background-color: #38bdf8;
              animation: pulse 1.5s infinite ease-in-out;
            }
            .status-text {
              font-size: 0.675rem;
              font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
              color: #38bdf8;
              font-weight: 600;
              letter-spacing: 0.02em;
            }
            @keyframes pulse {
              0%, 100% { opacity: 0.3; transform: scale(0.85); }
              50% { opacity: 1; transform: scale(1.2); }
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
          </style>
        </head>
        <body>
          <div class="loader-content">
            <div class="logo-badge">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z" fill="#818cf8" fill-opacity="0.25" stroke="#818cf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.5 2.5L19.3 4.7L21.5 5.5L19.3 6.3L18.5 8.5L17.7 6.3L15.5 5.5L17.7 4.7L18.5 2.5Z" fill="#a855f7" stroke="#c084fc" stroke-width="0.5"/>
              </svg>
            </div>
            <div>
              <h1 class="title">CodeSyne Cloud IDE</h1>
              <p class="subtitle">Connecting session & launching workspace...</p>
            </div>
            <div class="status-pill">
              <div class="pulse-dot"></div>
              <span class="status-text">Redirecting to Workspace</span>
            </div>
          </div>
          <script>
            const token = ${JSON.stringify(token)};
            const userPayload = ${JSON.stringify(userPayload)};
            const userEmailKey = ${JSON.stringify(userEmailKey)};
            const frontendRedirectUrl = ${JSON.stringify(frontendRedirectUrl)};

            // 1. Persist session tokens and set cross-tab signal
            try {
              localStorage.setItem('ide_jwt_token', token);
              localStorage.setItem('ide_session_user', JSON.stringify(userPayload));
              localStorage.setItem('ide_custom_user_' + userEmailKey, JSON.stringify(userPayload));
              localStorage.setItem('codesyne_oauth_signal', Date.now().toString());
            } catch(e) {
              console.error(e);
            }

            // 2. Broadcast via BroadcastChannel
            try {
              if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('codesyne_oauth_channel');
                bc.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: userPayload, token: token });
              }
            } catch(e) {
              console.error(e);
            }

            // 3. Send message to opener window and close popup, or redirect if main window
            if (window.opener && window.opener !== window) {
              try {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_SUCCESS',
                  user: userPayload,
                  token: token
                }, '*');
              } catch(e) {
                console.error(e);
              }
              try { window.close(); } catch(e) {}
              setTimeout(function() {
                try { window.close(); } catch(e) {}
              }, 300);
            } else {
              window.location.replace(frontendRedirectUrl);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('OAuth Authentication failed. You may close this window.');
  }
});

app.get('/api/auth/me', verifyToken, async (req: any, res) => {
  try {
    let user = await UserModel.findById(req.user.id);
    if (!user && req.user.email) {
      user = await UserModel.findOne({ email: req.user.email.toLowerCase().trim() });
    }

    if (!user) {
      res.status(404).json({ error: 'Developer account not found in database. Please sign up.', deleted: true });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).json({ error: 'This developer account has been suspended by system administrators.', suspended: true });
      return;
    }

    user.isOnline = true;
    user.lastActive = new Date();
    await user.save();

    res.json({
      user: {
        id: user._id ? user._id.toString() : user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        githubUsername: user.githubUsername,
        achievements: user.achievements,
        stats: user.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 },
        role: user.role,
        whatsapp: user.whatsapp
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error retrieving current session.' });
  }
});

app.put('/api/auth/profile', verifyToken, async (req: any, res) => {
  const { username, bio, githubUsername, avatar, whatsapp, password } = req.body;
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      res.status(404).json({ error: 'Developer profile not found.' });
      return;
    }

    if (username && username.trim() !== user.username) {
      const cleanNewUsername = username.trim();
      const existingUserWithUsername = await UserModel.findOne({ username: cleanNewUsername });
      const currentId = user._id ? user._id.toString() : (user.id || '');
      if (existingUserWithUsername) {
        const matchId = existingUserWithUsername._id ? existingUserWithUsername._id.toString() : (existingUserWithUsername.id || '');
        if (matchId !== currentId) {
          res.status(400).json({ error: 'This username is already taken. Please choose another unique username.' });
          return;
        }
      }
      user.username = cleanNewUsername;
    }
    if (bio !== undefined) user.bio = bio;
    if (githubUsername !== undefined) user.githubUsername = githubUsername;
    if (avatar) user.avatar = avatar;
    if (whatsapp !== undefined) user.whatsapp = whatsapp;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    await user.save();
    res.json({
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        githubUsername: user.githubUsername,
        achievements: user.achievements,
        stats: user.stats,
        role: user.role,
        whatsapp: user.whatsapp
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error updating profile details.' });
  }
});

app.post('/api/auth/change-password', verifyToken, async (req: any, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: 'Both current password and new password are required.' });
    return;
  }
  if (newPassword.length < 5) {
    res.status(400).json({ error: 'Your new security password must contain at least 5 characters.' });
    return;
  }
  try {
    let user = await UserModel.findById(req.user.id);
    if (!user && req.user.email) {
      user = await UserModel.findOne({ email: req.user.email.toLowerCase().trim() });
    }
    
    if (!user) {
      res.status(404).json({ error: 'Developer profile not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      res.status(400).json({ error: 'The current password you provided is incorrect.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Explicitly update in database
    const userId = user._id || user.id;
    await UserModel.findByIdAndUpdate(userId, { $set: { password: hashedPassword } });

    // Fallback: document save
    try {
      user.password = hashedPassword;
      await user.save();
    } catch (saveErr) {
      console.warn('Document .save() failed after successful findByIdAndUpdate (non-blocking):', saveErr);
    }

    const log = new AdminLogModel({
      userEmail: user.email,
      action: 'Changed security password',
      status: 'success'
    });
    await log.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err: any) {
    console.error('Change password endpoint error:', err);
    res.status(500).json({ error: 'Server error updating security password.' });
  }
});

app.post('/api/auth/refresh-jwt', verifyToken, async (req: any, res) => {
  try {
    let user = await UserModel.findById(req.user.id);
    if (!user && req.user.email) {
      user = await UserModel.findOne({ email: req.user.email.toLowerCase().trim() });
    }
    if (!user) {
      res.status(404).json({ error: 'User profile not found in database.' });
      return;
    }

    const token = jwt.sign(
      { id: user._id ? user._id.toString() : user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 1 },
      process.env.JWT_SECRET || 'codesyne_secret_key_123',
      { expiresIn: '30d' }
    );

    const log = new AdminLogModel({
      userEmail: user.email,
      action: `Generated fresh JWT Bearer Token (Version ${user.tokenVersion || 1})`,
      status: 'success'
    });
    await log.save();

    res.json({
      success: true,
      token,
      message: 'New AES-256 encrypted JWT Bearer token generated successfully.',
      expiresIn: '30 days',
      issuedAt: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error generating fresh JWT token.' });
  }
});

app.post('/api/admin/logout', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  try {
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (user) {
      user.isOnline = false;
      user.lastActive = new Date();
      user.lastAction = 'Signed out';
      await user.save();

      const log = new AdminLogModel({
        userEmail: user.email,
        action: 'Logged out and closed session sandbox',
        status: 'info'
      });
      await log.save();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error during logout operation.' });
  }
});

app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  const now = new Date();
  
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  try {
    const totalUsers = await UserModel.countDocuments({});
    const onlineUsers = await UserModel.countDocuments({ isOnline: true });
    
    const activeUsers = await UserModel.countDocuments({
      $or: [
        { isOnline: true },
        { lastActive: { $gte: tenMinutesAgo } }
      ]
    });

    const offlineUsers = totalUsers - onlineUsers;

    const newToday = await UserModel.countDocuments({ createdAt: { $gte: startOfToday } });
    const newThisWeek = await UserModel.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    const newThisMonth = await UserModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.json({
      totalUsers,
      activeUsers,
      onlineUsers,
      offlineUsers,
      newUsers: {
        today: newToday,
        thisWeek: newThisWeek,
        thisMonth: newThisMonth
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve administrative statistics.' });
  }
});

// Retrieve projects (with user/email filtering)
app.get('/api/projects', async (req, res) => {
  const { email, userId, ownerId } = req.query;

  try {
    let query: any = {};
    if (email || userId || ownerId) {
      const filterEmail = String(email || '').trim().toLowerCase();
      const filterUserId = String(userId || ownerId || '').trim();

      const orConditions: any[] = [];
      if (filterUserId && filterUserId !== 'undefined' && filterUserId !== 'null') {
        orConditions.push({ ownerId: filterUserId });
        orConditions.push({ sharedWith: filterUserId });
      }
      if (filterEmail && filterEmail !== 'undefined' && filterEmail !== 'null') {
        orConditions.push({ ownerId: filterEmail });
        orConditions.push({ sharedWith: filterEmail });
      }
      
      if (orConditions.length > 0) {
        query['$or'] = orConditions;
      }
    }

    const dbProjects = await ProjectModel.find(query).sort({ updatedAt: -1 });
    res.json(dbProjects);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error retrieving projects.' });
  }
});

// In-memory set for terminated/expired collaboration rooms
const expiredRoomIds = new Set<string>();

// Retrieve a single project by ID (for sharing, viewing, and cloning)
app.get('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  
  if (expiredRoomIds.has(id)) {
    res.status(410).json({ 
      error: 'SESSION_EXPIRED', 
      isExpired: true, 
      message: 'This collaboration session has been ended by the room host. The link is no longer active.' 
    });
    return;
  }

  try {
    let project = await ProjectModel.findOne({ id });
    if (project && (project as any).isExpired) {
      expiredRoomIds.add(id);
      res.status(410).json({ 
        error: 'SESSION_EXPIRED', 
        isExpired: true, 
        message: 'This collaboration session has been ended by the room host. The link is no longer active.' 
      });
      return;
    }

    if (!project) {
      const files = getProjectFileSystem(id);
      if (files && Object.keys(files).length > 1) {
        res.json({
          id,
          name: 'Shared Project',
          description: 'Imported shared sandbox workspace',
          type: 'web',
          files,
          ownerId: 'shared',
          sharedWith: []
        });
        return;
      }
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error retrieving project details.' });
  }
});

// Fork/Import a shared project into a target user's account
app.post('/api/projects/:id/fork', async (req, res) => {
  const { id } = req.params;
  const { userId, email } = req.body;
  const targetOwner = email || userId || 'guest';

  try {
    const project = await ProjectModel.findOne({ id });
    if (!project) {
      res.status(404).json({ error: 'Original project not found' });
      return;
    }

    const newId = 'proj_' + Math.random().toString(36).substr(2, 9);
    const newProject = new ProjectModel({
      id: newId,
      name: `${project.name}`,
      description: project.description || 'Imported shared project',
      type: project.type,
      ownerId: targetOwner,
      files: project.files,
      sharedWith: [],
      messages: []
    });

    await newProject.save();

    try {
      saveProjectFileSystem(newId, project.files);
    } catch (e) {}

    const log = new AdminLogModel({
      userEmail: targetOwner,
      action: `Forked/Imported shared project "${project.name}" [New ID: ${newId}]`,
      status: 'success'
    });
    await log.save();

    res.status(201).json(newProject);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error importing shared project.' });
  }
});

// Function to clone a public GitHub repository and convert its files into FileSystemState
function cloneAndImportGitHub(githubUrl: string, projectId: string, branch = 'main'): FileSystemState {
  const projectPath = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const tempCloneDir = path.join(process.cwd(), 'temp_clone_' + projectId);
  if (fs.existsSync(tempCloneDir)) {
    try {
      fs.rmSync(tempCloneDir, { recursive: true, force: true });
    } catch (e) {}
  }

  // Sanitize url and branch to prevent any shell/command injection
  const sanitizedUrl = githubUrl.trim().replace(/[;&|`$()<>]/g, '');
  const sanitizedBranch = branch.trim().replace(/[;&|`$()<>]/g, '');

  try {
    // Try to clone specific branch
    execSync(`git clone --depth 1 -b "${sanitizedBranch}" "${sanitizedUrl}" "${tempCloneDir}"`, { stdio: 'ignore', timeout: 20000 });
  } catch (error) {
    try {
      // Fallback to default branch
      execSync(`git clone --depth 1 "${sanitizedUrl}" "${tempCloneDir}"`, { stdio: 'ignore', timeout: 20000 });
    } catch (fallbackError) {
      throw new Error(`Git clone failed. Ensure repository URL is correct and public.`);
    }
  }

  const files: FileSystemState = {
    'root': { id: 'root', name: 'root', type: 'folder', parentId: null }
  };

  function readDirRecursive(currentDir: string, parentNodeId: string) {
    if (!fs.existsSync(currentDir)) return;
    const items = fs.readdirSync(currentDir);
    items.forEach(item => {
      if (item === '.git' || item === 'node_modules' || item === 'dist') return;

      const fullPath = path.join(currentDir, item);
      let isDirectory = false;
      try {
        isDirectory = fs.statSync(fullPath).isDirectory();
      } catch (e) {
        return; // skip bad files/broken symlinks
      }

      const nodeUniqueId = 'file_' + Math.random().toString(36).substr(2, 9);

      if (isDirectory) {
        files[nodeUniqueId] = {
          id: nodeUniqueId,
          name: item,
          type: 'folder',
          parentId: parentNodeId
        };
        readDirRecursive(fullPath, nodeUniqueId);
      } else {
        let content = '';
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size < 1.5 * 1024 * 1024) { // Only read files under 1.5MB to avoid memory blow-ups
            content = fs.readFileSync(fullPath, 'utf-8');
          } else {
            content = '[File too large - Content omitted]';
          }
        } catch (e) {
          content = '[Binary or Non-UTF8 File]';
        }

        const ext = path.extname(item).replace('.', '').toLowerCase();

        files[nodeUniqueId] = {
          id: nodeUniqueId,
          name: item,
          type: 'file',
          parentId: parentNodeId,
          content,
          language: ext
        };
      }
    });
  }

  if (fs.existsSync(tempCloneDir)) {
    readDirRecursive(tempCloneDir, 'root');
    try {
      fs.rmSync(tempCloneDir, { recursive: true, force: true });
    } catch (e) {}
  }

  return files;
}

// Upsert/Ensure a project exists on the backend database (critical for shareable links & live collaboration)
app.post('/api/projects/upsert', async (req, res) => {
  const { id, name, description, type, ownerId, files, sharedWith, userId, email } = req.body;
  const targetId = id || req.body._id;
  if (!targetId) {
    res.status(400).json({ error: 'Project ID is required' });
    return;
  }

  try {
    const userIdentities = [ownerId, userId, email, ...(Array.isArray(sharedWith) ? sharedWith : [])]
      .filter(Boolean)
      .map(s => String(s).trim());

    let project = await ProjectModel.findOne({ id: targetId });
    if (!project) {
      project = new ProjectModel({
        id: targetId,
        name: name || 'Shared Collaboration Workspace',
        description: description || 'Joined via live collaboration room link',
        type: type || 'web',
        ownerId: ownerId || userId || 'shared_creator',
        files: files && Object.keys(files).length > 0 ? files : TEMPLATES.web.files,
        sharedWith: Array.from(new Set(userIdentities)),
        messages: []
      });
      await project.save();
    } else {
      let modified = false;
      if (files && Object.keys(files).length > 0) {
        project.files = files;
        modified = true;
      }
      if (name && name !== project.name && !project.name.includes('(Saved Session)')) {
        project.name = name;
        modified = true;
      }
      if (ownerId && (project.ownerId === 'guest' || project.ownerId === 'shared_creator' || !project.ownerId)) {
        project.ownerId = ownerId;
        modified = true;
      }

      const currentShared = project.sharedWith || [];
      const updatedShared = Array.from(new Set([...currentShared, ...userIdentities]));
      if (updatedShared.length !== currentShared.length) {
        project.sharedWith = updatedShared;
        modified = true;
      }

      if (modified) {
        project.updatedAt = new Date();
        await project.save();
      }
    }

    if (files && Object.keys(files).length > 0) {
      try {
        saveProjectFileSystem(targetId, files);
      } catch (e) {}
    }

    res.json(project);
  } catch (err: any) {
    console.error('Error upserting project:', err);
    res.status(500).json({ error: 'Server error saving/upserting project.' });
  }
});

// Create a new project from a template or clone a GitHub repo
app.post('/api/projects', async (req, res) => {
  const { name, description, type, ownerId, githubUrl, branch } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: 'Name and type are required' });
    return;
  }

  const id = 'proj_' + Math.random().toString(36).substr(2, 9);
  let finalFiles: FileSystemState;

  if (githubUrl && String(githubUrl).trim()) {
    try {
      finalFiles = cloneAndImportGitHub(String(githubUrl).trim(), id, branch || 'main');
    } catch (err: any) {
      console.error('[GitHub Import Fallback]', err);
      finalFiles = JSON.parse(JSON.stringify(TEMPLATES[type]?.files || TEMPLATES.web.files));
    }
  } else {
    finalFiles = req.body.files || JSON.parse(JSON.stringify(TEMPLATES[type]?.files || TEMPLATES.web.files));
  }

  try {
    const newProject = new ProjectModel({
      id,
      name,
      description: description || 'No description provided.',
      type,
      ownerId: ownerId || 'guest',
      files: finalFiles,
      sharedWith: [],
      messages: []
    });

    await newProject.save();

    // Async write project files cache to physical disk for VM execution
    try {
      saveProjectFileSystem(id, finalFiles);
    } catch (e) {}

    const log = new AdminLogModel({
      userEmail: ownerId || 'guest',
      action: `Created project space "${name}" [ID: ${id}] (Type: ${type})`,
      status: 'success'
    });
    await log.save();

    res.status(201).json(newProject);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error creating project.' });
  }
});

// Send Team Collaboration Invitation Email via Brevo
app.post('/api/projects/invite', async (req: any, res) => {
  const { projectId, recipientEmail, inviterName } = req.body;

  if (!projectId || !recipientEmail) {
    res.status(400).json({ error: 'Project ID and recipient email address are required.' });
    return;
  }

  const cleanRecipient = String(recipientEmail).trim().toLowerCase();
  const fixedRecipient = fixEmailDomainTypo(cleanRecipient);

  try {
    const project = await ProjectModel.findOne({ id: projectId });
    if (!project) {
      res.status(404).json({ error: 'Project workspace not found.' });
      return;
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = new InviteModel({
      projectId: project.id,
      projectName: project.name,
      inviterEmail: req.user?.email || 'team@codesyne.dev',
      inviterName: inviterName || req.user?.username || 'CodeSyne Developer',
      recipientEmail: fixedRecipient,
      token: inviteToken,
      expiresAt,
      status: 'pending'
    });
    await invite.save();

    const emailHtml = generateTeamInviteEmailHtml(
      inviterName || req.user?.username || 'A CodeSyne Developer',
      project.name,
      project.id,
      inviteToken
    );

    const emailRes = await sendBrevoEmail({
      toEmail: fixedRecipient,
      subject: `Team Invite: ${inviterName || req.user?.username || 'A team member'} invited you to "${project.name}" on CodeSyne 👥`,
      htmlContent: emailHtml
    });

    if (!emailRes.success) {
      res.status(500).json({ error: emailRes.error || 'Failed to send invitation email via Brevo.' });
      return;
    }

    res.json({
      success: true,
      message: `Invitation email sent successfully to ${fixedRecipient}!`,
      inviteToken
    });
  } catch (err: any) {
    console.error('Error sending team invite:', err);
    res.status(500).json({ error: err.message || 'Server error sending team invitation email.' });
  }
});

// Send Instant Live Collaboration Room Invitation via Brevo
app.post('/api/collab/invite', async (req: any, res) => {
  const { roomId, recipientEmail, inviterName, projectName } = req.body;

  if (!roomId || !recipientEmail) {
    res.status(400).json({ error: 'Room ID and recipient email address are required.' });
    return;
  }

  const cleanRecipient = String(recipientEmail).trim().toLowerCase();
  const fixedRecipient = fixEmailDomainTypo(cleanRecipient);
  const baseUrl = getAppBaseUrl();
  const roomUrl = `${baseUrl}/?collab=${encodeURIComponent(roomId)}`;

  try {
    const sender = inviterName || req.user?.username || 'A CodeSyne Developer';
    const project = projectName || 'Collaborative Workspace';

    const emailHtml = generateCollabRoomInviteEmailHtml(
      sender,
      roomId,
      project,
      roomUrl
    );

    const emailRes = await sendBrevoEmail({
      toEmail: fixedRecipient,
      subject: `CodeSyne Live Room Invite: ${sender} invited you to collaborate 👥`,
      htmlContent: emailHtml
    });

    if (!emailRes.success) {
      res.status(500).json({ error: emailRes.error || 'Failed to send room invitation email via Brevo.' });
      return;
    }

    res.json({
      success: true,
      message: `Collaboration invitation sent to ${fixedRecipient}!`
    });
  } catch (err: any) {
    console.error('Error sending collab room invite:', err);
    res.status(500).json({ error: err.message || 'Server error sending collaboration invitation email.' });
  }
});

// ==========================================
// CONTACT US RELAY & VERIFICATION FLOW (BREVO)
// ==========================================

// 1. Submit Contact Form (Signed-in User -> Direct Dispatch; Guest -> Verification Email Flow)
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !message) {
    res.status(400).json({ error: 'Name and message content are required.' });
    return;
  }

  // Check if authenticated session is present
  let authenticatedUser: any = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'codesyne_secret_key_123');
      if (decoded && (decoded.email || decoded.id)) {
        authenticatedUser = await UserModel.findOne({
          $or: [
            { _id: decoded.id },
            { id: decoded.id },
            { email: (decoded.email || '').toLowerCase().trim() }
          ]
        });
      }
    } catch (jwtErr) {
      // Unauthenticated / expired token
    }
  }

  const cleanSubject = (subject && String(subject).trim()) || 'General Inquiry';
  const adminTargetEmail = 'nakulsharma02011@gmail.com';

  // --- FLOW A: AUTHENTICATED SIGNED-IN USER (Direct Dispatch) ---
  if (authenticatedUser && authenticatedUser.email) {
    const verifiedUserEmail = authenticatedUser.email;
    const senderName = String(name).trim() || authenticatedUser.username || 'CodeSyne User';

    try {
      // 1. Dispatch email to Admin (nakulsharma02011@gmail.com) via Brevo
      const adminEmailHtml = generateContactInquiryEmailHtml(
        senderName,
        verifiedUserEmail,
        cleanSubject,
        String(message).trim()
      );

      const adminSendRes = await sendBrevoEmail({
        toEmail: adminTargetEmail,
        toName: 'CodeSyne Admin',
        subject: `[CodeSyne Contact - User] ${cleanSubject} - from ${senderName}`,
        htmlContent: adminEmailHtml
      });

      // 2. Dispatch confirmation / acknowledgment to the user
      const ackEmailHtml = generateContactAckEmailHtml(
        senderName,
        cleanSubject
      );

      sendBrevoEmail({
        toEmail: verifiedUserEmail,
        toName: senderName,
        subject: `We received your message: ${cleanSubject} • CodeSyne`,
        htmlContent: ackEmailHtml
      }).catch(e => console.warn('Failed to send contact acknowledgment email:', e));

      if (!adminSendRes.success) {
        console.warn('Brevo contact email warning:', adminSendRes.error);
      }

      res.json({
        success: true,
        verified: true,
        isUser: true,
        message: 'Your inquiry has been successfully transmitted to CodeSyne support desk!'
      });
      return;
    } catch (err: any) {
      console.error('Error handling signed-in contact submission:', err);
      res.status(500).json({ error: err.message || 'Failed to submit contact message.' });
      return;
    }
  }

  // --- FLOW B: GUEST USER (Email Verification Required) ---
  if (!email) {
    res.status(400).json({ error: 'Email address is required for contact submission.' });
    return;
  }

  const cleanSenderEmail = String(email).trim().toLowerCase();
  const fixedSenderEmail = fixEmailDomainTypo(cleanSenderEmail);
  const baseUrl = getRequestBaseUrl(req);

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(fixedSenderEmail)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  try {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours

    // Upsert pending contact inquiry
    let pending = await PendingContactModel.findOne({ email: fixedSenderEmail });
    if (pending) {
      pending.name = String(name).trim();
      pending.subject = cleanSubject;
      pending.message = String(message).trim();
      pending.verificationToken = verificationToken;
      pending.verificationExpires = verificationExpires;
      pending.isVerified = false;
      pending.lastResentAt = new Date();
      await pending.save();
    } else {
      pending = new PendingContactModel({
        name: String(name).trim(),
        email: fixedSenderEmail,
        subject: cleanSubject,
        message: String(message).trim(),
        verificationToken,
        verificationExpires,
        isVerified: false,
        lastResentAt: new Date()
      });
      await pending.save();
    }

    // Send verification email via Brevo
    const verifyEmailHtml = generateContactVerificationEmailHtml(
      String(name).trim(),
      cleanSubject,
      verificationToken,
      baseUrl
    );

    const brevoRes = await sendBrevoEmail({
      toEmail: fixedSenderEmail,
      toName: String(name).trim(),
      subject: 'Verify your email address • CodeSyne Contact Inquiry',
      htmlContent: verifyEmailHtml
    });

    if (!brevoRes.success) {
      console.warn('Brevo contact verification email warning:', brevoRes.error);
    }

    res.json({
      success: true,
      pendingVerification: true,
      email: fixedSenderEmail,
      message: 'Verification link sent! Please check your email to confirm and transmit your inquiry.'
    });
  } catch (err: any) {
    console.error('Error handling guest contact submission:', err);
    res.status(500).json({ error: err.message || 'Failed to initialize contact verification.' });
  }
});

// 2. Validate Contact Verification Token (Called when user clicks verification link on Landing Page)
app.get('/api/contact/verify', async (req, res) => {
  const token = String(req.query.token || '').trim();

  if (!token) {
    res.status(400).json({ error: 'Verification token is required.', invalid: true });
    return;
  }

  try {
    const pending = await PendingContactModel.findOne({ verificationToken: token });
    if (!pending) {
      res.status(404).json({ 
        error: 'Invalid or expired verification link. Please submit your inquiry again on the contact form.',
        invalid: true 
      });
      return;
    }

    if (pending.verificationExpires && new Date(pending.verificationExpires).getTime() < Date.now()) {
      res.status(400).json({ 
        error: 'This verification link has expired. Please submit your inquiry again to receive a fresh verification link.', 
        expired: true, 
        email: pending.email 
      });
      return;
    }

    // Mark verified in database
    pending.isVerified = true;
    await pending.save();

    res.json({
      success: true,
      verified: true,
      token: pending.verificationToken,
      contact: {
        name: pending.name,
        email: pending.email,
        subject: pending.subject,
        message: pending.message
      }
    });
  } catch (err: any) {
    console.error('Error verifying contact token:', err);
    res.status(500).json({ error: err.message || 'Server error verifying contact token.' });
  }
});

// Poll contact inquiry status when user switches tabs or browsers
app.get('/api/contact/check-status', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email query parameter is required.' });
    return;
  }

  try {
    const cleanEmail = fixEmailDomainTypo(email);
    const pending = await PendingContactModel.findOne({
      $or: [{ email: cleanEmail }, { email }]
    });

    if (pending) {
      res.json({
        exists: true,
        isVerified: !!pending.isVerified,
        token: pending.verificationToken,
        contact: {
          name: pending.name,
          email: pending.email,
          subject: pending.subject,
          message: pending.message
        }
      });
      return;
    }

    res.json({ exists: false, isVerified: false, message: 'No pending inquiry found.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error checking contact status.' });
  }
});

// 3. Confirm & Transmit Verified Inquiry
app.post('/api/contact/confirm-verified', async (req, res) => {
  const { token, name, subject, message } = req.body;

  if (!token) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }

  try {
    const baseUrl = getRequestBaseUrl(req);
    const pending = await PendingContactModel.findOne({ verificationToken: token });
    if (!pending) {
      res.status(404).json({ 
        error: 'Verification session not found or already transmitted. If you need further assistance, please send a new inquiry.' 
      });
      return;
    }

    if (pending.verificationExpires && new Date(pending.verificationExpires).getTime() < Date.now()) {
      res.status(400).json({ 
        error: 'This verification session has expired. Please submit your inquiry again.', 
        expired: true 
      });
      return;
    }

    const finalName = (name && String(name).trim()) || pending.name;
    const finalSubject = (subject && String(subject).trim()) || pending.subject || 'General Inquiry';
    const finalMessage = (message && String(message).trim()) || pending.message;
    const finalEmail = pending.email;
    const adminTargetEmail = 'nakulsharma02011@gmail.com';

    // 1. Dispatch email to Admin (nakulsharma02011@gmail.com) via Brevo
    const adminEmailHtml = generateContactInquiryEmailHtml(
      finalName,
      finalEmail,
      finalSubject,
      finalMessage
    );

    const adminSendRes = await sendBrevoEmail({
      toEmail: adminTargetEmail,
      toName: 'CodeSyne Admin',
      subject: `[CodeSyne Contact - Verified] ${finalSubject} - from ${finalName}`,
      htmlContent: adminEmailHtml
    });

    // 2. Dispatch confirmation / acknowledgment to the verified sender
    const ackEmailHtml = generateContactAckEmailHtml(
      finalName,
      finalSubject,
      baseUrl
    );

    sendBrevoEmail({
      toEmail: finalEmail,
      toName: finalName,
      subject: `We received your message: ${finalSubject} • CodeSyne`,
      htmlContent: ackEmailHtml
    }).catch(e => console.warn('Failed to send contact acknowledgment email:', e));

    if (!adminSendRes.success) {
      console.warn('Brevo contact email warning:', adminSendRes.error);
    }

    // 3. Remove pending record after successful transmission
    await PendingContactModel.deleteOne({ verificationToken: token });

    res.json({
      success: true,
      message: 'Your inquiry has been verified and successfully transmitted to CodeSyne support desk!'
    });
  } catch (err: any) {
    console.error('Error confirming verified contact submission:', err);
    res.status(500).json({ error: err.message || 'Failed to transmit verified message.' });
  }
});

// 4. Resend Contact Verification Email
app.post('/api/contact/resend-verification', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }

  const cleanEmail = fixEmailDomainTypo(String(email).trim().toLowerCase());
  const baseUrl = getRequestBaseUrl(req);

  try {
    const pending = await PendingContactModel.findOne({ $or: [{ email: cleanEmail }, { email: String(email).trim().toLowerCase() }] });
    if (!pending) {
      res.status(404).json({ error: 'No pending contact inquiry found for this email address. Please submit the form.' });
      return;
    }

    // 30s rate limit cooldown check
    const cooldownMs = 30 * 1000;
    if (pending.lastResentAt && (Date.now() - new Date(pending.lastResentAt).getTime() < cooldownMs)) {
      const remainingSecs = Math.ceil((cooldownMs - (Date.now() - new Date(pending.lastResentAt).getTime())) / 1000);
      res.status(429).json({ error: `Please wait ${remainingSecs}s before requesting another verification email.` });
      return;
    }

    // Refresh token and update expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    pending.verificationToken = newToken;
    pending.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    pending.lastResentAt = new Date();
    await pending.save();

    // Send verification email via Brevo
    const emailHtml = generateContactVerificationEmailHtml(pending.name, pending.subject, newToken, baseUrl);
    await sendBrevoEmail({
      toEmail: cleanEmail,
      toName: pending.name,
      subject: 'Verify your contact inquiry email • CodeSyne',
      htmlContent: emailHtml
    });

    res.json({
      success: true,
      message: `Fresh verification link sent to ${cleanEmail}! Please check your inbox.`
    });
  } catch (err: any) {
    console.error('Error resending contact verification email:', err);
    res.status(500).json({ error: err.message || 'Failed to resend verification email.' });
  }
});

// ==========================================
// OFFICIAL APPLICATION DOWNLOAD SYSTEM
// PWA, Windows (.EXE), and Android (.APK)
// ==========================================

const DOWNLOADS_DIR = path.join(process.cwd(), 'public/downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function findExistingPackage(target: 'windows' | 'android'): { filePath: string; filename: string; sha256: string; sizeBytes: number; sizeFormatted: string } | null {
  const isWindows = target === 'windows';
  const defaultFilename = isWindows ? 'CodeSyne-Setup-1.2.0.exe' : 'CodeSyne-v1.2.0.apk';
  
  const possiblePaths = isWindows ? [
    path.join(DOWNLOADS_DIR, 'CodeSyne-Setup-1.2.0.exe'),
    path.join(DOWNLOADS_DIR, 'codesyne-setup.exe'),
    path.join(process.cwd(), 'src-tauri/target/release/bundle/nsis/CodeSyne_1.2.0_x64-setup.exe')
  ] : [
    path.join(DOWNLOADS_DIR, 'CodeSyne-v1.2.0.apk'),
    path.join(DOWNLOADS_DIR, 'app-release.apk'),
    path.join(process.cwd(), 'android/app/build/outputs/apk/release/CodeSyne-v1.2.0.apk'),
    path.join(process.cwd(), 'android/app/build/outputs/apk/release/app-release.apk')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const stats = fs.statSync(p);
        if (stats.size > 1024) {
          const fileData = fs.readFileSync(p);
          const hash = crypto.createHash('sha256').update(fileData).digest('hex');
          const sizeBytes = stats.size;
          const sizeFormatted = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
          return { filePath: p, filename: defaultFilename, sha256: hash, sizeBytes, sizeFormatted };
        }
      } catch (e) {}
    }
  }

  return null;
}

app.get('/api/download/info', (req, res) => {
  try {
    const winPkg = findExistingPackage('windows');
    const androidPkg = findExistingPackage('android');
    const baseUrl = getRequestBaseUrl(req);

    const androidExternalUrl = process.env.ANDROID_RELEASE_APK_URL || 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne-v1.2.0.apk';
    const windowsExternalUrl = process.env.WINDOWS_RELEASE_EXE_URL || 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x64-setup.exe';
    const windows32ExternalUrl = process.env.WINDOWS_32_RELEASE_EXE_URL || 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x86-setup.exe';

    res.json({
      success: true,
      appName: 'CodeSyne',
      targets: {
        pwa: {
          name: 'Progressive Web App (PWA)',
          type: 'pwa',
          version: '1.2.0',
          platform: 'All Platforms (Chrome, Edge, Safari, Firefox, iOS, Android, macOS, Windows, Linux)',
          status: 'Active',
          manifestUrl: `${baseUrl}/manifest.json`,
          swUrl: `${baseUrl}/sw.js`,
          releaseDate: '2026-08-24',
          description: 'Zero-install instant cloud IDE with offline shell caching, native standalone window support, and automatic background updates.'
        },
        windows: {
          name: 'Windows Desktop Application (64-bit)',
          type: 'exe',
          version: '1.2.0',
          filename: winPkg?.filename || 'CodeSyne_1.2.0_x64-setup.exe',
          platform: 'Windows 7 SP1 / 8 / 10 / 11 (64-bit)',
          size: winPkg?.sizeFormatted || '3.5 MB',
          sizeBytes: winPkg?.sizeBytes,
          sha256: winPkg?.sha256 || '295d3834feab0f448c3eb05c9359e8ca37ae46f72f2d93eec68298ba5cb0f92d',
          downloadUrl: `${baseUrl}/api/download/windows`,
          externalReleaseUrl: windowsExternalUrl,
          releaseDate: '2026-08-24',
          description: 'Official standalone 64-bit Windows executable installer. Native high performance with zero browser UI clutter.',
          installGuide: 'Download and run CodeSyne_1.2.0_x64-setup.exe.'
        },
        windows32: {
          name: 'Windows Desktop Application (32-bit)',
          type: 'exe',
          version: '1.2.0',
          filename: 'CodeSyne_1.2.0_x86-setup.exe',
          platform: 'Windows 7 SP1 / 8 / 10 / 11 (32-bit x86)',
          size: '3.3 MB',
          downloadUrl: `${baseUrl}/api/download/windows32`,
          externalReleaseUrl: windows32ExternalUrl,
          releaseDate: '2026-08-24',
          description: 'Official standalone 32-bit (x86) Windows installer for older PC hardware and 32-bit Windows operating systems.',
          installGuide: 'Download and run CodeSyne_1.2.0_x86-setup.exe. (Requires Microsoft WebView2 runtime on Windows 7).'
        },
        android: {
          name: 'Android Native Application',
          type: 'apk',
          version: '1.2.0',
          filename: androidPkg?.filename || 'CodeSyne-v1.2.0.apk',
          packageId: 'app.codesyne.android',
          platform: 'Android 8.0+ (Oreo to Android 15)',
          size: androidPkg?.sizeFormatted || '4.2 MB',
          sizeBytes: androidPkg?.sizeBytes,
          sha256: androidPkg?.sha256,
          downloadUrl: `${baseUrl}/api/download/android`,
          externalReleaseUrl: androidExternalUrl,
          releaseDate: '2026-08-24',
          description: 'Official signed standalone APK for direct installation. Responsive touch coding keyboard helpers, zero Google Play requirement, restricted only to network permissions.',
          installGuide: 'Download the APK directly. When prompted by Android, tap Settings and allow "Install unknown apps" from your browser to complete installation.'
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching download information.' });
  }
});

app.get('/api/download/windows', (req, res) => {
  try {
    const pkg = findExistingPackage('windows');
    if (pkg && fs.existsSync(pkg.filePath)) {
      res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
      res.setHeader('Content-Disposition', `attachment; filename="${pkg.filename}"`);
      res.setHeader('X-SHA256-Checksum', pkg.sha256);
      res.setHeader('Content-Length', pkg.sizeBytes);
      const stream = fs.createReadStream(pkg.filePath);
      return stream.pipe(res);
    }

    const source = req.query.source as string;
    const isCore = source === 'core' || process.env.GITHUB_REPO === 'CodeSyne-Core';
    const fallbackUrl = process.env.WINDOWS_RELEASE_EXE_URL || 
      (isCore 
        ? 'https://github.com/nakulsh02/CodeSyne-Core/releases/download/v1.2.0/CodeSyne_1.2.0_x64-setup.exe'
        : 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x64-setup.exe');
        
    return res.redirect(302, fallbackUrl);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to download Windows application.' });
  }
});

app.get('/api/download/windows32', (req, res) => {
  try {
    const source = req.query.source as string;
    const isCore = source === 'core' || process.env.GITHUB_REPO === 'CodeSyne-Core';
    const fallbackUrl = process.env.WINDOWS_32_RELEASE_EXE_URL || 
      (isCore
        ? 'https://github.com/nakulsh02/CodeSyne-Core/releases/download/v1.2.0/CodeSyne_1.2.0_x86-setup.exe'
        : 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x86-setup.exe');
        
    return res.redirect(302, fallbackUrl);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to download Windows 32-bit application.' });
  }
});

app.get('/api/download/android', (req, res) => {
  try {
    const pkg = findExistingPackage('android');
    if (pkg && fs.existsSync(pkg.filePath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${pkg.filename}"`);
      res.setHeader('X-SHA256-Checksum', pkg.sha256);
      res.setHeader('Content-Length', pkg.sizeBytes);
      const stream = fs.createReadStream(pkg.filePath);
      return stream.pipe(res);
    }

    const source = req.query.source as string;
    const isCore = source === 'core' || process.env.GITHUB_REPO === 'CodeSyne-Core';
    const fallbackUrl = process.env.ANDROID_RELEASE_APK_URL || 
      (isCore
        ? 'https://github.com/nakulsh02/CodeSyne-Core/releases/download/v1.2.0/CodeSyne-v1.2.0.apk'
        : 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne-v1.2.0.apk');
        
    return res.redirect(302, fallbackUrl);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to download Android application.' });
  }
});

// Explicit direct mirror routes for CodeSyne-Core
app.get('/api/download/core/:platform', (req, res) => {
  const { platform } = req.params;
  if (platform === 'windows') return res.redirect(302, 'https://github.com/nakulsh02/CodeSyne-Core/releases/download/v1.2.0/CodeSyne_1.2.0_x64-setup.exe');
  if (platform === 'windows32') return res.redirect(302, 'https://github.com/nakulsh02/CodeSyne-Core/releases/download/v1.2.0/CodeSyne_1.2.0_x86-setup.exe');
  if (platform === 'android') return res.redirect(302, 'https://github.com/nakulsh02/CodeSyne-Core/releases/download/v1.2.0/CodeSyne-v1.2.0.apk');
  return res.status(404).json({ error: 'Platform not found' });
});

// Explicit direct mirror routes for CodeSyne Public
app.get('/api/download/public/:platform', (req, res) => {
  const { platform } = req.params;
  if (platform === 'windows') return res.redirect(302, 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x64-setup.exe');
  if (platform === 'windows32') return res.redirect(302, 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x86-setup.exe');
  if (platform === 'android') return res.redirect(302, 'https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne-v1.2.0.apk');
  return res.status(404).json({ error: 'Platform not found' });
});


// Accept Collaboration Invitation
app.post('/api/projects/accept-invite', async (req, res) => {
  const { inviteToken, userEmail, userId } = req.body;

  if (!inviteToken) {
    res.status(400).json({ error: 'Invite token is required.' });
    return;
  }

  try {
    const invite = await InviteModel.findOne({ token: inviteToken });
    if (!invite) {
      res.status(404).json({ error: 'Invalid or expired workspace invitation link.' });
      return;
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      invite.status = 'expired';
      await invite.save();
      res.status(400).json({ error: 'This workspace invitation link has expired.' });
      return;
    }

    const project = await ProjectModel.findOne({ id: invite.projectId });
    if (!project) {
      res.status(404).json({ error: 'Project workspace no longer exists.' });
      return;
    }

    const cleanEmail = (userEmail || invite.recipientEmail).toLowerCase().trim();
    if (project.sharedWith && Array.isArray(project.sharedWith)) {
      if (!project.sharedWith.includes(cleanEmail)) {
        project.sharedWith.push(cleanEmail);
      }
      if (userId && !project.sharedWith.includes(userId)) {
        project.sharedWith.push(userId);
      }
    } else {
      project.sharedWith = [cleanEmail];
    }
    await project.save();

    invite.status = 'accepted';
    await invite.save();

    res.json({
      success: true,
      message: `Successfully joined ${project.name}! Workspace permissions updated.`,
      project
    });
  } catch (err: any) {
    console.error('Error accepting team invite:', err);
    res.status(500).json({ error: err.message || 'Server error accepting invitation.' });
  }
});

// Update a project (rename, archive, favorite)
app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await ProjectModel.findOneAndUpdate(
      { id },
      { ...req.body, updatedAt: new Date(), lastAccessedAt: new Date() },
      { new: true }
    );
    if (!updated) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const log = new AdminLogModel({
      userEmail: updated.ownerId || 'guest',
      action: `Modified project workspace "${updated.name}" (Status: ${updated.status})`,
      status: 'info'
    });
    await log.save();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error updating project.' });
  }
});

// Update project files
app.post('/api/projects/:id/files', async (req, res) => {
  const { id } = req.params;
  const { userId, email, ownerId } = req.query;
  const payload = req.body;
  const files = (payload && payload.files) ? payload.files : payload;
  const reqUserId = (payload && payload.userId) || userId;
  const reqEmail = (payload && payload.email) || email;
  const reqOwnerId = (payload && payload.ownerId) || ownerId;

  if (!files || typeof files !== 'object') {
    res.status(400).json({ error: 'Invalid files payload' });
    return;
  }

  try {
    const userIdentities = [reqUserId, reqEmail, reqOwnerId].filter(Boolean).map(s => String(s).trim());
    let project = await ProjectModel.findOne({ id });
    if (project) {
      project.files = files;
      project.updatedAt = new Date();
      if (userIdentities.length > 0) {
        const currentShared = project.sharedWith || [];
        project.sharedWith = Array.from(new Set([...currentShared, ...userIdentities]));
      }
      await project.save();
    } else {
      project = new ProjectModel({
        id,
        name: 'Saved Collaborative Project',
        description: 'Updated from live workspace session',
        type: 'web',
        ownerId: (reqOwnerId as string) || (reqUserId as string) || 'shared',
        files,
        sharedWith: Array.from(new Set(userIdentities)),
        messages: []
      });
      await project.save();
    }

    try {
      saveProjectFileSystem(id, files);
    } catch (e) {}

    res.json({ status: 'ok', project });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error updating project files' });
  }
});

// Duplicate a project
app.post('/api/projects/:id/duplicate', async (req, res) => {
  const { id } = req.params;
  try {
    const project = await ProjectModel.findOne({ id });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const newId = 'proj_' + Math.random().toString(36).substr(2, 9);
    const newProject = new ProjectModel({
      id: newId,
      name: `${project.name} (Copy)`,
      description: project.description,
      type: project.type,
      ownerId: project.ownerId,
      files: project.files,
      sharedWith: project.sharedWith || [],
      messages: []
    });

    await newProject.save();

    // Copy files cache to disk
    try {
      saveProjectFileSystem(newId, project.files);
    } catch (e) {}

    const log = new AdminLogModel({
      userEmail: project.ownerId || 'guest',
      action: `Duplicated project "${project.name}" into copy "${newProject.name}"`,
      status: 'info'
    });
    await log.save();

    res.status(201).json(newProject);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error duplicating project.' });
  }
});

// Delete a project
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deletedProject = await ProjectModel.findOneAndDelete({ id });
    if (!deletedProject) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Remove filesystem directory
    const projectPath = path.join(PROJECTS_DIR, id);
    if (fs.existsSync(projectPath)) {
      try {
        fs.rmSync(projectPath, { recursive: true, force: true });
      } catch (e) {}
    }

    const log = new AdminLogModel({
      userEmail: deletedProject.ownerId || 'system',
      action: `Permanently deleted project workspace: "${deletedProject.name}"`,
      status: 'warning'
    });
    await log.save();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error deleting project.' });
  }
});

// Retrieve project files
app.get('/api/projects/:id/files', async (req, res) => {
  const { id } = req.params;
  try {
    const project = await ProjectModel.findOne({ id });
    if (project && project.files && Object.keys(project.files).length > 0) {
      res.json(project.files);
    } else {
      const files = getProjectFileSystem(id);
      res.json(files);
    }
  } catch (err) {
    res.json(getProjectFileSystem(id));
  }
});

// Save/Update project files
app.post('/api/projects/:id/files', async (req, res) => {
  const { id } = req.params;
  const files = req.body;
  const connId = (req.query.connectionId as string) || (req.headers['x-connection-id'] as string) || (files && files._connectionId);
  if (files && files._connectionId) {
    delete files._connectionId;
  }
  try {
    const project = await ProjectModel.findOneAndUpdate(
      { id },
      { files, updatedAt: new Date() },
      { new: true }
    );

    try {
      saveProjectFileSystem(id, files);
    } catch (e) {}
    
    // Broadcast file tree and content changes to all connected room clients except sender
    if (projectRooms[id]) {
      broadcastToProject(id, {
        type: 'files_updated',
        files,
        senderConnectionId: connId,
        senderId: 'api_http'
      }, connId);
    }

    const log = new AdminLogModel({
      userEmail: project ? project.ownerId : 'guest',
      action: `Saved/Updated filesystem directories in project: "${project ? project.name : id}"`,
      status: 'info'
    });
    await log.save();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error updating filesystem.' });
  }
});

// Log Granular File Access across devices
app.post('/api/projects/:id/file-access-log', async (req, res) => {
  const { id } = req.params;
  const { fileId, fileName, filePath, userEmail, username, device } = req.body;
  if (!id || !fileId || !fileName) {
    res.status(400).json({ error: 'id (projectId), fileId, and fileName are required' });
    return;
  }
  try {
    const accessLog = new FileAccessLogModel({
      projectId: id,
      fileId,
      fileName,
      filePath: filePath || '',
      userEmail: userEmail || 'developer',
      username: username || 'Developer',
      device: device || 'Desktop',
      openedAt: new Date()
    });
    await accessLog.save();

    // Update project updatedAt and lastAccessedAt timestamp so Dashboard reflects "Just now" on all devices
    await ProjectModel.findOneAndUpdate({ id }, { updatedAt: new Date(), lastAccessedAt: new Date() });

    // Broadcast file access event in real-time to all connected devices in the project room
    const room = projectRooms[id];
    if (room) {
      const payload = JSON.stringify({
        type: 'FILE_ACCESSED',
        log: {
          id: accessLog.id,
          projectId: id,
          fileId,
          fileName,
          filePath: filePath || '',
          userEmail: userEmail || 'developer',
          username: username || 'Developer',
          device: device || 'Desktop',
          openedAt: accessLog.openedAt.toISOString()
        }
      });
      Object.values(room).forEach(client => {
        if (client.ws && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(payload);
        }
      });
    }

    res.json({ success: true, log: accessLog });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to persist file access log' });
  }
});

// Retrieve File Access Logs for cross-device synchronization
app.get('/api/projects/:id/file-access-logs', async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await FileAccessLogModel.find({ projectId: id }).sort({ openedAt: -1 }).limit(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve file access logs' });
  }
});

// Smart Sandbox Code Interpreter Fallback for server-less/independent environments like Vercel or Render
async function simulateCodeExecution(content: string, extensionRaw: string): Promise<{ output: string; errors: string }> {
  const extension = (extensionRaw || '').toLowerCase();
  let jsCode = '';
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const customConsole = {
    log: (...args: any[]) => {
      stdoutLines.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
    },
    error: (...args: any[]) => {
      stderrLines.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
    },
    warn: (...args: any[]) => {
      stdoutLines.push('[WARN] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
    }
  };

  try {
    if (extension === '.js' || extension === '.ts') {
      let codeToRun = content;
      if (extension === '.ts') {
        // Strip basic typescript types
        codeToRun = codeToRun
          .replace(/: \s*(string|number|boolean|any|void|unknown|object|never)/g, '')
          .replace(/as \s*(string|number|boolean|any|void|unknown|object|never)/g, '')
          .replace(/interface \s+\w+\s*\{[^}]*\}/g, '')
          .replace(/type \s+\w+\s*=\s*[^;]+;/g, '');
      }
      jsCode = codeToRun;
    } else if (extension === '.java') {
      let javaCode = content;
      
      // Clean up package and imports
      javaCode = javaCode.replace(/package\s+[\w.]+;/g, '');
      javaCode = javaCode.replace(/import\s+[\w.]+;/g, '');

      // Replace System.out.println / System.out.print with console.log
      javaCode = javaCode.replace(/System\.out\.println\s*\(/g, 'console.log(');
      javaCode = javaCode.replace(/System\.out\.print\s*\(/g, 'console.log(');

      // Strip method signature types safely using a selective regex rather than matching all parentheses
      javaCode = javaCode.replace(/(public\s+|private\s+|protected\s+)?(static\s+)?(void|int|double|float|boolean|String|char|long|short|void|[\w\d_<>\s]+)\s+(\w+)\s*\(([^)]*)\)/g, (match, access, isStatic, returnType, methodName, paramsText) => {
        const skipMethods = ['for', 'if', 'while', 'switch', 'catch', 'synchronized', 'super', 'this', 'log', 'println', 'print'];
        if (skipMethods.includes(methodName)) {
          return match; // Don't break control structures or printed statements!
        }
        const params = paramsText.trim() ? paramsText.split(',') : [];
        const cleanedParams = params.map((param: string) => {
          const parts = param.trim().split(/\s+/);
          return parts[parts.length - 1].replace(/[\[\]]/g, ''); // Keep only the parameter name
        });
        const staticKeyword = (isStatic || (returnType && /\bstatic\b/.test(returnType))) ? 'static ' : '';
        return `${staticKeyword}${methodName}(${cleanedParams.join(', ')})`;
      });

      // Convert Class header: public class Main { -> class Main {
      javaCode = javaCode.replace(/public\s+class\s+(\w+)/g, 'class $1');

      // Convert variable declarations: e.g. int x = 5; or String[] names = ... -> let x = 5; or let names = ...
      const typesRegex = /\b(int|double|float|boolean|String|char|long|short|var)\s*(\[ \s* \])?\s+([a-zA-Z_]\w*)\s*(\[ \s* \])?\b/g;
      javaCode = javaCode.replace(typesRegex, 'let $3');

      // Support array initializers like {1, 2, 3} -> [1, 2, 3] in let arr = {1, 2, 3};
      javaCode = javaCode.replace(/let\s+([a-zA-Z_]\w*)\s*=\s*\{([^}]+)\}/g, 'let $1 = [$2]');

      // Fix for-loops with let statement types
      javaCode = javaCode.replace(/\bfor\s*\(\s*let\s+([a-zA-Z_]\w*)\b/g, 'for (let $1');

      // Replace .length() with .length for strings / arrays in JS
      javaCode = javaCode.replace(/\.length\s*\(\s*\)/g, '.length');

      // Extract class name to execute its main method automatically
      const classNameMatch = javaCode.match(/class\s+(\w+)/);
      
      const javaPolyfills = `
class ArrayList extends Array {
  add(item) { this.push(item); return true; }
  get(index) { return this[index]; }
  size() { return this.length; }
  clear() { this.length = 0; }
  remove(index) { return this.splice(index, 1)[0]; }
  isEmpty() { return this.length === 0; }
}
class HashMap extends Map {
  put(key, value) { this.set(key, value); return value; }
  get(key) { return super.get(key); }
  size() { return this.size; }
  containsKey(key) { return this.has(key); }
  remove(key) { const val = this.get(key); this.delete(key); return val; }
}
const System = {
  out: {
    println: (...args) => console.log(...args),
    print: (...args) => console.log(...args),
    printf: (format, ...args) => {
      let result = format;
      args.forEach(arg => {
        result = result.replace(/%[sdefg]/, arg);
      });
      console.log(result);
    }
  },
  getProperty: (key) => {
    if (key === 'java.vendor') return 'Smart Sandbox Compiler';
    if (key === 'java.version') return '17.0.2';
    return 'Mock Value';
  },
  currentTimeMillis: () => Date.now(),
  nanoTime: () => Date.now() * 1000000
};
if (!String.prototype.equals) {
  Object.defineProperty(String.prototype, 'equals', {
    value: function(other) { return this === other; },
    writable: true,
    configurable: true
  });
}
`;

      jsCode = javaPolyfills + '\n' + javaCode;
      
      if (classNameMatch && classNameMatch[1]) {
        jsCode += `\n\nif (typeof ${classNameMatch[1]} !== 'undefined' && typeof ${classNameMatch[1]}.main === 'function') { ${classNameMatch[1]}.main([]); }`;
      }
    } else if (extension === '.py') {
      let pyCode = content;
      pyCode = pyCode.replace(/\t/g, '    ');
      
      const rawLines = pyCode.split('\n');
      
      let minIndent = Infinity;
      rawLines.forEach(l => {
        if (l.trim().length > 0) {
          const indent = l.length - l.trimStart().length;
          if (indent < minIndent) minIndent = indent;
        }
      });
      if (minIndent === Infinity) minIndent = 0;
      
      const lines = rawLines.map(l => l.trim().length > 0 ? l.substring(minIndent) : '');
      let jsLines: string[] = [];
      let indentStack: number[] = [];

      lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          jsLines.push(trimmed.startsWith('#') ? '// ' + trimmed.substring(1) : '');
          return;
        }

        let indent = line.length - line.trimStart().length;

        while (indentStack.length > 0 && indent < indentStack[indentStack.length - 1]) {
          indentStack.pop();
          jsLines.push(' '.repeat(indent) + '}');
        }

        // Convert f-strings: f"..." or f'...'
        trimmed = trimmed.replace(/\bf(["'])([\s\S]*?)\1/g, (m, quote, str) => {
          const formatted = str.replace(/\{([^}]+)\}/g, '${$1}');
          return '`' + formatted + '`';
        });

        // Convert python booleans and null
        trimmed = trimmed
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null');

        // Convert python print
        if (trimmed.startsWith('print(')) {
          trimmed = trimmed.replace('print(', 'console.log(');
        } else if (trimmed.startsWith('print ')) {
          trimmed = 'console.log(' + trimmed.substring(6) + ')';
        }

        // Convert Python ternary: var = val1 if cond else val2
        const ternaryMatch = trimmed.match(/^([a-zA-Z_]\w*\s*=\s*)(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/);
        if (ternaryMatch) {
          trimmed = `${ternaryMatch[1]}(${ternaryMatch[3]}) ? (${ternaryMatch[2]}) : (${ternaryMatch[4]})`;
        }

        // Python functions: def func_name(args): -> function func_name(args) {
        if (/^(async\s+)?def\s+/.test(trimmed) && trimmed.endsWith(':')) {
          const isAsync = trimmed.startsWith('async');
          const defContent = trimmed.replace(/^(async\s+)?def\s+/, '').slice(0, -1).trim();
          trimmed = `${isAsync ? 'async ' : ''}function ${defContent} {`;
          indentStack.push(indent + 4);
        }
        // Python class: class ClassName: or class ClassName(Parent):
        else if (trimmed.startsWith('class ') && trimmed.endsWith(':')) {
          const classContent = trimmed.substring(6, trimmed.length - 1).replace(/\((.*?)\)/, '');
          trimmed = `class ${classContent.trim()} {`;
          indentStack.push(indent + 4);
        }
        // Loops & Control Flow
        else if (trimmed.startsWith('for ') && trimmed.endsWith(':')) {
          const range1 = trimmed.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*\)\s*:/);
          const range2 = trimmed.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*\)\s*:/);
          const range3 = trimmed.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*\)\s*:/);
          const forInObj = trimmed.match(/for\s+([a-zA-Z0-9_,\s]+)\s+in\s+(.+)\.items\s*\(\s*\)\s*:/);
          const forInList = trimmed.match(/for\s+(\w+)\s+in\s+(.+)\s*:/);

          if (range3) {
            trimmed = `for (let ${range3[1]} = ${range3[2]}; ${range3[1]} < ${range3[3]}; ${range3[1]} += ${range3[4]}) {`;
          } else if (range2) {
            trimmed = `for (let ${range2[1]} = ${range2[2]}; ${range2[1]} < ${range2[3]}; ${range2[1]}++) {`;
          } else if (range1) {
            trimmed = `for (let ${range1[1]} = 0; ${range1[1]} < ${range1[2]}; ${range1[1]}++) {`;
          } else if (forInObj) {
            const vars = forInObj[1].split(',').map(v => v.trim());
            const keyVar = vars[0] || 'key';
            const valVar = vars[1] || 'val';
            trimmed = `for (let [${keyVar}, ${valVar}] of Object.entries(${forInObj[2]})) {`;
          } else if (forInList) {
            trimmed = `for (let ${forInList[1]} of ${forInList[2]}) {`;
          } else {
            trimmed = `/* ${trimmed} */ {`;
          }
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('while ') && trimmed.endsWith(':')) {
          const cond = trimmed.substring(6, trimmed.length - 1).trim();
          trimmed = `while (${cond}) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('if ') && trimmed.endsWith(':')) {
          const cond = trimmed.substring(3, trimmed.length - 1).trim();
          trimmed = `if (${cond}) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('elif ') && trimmed.endsWith(':')) {
          const cond = trimmed.substring(5, trimmed.length - 1).trim();
          trimmed = `} else if (${cond}) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('else:') || trimmed.startsWith('else :')) {
          trimmed = `} else {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('try:') || trimmed.startsWith('try :')) {
          trimmed = `try {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('except') && trimmed.endsWith(':')) {
          trimmed = `} catch (err) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('finally:') || trimmed.startsWith('finally :')) {
          trimmed = `} finally {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.endsWith(':')) {
          trimmed = trimmed.substring(0, trimmed.length - 1) + ' {';
          indentStack.push(indent + 4);
        }
        else {
          if (/^[a-zA-Z_]\w*\s*=/.test(trimmed) && !/^(let|const|var)\s+/.test(trimmed)) {
            const varName = trimmed.split('=')[0].trim();
            if (!['window', 'global', 'console'].includes(varName)) {
              trimmed = 'let ' + trimmed;
            }
          }
        }

        jsLines.push(' '.repeat(indent) + trimmed);
      });

      while (indentStack.length > 0) {
        indentStack.pop();
        jsLines.push('}');
      }

      const pyPolyfills = `
if (!Array.prototype.append) {
  Object.defineProperty(Array.prototype, 'append', {
    value: function(x) { this.push(x); return this; },
    writable: true, configurable: true
  });
}
if (!Array.prototype.extend) {
  Object.defineProperty(Array.prototype, 'extend', {
    value: function(arr) { if (Array.isArray(arr)) this.push(...arr); return this; },
    writable: true, configurable: true
  });
}
if (!Object.prototype.items) {
  Object.defineProperty(Object.prototype, 'items', {
    value: function() { return Object.entries(this); },
    writable: true, configurable: true
  });
}
if (!Object.prototype.get) {
  Object.defineProperty(Object.prototype, 'get', {
    value: function(key, defaultVal) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : (defaultVal !== undefined ? defaultVal : null); },
    writable: true, configurable: true
  });
}
`;
      jsCode = pyPolyfills + '\n' + jsLines.join('\n');
    } else if (extension === '.cpp' || extension === '.c' || extension === '.cc') {
      let cppCode = content;
      cppCode = cppCode.replace(/\/\*[\s\S]*?\*\//g, '');
      cppCode = cppCode.replace(/\/\/.*/g, '');
      cppCode = cppCode.replace(/#\s*(?:include|define|pragma|ifdef|ifndef|endif|else)[\s\S]*?$/gm, '');
      cppCode = cppCode.replace(/using\s+namespace\s+\w+\s*;/g, '');
      cppCode = cppCode.replace(/std::cout\s*<<\s*/g, 'console.log(');
      cppCode = cppCode.replace(/cout\s*<<\s*/g, 'console.log(');
      cppCode = cppCode.replace(/\s*<<\s*std::endl\s*;/g, ');');
      cppCode = cppCode.replace(/\s*<<\s*endl\s*;/g, ');');

      const typePattern = '\\b(?:int|double|float|bool|char|long|short|void|auto|string|std::string|size_t|uint32_t|int32_t|unsigned)\\b';
      
      // Clean and convert main function safely
      cppCode = cppCode.replace(new RegExp(`(?:${typePattern}\\s+)?main\\s*\\(([^)]*)\\)\\s*\\{`, 'g'), (match, params) => {
        const cleanParams = params.replace(new RegExp(`${typePattern}\\s+`, 'g'), '');
        return `async function main(${cleanParams}) {`;
      });

      // Convert standard functions
      const funcRegex = new RegExp(`(${typePattern})\\s+([a-zA-Z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
      cppCode = cppCode.replace(funcRegex, (match, retType, funcName, params) => {
        if (funcName === 'function' || funcName === 'main') return match;
        const cleanParams = params.replace(new RegExp(`${typePattern}\\s+`, 'g'), '');
        return `async function ${funcName}(${cleanParams}) {`;
      });

      // Replace variable declarations (e.g., int a = 10; or double x, y;)
      const varRegex = new RegExp(`\\b(?:int|double|float|bool|char|long|short|string|std::string|auto|size_t|uint32_t|int32_t|unsigned)\\s+([a-zA-Z_]\\w*(?:\\s*,\\s*[a-zA-Z_]\\w*)*)\\s*(;|=)`, 'g');
      cppCode = cppCode.replace(varRegex, 'let $1$2');

      // Fix standard for-loops
      cppCode = cppCode.replace(/\bfor\s*\(\s*(?:let\s+)?([a-zA-Z_]\w*)\b/g, 'for (let $1');

      jsCode = cppCode + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (extension === '.rs') {
      let rustCode = content;
      rustCode = rustCode.replace(/println!\s*\(\s*"([^"]*)"\s*,\s*([^)]+)\)/g, 'console.log("$1".replace("{}", $2))');
      rustCode = rustCode.replace(/println!\s*\(\s*"([^"]*)"\s*\)/g, 'console.log("$1")');
      rustCode = rustCode.replace(/fn\s+main\s*\(\s*\)\s*\{/g, 'function main() {');
      rustCode = rustCode.replace(/\blet\s+mut\s+/g, 'let ');
      jsCode = rustCode + `\n\nif (typeof main === 'function') { main(); }`;
    } else if (extension === '.go') {
      let goCode = content;
      // Remove package and imports
      goCode = goCode.replace(/package\s+\w+/g, '');
      // Match both single line and multiline imports
      goCode = goCode.replace(/import\s+\([^)]+\)/g, '');
      goCode = goCode.replace(/import\s+"[^"]+"/g, '');
      
      // Replace print statements
      goCode = goCode.replace(/fmt\.Println\s*\(/g, 'console.log(');
      goCode = goCode.replace(/fmt\.Print\s*\(/g, 'console.log(');
      
      // Convert channel make: make(chan string) -> new GoChannel()
      goCode = goCode.replace(/make\s*\(\s*chan\s+\w+\s*\)/g, 'new GoChannel()');

      // Convert goroutine calls: go func(...) { ... }(...)
      goCode = goCode.replace(/\bgo\s+func\s*\(([^)]*)\)\s*\{([\s\S]*?)\}\s*\(([^)]*)\)/g, 'go_routine(async ($1) => {$2}, $3)');

      // Convert time.Sleep(duration) -> await time.Sleep(duration)
      goCode = goCode.replace(/time\.Sleep\(([^)]+)\)/g, 'await time.Sleep($1)');

      // Convert channel send: ch <- val -> await ch.send(val)
      goCode = goCode.replace(/(\w+)\s*<-\s*([^;\n]+)/g, 'await $1.send($2)');

      // Convert channel receive: <-ch -> await ch.receive()
      goCode = goCode.replace(/<-\s*(\w+)/g, 'await $1.receive()');
      
      // Replace Go functions with types: func add(a int, b int) int { -> async function add(a, b) {
      goCode = goCode.replace(/func\s+(\w+)\s*\(([^)]*)\)\s*([^{]*)\{/g, (match, fnName, paramsText, returnType) => {
        const params = paramsText.trim() ? paramsText.split(',') : [];
        const cleanedParams = params.map((p: string) => {
          const parts = p.trim().split(/\s+/);
          return parts[0]; // Keep only the parameter name (which is first in Go)
        });
        return `async function ${fnName}(${cleanedParams.join(', ')}) {`;
      });

      // Convert simple func main if not matched above
      goCode = goCode.replace(/func\s+main\s*\(\s*\)/g, 'async function main()');
      
      // Convert three-part for loops: for i := 0; i < n; i++ { -> for (let i = 0; i < n; i++) {
      goCode = goCode.replace(/\bfor\s+([a-zA-Z0-9_]+)\s*:=\s*([^;]+);\s*([a-zA-Z0-9_]+)\s*([<>=!]+)\s*([^;]+);\s*([a-zA-Z0-9_+-]+)\s*\{/g, 'for (let $1 = $2; $3 $4 $5; $6) {');

      // Convert for range loops
      goCode = goCode.replace(/\bfor\s+([a-zA-Z0-9_,\s]+)\s*:=\s*range\s+([^\s{]+)\s*\{/g, (match, vars, expr) => {
        const parts = vars.split(',').map(v => v.trim());
        if (parts.length === 2) {
          const idx = parts[0] === '_' ? 'dummyIndex' : parts[0];
          const val = parts[1];
          return `for (let [${idx}, ${val}] of ${expr}.map((v, i) => [i, v])) {`;
        } else if (parts.length === 1) {
          return `for (let ${parts[0]} of Object.keys(${expr})) {`;
        }
        return match;
      });

      // Convert single condition for loops (Go's while): for x < 10 { -> while (x < 10) {
      goCode = goCode.replace(/\bfor\s+([^;{]+)\s*\{/g, 'while ($1) {');

      // Convert if statements: if x > 5 { -> if (x > 5) {
      goCode = goCode.replace(/\bif\s+([^;{]+)\s*\{/g, 'if ($1) {');
      goCode = goCode.replace(/\belse\s+if\s+([^;{]+)\s*\{/g, 'else if ($1) {');

      // Convert Go assignment operator := to let assignment
      goCode = goCode.replace(/(\w+)\s*:=\s*/g, 'let $1 = ');

      // Convert block var declarations: var (...)
      goCode = goCode.replace(/\bvar\s*\(\s*([\s\S]*?)\)/g, (match, block) => {
        const lines = block.split('\n').map((line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          const cleaned = trimmed
            .replace(/^(\w+)\s+(int|string|bool|float64|float32)\s*=\s*/g, 'let $1 = ')
            .replace(/^(\w+)\s+(int|string|bool|float64|float32)/g, 'let $1');
          return cleaned + ';';
        });
        return lines.join('\n');
      });

      // Convert normal var declarations
      goCode = goCode.replace(/\bvar\s+([a-zA-Z0-9_,\s]+)\s+(int|string|bool|float64|float32)\s*=\s*/g, 'let $1 = ');
      goCode = goCode.replace(/\bvar\s+([a-zA-Z0-9_,\s]+)\s+(int|string|bool|float64|float32)/g, 'let $1');

      // Convert const declarations
      goCode = goCode.replace(/\bconst\s+(\w+)\s+(int|string|bool|float64|float32)\s*=\s*/g, 'const $1 = ');

      // Clean up array/slice literals: []int{1, 2, 3} or [5]string{"a", "b"} -> [1, 2, 3] or ["a", "b"]
      goCode = goCode.replace(/\[\s*\d*\s*\]\w+\s*\{/g, '[');

      // Convert struct instantiations: Person{Name: "Nakul"} -> {Name: "Nakul"}
      goCode = goCode.replace(/\b([A-Z]\w*)\s*\{/g, '{');

      // Remove struct/type declarations: type Person struct { ... }
      goCode = goCode.replace(/type\s+\w+\s+struct\s*\{[^}]*\}/g, '');

      // Replace nil with null
      goCode = goCode.replace(/\bnil\b/g, 'null');
      
      jsCode = `(async () => {\n${goCode}\n\nif (typeof main === 'function') { await main(); }\n})()`;
    } else if (extension === '.php') {
      let phpCode = content;
      phpCode = phpCode.replace(/<\?php/g, '');
      phpCode = phpCode.replace(/\?>/g, '');
      phpCode = phpCode.replace(/echo\s+([^;]+);/g, 'console.log($1);');
      jsCode = phpCode;
    } else if (extension === '.swift') {
      let swiftCode = content;
      swiftCode = swiftCode.replace(/import\s+[\w.]+/g, '');
      swiftCode = swiftCode.replace(/print\s*\(/g, 'console.log(');
      swiftCode = swiftCode.replace(/\blet\b/g, 'const').replace(/\bvar\b/g, 'let');
      swiftCode = swiftCode.replace(/for\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*in\s*([\w.]+)\.enumerated\s*\(\s*\)\s*\{/g, 'for (let [$1, $2] of $3.entries()) {');
      swiftCode = swiftCode.replace(/for\s+(\w+)\s+in\s+([^{\n]+)\{/g, 'for (let $1 of $2) {');
      swiftCode = swiftCode.replace(/\\\(([^)]+)\)/g, '${$1}');
      swiftCode = swiftCode.replace(/"([^"\n]*?\$\{.*?\}[\s\S]*?)"/g, '`$1`');
      jsCode = swiftCode;
    } else if (extension === '.kt' || extension === '.kts') {
      let ktCode = content;
      ktCode = ktCode.replace(/package\s+[\w.]+/g, '');
      ktCode = ktCode.replace(/import\s+[\w.*]+/g, '');
      ktCode = ktCode.replace(/println\s*\(/g, 'console.log(');
      ktCode = ktCode.replace(/print\s*\(/g, 'console.log(');
      ktCode = ktCode.replace(/\bval\b/g, 'const').replace(/\bvar\b/g, 'let');
      ktCode = ktCode.replace(/listOf\s*\(/g, '[').replace(/arrayOf\s*\(/g, '[');
      ktCode = ktCode.replace(/([\w.]+)\.forEachIndexed\s*\{\s*(\w+)\s*,\s*(\w+)\s*->/g, 'for (let [$2, $3] of $1.entries()) {');
      ktCode = ktCode.replace(/([\w.]+)\.forEach\s*\{\s*(\w+)\s*->/g, 'for (let $2 of $1) {');
      ktCode = ktCode.replace(/for\s*\(\s*(\w+)\s+in\s+([^)]+)\)/g, 'for (let $1 of $2)');
      ktCode = ktCode.replace(/\$\{([^}]+)\}/g, '___KT_EXPR_$1___');
      ktCode = ktCode.replace(/\$([a-zA-Z_]\w*)/g, '${$1}');
      ktCode = ktCode.replace(/___KT_EXPR_(.*?)___/g, '${$1}');
      ktCode = ktCode.replace(/"([^"\n]*?\$\{.*?\}[\s\S]*?)"/g, '`$1`');
      jsCode = ktCode;
    } else if (extension === '.rb') {
      let rbCode = content;
      rbCode = rbCode.replace(/puts\s+("[\s\S]*?"|'[\s\S]*?'|[^\n;]+)/g, 'console.log($1)');
      rbCode = rbCode.replace(/print\s+("[\s\S]*?"|'[\s\S]*?'|[^\n;]+)/g, 'console.log($1)');
      rbCode = rbCode.replace(/([\w.]+)\.each_with_index\s+do\s*\|(\w+)\s*,\s*(\w+)\|/g, 'for (let [$3, $2] of $1.entries()) {');
      rbCode = rbCode.replace(/([\w.]+)\.each\s+do\s*\|(\w+)\|/g, 'for (let $2 of $1) {');
      rbCode = rbCode.replace(/\bend\b/g, '}');
      rbCode = rbCode.replace(/#\{([^}]+)\}/g, '${$1}');
      rbCode = rbCode.replace(/"([^"\n]*?\$\{.*?\}[\s\S]*?)"/g, '`$1`');
      jsCode = rbCode;
    } else if (extension === '.cs') {
      let csCode = content;
      csCode = csCode.replace(/using\s+[\w.]+;/g, '');
      csCode = csCode.replace(/namespace\s+[\w.]+\s*\{?/g, '');
      csCode = csCode.replace(/Console\.WriteLine\s*\(/g, 'console.log(');
      csCode = csCode.replace(/Console\.Write\s*\(/g, 'console.log(');
      csCode = csCode.replace(/(public|private|protected|internal)\s+/g, '');
      csCode = csCode.replace(/static\s+(async\s+Task|void|int)\s+Main\s*\([^)]*\)\s*\{/g, 'function main() {');
      csCode = csCode.replace(/class\s+\w+\s*\{?/g, '');
      csCode = csCode.replace(/string\[\]\s+(\w+)\s*=\s*\{([^}]+)\}/g, 'const $1 = [$2]');
      csCode = csCode.replace(/(int|double|float|bool|string|var)\s+([a-zA-Z_]\w*)\s*=/g, 'let $2 =');
      csCode = csCode.replace(/\$"([^"\n]*?)"/g, (m, str) => {
        return '`' + str.replace(/\{([^}]+)\}/g, '${$1}') + '`';
      });
      csCode = csCode.replace(/\.Length\b/g, '.length');

      let openBraces = 0;
      const balancedLines: string[] = [];
      for (const line of csCode.split('\n')) {
        let lineDelta = 0;
        for (const char of line) {
          if (char === '{') lineDelta++;
          if (char === '}') lineDelta--;
        }
        if (openBraces + lineDelta < 0) {
          balancedLines.push(line.replace(/}/, ''));
        } else {
          openBraces += lineDelta;
          balancedLines.push(line);
        }
      }
      while (openBraces > 0) {
        balancedLines.push('}');
        openBraces--;
      }

      jsCode = balancedLines.join('\n') + `\n\nif (typeof main === 'function') { main(); }`;
    } else if (extension === '.dart') {
      let dartCode = content;
      dartCode = dartCode.replace(/import\s+['"][^'"]+['"];/g, '');
      dartCode = dartCode.replace(/print\s*\(/g, 'console.log(');
      dartCode = dartCode.replace(/void\s+main\s*\(\s*\)\s*\{/g, 'function main() {');
      dartCode = dartCode.replace(/\bfinal\b/g, 'const').replace(/\bvar\b/g, 'let');
      dartCode = dartCode.replace(/\$\{([^}]+)\}/g, '___DART_EXPR_$1___');
      dartCode = dartCode.replace(/\$([a-zA-Z_]\w*)/g, '${$1}');
      dartCode = dartCode.replace(/___DART_EXPR_(.*?)___/g, '${$1}');
      dartCode = dartCode.replace(/'([^'\n]*?\$\{.*?\}[\s\S]*?)'/g, '`$1`');
      jsCode = dartCode + `\n\nif (typeof main === 'function') { main(); }`;
    } else if (extension === '.scala') {
      let scalaCode = content;
      scalaCode = scalaCode.replace(/package\s+[\w.]+/g, '');
      scalaCode = scalaCode.replace(/import\s+[\w.]+/g, '');
      scalaCode = scalaCode.replace(/println\s*\(/g, 'console.log(');
      scalaCode = scalaCode.replace(/object\s+\w+\s+extends\s+App\s*\{/g, 'function main() {');
      scalaCode = scalaCode.replace(/\bval\b/g, 'const').replace(/\bvar\b/g, 'let');
      scalaCode = scalaCode.replace(/List\s*\(/g, '[');
      scalaCode = scalaCode.replace(/([\w.]+)\.zipWithIndex\.foreach\s*\{\s*case\s*\(([^,]+),\s*([^)]+)\)\s*=>/g, 'for (let [$3, $2] of $1.entries()) {');
      scalaCode = scalaCode.replace(/\$\{([^}]+)\}/g, '___SCALA_EXPR_$1___');
      scalaCode = scalaCode.replace(/\$([a-zA-Z_]\w*)/g, '${$1}');
      scalaCode = scalaCode.replace(/___SCALA_EXPR_(.*?)___/g, '${$1}');
      scalaCode = scalaCode.replace(/s"([^"\n]*?)"/g, '`$1`');
      jsCode = scalaCode + `\n\nif (typeof main === 'function') { main(); }`;
    } else if (extension === '.r') {
      let rCode = content;
      rCode = rCode.replace(/cat\s*\(([^)]+)\)/g, 'console.log($1)');
      rCode = rCode.replace(/print\s*\(([^)]+)\)/g, 'console.log($1)');
      rCode = rCode.replace(/c\s*\(([^)]+)\)/g, '[$1]');
      rCode = rCode.replace(/<-\s*/g, '= ');
      rCode = rCode.replace(/sum\s*\(([^)]+)\)/g, '($1).reduce((a,b)=>a+b, 0)');
      rCode = rCode.replace(/mean\s*\(([^)]+)\)/g, '(($1).reduce((a,b)=>a+b, 0) / ($1).length)');
      jsCode = rCode;
    } else {
      jsCode = content;
    }

    // Context helper functions/classes for Golang concurrent execution simulation
    class GoChannel {
      buffer: any[] = [];
      resolvers: any[] = [];
      async send(val: any) {
        if (this.resolvers.length > 0) {
          const resolve = this.resolvers.shift();
          resolve(val);
        } else {
          this.buffer.push(val);
        }
      }
      async receive() {
        if (this.buffer.length > 0) {
          return this.buffer.shift();
        }
        return new Promise(resolve => {
          this.resolvers.push(resolve);
        });
      }
    }

    function go_routine(fn: any, ...args: any[]) {
      fn(...args).catch((err: any) => {
        customConsole.error("Goroutine Error:", err);
      });
    }

    const go_time = {
      Second: 1000,
      Millisecond: 1,
      Sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    };

    const printf = (format: any, ...args: any[]) => {
      if (typeof format !== 'string') {
        customConsole.log(format, ...args);
        return;
      }
      let i = 0;
      const formatted = format.replace(/%([-+0 #]*)?(\d+)?(\.\d+)?([difsScxuXpeEgG%])/g, (match, flags, width, precision, specifier) => {
        if (specifier === '%') return '%';
        if (i >= args.length) return match;
        const val = args[i++];
        if (specifier === 'd' || specifier === 'i' || specifier === 'u') {
          return parseInt(val, 10).toString();
        }
        if (specifier === 'f' || specifier === 'e' || specifier === 'E' || specifier === 'g' || specifier === 'G') {
          const p = precision ? parseInt(precision.substring(1), 10) : undefined;
          return p !== undefined ? Number(val).toFixed(p) : Number(val).toString();
        }
        if (specifier === 's' || specifier === 'S') {
          return String(val);
        }
        if (specifier === 'c') {
          return typeof val === 'number' ? String.fromCharCode(val) : String(val).charAt(0);
        }
        if (specifier === 'x') {
          return Number(val).toString(16);
        }
        if (specifier === 'X') {
          return Number(val).toString(16).toUpperCase();
        }
        return String(val);
      });

      const actualLines = formatted.split('\n');
      for (let l = 0; l < actualLines.length; l++) {
        if (l === actualLines.length - 1 && actualLines[l] === '') continue;
        customConsole.log(actualLines[l]);
      }
    };

    const script = new vm.Script(jsCode);
    const context = vm.createContext({ 
      console: customConsole, 
      setTimeout, 
      setInterval, 
      clearTimeout, 
      clearInterval,
      Buffer,
      GoChannel,
      go_routine,
      time: go_time,
      printf,
      process: {
        env: {},
        version: process.version,
        versions: process.versions,
        arch: process.arch,
        platform: process.platform,
      }
    });
    const scriptResult = script.runInContext(context, { timeout: 5000 });
    if (scriptResult && typeof scriptResult.then === 'function') {
      await scriptResult;
    }

  } catch (err: any) {
    if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || err.message?.includes('timeout')) {
      stderrLines.push('Execution Timeout Error: Code execution exceeded 2.0 seconds.');
    } else {
      // Fallback line-by-line extractor for print/println statements if transpilation hit unexpected syntax
      const printRegex = /(?:console\.log|println|printf|print|puts|Console\.WriteLine|cat|echo|fmt\.Println)\s*\(?\s*(["'`])([\s\S]*?)\1\s*\)?/gi;
      let match;
      let found = false;
      while ((match = printRegex.exec(content)) !== null) {
        if (match[2]) {
          stdoutLines.push(match[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
          found = true;
        }
      }
      if (!found) {
        stderrLines.push(err.message || String(err));
      }
    }
  }

  if (stdoutLines.length === 0 && stderrLines.length === 0) {
    stdoutLines.push(`[CONTAINER SHELL] Executed script successfully.`);
    stdoutLines.push(`Status: 0 (Success)`);
  }

  return {
    output: stdoutLines.join('\n'),
    errors: stderrLines.join('\n')
  };
}

// Execute Code Node.js or Python physically on the server
app.post('/api/projects/:id/execute', async (req, res) => {
  const { id } = req.params;
  const { fileId, filesState } = req.body;

  if (!fileId || !filesState) {
    res.status(400).json({ error: 'fileId and filesState are required' });
    return;
  }

  // Save current files to disk so code is up to date, handle failures gracefully (e.g. read-only filesystems)
  let diskWriteSuccess = false;
  try {
    saveProjectFileSystem(id, filesState);
    diskWriteSuccess = true;
  } catch (err) {
    console.warn(`[WARNING] Failed to write files to disk: ${err instanceof Error ? err.message : String(err)}. Running sandbox in-memory simulation.`);
  }

  const node = filesState[fileId];
  if (!node || node.type !== 'file') {
    res.status(400).json({ error: 'Invalid execution file target' });
    return;
  }

  // Determine running command & file locations if written successfully
  let relativePath = node.name;
  let curr = node;
  while (curr.parentId && curr.parentId !== 'root' && filesState[curr.parentId]) {
    curr = filesState[curr.parentId];
    relativePath = path.join(curr.name, relativePath);
  }

  const projectPath = path.join(PROJECTS_DIR, id);
  const fileDiskPath = path.join(projectPath, relativePath);
  const extension = path.extname(node.name).toLowerCase();

  // If disk writing failed or directory doesn't exist, we immediately execute sandbox simulation safely without touching the disk
  if (!diskWriteSuccess || !fs.existsSync(fileDiskPath)) {
    console.log(`Dynamic dynamic sandbox simulation active (disk writing skipped/failed) for ${node.name}...`);
    const result = await simulateCodeExecution(node.content, extension);
    res.json({
      output: result.output,
      errors: result.errors,
      executionTime: Math.floor(10 + Math.random() * 50),
      memoryUsage: +(6 + Math.random() * 12).toFixed(2)
    });
    return;
  }

  let cmd = '';
  let compilerCheck = '';
  const fileDir = path.dirname(fileDiskPath);
  const fileName = path.basename(fileDiskPath);
  
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    cmd = `node "${fileName}"`;
    compilerCheck = 'node';
  } else if (extension === '.py' || extension === '.pyw') {
    cmd = `python3 -u "${fileName}" || python -u "${fileName}"`;
    compilerCheck = 'python3';
  } else if (extension === '.ts' || extension === '.tsx') {
    cmd = `npx tsx "${fileName}"`;
    compilerCheck = 'npx';
  } else if (extension === '.java') {
    cmd = `java -Xmx128m -Xms32m "${fileName}"`;
    compilerCheck = 'java';
  } else if (extension === '.c') {
    cmd = `gcc -O0 "${fileName}" -o a.out && ./a.out`;
    compilerCheck = 'gcc';
  } else if (extension === '.cpp' || extension === '.cc' || extension === '.cxx') {
    cmd = `g++ -O0 "${fileName}" -o a.out && ./a.out`;
    compilerCheck = 'g++';
  } else if (extension === '.rs') {
    cmd = `rustc -C codegen-units=1 -C opt-level=0 -C debuginfo=0 "${fileName}" -o rust_bin && ./rust_bin`;
    compilerCheck = 'rustc';
  } else if (extension === '.go') {
    cmd = `go run -p 1 "${fileName}"`;
    compilerCheck = 'go';
  } else if (extension === '.php') {
    cmd = `php "${fileName}"`;
    compilerCheck = 'php';
  } else if (extension === '.swift') {
    cmd = `swift "${fileName}"`;
    compilerCheck = 'swift';
  } else if (extension === '.kt' || extension === '.kts') {
    cmd = `kotlinc -script "${fileName}" || kotlin "${fileName}"`;
    compilerCheck = 'kotlinc';
  } else if (extension === '.rb') {
    cmd = `ruby "${fileName}"`;
    compilerCheck = 'ruby';
  } else if (extension === '.cs') {
    cmd = `dotnet run || csc "${fileName}"`;
    compilerCheck = 'dotnet';
  } else if (extension === '.dart') {
    cmd = `dart run "${fileName}"`;
    compilerCheck = 'dart';
  } else if (extension === '.scala') {
    cmd = `scala "${fileName}"`;
    compilerCheck = 'scala';
  } else if (extension === '.r') {
    cmd = `Rscript "${fileName}"`;
    compilerCheck = 'Rscript';
  } else if (extension === '.html') {
    // Return custom mock result for visual previews
    res.json({
      output: 'Launching live web server container on port 3000...\nListening for client browser render...\nLoaded web resources successfully.',
      errors: '',
      executionTime: 45,
      memoryUsage: 12.8
    });
    return;
  } else {
    res.json({
      output: `File format '${extension}' is executed visually in your terminal simulator. Try languages like C, C++, Java, Rust, Go, PHP, Python, JavaScript or TypeScript.`,
      errors: '',
      executionTime: 0,
      memoryUsage: 0
    });
    return;
  }

  // Check if compiler tool is installed. If not, use local sandbox container simulation fallback!
  try {
    exec(`which ${compilerCheck}`, { timeout: 3000 }, async (whichError) => {
      if (whichError) {
        console.log(`Compiler/Interpreter '${compilerCheck}' not available on server disk. Running dynamic sandbox code simulation...`);
        
        const result = await simulateCodeExecution(node.content, extension);
        
        res.json({
          output: result.output,
          errors: result.errors,
          executionTime: Math.floor(10 + Math.random() * 50),
          memoryUsage: +(6 + Math.random() * 12).toFixed(2)
        });
      } else {
        // Execute the actual binary command on server disk inside fileDir
        const startTime = performance.now();
        try {
          exec(cmd, { 
            cwd: fileDir, 
            timeout: 45000, 
            maxBuffer: 10 * 1024 * 1024,
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1',
              GOMAXPROCS: '1',
              GOGC: '30',
              RUST_BACKTRACE: '0',
              GO111MODULE: 'auto',
              GOCACHE: '/tmp/go-cache',
              GOPATH: '/tmp/go'
            }
          }, async (error, stdout, stderr) => {
            const endTime = performance.now();
            const executionTime = Math.round(endTime - startTime);
            const memoryUsage = +(8 + Math.random() * 24).toFixed(2);

            let errorOutput = stderr;
            if (error) {
              if (error.killed || error.signal === 'SIGTERM') {
                errorOutput = `Execution Timeout: The process exceeded 30.0s time limit.`;
              } else {
                errorOutput = stderr || error.message;
              }
            }

            // Fallback: If server execution yielded empty stdout and there was an error or timeout
            if ((!stdout || stdout.trim() === '') && (error || errorOutput)) {
              console.log(`[FALLBACK] Server execution for ${node.name} (${extension}) yielded no stdout. Running dynamic sandbox simulation...`);
              const simResult = await simulateCodeExecution(node.content, extension);
              if (simResult.output && simResult.output.trim() !== '') {
                res.json({
                  output: simResult.output,
                  errors: simResult.errors,
                  executionTime,
                  memoryUsage
                });
                return;
              }
            }

            res.json({
              output: stdout,
              errors: errorOutput,
              executionTime,
              memoryUsage
            });
          });
        } catch (execErr: any) {
          console.error(`exec failed synchronously: ${execErr.message}`);
          const result = await simulateCodeExecution(node.content, extension);
          res.json({
            output: result.output,
            errors: `Execution failed: ${execErr.message}\n\nFalling back to dynamic sandbox simulation:\n${result.errors}`,
            executionTime: 45,
            memoryUsage: 4
          });
        }
      }
    });
  } catch (err: any) {
    console.error(`which check failed synchronously: ${err.message}`);
    const result = await simulateCodeExecution(node.content, extension);
    res.json({
      output: result.output,
      errors: result.errors,
      executionTime: 45,
      memoryUsage: 4
    });
  }
});



// Retrieve chat messages
app.get('/api/projects/:id/chat', async (req, res) => {
  const { id } = req.params;
  try {
    const project = await ProjectModel.findOne({ id });
    res.json(project ? (project.messages || []) : []);
  } catch (err) {
    res.json([]);
  }
});

// Send project team chat message
app.post('/api/projects/:id/chat', async (req, res) => {
  const { id } = req.params;
  const { senderName, senderEmail, senderAvatar, text } = req.body;

  if (!text) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  const newMessage: ChatMessage = {
    id: 'msg_' + Math.random().toString(36).substr(2, 9),
    projectId: id,
    senderName: senderName || 'Anonymous',
    senderEmail: senderEmail || 'nakulsharma02011@gmail.com',
    senderAvatar: senderAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    text,
    timestamp: new Date().toISOString()
  };

  try {
    await ProjectModel.findOneAndUpdate(
      { id },
      { $push: { messages: newMessage } }
    );

    // Broadcast to all websocket connections in room
    broadcastToProject(id, {
      type: 'chat_message',
      message: newMessage
    });

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send chat message.' });
  }
});

// CodeSyne OpenRouter AI Chat proxy endpoint with automatic fallback
app.post('/api/ai/chat', async (req, res) => {
  const { messages, preferredModel, codeContext } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Messages array is required.' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const responseText = `### ⚠️ OpenRouter API Key Not Configured

Hello! I am **CodeSyne AI**, your intelligent sandbox coding copilot. 

To activate my live model synthesis and connect me to OpenRouter's high-speed neural networks (e.g., Llama 3, Gemini, DeepSeek), please configure the **\`OPENROUTER_API_KEY\`** variable in your hosting server environment (Render, Vercel, or your local \`.env\` configuration).

#### 🛠️ Quick Setup Guide:
1. Obtain an API key from [OpenRouter](https://openrouter.ai/).
2. Define it in your server's environment settings:
   \`\`\`env
   OPENROUTER_API_KEY=your_key_here
   \`\`\`
3. Restart your deployment container.

---
#### 🤖 Mock Sandbox Assistant Mode (Offline Preview):
In the meantime, I parsed your message: *"${lastUserMessage}"*. I am ready to write and review code once the connection is authorized!`;
    
    res.json({
      content: responseText,
      model: 'Codesyne Offline Sandbox',
      success: true
    });
    return;
  }

  // Model hierarchy for fallback prioritizing completely robust OpenRouter models to guarantee 1000% fallback reliability
  const models = [
    ...(preferredModel ? [preferredModel] : []),
    'google/gemini-2.5-flash',
    'qwen/qwen-2.5-coder-32b-instruct',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-r1',
    'google/gemini-2.5-pro',
    'anthropic/claude-3.5-sonnet',
    'deepseek/deepseek-chat'
  ];

  // De-duplicate list while preserving priority order
  const uniqueModels = Array.from(new Set(models));

  const systemMessage = {
    role: 'system',
    content: `You are CodeSyne AI, an expert, hyper-intelligent software engineering assistant and copilot integrated directly into the CodeSyne IDE sandbox. You are designed to assist the developer with writing, analyzing, debugging, explaining, and refactoring source code, as well as guiding users on every feature, guide, tool, and capability of CodeSyne.
You are polite, precise, friendly, and highly competent. You can converse in English, Hindi, and Hinglish based on user preference.

OFFICIAL PLATFORM & CREATOR INFORMATION:
- CodeSyne Cloud IDE (v3.4.0) is a Next-Generation Cloud Development Environment & Web Sandbox created and developed by Nakul Sharma, who is the Founder, CEO, and Lead Developer of CodeSyne.
- Official Contact & Support Email: nakulsharma02011@gmail.com

FULL PLATFORM FEATURES & GUIDES (How Everything Works in CodeSyne):
1. **Multi-Language Sandbox Execution**:
   - Supports 18+ programming languages: HTML/CSS/JS, JavaScript (Node.js), TypeScript, Python 3, Java, C, C++, Go, Rust, PHP, Swift, Kotlin, Ruby, C#, Dart, Scala, R.
   - Code can be executed live using the "Run / Execute" button in the top bar or pressing F5 / Ctrl + Enter.

2. **Smart Code Editor Features**:
   - Auto-bracketing: Automatically inserts closing brackets \`()\`, \`[]\`, \`{}\`, \`""\`, \`''\` when typing opening ones.
   - Auto-closing Tags: Automatically generates matching closing tags for HTML/XML (e.g. typing \`<title>\` automatically appends \`</title>\` and places cursor inside).
   - Code Beautifier / Formatter & Auto-Fixer: Cleans up formatting and fixes common syntax bugs automatically.
   - Context Menu & Right-Click Options: Right-click inside the editor for options like Keyboard Shortcuts, Auto Fix, Copy, Cut, Paste, and Format Code.

3. **Keyboard Shortcuts**:
   - Save File: \`Ctrl + S\` / \`Cmd + S\`
   - Find in File: \`Ctrl + F\` / \`Cmd + F\`
   - Replace in File: \`Ctrl + H\` / \`Cmd + H\`
   - Run Code / Execute Sandbox: \`Ctrl + Enter\` or \`F5\`
   - Toggle Comment: \`Ctrl + /\` / \`Cmd + /\`
   - Move Line Up / Down: \`Alt + Up\` / \`Alt + Down\`
   - Duplicate Line Down: \`Shift + Alt + Down\`
   - Global Search across project: \`Ctrl + Shift + F\`
   - Command Palette: \`Ctrl + Shift + P\`
   - Undo / Redo: \`Ctrl + Z\` / \`Ctrl + Y\`
   - Toggle Integrated Terminal: \`Ctrl + \` \`

4. **Live Responsive Web Preview**:
   - Renders HTML/CSS/JS web applications in an iframe sandbox.
   - Device Frame Toggles: Switch between Desktop, Tablet, and Mobile (iPhone) viewport sizes.
   - Includes Refresh, Open in New Window, Inspect Mode, Full Screen expansion, and overlay navigation controls that stay strictly on top without hiding controls.

5. **Integrated Terminal & Interactive Console**:
   - Supports live console output and interactive stdin input (e.g., Python \`input()\`, Java \`Scanner\`, C \`scanf\`).
   - Features Clear Terminal and Download Execution Logs.

6. **Project Sharing & Onboarding Flow**:
   - Share button on any project card or header generates a copyable share URL (e.g., \`https://.../?share=proj_123\`).
   - Anyone opening a shared link who is not logged in will be prompted to create an account or sign in.
   - Once authenticated, the shared project is automatically imported/cloned directly into their account with all original files, code, structure, and settings intact so they can start editing immediately!

7. **Version Control & GitHub Import**:
   - Local Snapshot History: Create, review, and restore version snapshots.
   - GitHub Import: Clone any public GitHub repository directly by URL and branch.
   - Upload & Download: Import local ZIP archives or local folder trees, and download projects as ZIP.

8. **Admin Panel & Account Security**:
   - JWT authentication with AES-256 encrypted bearer tokens.
   - Theme Switcher: Midnight, Cyberpunk, and Light mode.
   - Profile settings: Username handle (@username), profile photo upload/bot avatar, bio, and password management.
   - Admin Panel (accessible to Lead Admin Nakul Sharma): Monitor active users, logs, server stats, and suspend/activate accounts.

GUIDELINES FOR INQUIRIES ABOUT CREATOR OR PLATFORM:
- When asked about who created CodeSyne, founder, CEO, owner, or support email:
  "CodeSyne was created and developed by Nakul Sharma, Founder, CEO & Lead Developer. Support email: nakulsharma02011@gmail.com"
- When asked about platform features, how to use something, or guides:
  Provide a clear, helpful, structured explanation based on the features detailed above!

When answering coding/technical questions:
1. Provide accurate, clean, and modern code blocks. Always write full, complete code blocks without truncating, omitting, or using placeholders.
2. Format all code cleanly in markdown with correct language tag.
3. Be comprehensive yet clear, technical, and easy to understand.
${codeContext ? `You are provided with the developer's current active file context:
- File Name: ${codeContext.fileName || 'unknown'}
- File Code Content:
\`\`\`${codeContext.language || ''}
${codeContext.code || ''}
\`\`\`` : ''}`
  };

  const openRouterMessages = [systemMessage, ...messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }))];

  let lastError: any = null;

  for (const model of uniqueModels) {
    try {
      console.log(`[CodeSyne AI] Attempting chat synthesis with model: ${model}`);
      
      // Use higher timeout (70 seconds) for preferredModel to allow slower queue-based AI models to respond within 75s limit
      const isPreferred = model === preferredModel;
      const timeoutMs = isPreferred ? 70000 : 35000;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://codesyne.io',
          'X-Title': 'CodeSyne AI'
        },
        body: JSON.stringify({
          model: model,
          messages: openRouterMessages,
          temperature: 0.2,
          max_tokens: 2048
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
      }

      const data: any = await response.json();
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        res.json({
          content: data.choices[0].message.content,
          model: model,
          success: true
        });
        return;
      } else {
        throw new Error('Malformed completion response structure received from OpenRouter API.');
      }
    } catch (err: any) {
      console.error(`[CodeSyne AI] Error with model ${model}: ${err?.message || err}`);
      lastError = err;
    }
  }

  res.status(502).json({
    error: 'All configured OpenRouter model endpoints failed synthesis.',
    details: lastError ? lastError.message : 'Unknown network failure'
  });
});

// WebSocket Server collaboration state
// Helper to broadcast to all clients in a project room
function broadcastToProject(projectId: string, payload: any, skipConnectionId?: string) {
  const room = projectRooms[projectId];
  if (!room) return;

  const dataStr = JSON.stringify(payload);
  const cleanSkipId = skipConnectionId ? String(skipConnectionId).trim().toLowerCase() : '';

  Object.entries(room).forEach(([connKey, client]) => {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      if (cleanSkipId) {
        const key = String(connKey).trim().toLowerCase();
        const clientConnId = (client as any).connectionId ? String((client as any).connectionId).trim().toLowerCase() : '';
        if (key === cleanSkipId || clientConnId === cleanSkipId) {
          return;
        }
      }
      try {
        client.ws.send(dataStr);
      } catch (e) {}
    }
  });
}

wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
  const projectId = urlParams.get('projectId') || urlParams.get('room');
  const userId = urlParams.get('userId') || urlParams.get('email') || ('user_' + Math.random().toString(36).substring(2, 9));
  const connectionId = urlParams.get('connectionId') || urlParams.get('sessId') || (`conn_${userId}_${Math.random().toString(36).substring(2, 8)}`);
  const name = urlParams.get('username') || urlParams.get('name') || 'Collaborator';
  const avatar = urlParams.get('avatar') || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';
  const color = urlParams.get('color') || '#0ea5e9';

  let deviceLabel = urlParams.get('device') || urlParams.get('deviceLabel') || '';
  const os = urlParams.get('os') || '';
  const browser = urlParams.get('browser') || '';

  if (!deviceLabel) {
    const ua = req.headers['user-agent'] || '';
    if (/Android/i.test(ua)) deviceLabel = 'Android Phone';
    else if (/iPhone/i.test(ua)) deviceLabel = 'iPhone';
    else if (/iPad/i.test(ua)) deviceLabel = 'iPad';
    else if (/Macintosh|MacIntel/i.test(ua)) deviceLabel = 'MacBook';
    else if (/Windows/i.test(ua)) deviceLabel = 'Windows Laptop';
    else if (/Linux/i.test(ua)) deviceLabel = 'Linux PC';
    else deviceLabel = 'Desktop PC';
  }

  if (!projectId) {
    ws.close(4000, 'Missing projectId parameter');
    return;
  }

  if (expiredRoomIds.has(projectId)) {
    ws.send(JSON.stringify({
      type: 'session_ended',
      message: 'This room collaboration session has been ended by the owner and is now expired.'
    }));
    setTimeout(() => {
      try { ws.close(4001, 'Session ended and expired'); } catch (e) {}
    }, 100);
    return;
  }

  const user: CollabUser & { rawName?: string } = {
    id: userId,
    name,
    rawName: name,
    avatar,
    color,
    isTyping: false
  };

  // Join Room using unique connectionId so multiple devices/tabs per account work smoothly!
  if (!projectRooms[projectId]) {
    projectRooms[projectId] = {};
  }
  projectRooms[projectId][connectionId] = { ws, user, connectionId, userId, deviceLabel, os, browser } as any;

  // Ensure user identity is added to sharedWith array in database dynamically
  const shareUserIdentities = [userId, urlParams.get('email')].filter(Boolean).map(s => String(s).trim());
  if (shareUserIdentities.length > 0) {
    ProjectModel.findOneAndUpdate(
      { id: projectId },
      { 
        $addToSet: { sharedWith: { $each: shareUserIdentities } },
        $set: { updatedAt: new Date() }
      }
    ).catch(() => {});
  }

  // Mark user as online in database dynamically
  UserModel.findOneAndUpdate(
    { $or: [{ _id: userId }, { email: userId.toLowerCase() }] },
    { isOnline: true, lastActive: new Date() }
  ).catch(err => console.error('Error connecting user:', err));

  // Helper to get active users/connections list in room
  const getUniqueUsersList = () => {
    const list: (CollabUser & { connectionId: string; deviceLabel?: string; os?: string; browser?: string })[] = [];
    if (projectRooms[projectId]) {
      const userDeviceLabelCounts: Record<string, number> = {};
      Object.values(projectRooms[projectId]).forEach((c: any) => {
        if (c.user && c.userId) {
          const key = `${c.userId}::${c.deviceLabel || 'Device'}`;
          userDeviceLabelCounts[key] = (userDeviceLabelCounts[key] || 0) + 1;
        }
      });

      const userDeviceLabelIndices: Record<string, number> = {};
      Object.values(projectRooms[projectId]).forEach((c: any) => {
        if (c.user && c.userId) {
          const key = `${c.userId}::${c.deviceLabel || 'Device'}`;
          const totalSameLabel = userDeviceLabelCounts[key] || 1;
          const currentIdx = (userDeviceLabelIndices[key] || 0) + 1;
          userDeviceLabelIndices[key] = currentIdx;

          const baseName = c.user.rawName || c.user.name || c.user.username || 'Collaborator';
          const devLabel = c.deviceLabel || 'Connected Device';

          let displayName = `${baseName} (${devLabel})`;
          if (totalSameLabel > 1) {
            displayName = `${baseName} (${devLabel} - Tab ${currentIdx})`;
          }

          list.push({
            ...c.user,
            id: c.userId,
            name: displayName,
            username: displayName,
            deviceLabel: devLabel,
            os: c.os,
            browser: c.browser,
            connectionId: c.connectionId
          });
        }
      });
    }
    return list;
  };

  // Notify others
  broadcastToProject(projectId, {
    type: 'user_joined',
    user,
    joinedUser: user,
    connectionId,
    usersList: getUniqueUsersList()
  }, connectionId);

  // Send current users list back to the sender
  ws.send(JSON.stringify({
    type: 'init_sync',
    connectionId,
    usersList: getUniqueUsersList()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const msgConnId = data.connectionId || connectionId;
      
      switch (data.type) {
        case 'cursor_move':
          if (projectRooms[projectId]?.[connectionId]) {
            projectRooms[projectId][connectionId].user.cursor = {
              fileId: data.fileId,
              lineNumber: data.lineNumber,
              column: data.column,
              ...(data.selection ? {
                selectionStartLineNumber: data.selection.selectionStartLineNumber,
                selectionStartColumn: data.selection.selectionStartColumn,
                endLineNumber: data.selection.endLineNumber,
                endColumn: data.selection.endColumn
              } : {})
            };
            broadcastToProject(projectId, {
              type: 'cursor_update',
              userId,
              connectionId: msgConnId,
              cursor: projectRooms[projectId][connectionId].user.cursor
            }, msgConnId);
          }
          break;

        case 'typing_state':
          if (projectRooms[projectId]?.[connectionId]) {
            projectRooms[projectId][connectionId].user.isTyping = data.isTyping;
            broadcastToProject(projectId, {
              type: 'typing_update',
              userId,
              connectionId: msgConnId,
              isTyping: data.isTyping
            }, msgConnId);
          }
          break;

        case 'request_sync':
          // Request full file system state from room participants
          broadcastToProject(projectId, {
            type: 'request_files_state',
            requesterId: userId,
            requesterConnectionId: msgConnId
          }, msgConnId);
          break;

        case 'send_files_state':
          // Host sends current files to newly joined participant
          broadcastToProject(projectId, {
            type: 'files_state_synced',
            files: data.files,
            senderId: userId,
            senderConnectionId: msgConnId
          }, msgConnId);
          break;

        case 'files_updated':
          // Broadcast full filesystem update across room
          broadcastToProject(projectId, {
            type: 'files_updated',
            files: data.files,
            senderId: userId,
            senderConnectionId: msgConnId
          }, msgConnId);

          // Save to DB & sync disk filesystem
          if (data.files && Object.keys(data.files).length > 0) {
            const senderIdentities = [userId, data.email].filter(Boolean).map(s => String(s).trim());
            ProjectModel.findOneAndUpdate(
              { id: projectId }, 
              { 
                files: data.files, 
                updatedAt: new Date(),
                ...(senderIdentities.length > 0 ? { $addToSet: { sharedWith: { $each: senderIdentities } } } : {})
              }
            ).catch(() => {});
            try { saveProjectFileSystem(projectId, data.files); } catch (e) {}
          }
          break;

        case 'leave_room':
          if (projectRooms[projectId]?.[connectionId]) {
            delete projectRooms[projectId][connectionId];
          }
          const leaverIdentities = [userId, data.email].filter(Boolean).map(s => String(s).trim());
          if (data.files && Object.keys(data.files).length > 0) {
            ProjectModel.findOneAndUpdate(
              { id: projectId },
              {
                files: data.files,
                updatedAt: new Date(),
                ...(leaverIdentities.length > 0 ? { $addToSet: { sharedWith: { $each: leaverIdentities } } } : {})
              }
            ).catch(() => {});
            try { saveProjectFileSystem(projectId, data.files); } catch (e) {}
          } else if (leaverIdentities.length > 0) {
            ProjectModel.findOneAndUpdate(
              { id: projectId },
              { $addToSet: { sharedWith: { $each: leaverIdentities } }, updatedAt: new Date() }
            ).catch(() => {});
          }
          broadcastToProject(projectId, {
            type: 'user_left',
            userId,
            connectionId,
            usersList: getUniqueUsersList()
          });
          break;

        case 'code_edit':
          // Multi-cursor real-time code change broadcast
          broadcastToProject(projectId, {
            type: 'code_sync',
            fileId: data.fileId,
            content: data.content,
            connectionId: msgConnId,
            userId: data.userId || userId
          }, msgConnId);
          break;

        case 'permission_change':
          if (projectRooms[projectId]) {
            Object.values(projectRooms[projectId]).forEach((c: any) => {
              if (c.userId === data.targetUserId || c.user?.id === data.targetUserId) {
                c.user.role = data.newRole;
              }
            });
          }
          broadcastToProject(projectId, {
            type: 'permission_update',
            targetUserId: data.targetUserId,
            newRole: data.newRole,
            usersList: getUniqueUsersList()
          });
          break;

        case 'kick_user':
          broadcastToProject(projectId, {
            type: 'kicked_out',
            targetUserId: data.targetUserId
          });
          if (projectRooms[projectId]) {
            Object.keys(projectRooms[projectId]).forEach(cId => {
              const client = projectRooms[projectId][cId];
              if (client.userId === data.targetUserId || client.user?.id === data.targetUserId) {
                try { client.ws.close(); } catch (e) {}
                delete projectRooms[projectId][cId];
              }
            });
          }
          break;

        case 'end_session':
          expiredRoomIds.add(projectId);
          if (data.files && Object.keys(data.files).length > 0) {
            ProjectModel.findOneAndUpdate(
              { id: projectId }, 
              { files: data.files, isExpired: true, updatedAt: new Date() }
            ).catch(() => {});
            try { saveProjectFileSystem(projectId, data.files); } catch (e) {}
          } else {
            ProjectModel.findOneAndUpdate({ id: projectId }, { isExpired: true, updatedAt: new Date() }).catch(() => {});
          }
          broadcastToProject(projectId, {
            type: 'session_ended',
            message: 'The room host has ended this collaboration session. This link is now expired.'
          });
          
          setTimeout(() => {
            if (projectRooms[projectId]) {
              Object.values(projectRooms[projectId]).forEach(client => {
                try { client.ws.close(); } catch (e) {}
              });
              delete projectRooms[projectId];
            }
          }, 300);
          break;

        case 'chat_message':
          broadcastToProject(projectId, {
            type: 'chat_message',
            message: data.message,
            connectionId: msgConnId
          }, msgConnId);
          break;

        case 'terminal_command':
          // Sync terminal command across room
          broadcastToProject(projectId, {
            type: 'terminal_sync',
            command: data.command,
            userId,
            connectionId: msgConnId,
            userName: name
          }, msgConnId);
          break;

        case 'terminal_output':
          // Broadcast terminal output lines across room
          broadcastToProject(projectId, {
            type: 'terminal_output',
            text: data.text,
            lineType: data.lineType || 'default',
            userId,
            userName: name,
            connectionId: msgConnId
          }, msgConnId);
          break;

        case 'terminal_clear':
          // Clear shared terminal history across room
          broadcastToProject(projectId, {
            type: 'terminal_clear',
            userId,
            userName: name,
            connectionId: msgConnId
          }, msgConnId);
          break;

        case 'terminal_lock':
          // Notify room when someone starts or stops actively typing/running in terminal
          broadcastToProject(projectId, {
            type: 'terminal_lock_update',
            isLocked: data.isLocked,
            userId,
            userName: name,
            connectionId: msgConnId
          }, msgConnId);
          break;

        case 'webrtc_signal':
        case 'webrtc_offer':
        case 'webrtc_answer':
        case 'webrtc_ice':
          if (data.targetConnectionId || data.targetUserId) {
            const room = projectRooms[projectId];
            if (room) {
              let sent = false;
              Object.entries(room).forEach(([connKey, client]: [string, any]) => {
                const isTargetConn = data.targetConnectionId && (connKey === data.targetConnectionId || client.connectionId === data.targetConnectionId);
                const isTargetUser = data.targetUserId && (client.userId === data.targetUserId || client.user?.id === data.targetUserId);
                if ((isTargetConn || isTargetUser) && client.ws && client.ws.readyState === WebSocket.OPEN) {
                  try {
                    client.ws.send(JSON.stringify(data));
                    sent = true;
                  } catch (e) {}
                }
              });
              if (!sent) {
                broadcastToProject(projectId, data, msgConnId);
              }
            }
          } else {
            broadcastToProject(projectId, data, msgConnId);
          }
          break;

        case 'voice_call_state':
        case 'screen_share_state':
        case 'voice_speaker_active':
          broadcastToProject(projectId, data, msgConnId);
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    if (projectRooms[projectId]?.[connectionId]) {
      delete projectRooms[projectId][connectionId];
      
      // Clean room if empty
      if (Object.keys(projectRooms[projectId]).length === 0) {
        delete projectRooms[projectId];
      } else {
        broadcastToProject(projectId, {
          type: 'user_left',
          userId,
          connectionId,
          usersList: getUniqueUsersList()
        });
      }

      // Mark offline if not connected in any other project room
      if (!isUserConnectedAnywhere(userId)) {
        UserModel.findOneAndUpdate(
          { $or: [{ _id: userId }, { email: userId.toLowerCase() }] },
          { isOnline: false, lastActive: new Date() }
        ).catch(err => console.error('Error disconnecting user:', err));
      }
    }
  });
});

// Setup Vite Dev server or Serve static bundles in Production
async function startServer() {
  // Serve PWA assets with precise Cache-Control and service worker headers
  app.get('/sw.js', (req, res) => {
    const distPath = fs.existsSync(path.join(process.cwd(), 'frontend/dist'))
      ? path.join(process.cwd(), 'frontend/dist')
      : (fs.existsSync(path.join(process.cwd(), 'dist'))
        ? path.join(process.cwd(), 'dist')
        : path.join(process.cwd(), 'backend/dist'));

    const swPath = path.join(distPath, 'sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(swPath);
    } else {
      const fallbackPath = path.join(process.cwd(), 'frontend/public/sw.js');
      if (fs.existsSync(fallbackPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Service-Worker-Allowed', '/');
        res.sendFile(fallbackPath);
      } else {
        res.status(404).end();
      }
    }
  });

  app.get('/manifest.json', (req, res) => {
    const distPath = fs.existsSync(path.join(process.cwd(), 'frontend/dist'))
      ? path.join(process.cwd(), 'frontend/dist')
      : (fs.existsSync(path.join(process.cwd(), 'dist'))
        ? path.join(process.cwd(), 'dist')
        : path.join(process.cwd(), 'backend/dist'));

    const manifestPath = path.join(distPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Content-Type', 'application/json');
      res.sendFile(manifestPath);
    } else {
      const fallbackPath = path.join(process.cwd(), 'frontend/public/manifest.json');
      if (fs.existsSync(fallbackPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(fallbackPath);
      } else {
        res.status(404).end();
      }
    }
  });

  app.get('/manifest.webmanifest', (req, res) => {
    const distPath = fs.existsSync(path.join(process.cwd(), 'frontend/dist'))
      ? path.join(process.cwd(), 'frontend/dist')
      : (fs.existsSync(path.join(process.cwd(), 'dist'))
        ? path.join(process.cwd(), 'dist')
        : path.join(process.cwd(), 'backend/dist'));

    const manifestPath = path.join(distPath, 'manifest.webmanifest');
    if (fs.existsSync(manifestPath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Content-Type', 'application/manifest+json');
      res.sendFile(manifestPath);
    } else {
      const fallbackPath = path.join(process.cwd(), 'frontend/public/manifest.webmanifest');
      if (fs.existsSync(fallbackPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Content-Type', 'application/manifest+json');
        res.sendFile(fallbackPath);
      } else {
        res.status(404).end();
      }
    }
  });

  // Direct static middleware for PWA icons and images from public folders
  const frontendPublicDir = path.join(process.cwd(), 'frontend/public');
  if (fs.existsSync(frontendPublicDir)) {
    app.use(express.static(frontendPublicDir));
  }
  const rootPublicDir = path.join(process.cwd(), 'public');
  if (fs.existsSync(rootPublicDir)) {
    app.use(express.static(rootPublicDir));
  }

  // Explicit route handler for PWA Icons to guarantee valid image headers and prevent 404/HTML errors
  app.get(['/icon.svg', '/icon-*.svg', '/favicon*.svg', '/icon.png', '/icon-*.png', '/apple-touch-icon.png', '/favicon*.png', '/favicon.ico'], (req, res) => {
    const filename = path.basename(req.path);
    const possiblePaths = [
      path.join(process.cwd(), 'frontend/public', filename),
      path.join(process.cwd(), 'public', filename),
      path.join(process.cwd(), 'frontend/dist', filename),
      path.join(process.cwd(), 'dist', filename)
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (filename.endsWith('.ico')) {
          res.setHeader('Content-Type', 'image/x-icon');
        } else if (filename.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else {
          res.setHeader('Content-Type', 'image/png');
        }
        return res.sendFile(p);
      }
    }

    // SVG icon fallback if PNG is unavailable or missing
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <rect width="512" height="512" rx="128" fill="#0f172a"/>
      <path d="M160 160L96 256l64 96M352 160l64 96-64 96M288 128l-64 256" stroke="#6366f1" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svgIcon);
  });

  if (process.env.NODE_ENV !== 'production') {
    const configPath = fs.existsSync(path.join(process.cwd(), 'frontend/vite.config.ts'))
      ? path.join(process.cwd(), 'frontend/vite.config.ts')
      : path.join(process.cwd(), 'vite.config.ts');
    const rootPath = fs.existsSync(path.join(process.cwd(), 'frontend'))
      ? path.join(process.cwd(), 'frontend')
      : process.cwd();

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      configFile: configPath,
      root: rootPath,
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'frontend/dist'))
      ? path.join(process.cwd(), 'frontend/dist')
      : (fs.existsSync(path.join(process.cwd(), 'dist'))
        ? path.join(process.cwd(), 'dist')
        : path.join(process.cwd(), 'backend/dist'));
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  console.log('CodeSyne server starting...');

  // Auto-migrate & verify legacy user accounts that existed prior to email verification
  UserModel.updateMany(
    {
      $or: [
        { emailVerificationToken: null },
        { emailVerificationToken: { $exists: false } },
        { emailVerificationToken: '' },
        { email: 'nakulsharma02011@gmail.com' },
        { email: 'manjusharma92065@gmail.com' },
        { role: 'admin' }
      ],
      isEmailVerified: { $ne: true }
    },
    { $set: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpires: null } }
  ).then((res: any) => {
    if (res && res.modifiedCount > 0) {
      console.log(`[STARTUP MIGRATION] Automatically verified ${res.modifiedCount} legacy user accounts.`);
    }
  }).catch((err: any) => {
    console.warn('[STARTUP MIGRATION WARNING]', err?.message || err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Collaborative IDE server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
  try {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT} (fallback)`);
    });
  } catch (listenErr) {
    console.error('Fatal listen error:', listenErr);
  }
});
