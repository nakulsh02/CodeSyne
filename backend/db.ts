import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
let useMongoose = false;

if (!MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI/MONGO_URI environment variable is not defined. Falling back to local JSON database.');
} else {
  try {
    mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
      .then(() => {
        console.log('Successfully connected to MongoDB Atlas.');
        useMongoose = true;
      })
      .catch((err) => {
        console.error('MongoDB Atlas connection error, falling back to local JSON database:', err.message || err);
        useMongoose = false;
      });
  } catch (err: any) {
    console.error('Synchronous exception when initiating MongoDB connection:', err.message || err);
    useMongoose = false;
  }
}

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' },
  githubUsername: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  achievements: { type: [String], default: [] },
  stats: {
    linesCoded: { type: Number, default: 0 },
    activeHours: { type: Number, default: 0 },
    projectsCount: { type: Number, default: 0 },
    commitsCount: { type: Number, default: 0 },
  },
  role: { type: String, default: 'user' },
  status: { type: String, default: 'active' }, // active | suspended
  lastAction: { type: String, default: 'Created account' },
  isOnline: { type: Boolean, default: false },
  cpuUsage: { type: Number, default: 0 },
  memoryUsage: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  tokenVersion: { type: Number, default: 1 },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String, default: null },
  emailVerificationExpires: { type: Date, default: null },
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  welcomeEmailSent: { type: Boolean, default: false },
  trustedDevices: {
    type: [
      {
        deviceId: { type: String, required: true },
        deviceName: { type: String, default: 'Web Browser Session' },
        ip: { type: String, default: '' },
        userAgent: { type: String, default: '' },
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now }
      }
    ],
    default: []
  },
}, { timestamps: true });

const MongooseUserModel = (mongoose.models.User || mongoose.model('User', UserSchema)) as any;

// Pending Signup Schema (Users register -> PendingSignup created -> Email verified -> User created)
const PendingSignupSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  role: { type: String, default: 'user' },
  bio: { type: String, default: '' },
  githubUsername: { type: String, default: '' },
  achievements: { type: [String], default: [] },
  verificationToken: { type: String, required: true, unique: true },
  verificationExpires: { type: Date, required: true },
  lastResentAt: { type: Date, default: Date.now },
}, { timestamps: true });

const MongoosePendingSignupModel = (mongoose.models.PendingSignup || mongoose.model('PendingSignup', PendingSignupSchema)) as any;

// Pending Contact Inquiry Schema (Guests submit form -> PendingContact created -> Email verified -> Contact sent to admin & ack to user)
const PendingContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  subject: { type: String, default: 'General Inquiry' },
  message: { type: String, required: true },
  verificationToken: { type: String, required: true, unique: true },
  verificationExpires: { type: Date, required: true },
  isVerified: { type: Boolean, default: false },
  lastResentAt: { type: Date, default: Date.now },
}, { timestamps: true });

const MongoosePendingContactModel = (mongoose.models.PendingContact || mongoose.model('PendingContact', PendingContactSchema)) as any;


// Project Schema
const ProjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  type: { type: String, required: true },
  isFavorite: { type: Boolean, default: false },
  status: { type: String, default: 'active' },
  ownerId: { type: String, required: true },
  sharedWith: { type: [String], default: [] },
  files: { type: mongoose.Schema.Types.Mixed, default: {} },
  messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
  tabs: { type: [String], default: [] },
  activeTabId: { type: String, default: '' },
  editorSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastAccessedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const MongooseProjectModel = (mongoose.models.Project || mongoose.model('Project', ProjectSchema)) as any;

// Admin Log Schema
const AdminLogSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  action: { type: String, required: true },
  status: { type: String, default: 'info' }, // success | warning | info
}, { timestamps: true });

const MongooseAdminLogModel = (mongoose.models.AdminLog || mongoose.model('AdminLog', AdminLogSchema)) as any;

// File Access Log Schema
const FileAccessLogSchema = new mongoose.Schema({
  projectId: { type: String, required: true },
  fileId: { type: String, required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, default: '' },
  userEmail: { type: String, default: '' },
  username: { type: String, default: '' },
  device: { type: String, default: 'Desktop' },
  openedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const MongooseFileAccessLogModel = (mongoose.models.FileAccessLog || mongoose.model('FileAccessLog', FileAccessLogSchema)) as any;

// Collaboration Invite Schema
const InviteSchema = new mongoose.Schema({
  projectId: { type: String, required: true },
  projectName: { type: String, default: 'CodeSyne Workspace' },
  inviterEmail: { type: String, required: true },
  inviterName: { type: String, default: 'CodeSyne Developer' },
  recipientEmail: { type: String, required: true, lowercase: true, trim: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, default: 'pending' }, // pending | accepted | expired
}, { timestamps: true });

const MongooseInviteModel = (mongoose.models.Invite || mongoose.model('Invite', InviteSchema)) as any;


// ==========================================
// RESILIENT DUAL-MODE FILE BACKEND DATABASE
// ==========================================
const USERS_FILE = path.join(process.cwd(), 'backend/users_db.json');
const LOGS_FILE = path.join(process.cwd(), 'backend/logs_db.json');
const PROJECTS_FILE = path.join(process.cwd(), 'backend/projects_db.json');
const FILE_ACCESS_LOGS_FILE = path.join(process.cwd(), 'backend/file_access_logs_db.json');
const INVITES_FILE = path.join(process.cwd(), 'backend/invites_db.json');
const PENDING_SIGNUPS_FILE = path.join(process.cwd(), 'backend/pending_signups_db.json');
const PENDING_CONTACTS_FILE = path.join(process.cwd(), 'backend/pending_contacts_db.json');

function initFileDB(filePath: string, defaultData: any) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

initFileDB(USERS_FILE, []);
initFileDB(LOGS_FILE, []);
initFileDB(PROJECTS_FILE, []);
initFileDB(FILE_ACCESS_LOGS_FILE, []);
initFileDB(INVITES_FILE, []);
initFileDB(PENDING_SIGNUPS_FILE, []);
initFileDB(PENDING_CONTACTS_FILE, []);


function readJSON(filePath: string): any[] {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading JSON db file:', filePath, e);
  }
  return [];
}

function writeJSON(filePath: string, data: any[]) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error writing JSON db file:', filePath, e);
  }
}

// Helper class for chainable/thenable queries
export class QueryHelper<T> {
  private executor: () => Promise<T[]>;
  private sortOptions: any = null;
  private limitCount: number | null = null;

  constructor(executor: () => Promise<T[]>) {
    this.executor = executor;
  }

  sort(options: any) {
    this.sortOptions = options;
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  async exec(): Promise<T[]> {
    let result = await this.executor();
    if (this.sortOptions) {
      const key = Object.keys(this.sortOptions)[0];
      const order = this.sortOptions[key] === -1 ? -1 : 1;
      result.sort((a: any, b: any) => {
        const valA = a[key] instanceof Date ? a[key].getTime() : (a[key] === undefined || a[key] === null ? 0 : a[key]);
        const valB = b[key] instanceof Date ? b[key].getTime() : (b[key] === undefined || b[key] === null ? 0 : b[key]);
        if (typeof valA === 'number' && typeof valB === 'number') {
          return order === -1 ? valB - valA : valA - valB;
        }
        return order === -1
          ? String(valB).localeCompare(String(valA))
          : String(valA).localeCompare(String(valB));
      });
    }
    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }
    return result;
  }

  then(onfulfilled?: (value: T[]) => any, onrejected?: (reason: any) => any) {
    return this.exec().then(onfulfilled, onrejected);
  }
}

// 1. UserModel Class & Proxy
export class UserModelClass {
  _id: string;
  username: string;
  email: string;
  password?: string;
  bio?: string;
  avatar?: string;
  githubUsername?: string;
  whatsapp?: string;
  achievements?: string[];
  stats?: any;
  role?: string;
  status?: string;
  lastAction?: string;
  isOnline?: boolean;
  cpuUsage?: number;
  memoryUsage?: number;
  lastActive?: Date;
  tokenVersion?: number;
  isEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  welcomeEmailSent?: boolean;
  trustedDevices?: Array<{
    deviceId: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
    firstSeen?: Date;
    lastSeen?: Date;
  }>;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(data: any) {
    this._id = data._id || data.id || 'usr_' + Math.random().toString(36).substr(2, 9);
    this.username = data.username;
    this.email = data.email;
    this.password = data.password;
    this.bio = data.bio || '';
    this.avatar = data.avatar || '';
    this.githubUsername = data.githubUsername || '';
    this.whatsapp = data.whatsapp || '';
    this.achievements = data.achievements || [];
    this.stats = data.stats || { linesCoded: 0, activeHours: 0, projectsCount: 0, commitsCount: 0 };
    this.role = data.role || 'user';
    this.status = data.status || 'active';
    this.lastAction = data.lastAction || 'Created account';
    this.isOnline = data.isOnline || false;
    this.cpuUsage = data.cpuUsage || 0;
    this.memoryUsage = data.memoryUsage || 0;
    this.lastActive = data.lastActive ? new Date(data.lastActive) : new Date();
    this.tokenVersion = typeof data.tokenVersion === 'number' ? data.tokenVersion : 1;
    this.isEmailVerified = data.isEmailVerified ?? false;
    this.emailVerificationToken = data.emailVerificationToken || null;
    this.emailVerificationExpires = data.emailVerificationExpires ? new Date(data.emailVerificationExpires) : null;
    this.passwordResetToken = data.passwordResetToken || null;
    this.passwordResetExpires = data.passwordResetExpires ? new Date(data.passwordResetExpires) : null;
    this.welcomeEmailSent = data.welcomeEmailSent ?? false;
    this.trustedDevices = Array.isArray(data.trustedDevices) ? data.trustedDevices : [];
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
  }

  async save() {
    // Save to Mongoose Atlas first if connected
    let mongooseSaveError: any = null;
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const isValidHex = (val: string) => typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val);
        const cleanEmail = (this.email || '').trim().toLowerCase();
        
        let exists = null;
        if (isValidHex(this._id)) {
          exists = await MongooseUserModel.findById(this._id);
        }
        if (!exists && cleanEmail) {
          exists = await MongooseUserModel.findOne({ email: cleanEmail });
        }

        const cleanDoc: any = { ...this };
        delete cleanDoc.save;

        if (exists) {
          delete cleanDoc._id;
          const saved = await MongooseUserModel.findByIdAndUpdate(
            exists._id,
            { $set: cleanDoc },
            { new: true }
          );
          if (saved) {
            this._id = saved._id.toString();
          }
        } else {
          if (!isValidHex(cleanDoc._id)) {
            delete cleanDoc._id; // Let Mongoose assign a valid ObjectId
          }
          const mDoc = new MongooseUserModel(cleanDoc);
          const saved = await mDoc.save();
          if (saved) {
            this._id = saved._id.toString();
          }
        }
      } catch (err: any) {
        console.error('Mongoose user save error:', err);
        mongooseSaveError = err;
        // If it's a duplicate key error, throw it so endpoint handles it
        if (err && (err.code === 11000 || String(err).includes('E11000'))) {
          throw err;
        }
      }
    }

    // Always update local JSON DB as well for resilience
    const list = readJSON(USERS_FILE);
    const idx = list.findIndex(item => (item._id || item.id) === this._id || (item.email && this.email && item.email.trim().toLowerCase() === this.email.trim().toLowerCase()));
    this.updatedAt = new Date();
    const cleanDoc: any = { ...this };
    delete cleanDoc.save;

    if (idx !== -1) {
      list[idx] = { ...list[idx], ...cleanDoc };
    } else {
      list.push(cleanDoc);
    }
    writeJSON(USERS_FILE, list);

    if (mongooseSaveError && useMongoose && mongoose.connection.readyState === 1) {
      throw mongooseSaveError;
    }

    return this;
  }

  // Static Queries
  static find(query: any = {}) {
    return new QueryHelper(async () => {
      const mapByEmail = new Map<string, any>();

      // 1. Fetch from local file DB
      const fileList = readJSON(USERS_FILE);
      fileList.forEach(u => {
        if (u && u.email) {
          mapByEmail.set(u.email.trim().toLowerCase(), u);
        }
      });

      // 2. Fetch from Mongoose if available
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const mDocs = await MongooseUserModel.find({});
          mDocs.forEach((d: any) => {
            const raw = d.toObject ? d.toObject() : d;
            const em = (raw.email || '').trim().toLowerCase();
            if (em) {
              const existing = mapByEmail.get(em);
              mapByEmail.set(em, { ...existing, ...raw, _id: raw._id.toString() });
            }
          });
        } catch (err) {
          console.warn('Mongoose find error, using file DB:', err);
        }
      }

      let allUsers = Array.from(mapByEmail.values());

      // Filter by email if query requests it
      if (query.email) {
        const targetEmail = String(query.email).trim().toLowerCase();
        allUsers = allUsers.filter(u => (u.email || '').trim().toLowerCase() === targetEmail);
      }

      return allUsers.map(u => new UserModelClass(u));
    });
  }

  static async findOne(query: any = {}) {
    const cleanEmail = query.email ? String(query.email).trim().toLowerCase() : '';
    const cleanUsername = query.username ? String(query.username).trim().toLowerCase() : '';
    const cleanId = query._id ? String(query._id) : (query.id ? String(query.id) : '');

    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const doc = await MongooseUserModel.findOne(query);
        if (doc) return new UserModelClass(doc);
      } catch (err) {
        console.warn('Mongoose findOne warning:', err);
      }
    }

    // Fallback search in JSON file DB
    const list = readJSON(USERS_FILE);
    const match = list.find(u => {
      if (query.$or && Array.isArray(query.$or)) {
        return query.$or.some((cond: any) => {
          if (cond.email && (u.email || '').trim().toLowerCase() === String(cond.email).trim().toLowerCase()) return true;
          if (cond.username && (u.username || '').trim().toLowerCase() === String(cond.username).trim().toLowerCase()) return true;
          if (cond._id && (u._id || u.id) === String(cond._id)) return true;
          if (cond.id && (u._id || u.id) === String(cond.id)) return true;
          return false;
        });
      }
      if (cleanEmail && (u.email || '').trim().toLowerCase() === cleanEmail) return true;
      if (cleanUsername && (u.username || '').trim().toLowerCase() === cleanUsername) return true;
      if (cleanId && (u._id || u.id) === cleanId) return true;

      // Generic key-value matching fallback (e.g. emailVerificationToken, passwordResetToken)
      let allMatch = Object.keys(query).length > 0;
      for (const key of Object.keys(query)) {
        if (key === '$or') continue;
        if (key === 'email' && (u.email || '').trim().toLowerCase() !== cleanEmail) { allMatch = false; break; }
        if (key === 'username' && (u.username || '').trim().toLowerCase() !== cleanUsername) { allMatch = false; break; }
        if ((key === '_id' || key === 'id') && String(u._id || u.id) !== cleanId) { allMatch = false; break; }
        if (key !== 'email' && key !== 'username' && key !== '_id' && key !== 'id') {
          if (u[key] !== query[key]) { allMatch = false; break; }
        }
      }
      if (allMatch) return true;

      return false;
    });

    if (!match) return null;
    return new UserModelClass(match);
  }

  static async findById(id: string) {
    const cleanId = String(id || '');
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        if (/^[0-9a-fA-F]{24}$/.test(cleanId)) {
          const doc = await MongooseUserModel.findById(cleanId);
          if (doc) return new UserModelClass(doc);
        }
      } catch (err) {
        console.warn('Mongoose findById warning:', err);
      }
    }

    const list = readJSON(USERS_FILE);
    const match = list.find(u => (u._id || u.id) === cleanId);
    if (!match) return null;
    return new UserModelClass(match);
  }

  static async findByIdAndUpdate(id: string, update: any, options: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongooseUserModel.findByIdAndUpdate(id, update, options);
      } catch (err) {
        console.warn('Mongoose findByIdAndUpdate failed, falling back to files:', err);
      }
    }
    const list = readJSON(USERS_FILE);
    const idx = list.findIndex(item => (item._id || item.id) === String(id));
    if (idx !== -1) {
      const changes = update.$set || update;
      list[idx] = { ...list[idx], ...changes, updatedAt: new Date() };
      writeJSON(USERS_FILE, list);
      return new UserModelClass(list[idx]);
    }
    return null;
  }

  static async findOneAndUpdate(query: any, update: any, options: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongooseUserModel.findOneAndUpdate(query, update, options);
      } catch (err) {
        console.warn('Mongoose findOneAndUpdate failed, falling back to files:', err);
      }
    }
    const list = readJSON(USERS_FILE);
    let idx = -1;
    if (query.$or) {
      idx = list.findIndex(item => {
        return query.$or.some((cond: any) => {
          if (cond._id) return (item._id || item.id) === String(cond._id);
          if (cond.email) return item.email.trim().toLowerCase() === String(cond.email).trim().toLowerCase();
          return false;
        });
      });
    } else if (query.email) {
      idx = list.findIndex(item => item.email.trim().toLowerCase() === String(query.email).trim().toLowerCase());
    } else if (query._id) {
      idx = list.findIndex(item => (item._id || item.id) === String(query._id));
    }

    if (idx !== -1) {
      const changes = update.$set || update;
      list[idx] = { ...list[idx], ...changes, updatedAt: new Date() };
      writeJSON(USERS_FILE, list);
      return new UserModelClass(list[idx]);
    }
    return null;
  }

  static async findByIdAndDelete(id: string) {
    const cleanId = String(id || '');
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        if (/^[0-9a-fA-F]{24}$/.test(cleanId)) {
          await MongooseUserModel.findByIdAndDelete(cleanId);
        }
      } catch (err) {
        console.warn('Mongoose findByIdAndDelete warning:', err);
      }
    }
    const list = readJSON(USERS_FILE);
    const updated = list.filter(u => (u._id || u.id) !== cleanId);
    writeJSON(USERS_FILE, updated);
    return { acknowledged: true };
  }

  static async deleteOne(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongooseUserModel.deleteOne(query);
      } catch (err) {
        console.warn('Mongoose deleteOne failed:', err);
      }
    }
    const list = readJSON(USERS_FILE);
    const idx = list.findIndex(u => {
      if (query._id && (u._id || u.id) === String(query._id)) return true;
      if (query.email && u.email && u.email.trim().toLowerCase() === String(query.email).trim().toLowerCase()) return true;
      return false;
    });
    if (idx !== -1) {
      list.splice(idx, 1);
      writeJSON(USERS_FILE, list);
    }
    return { acknowledged: true };
  }

  static async deleteMany(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongooseUserModel.deleteMany(query);
      } catch (err) {
        console.warn('Mongoose deleteMany failed:', err);
      }
    }
    let list = readJSON(USERS_FILE);
    if (query.email) {
      if (typeof query.email === 'string') {
        const cleanEm = query.email.trim().toLowerCase();
        list = list.filter(item => (item.email || '').trim().toLowerCase() !== cleanEm);
      } else if (query.email.$regex) {
        const regex = new RegExp(query.email.$regex, 'i');
        list = list.filter(item => !regex.test(item.email || ''));
      }
    } else if (query._id) {
      const cleanId = String(query._id);
      list = list.filter(item => (item._id || item.id) !== cleanId);
    } else if (!Object.keys(query).length) {
      list = [];
    }
    writeJSON(USERS_FILE, list);
    return { acknowledged: true, deletedCount: list.length };
  }

  static async countDocuments(query: any = {}) {
    const all = await UserModelClass.find({}).exec();
    let filtered = all;

    if (query.isOnline === true) {
      filtered = filtered.filter(u => u.isOnline === true);
    }
    if (query.createdAt && query.createdAt.$gte) {
      const minDate = new Date(query.createdAt.$gte).getTime();
      filtered = filtered.filter(u => u.createdAt && new Date(u.createdAt).getTime() >= minDate);
    }
    if (query.lastActive && query.lastActive.$gte) {
      const minDate = new Date(query.lastActive.$gte).getTime();
      filtered = filtered.filter(u => u.lastActive && new Date(u.lastActive).getTime() >= minDate);
    }
    if (query.$or && Array.isArray(query.$or)) {
      filtered = filtered.filter(u => {
        return query.$or.some((cond: any) => {
          if (cond.isOnline === true && u.isOnline === true) return true;
          if (cond.lastActive && cond.lastActive.$gte) {
            const minDate = new Date(cond.lastActive.$gte).getTime();
            if (u.lastActive && new Date(u.lastActive).getTime() >= minDate) return true;
          }
          return false;
        });
      });
    }

    return filtered.length;
  }
}


// 2. ProjectModel Class & Proxy
export class ProjectModelClass {
  id: string;
  name: string;
  description?: string;
  type: string;
  isFavorite?: boolean;
  status?: string;
  ownerId: string;
  sharedWith?: string[];
  files?: any;
  messages?: any[];
  tabs?: string[];
  activeTabId?: string;
  editorSettings?: any;
  lastAccessedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(data: any) {
    this.id = data.id || 'proj_' + Math.random().toString(36).substr(2, 9);
    this.name = data.name;
    this.description = data.description || '';
    this.type = data.type;
    this.isFavorite = data.isFavorite || false;
    this.status = data.status || 'active';
    this.ownerId = data.ownerId;
    this.sharedWith = data.sharedWith || [];
    this.files = data.files || {};
    this.messages = data.messages || [];
    this.tabs = data.tabs || [];
    this.activeTabId = data.activeTabId || '';
    this.editorSettings = data.editorSettings || {};
    this.lastAccessedAt = data.lastAccessedAt ? new Date(data.lastAccessedAt) : (data.updatedAt ? new Date(data.updatedAt) : new Date());
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
  }

  async save() {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const cleanDoc: any = { ...this };
        delete cleanDoc.save;
        
        const exists = await MongooseProjectModel.findOne({ id: this.id });
        if (exists) {
          await MongooseProjectModel.findByIdAndUpdate(
            exists._id,
            { $set: cleanDoc },
            { new: true }
          );
        } else {
          const mDoc = new MongooseProjectModel(cleanDoc);
          await mDoc.save();
        }
        return this;
      } catch (err) {
        console.warn('Mongoose save failed, saving to file fallback:', err);
      }
    }
    const list = readJSON(PROJECTS_FILE);
    const idx = list.findIndex(item => item.id === this.id);
    this.updatedAt = new Date();
    const cleanDoc = { ...this };
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...cleanDoc };
    } else {
      list.push(cleanDoc);
    }
    writeJSON(PROJECTS_FILE, list);
    return this;
  }

  // Static Queries
  static async countDocuments(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongooseProjectModel.countDocuments(query);
      } catch (err) {
        console.warn('Mongoose countDocuments failed, falling back to files:', err);
      }
    }
    let list = readJSON(PROJECTS_FILE);
    if (query.ownerId) {
      list = list.filter(item => item.ownerId === String(query.ownerId));
    }
    return list.length;
  }

  static find(query: any = {}) {
    return new QueryHelper(async () => {
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const docs = await MongooseProjectModel.find(query);
          return docs.map((d: any) => new ProjectModelClass(d));
        } catch (err) {
          console.warn('Mongoose find failed, falling back to files:', err);
        }
      }
      let list = readJSON(PROJECTS_FILE);
      if (query['$or']) {
        list = list.filter(item => {
          return query['$or'].some((cond: any) => {
            if (cond.ownerId) return item.ownerId === String(cond.ownerId);
            if (cond.sharedWith) return item.sharedWith && item.sharedWith.includes(String(cond.sharedWith));
            return false;
          });
        });
      } else if (query.ownerId) {
        list = list.filter(item => item.ownerId === String(query.ownerId));
      }
      return list.map(p => new ProjectModelClass(p));
    });
  }

  static async findOne(query: any) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongooseProjectModel.findOne(query);
      } catch (err) {
        console.warn('Mongoose findOne failed, falling back to files:', err);
      }
    }
    const list = readJSON(PROJECTS_FILE);
    const item = list.find(p => p.id === query.id);
    if (!item) return null;
    return new ProjectModelClass(item);
  }

  static async findOneAndUpdate(query: any, update: any, options: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongooseProjectModel.findOneAndUpdate(query, update, options);
      } catch (err) {
        console.warn('Mongoose findOneAndUpdate failed, falling back to files:', err);
      }
    }
    const list = readJSON(PROJECTS_FILE);
    const idx = list.findIndex(p => p.id === query.id);
    if (idx !== -1) {
      const changes = update.$set || update;
      list[idx] = { ...list[idx], ...changes, updatedAt: new Date() };
      writeJSON(PROJECTS_FILE, list);
      return new ProjectModelClass(list[idx]);
    }
    return null;
  }

  static async findOneAndDelete(query: any) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongooseProjectModel.findOneAndDelete(query);
      } catch (err) {
        console.warn('Mongoose findOneAndDelete failed, falling back to files:', err);
      }
    }
    const list = readJSON(PROJECTS_FILE);
    const idx = list.findIndex(p => p.id === query.id || (query.ownerId && p.ownerId === query.ownerId));
    if (idx !== -1) {
      const removed = list.splice(idx, 1)[0];
      writeJSON(PROJECTS_FILE, list);
      return new ProjectModelClass(removed);
    }
    return null;
  }

  static async findByIdAndDelete(id: string) {
    return this.findOneAndDelete({ id });
  }

  static async deleteOne(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongooseProjectModel.deleteOne(query);
      } catch (err) {
        console.warn('Mongoose deleteOne failed on ProjectModel:', err);
      }
    }
    const list = readJSON(PROJECTS_FILE);
    const idx = list.findIndex(p => p.id === query.id || (query.ownerId && p.ownerId === query.ownerId));
    if (idx !== -1) {
      list.splice(idx, 1);
      writeJSON(PROJECTS_FILE, list);
    }
    return { acknowledged: true };
  }

  static async deleteMany(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongooseProjectModel.deleteMany(query);
      } catch (err) {
        console.warn('Mongoose deleteMany failed on ProjectModel:', err);
      }
    }
    let list = readJSON(PROJECTS_FILE);
    const initialLen = list.length;
    if (query.ownerId) {
      const oid = String(query.ownerId);
      list = list.filter(item => String(item.ownerId) !== oid);
    }
    if (query.ownerEmail) {
      const oem = String(query.ownerEmail).trim().toLowerCase();
      list = list.filter(item => String(item.ownerEmail || '').trim().toLowerCase() !== oem);
    }
    if (query.userId) {
      const uid = String(query.userId);
      list = list.filter(item => String(item.userId || item.ownerId) !== uid);
    }
    if (query.id) {
      const pid = String(query.id);
      list = list.filter(item => String(item.id) !== pid);
    }
    if (!Object.keys(query).length) {
      list = [];
    }
    writeJSON(PROJECTS_FILE, list);
    return { acknowledged: true, deletedCount: initialLen - list.length };
  }
}


// 3. AdminLogModel Class & Proxy
export class AdminLogModelClass {
  userEmail: string;
  action: string;
  status: string;
  createdAt?: Date;

  constructor(data: any) {
    this.userEmail = data.userEmail;
    this.action = data.action;
    this.status = data.status || 'info';
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
  }

  async save() {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const cleanDoc: any = { ...this };
        delete cleanDoc.save;
        const mDoc = new MongooseAdminLogModel(cleanDoc);
        await mDoc.save();
        return this;
      } catch (err) {
        console.warn('Mongoose save failed, saving to file fallback:', err);
      }
    }
    const list = readJSON(LOGS_FILE);
    const cleanDoc = { ...this };
    list.push(cleanDoc);
    writeJSON(LOGS_FILE, list);
    return this;
  }

  // Static Queries
  static find(query: any = {}) {
    return new QueryHelper(async () => {
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const docs = await MongooseAdminLogModel.find(query);
          return docs.map((d: any) => new AdminLogModelClass(d));
        } catch (err) {
          console.warn('Mongoose find failed, falling back to files:', err);
        }
      }
      const list = readJSON(LOGS_FILE);
      return list.map(l => new AdminLogModelClass(l));
    });
  }
}

// 4. FileAccessLogModel Class & Proxy
export class FileAccessLogModelClass {
  id: string;
  projectId: string;
  fileId: string;
  fileName: string;
  filePath: string;
  userEmail: string;
  username: string;
  device: string;
  openedAt: Date;

  constructor(data: any) {
    this.id = data._id || data.id || 'log_' + Math.random().toString(36).substr(2, 9);
    this.projectId = data.projectId;
    this.fileId = data.fileId;
    this.fileName = data.fileName;
    this.filePath = data.filePath || '';
    this.userEmail = data.userEmail || '';
    this.username = data.username || '';
    this.device = data.device || 'Desktop';
    this.openedAt = data.openedAt ? new Date(data.openedAt) : new Date();
  }

  async save() {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const cleanDoc: any = { ...this };
        delete cleanDoc.save;
        const mDoc = new MongooseFileAccessLogModel(cleanDoc);
        const saved = await mDoc.save();
        this.id = saved._id.toString();
        return this;
      } catch (err) {
        console.warn('Mongoose save failed for FileAccessLog, saving to file fallback:', err);
      }
    }
    const list = readJSON(FILE_ACCESS_LOGS_FILE);
    const cleanDoc = { ...this };
    list.push(cleanDoc);
    writeJSON(FILE_ACCESS_LOGS_FILE, list);
    return this;
  }

  // Static Queries
  static find(query: any = {}) {
    return new QueryHelper(async () => {
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const docs = await MongooseFileAccessLogModel.find(query);
          return docs.map((d: any) => new FileAccessLogModelClass(d));
        } catch (err) {
          console.warn('Mongoose find failed for FileAccessLog, falling back to files:', err);
        }
      }
      let list = readJSON(FILE_ACCESS_LOGS_FILE);
      if (query.projectId) {
        list = list.filter(item => item.projectId === String(query.projectId));
      }
      if (query.fileId) {
        list = list.filter(item => item.fileId === String(query.fileId));
      }
      return list.map(l => new FileAccessLogModelClass(l));
    });
  }
}

// 5. InviteModel Class & Proxy
export class InviteModelClass {
  id: string;
  projectId: string;
  projectName: string;
  inviterEmail: string;
  inviterName: string;
  recipientEmail: string;
  token: string;
  expiresAt: Date;
  status: string;
  createdAt: Date;

  constructor(data: any) {
    this.id = data._id ? data._id.toString() : data.id || 'inv_' + Math.random().toString(36).substr(2, 9);
    this.projectId = data.projectId;
    this.projectName = data.projectName || 'CodeSyne Workspace';
    this.inviterEmail = data.inviterEmail;
    this.inviterName = data.inviterName || 'CodeSyne Developer';
    this.recipientEmail = (data.recipientEmail || '').toLowerCase();
    this.token = data.token;
    this.expiresAt = data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    this.status = data.status || 'pending';
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
  }

  async save() {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        if (this.id && !this.id.startsWith('inv_')) {
          const doc = await MongooseInviteModel.findByIdAndUpdate(this.id, this, { new: true });
          if (doc) return new InviteModelClass(doc);
        }
        const cleanDoc: any = { ...this };
        delete cleanDoc.save;
        const mDoc = new MongooseInviteModel(cleanDoc);
        const saved = await mDoc.save();
        this.id = saved._id.toString();
        return this;
      } catch (err) {
        console.warn('Mongoose save failed for Invite, falling back to JSON:', err);
      }
    }
    const list = readJSON(INVITES_FILE);
    const idx = list.findIndex(i => i.id === this.id || i.token === this.token);
    const cleanDoc = { ...this };
    if (idx >= 0) {
      list[idx] = cleanDoc;
    } else {
      list.push(cleanDoc);
    }
    writeJSON(INVITES_FILE, list);
    return this;
  }

  static async findOne(query: any) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const doc = await MongooseInviteModel.findOne(query);
        if (doc) return new InviteModelClass(doc);
      } catch (err) {
        console.warn('Mongoose findOne failed for Invite, falling back to JSON:', err);
      }
    }
    const list = readJSON(INVITES_FILE);
    const match = list.find(item => {
      if (query.token && item.token === query.token) return true;
      if (query.id && item.id === query.id) return true;
      return false;
    });
    return match ? new InviteModelClass(match) : null;
  }

  static find(query: any = {}) {
    return new QueryHelper(async () => {
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const docs = await MongooseInviteModel.find(query);
          return docs.map((d: any) => new InviteModelClass(d));
        } catch (err) {
          console.warn('Mongoose find failed for Invite, falling back to JSON:', err);
        }
      }
      let list = readJSON(INVITES_FILE);
      if (query.projectId) {
        list = list.filter(item => item.projectId === String(query.projectId));
      }
      if (query.recipientEmail) {
        list = list.filter(item => item.recipientEmail === String(query.recipientEmail).toLowerCase());
      }
      return list.map(l => new InviteModelClass(l));
    });
  }
}

// Pending Signup Dual-Mode Model
export class PendingSignupModelClass {
  _id: string;
  username: string;
  email: string;
  password: string;
  avatar?: string;
  role?: string;
  bio?: string;
  githubUsername?: string;
  achievements?: string[];
  verificationToken: string;
  verificationExpires: Date;
  lastResentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(data: any) {
    this._id = data._id || data.id || 'psign_' + Math.random().toString(36).substr(2, 9);
    this.username = data.username;
    this.email = (data.email || '').trim().toLowerCase();
    this.password = data.password;
    this.avatar = data.avatar || '';
    this.role = data.role || 'user';
    this.bio = data.bio || '';
    this.githubUsername = data.githubUsername || '';
    this.achievements = data.achievements || ['Collab Developer', 'Clean Code Specialist'];
    this.verificationToken = data.verificationToken;
    this.verificationExpires = data.verificationExpires ? new Date(data.verificationExpires) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.lastResentAt = data.lastResentAt ? new Date(data.lastResentAt) : new Date();
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
  }

  async save() {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const cleanDoc: any = { ...this };
        delete cleanDoc.save;
        const exists = await MongoosePendingSignupModel.findOne({ email: this.email });
        if (exists) {
          await MongoosePendingSignupModel.findByIdAndUpdate(exists._id, { $set: cleanDoc }, { new: true });
        } else {
          const mDoc = new MongoosePendingSignupModel(cleanDoc);
          await mDoc.save();
        }
      } catch (err) {
        console.warn('Mongoose pending signup save warning:', err);
      }
    }
    const list = readJSON(PENDING_SIGNUPS_FILE);
    const idx = list.findIndex((item: any) => item.email && item.email.trim().toLowerCase() === this.email);
    this.updatedAt = new Date();
    const cleanDoc = { ...this };
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...cleanDoc };
    } else {
      list.push(cleanDoc);
    }
    writeJSON(PENDING_SIGNUPS_FILE, list);
    return this;
  }

  static async findOne(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const doc = await MongoosePendingSignupModel.findOne(query);
        if (doc) return new PendingSignupModelClass(doc);
      } catch (err) {
        console.warn('Mongoose pending signup findOne warning:', err);
      }
    }
    const list = readJSON(PENDING_SIGNUPS_FILE);
    const match = list.find((item: any) => {
      const itemEmail = (item.email || '').trim().toLowerCase();
      const itemUser = (item.username || '').trim().toLowerCase();

      if (query.$or && Array.isArray(query.$or)) {
        return query.$or.some((cond: any) => {
          if (cond.email && itemEmail === String(cond.email).trim().toLowerCase()) return true;
          if (cond.username && itemUser === String(cond.username).trim().toLowerCase()) return true;
          if (cond.verificationToken && item.verificationToken === String(cond.verificationToken)) return true;
          return false;
        });
      }

      if (query.email && itemEmail === String(query.email).trim().toLowerCase()) return true;
      if (query.username && itemUser === String(query.username).trim().toLowerCase()) return true;
      if (query.verificationToken && item.verificationToken === String(query.verificationToken)) return true;
      return false;
    });
    return match ? new PendingSignupModelClass(match) : null;
  }

  static find(query: any = {}) {
    return new QueryHelper(async () => {
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const docs = await MongoosePendingSignupModel.find(query);
          return docs.map((d: any) => new PendingSignupModelClass(d));
        } catch (err) {
          console.warn('Mongoose pending signup find warning:', err);
        }
      }
      let list = readJSON(PENDING_SIGNUPS_FILE);
      if (query.email) {
        const em = String(query.email).trim().toLowerCase();
        list = list.filter((i: any) => (i.email || '').trim().toLowerCase() === em);
      }
      return list.map((i: any) => new PendingSignupModelClass(i));
    });
  }

  static async countDocuments(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongoosePendingSignupModel.countDocuments(query);
      } catch (err) {
        console.warn('Mongoose pending signup count warning:', err);
      }
    }
    const list = readJSON(PENDING_SIGNUPS_FILE);
    return list.length;
  }

  static async deleteOne(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongoosePendingSignupModel.deleteOne(query);
      } catch (err) {
        console.warn('Mongoose pending signup deleteOne warning:', err);
      }
    }
    const list = readJSON(PENDING_SIGNUPS_FILE);
    const cleanEmail = query.email ? String(query.email).trim().toLowerCase() : '';
    const token = query.verificationToken ? String(query.verificationToken) : '';
    const idx = list.findIndex((i: any) => {
      if (cleanEmail && (i.email || '').trim().toLowerCase() === cleanEmail) return true;
      if (token && i.verificationToken === token) return true;
      return false;
    });
    if (idx !== -1) {
      list.splice(idx, 1);
      writeJSON(PENDING_SIGNUPS_FILE, list);
    }
    return { acknowledged: true };
  }

  static async deleteMany(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongoosePendingSignupModel.deleteMany(query);
      } catch (err) {
        console.warn('Mongoose pending signup deleteMany warning:', err);
      }
    }
    let list = readJSON(PENDING_SIGNUPS_FILE);
    if (query.email) {
      const em = String(query.email).trim().toLowerCase();
      list = list.filter((i: any) => (i.email || '').trim().toLowerCase() !== em);
    } else if (!Object.keys(query).length) {
      list = [];
    }
    writeJSON(PENDING_SIGNUPS_FILE, list);
    return { acknowledged: true };
  }
}

class PendingContactModelClass {
  name: string;
  email: string;
  subject: string;
  message: string;
  verificationToken: string;
  verificationExpires: Date;
  isVerified: boolean;
  lastResentAt: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: any = {}) {
    this.name = data.name || '';
    this.email = (data.email || '').trim().toLowerCase();
    this.subject = data.subject || 'General Inquiry';
    this.message = data.message || '';
    this.verificationToken = data.verificationToken || '';
    this.verificationExpires = data.verificationExpires ? new Date(data.verificationExpires) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.isVerified = !!data.isVerified;
    this.lastResentAt = data.lastResentAt ? new Date(data.lastResentAt) : new Date();
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
  }

  async save() {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const existing = await MongoosePendingContactModel.findOne({ verificationToken: this.verificationToken });
        const cleanDoc = { ...this };
        if (existing) {
          await MongoosePendingContactModel.updateOne({ verificationToken: this.verificationToken }, { $set: cleanDoc });
        } else {
          const mDoc = new MongoosePendingContactModel(cleanDoc);
          await mDoc.save();
        }
      } catch (err) {
        console.warn('Mongoose pending contact save warning:', err);
      }
    }
    const list = readJSON(PENDING_CONTACTS_FILE);
    const idx = list.findIndex((item: any) => (item.verificationToken && item.verificationToken === this.verificationToken) || (item.email && item.email.trim().toLowerCase() === this.email));
    this.updatedAt = new Date();
    const cleanDoc = { ...this };
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...cleanDoc };
    } else {
      list.push(cleanDoc);
    }
    writeJSON(PENDING_CONTACTS_FILE, list);
    return this;
  }

  static async findOne(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        const doc = await MongoosePendingContactModel.findOne(query);
        if (doc) return new PendingContactModelClass(doc);
      } catch (err) {
        console.warn('Mongoose pending contact findOne warning:', err);
      }
    }
    const list = readJSON(PENDING_CONTACTS_FILE);
    const match = list.find((item: any) => {
      const itemEmail = (item.email || '').trim().toLowerCase();

      if (query.$or && Array.isArray(query.$or)) {
        return query.$or.some((cond: any) => {
          if (cond.email && itemEmail === String(cond.email).trim().toLowerCase()) return true;
          if (cond.verificationToken && item.verificationToken === String(cond.verificationToken)) return true;
          return false;
        });
      }

      if (query.email && itemEmail === String(query.email).trim().toLowerCase()) return true;
      if (query.verificationToken && item.verificationToken === String(query.verificationToken)) return true;
      return false;
    });
    return match ? new PendingContactModelClass(match) : null;
  }

  static find(query: any = {}) {
    return new QueryHelper(async () => {
      if (useMongoose && mongoose.connection.readyState === 1) {
        try {
          const docs = await MongoosePendingContactModel.find(query);
          return docs.map((d: any) => new PendingContactModelClass(d));
        } catch (err) {
          console.warn('Mongoose pending contact find warning:', err);
        }
      }
      let list = readJSON(PENDING_CONTACTS_FILE);
      if (query.email) {
        const em = String(query.email).trim().toLowerCase();
        list = list.filter((i: any) => (i.email || '').trim().toLowerCase() === em);
      }
      return list.map((i: any) => new PendingContactModelClass(i));
    });
  }

  static async countDocuments(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        return await MongoosePendingContactModel.countDocuments(query);
      } catch (err) {
        console.warn('Mongoose pending contact count warning:', err);
      }
    }
    const list = readJSON(PENDING_CONTACTS_FILE);
    return list.length;
  }

  static async deleteOne(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongoosePendingContactModel.deleteOne(query);
      } catch (err) {
        console.warn('Mongoose pending contact deleteOne warning:', err);
      }
    }
    const list = readJSON(PENDING_CONTACTS_FILE);
    const cleanEmail = query.email ? String(query.email).trim().toLowerCase() : '';
    const token = query.verificationToken ? String(query.verificationToken) : '';
    const idx = list.findIndex((i: any) => {
      if (cleanEmail && (i.email || '').trim().toLowerCase() === cleanEmail) return true;
      if (token && i.verificationToken === token) return true;
      return false;
    });
    if (idx !== -1) {
      list.splice(idx, 1);
      writeJSON(PENDING_CONTACTS_FILE, list);
    }
    return { acknowledged: true };
  }

  static async deleteMany(query: any = {}) {
    if (useMongoose && mongoose.connection.readyState === 1) {
      try {
        await MongoosePendingContactModel.deleteMany(query);
      } catch (err) {
        console.warn('Mongoose pending contact deleteMany warning:', err);
      }
    }
    let list = readJSON(PENDING_CONTACTS_FILE);
    if (query.email) {
      const em = String(query.email).trim().toLowerCase();
      list = list.filter((i: any) => (i.email || '').trim().toLowerCase() !== em);
    } else if (!Object.keys(query).length) {
      list = [];
    }
    writeJSON(PENDING_CONTACTS_FILE, list);
    return { acknowledged: true };
  }
}

// Map exports
export const UserModel = UserModelClass as any;
export const ProjectModel = ProjectModelClass as any;
export const AdminLogModel = AdminLogModelClass as any;
export const FileAccessLogModel = FileAccessLogModelClass as any;
export const InviteModel = InviteModelClass as any;
export const PendingSignupModel = PendingSignupModelClass as any;
export const PendingContactModel = PendingContactModelClass as any;

