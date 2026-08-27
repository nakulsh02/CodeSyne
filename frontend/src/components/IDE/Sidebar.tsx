import React from 'react';
import { 
  Files, Folder, Search, GitBranch, History, MessageSquare, Cpu, Settings, 
  Terminal, Play, ChevronLeft, ChevronRight, Monitor, Bug, Blocks, Shield, Code2, Home
} from 'lucide-react';
import { UserProfile } from '@shared/types';

export type SidebarTab = 'explorer' | 'search' | 'git' | 'rundebug' | 'extensions' | 'chat' | 'ai' | 'settings' | 'history' | 'admin';

interface SidebarProps {
  user: UserProfile;
  activeTab: SidebarTab | null;
  setActiveTab: (tab: SidebarTab | null) => void;
  collaborators: any[];
  onRunCode: () => void;
  onTogglePreview: () => void;
  showPreview: boolean;
  onGoBack: () => void;
  theme?: string;
  onOpenCollabModal?: () => void;
}

export default function Sidebar({
  user,
  activeTab,
  setActiveTab,
  collaborators,
  onRunCode,
  onTogglePreview,
  showPreview,
  onGoBack,
  theme,
  onOpenCollabModal
}: SidebarProps) {
  const ADMIN_EMAILS = ['nakulsharma02011@gmail.com'];
  const showAdminTab = !!(user && user.email && typeof user.email === 'string' && ADMIN_EMAILS.includes(user.email.trim().toLowerCase()));
  
  const isLightTheme = theme === 'light';
  const isCyberTheme = theme === 'cyberpunk';

  const tabs: { id: SidebarTab; icon: any; title: string; color: string; shortcut?: string }[] = [
    { id: 'explorer', icon: Files, title: 'Explorer', color: 'text-indigo-500', shortcut: 'Alt + E' },
    { id: 'search', icon: Search, title: 'Search', color: 'text-purple-500', shortcut: 'Alt + F' },
    { id: 'git', icon: GitBranch, title: 'Source Control', color: 'text-rose-500', shortcut: 'Alt + G' },
    { id: 'rundebug', icon: Bug, title: 'Run & Debug', color: 'text-amber-500', shortcut: 'Alt + D' },
    { id: 'extensions', icon: Blocks, title: 'Extensions', color: 'text-cyan-500', shortcut: 'Alt + X' },
    { id: 'chat', icon: MessageSquare, title: 'AI Chatbot', color: 'text-fuchsia-500', shortcut: 'Alt + C' },
    { id: 'settings', icon: Settings, title: 'Settings', color: 'text-slate-500', shortcut: 'Alt + S' },
    ...(showAdminTab ? [{ id: 'admin' as SidebarTab, icon: Shield, title: 'System Admin', color: 'text-indigo-600 animate-pulse' }] : [])
  ];

  return (
    <aside 
      id="ide_sidebar_rail" 
      className={`flex w-12 sm:w-13 md:w-14 self-stretch flex-col items-center justify-between pt-2 pb-2 sm:pt-2.5 sm:pb-2.5 px-1 shrink-0 select-none shadow-2xl relative z-40 transition-colors duration-300 border rounded-xl md:rounded-2xl overflow-hidden max-h-full ${
        isLightTheme 
          ? 'bg-white border-slate-200' 
          : isCyberTheme 
            ? 'bg-[#0d071d] border-indigo-900/30' 
            : 'bg-[#08080f] border-white/10'
      }`}
    >
      
      {/* Top logo & Back Button (fixed top section with generous top clearance) */}
      <div className="flex flex-col items-center justify-center space-y-2 w-full shrink-0 pt-0.5 pb-1">
        <button
          onClick={onGoBack}
          className={`p-1.5 sm:p-2 rounded-xl transition-all hover:scale-105 cursor-pointer flex items-center justify-center shadow-md border shrink-0 mx-auto ${
            isLightTheme 
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 hover:border-slate-300 text-slate-700' 
              : 'bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border-cyan-500/30 text-cyan-400'
          }`}
          title="Return to Dashboard"
        >
          <Code2 className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
        </button>
 
        <div className={`w-6 sm:w-8 h-[1px] shrink-0 mx-auto ${isLightTheme ? 'bg-slate-200' : 'bg-white/10'}`} />
      </div>

      {/* Tab Buttons centered in middle with 100% symmetry & isolated scroll container */}
      <nav className="flex-1 min-h-0 w-full flex flex-col items-center justify-start space-y-1.5 sm:space-y-2 py-1.5 my-auto px-0.5 overflow-y-auto overflow-x-hidden no-scrollbar scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(isActive ? null : tab.id);
              }}
              className={`relative mx-auto w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all cursor-pointer group rounded-xl shrink-0 ${
                isActive 
                  ? isLightTheme 
                    ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100' 
                    : 'bg-white/10 text-white shadow-lg border border-white/10' 
                  : isLightTheme 
                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title={`${tab.title}${tab.shortcut ? ` (${tab.shortcut})` : ''}`}
            >
              {/* VS Code styled left-hand vertical active bar */}
              <div 
                className={`absolute left-0 w-[3px] rounded-r transition-all duration-200 ${
                  isActive 
                    ? 'h-5 sm:h-6 bg-indigo-500' 
                    : isLightTheme 
                      ? 'h-0 bg-transparent group-hover:h-3 group-hover:bg-slate-300' 
                      : 'h-0 bg-transparent group-hover:h-3 group-hover:bg-slate-500'
                }`} 
              />
              
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-200 group-hover:scale-105 ${isActive ? tab.color : isLightTheme ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'}`} />
            </button>
          );
        })}
      </nav>

      {/* Bottom utilities (fixed bottom section with clear divider and padding) */}
      <div className={`flex flex-col items-center justify-center space-y-1.5 sm:space-y-2 w-full shrink-0 pt-2 mt-1 mx-auto border-t ${
        isLightTheme ? 'border-slate-200/80' : 'border-white/10'
      }`}>
        
        {/* Run Code trigger */}
        <button
          onClick={onRunCode}
          className="p-1.5 sm:p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center group shrink-0 mx-auto"
          title="Run Code in Sandbox (Ctrl + Enter)"
        >
          <Play className="h-4 w-4 sm:h-4.5 sm:w-4.5 fill-current text-white transition-transform duration-200 group-hover:rotate-12" />
        </button>

        {/* Live Preview Toggle */}
        <button
          onClick={onTogglePreview}
          className={`p-1.5 sm:p-2 rounded-xl hover:scale-105 transition-all cursor-pointer flex items-center justify-center border shrink-0 mx-auto ${
            showPreview 
              ? isLightTheme 
                ? 'bg-indigo-50 border-indigo-100 text-indigo-600 shadow-xs' 
                : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' 
              : isLightTheme 
                ? 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-200' 
                : 'bg-white/5 border-transparent text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Responsive Live Web Preview (Ctrl + Tab / Ctrl + `)"
        >
          <Monitor className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
        </button>

        <div className={`w-6 sm:w-8 h-[1px] shrink-0 mx-auto ${isLightTheme ? 'bg-slate-200' : 'bg-white/10'}`} />

        {/* User Profile Avatar */}
        {user && (
          <div 
            onClick={() => setActiveTab(activeTab === 'settings' ? null : 'settings')}
            className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-xl border border-indigo-500/30 overflow-hidden hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-md shadow-indigo-500/10 group shrink-0 mx-auto"
            title={`${user.username}'s Profile (Settings)`}
          >
            <img src={user.avatar} alt={user.username} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-slate-950 animate-pulse" />
          </div>
        )}

      </div>

    </aside>
  );
}
