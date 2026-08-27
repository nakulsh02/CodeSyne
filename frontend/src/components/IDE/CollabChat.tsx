import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Trash2, Copy, Check, Bot, Paperclip, RefreshCw, Cpu, ChevronDown } from 'lucide-react';
import { safeFetch } from '../../api';

interface ActiveFileContext {
  fileName: string;
  code: string;
  language?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
}

interface AIChatProps {
  projectId: string;
  activeFile: ActiveFileContext | null;
}

const AVAILABLE_MODELS = [
  {
    id: 'auto',
    name: 'Auto Mode',
    fullName: 'Auto (Fallback Mode)',
    desc: 'Cycles automatically to keep chat 100% online',
    badge: '1000% Reliable',
    isFree: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    fullName: 'Gemini 2.5 Flash',
    desc: '1M context, extremely fast & highly accurate',
    badge: 'Fast • 1M Context',
    isFree: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    fullName: 'Llama 3.3 70B',
    desc: 'State-of-the-art 70B smart reasoning',
    badge: 'Smart • 128K Context',
    isFree: true,
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder',
    fullName: 'Qwen 2.5 Coder',
    desc: 'Specialized expert for code and scripts',
    badge: 'Coding • 128K Context',
    isFree: true,
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    fullName: 'DeepSeek R1',
    desc: 'Next-gen reasoning & step-by-step thinking',
    badge: 'Reasoning • 128K Context',
    isFree: true,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    fullName: 'Claude 3.5 Sonnet',
    desc: 'Legendary performance (falls back if no credits)',
    badge: 'Premium • High IQ',
    isFree: false,
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    fullName: 'Gemini 2.5 Pro',
    desc: 'Complex agentic reasoning with ultra large context',
    badge: 'Premium • Pro Agent',
    isFree: false,
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3 Chat',
    fullName: 'DeepSeek V3 Chat',
    desc: 'High-speed intelligence (falls back if no credits)',
    badge: 'Premium • Fast',
    isFree: false,
  }
];

export default function CodeSyneAI({ projectId, activeFile }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [preferredModel, setPreferredModel] = useState('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSynthesizingModel, setCurrentSynthesizingModel] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside and Escape key logic
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`codesyne_ai_chat_${projectId}`);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        initializeWelcomeMessage();
      }
    } else {
      initializeWelcomeMessage();
    }
  }, [projectId]);

  // Save chat history to localStorage when changed
  const saveMessages = (newMsgs: ChatMessage[]) => {
    setMessages(newMsgs);
    localStorage.setItem(`codesyne_ai_chat_${projectId}`, JSON.stringify(newMsgs));
  };

  const initializeWelcomeMessage = () => {
    const welcome: ChatMessage = {
      id: 'welcome',
      role: 'assistant',
      content: `### Welcome to CodeSyne AI! 🚀

I am your advanced, high-performance sandbox coding copilot. I am connected directly to OpenRouter's neural models with automatic multi-model fallback redundancy.

#### 💡 How can I assist you today?
- **Analyze Code:** Ask me to explain or optimize your active editor file.
- **Generate Tests:** Let's write unit tests, mocks, or validation criteria.
- **Refactor & Fix:** Find latency bottlenecks, logic faults, or syntax errors.

*Tip: Select a specific model from the dropdown or stay on auto-fallback!*`,
      timestamp: Date.now(),
      model: 'System Guidance'
    };
    saveMessages([welcome]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isGenerating) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: textToSend,
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, userMsg];
    saveMessages(updatedMessages);
    setInputText('');
    setIsGenerating(true);
    setCurrentSynthesizingModel(preferredModel === 'auto' ? 'google/gemini-2.5-flash' : preferredModel);

    // Filter message list for API consumption (only user and assistant roles)
    const apiMessages = updatedMessages.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const response = await safeFetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: apiMessages,
          preferredModel: preferredModel === 'auto' ? undefined : preferredModel,
          codeContext: activeFile ? {
            fileName: activeFile.fileName,
            code: activeFile.code,
            language: activeFile.language
          } : undefined
        }),
        skipThrowOnNonOk: true
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      const botMsgId = Math.random().toString(36).substring(7);
      const fullContent = data.content || '';
      
      const botMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
        model: data.model
      };

      saveMessages([...updatedMessages, botMsg]);
      setIsGenerating(false);
      setCurrentSynthesizingModel('');

    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `### ❌ Synthesis Failure

Unable to compile response. All configured fallback models timed out or failed to reply.

**Error Details:** ${err.message || 'Unknown Network Error'}

*Please verify your server's **OPENROUTER_API_KEY** environmental secret, or try again shortly.*`,
        timestamp: Date.now(),
        model: 'Error Diagnostics'
      };
      saveMessages([...updatedMessages, errorMsg]);
      setIsGenerating(false);
      setCurrentSynthesizingModel('');
    }
  };

  const handleClear = () => {
    if (window.confirm('Clear all conversation history with CodeSyne AI?')) {
      initializeWelcomeMessage();
    }
  };

  const handleCopyCode = (codeText: string, keyId: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedId(keyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Custom regex markdown/code blocks parser
  const parseContent = (text: string) => {
    const segments: { type: 'text' | 'code'; content: string; language?: string }[] = [];
    const regex = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }
      segments.push({
        type: 'code',
        language: match[1] || 'plaintext',
        content: match[2].trim()
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    return segments;
  };

  const renderTextWithFormatting = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      if (line.trim() === '') {
        return <div key={lineIdx} className="h-1.5" />;
      }

      // Check for bullet lists
      const listMatch = line.match(/^([*-]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        return (
          <div key={lineIdx} className="flex items-start space-x-1.5 ml-2 my-1 text-[11px] leading-relaxed text-slate-300">
            <span className="text-indigo-400 mt-1 select-none font-sans shrink-0">•</span>
            <span className="flex-1">{renderInlineFormat(listMatch[2])}</span>
          </div>
        );
      }

      // Check for headings
      if (line.startsWith('### ')) {
        return (
          <h4 key={lineIdx} className="text-[12px] font-bold text-white mt-4 mb-2 border-b border-white/5 pb-1 font-sans flex items-center space-x-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span>{line.substring(4).trim()}</span>
          </h4>
        );
      }
      if (line.startsWith('#### ')) {
        return (
          <h5 key={lineIdx} className="text-[11px] font-bold text-slate-200 mt-3 mb-1.5 uppercase tracking-wider font-mono">
            {line.substring(5).trim()}
          </h5>
        );
      }

      return (
        <p key={lineIdx} className="text-[11px] leading-relaxed text-slate-300 my-1 font-sans break-words">
          {renderInlineFormat(line)}
        </p>
      );
    });
  };

  const renderInlineFormat = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="px-1 py-0.5 bg-slate-950/60 text-pink-300 font-mono text-[10px] rounded border border-white/5">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  // Suggestions removed per user feedback to declutter chatbot interface

  return (
    <div id="codesyne_ai_chatbot_panel" className="h-full flex flex-col justify-between bg-transparent text-slate-300 font-sans relative overflow-visible">
      
      {/* HEADER SECTION WITH MODEL SELECTOR */}
      <div className="p-2 sm:p-2.5 border-b border-white/5 bg-[#0a0a0f]/95 backdrop-blur-md flex items-center justify-between gap-1 sm:gap-2 shrink-0 min-w-0 w-full relative z-[100] overflow-visible select-none rounded-t-2xl" ref={dropdownRef}>
        {/* Left Brand and Title */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0 flex-1 overflow-hidden">
          <div className="p-1.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h4 className="text-[11px] sm:text-xs font-bold text-white tracking-wide truncate">CodeSyne AI</h4>
            <p className="text-[8px] text-slate-400 font-mono uppercase tracking-widest hidden xs:block truncate">Workspace Copilot</p>
          </div>
        </div>

        {/* Right Controls - Model select dropdown and clear button */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0 min-w-0 ml-auto">
          <button
            ref={dropdownRef}
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className={`flex items-center space-x-1 sm:space-x-1.5 bg-[#09090e] hover:bg-[#11111a] border rounded-xl px-2 sm:px-2.5 py-1.5 text-[10px] sm:text-[11px] font-bold text-slate-300 hover:text-white font-mono outline-none transition-all duration-200 cursor-pointer w-auto max-w-[100px] xs:max-w-[140px] sm:max-w-[190px] shadow-lg justify-between gap-1 group shrink-0 min-w-0 ${
              showModelDropdown ? 'border-indigo-500/60 ring-2 ring-indigo-500/20 text-white bg-[#11111a]' : 'border-white/10 hover:border-indigo-500/40'
            }`}
            title="Select AI Model"
          >
            <div className="flex items-center space-x-1 sm:space-x-1.5 truncate min-w-0">
              <Cpu className="h-3.5 w-3.5 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate">
                {(AVAILABLE_MODELS.find(m => m.id === preferredModel) || AVAILABLE_MODELS[0]).name}
              </span>
            </div>
            <ChevronDown className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${showModelDropdown ? 'rotate-180 text-indigo-400' : ''}`} />
          </button>

          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-xl border border-white/10 hover:border-rose-500/30 bg-[#09090e] transition-all duration-200 cursor-pointer shrink-0 shadow-lg flex items-center justify-center"
            title="Reset Chat Session"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* FLOATING MODEL SELECTION DROPDOWN MENU - Fixed position escapes all parent scrollbars & overflow clipping */}
        {showModelDropdown && (
          <>
            <div 
              className="fixed inset-0 z-[99998]" 
              onClick={() => setShowModelDropdown(false)} 
            />
            <div 
              className="fixed max-h-[min(380px,60vh)] overflow-y-auto bg-[#09090f]/98 backdrop-blur-2xl border border-indigo-500/40 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] z-[99999] py-2.5 px-2 custom-scrollbar divide-y divide-white/5 animate-in fade-in slide-in-from-top-1.5 duration-150"
              style={{
                top: dropdownRef.current ? Math.min(window.innerHeight - 390, Math.max(50, dropdownRef.current.getBoundingClientRect().bottom + 6)) : 60,
                left: dropdownRef.current ? Math.max(10, Math.min(window.innerWidth - 300, dropdownRef.current.getBoundingClientRect().left - 100)) : 10,
                width: dropdownRef.current ? Math.min(320, window.innerWidth - 20) : 280,
                maxWidth: 'calc(100vw - 20px)'
              }}
            >
              {/* CATEGORIZED SECTIONS */}
            <div className="pb-2 space-y-1">
              <p className="text-[8px] sm:text-[9px] font-bold text-amber-400 uppercase tracking-widest px-2 py-1 flex items-center justify-between">
                <span>Auto Routing</span>
                <span className="text-[7px] text-amber-400/80 lowercase font-normal font-sans">(recommended)</span>
              </p>
              {AVAILABLE_MODELS.filter(m => m.id === 'auto').map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setPreferredModel(m.id);
                    setShowModelDropdown(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl flex flex-col transition-all cursor-pointer ${
                    preferredModel === m.id
                      ? 'bg-indigo-600/20 border border-indigo-500/40 text-white shadow-inner'
                      : 'hover:bg-white/5 border border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5 w-full min-w-0">
                    <div className="flex items-center space-x-1.5 min-w-0 shrink">
                      <span className={`text-[10px] sm:text-[11px] font-bold font-mono truncate ${preferredModel === m.id ? 'text-indigo-300' : 'text-slate-200'}`}>
                        {m.fullName}
                      </span>
                      {preferredModel === m.id && (
                        <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      )}
                    </div>
                    <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded shrink-0">
                      {m.badge}
                    </span>
                  </div>
                  <span className="text-[8px] sm:text-[9px] text-slate-400 mt-1 leading-snug text-left block break-words">{m.desc}</span>
                </button>
              ))}
            </div>

            <div className="py-2 space-y-1">
              <p className="text-[8px] sm:text-[9px] font-bold text-emerald-400 uppercase tracking-widest px-2 py-1">100% Free Models (Long-Lasting)</p>
              <div className="space-y-1">
                {AVAILABLE_MODELS.filter(m => m.isFree && m.id !== 'auto').map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setPreferredModel(m.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl flex flex-col transition-all cursor-pointer ${
                      preferredModel === m.id
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-white shadow-inner'
                        : 'hover:bg-white/5 border border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5 w-full min-w-0">
                      <div className="flex items-center space-x-1.5 min-w-0 shrink">
                        <span className={`text-[10px] sm:text-[11px] font-bold font-mono truncate ${preferredModel === m.id ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {m.fullName}
                        </span>
                        {preferredModel === m.id && (
                          <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded shrink-0">
                        {m.badge}
                      </span>
                    </div>
                    <span className="text-[8px] sm:text-[9px] text-slate-400 mt-1 leading-snug text-left block break-words">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 pb-1 space-y-1">
              <p className="text-[8px] sm:text-[9px] font-bold text-indigo-400 uppercase tracking-widest px-2 py-1">Premium Models (Paid)</p>
              <div className="space-y-1">
                {AVAILABLE_MODELS.filter(m => !m.isFree).map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setPreferredModel(m.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl flex flex-col transition-all cursor-pointer ${
                      preferredModel === m.id
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-white shadow-inner'
                        : 'hover:bg-white/5 border border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5 w-full min-w-0">
                      <div className="flex items-center space-x-1.5 min-w-0 shrink">
                        <span className={`text-[10px] sm:text-[11px] font-bold font-mono truncate ${preferredModel === m.id ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {m.fullName}
                        </span>
                        {preferredModel === m.id && (
                          <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 rounded shrink-0">
                        {m.badge}
                      </span>
                    </div>
                    <span className="text-[8px] sm:text-[9px] text-slate-400 mt-1 leading-snug text-left block break-words">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>

      {/* CHAT MESSAGES PANEL */}
      <div className="flex-1 p-3 overflow-y-auto space-y-4 custom-scrollbar min-h-0">
        {messages.map((m) => (
          <div 
            key={m.id}
            className={`flex items-start space-x-2 text-xs text-left ${m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            <div className={`p-1.5 rounded-lg shrink-0 border ${
              m.role === 'user' 
                ? 'bg-indigo-600/15 border-indigo-500/20 text-indigo-400' 
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              {m.role === 'user' ? (
                <Cpu className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
            </div>

            <div className="space-y-1 max-w-[85%] min-w-0">
              <div className={`flex items-center space-x-1.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
                <span className="font-bold text-slate-200 text-[10px]">
                  {m.role === 'user' ? 'You' : 'CodeSyne AI'}
                </span>
                {m.model && (
                  <span className="text-[8px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/15 px-1 py-0.2 rounded uppercase">
                    {m.model.split('/').pop()}
                  </span>
                )}
                <span className="text-[8px] text-slate-500 font-mono">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className={`p-2.5 rounded-xl leading-relaxed text-[11px] break-words md:break-words min-w-0 overflow-hidden ${
                m.role === 'user' 
                  ? 'bg-indigo-600/10 border border-indigo-500/20 text-slate-200 rounded-tr-none' 
                  : 'bg-slate-900/40 border border-white/5 rounded-tl-none text-slate-300'
              }`}>
                {parseContent(m.content).map((seg, idx) => {
                  if (seg.type === 'code') {
                    const blockKey = `${m.id}-code-${idx}`;
                    return (
                      <div key={blockKey} className="my-2 border border-white/5 rounded-lg overflow-hidden bg-slate-950 font-mono text-[10px] max-w-full">
                        <div className="bg-slate-900 px-3 py-1.5 flex items-center justify-between border-b border-white/5">
                          <span className="text-slate-400 font-bold uppercase text-[8px] tracking-wider">{seg.language}</span>
                          <button
                            onClick={() => handleCopyCode(seg.content, blockKey)}
                            className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded transition-colors cursor-pointer flex items-center space-x-1"
                          >
                            {copiedId === blockKey ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-[8px] text-emerald-400 font-bold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span className="text-[8px]">Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3 overflow-x-auto text-slate-300 text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-indigo-500/40 hover:scrollbar-thumb-indigo-400 scrollbar-track-white/5 max-w-full whitespace-pre-wrap break-all md:break-words">
                          <code>{seg.content}</code>
                        </pre>
                      </div>
                    );
                  }
                  return <div key={idx} className="break-words [word-break:break-word]">{renderTextWithFormatting(seg.content)}</div>;
                })}
              </div>
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="flex items-start space-x-2 text-xs text-left">
            <div className="p-1.5 rounded-lg shrink-0 border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
              <Bot className="h-3.5 w-3.5 animate-bounce" />
            </div>
            <div className="space-y-1 max-w-[85%]">
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-200 text-[10px]">CodeSyne AI</span>
                <span className="text-[8px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded uppercase animate-pulse">
                  Synthesizing
                </span>
              </div>
              <div className="p-2.5 bg-slate-900/30 border border-white/5 rounded-xl rounded-tl-none flex items-center space-x-2 text-slate-400 text-[11px]">
                <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                <span>Thinking using {currentSynthesizingModel.split('/').pop()}...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestions panel completely removed per user request */}

      {/* CHAT INPUT AREA */}
      <div className="p-3 border-t border-white/5 bg-[#08080d]/60 shrink-0">
        {/* Code context notification line */}
        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono mb-2 px-0.5">
          <div className="flex items-center space-x-1 min-w-0">
            <Paperclip className={`h-3 w-3 shrink-0 ${activeFile ? 'text-indigo-400' : 'text-slate-600'}`} />
            {activeFile ? (
              <span className="text-indigo-400 font-bold truncate">Active File: {activeFile.fileName}</span>
            ) : (
              <span className="truncate text-slate-600">No active file (Open a script to inject context)</span>
            )}
          </div>
          <span className="text-[8px] bg-slate-950 border border-white/5 px-1.5 py-0.2 rounded font-mono text-slate-400">
            OpenRouter Mode
          </span>
        </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(inputText);
          }} 
          className="relative flex items-center"
        >
          <input
            type="text"
            placeholder={activeFile ? "Ask me about your file..." : "Type a message or code query..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isGenerating}
            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder-slate-600"
            required
          />
          <button
            type="submit"
            disabled={isGenerating || !inputText.trim()}
            className="absolute right-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

    </div>
  );
}
