import React, { useState } from 'react';
import { Search, RefreshCw, FileText, ChevronRight } from 'lucide-react';
import { FileSystemState } from '@shared/types';

interface SearchToolsProps {
  files: FileSystemState;
  onSelectFile: (id: string) => void;
}

export default function SearchTools({ files, onSelectFile }: SearchToolsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [results, setResults] = useState<{ fileId: string; fileName: string; line: number; text: string }[]>([]);

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const matches: { fileId: string; fileName: string; line: number; text: string }[] = [];

    Object.values(files).forEach(node => {
      const name = node.name ? node.name.toLowerCase() : '';
      if (name === 'dockerfile' || name === 'vercel.json') return;
      if (node.type === 'file' && node.content) {
        const lines = node.content.split('\n');
        lines.forEach((lineText, idx) => {
          if (lineText.toLowerCase().includes(searchQuery.toLowerCase())) {
            matches.push({
              fileId: node.id,
              fileName: node.name,
              line: idx + 1,
              text: lineText.trim()
            });
          }
        });
      }
    });

    setResults(matches);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div id="search_tools_panel" className="h-full flex flex-col justify-between bg-transparent text-slate-300 select-none">
      <div className="p-4 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search & Replace</span>
        </div>

        {/* Input box */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search phrase globally..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyPress}
              className="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
            />
          </div>

          <div className="relative">
            <RefreshCw className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Replace occurrences..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              className="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
            />
          </div>

          <button
            onClick={handleSearch}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md shadow-indigo-600/10"
          >
            Find Matches
          </button>
        </div>

        {/* Search Results list */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Search Matches ({results.length})
          </span>

          {results.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-white/10 rounded-xl bg-white/5 text-slate-500 text-xs">
              No occurrences found yet. Enter a query search word.
            </div>
          ) : (
            <div className="space-y-1 overflow-y-auto max-h-[300px] md:max-h-[calc(100vh-250px)] pr-1">
              {results.map((res, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectFile(res.fileId)}
                  className="p-2.5 bg-[#0a0a0f]/30 hover:bg-white/5 border border-white/5 rounded-lg cursor-pointer transition-colors text-left shadow-sm"
                >
                  <div className="flex items-center space-x-1.5 text-[10px] text-indigo-400 font-mono font-semibold">
                    <FileText className="h-3 w-3 text-slate-500" />
                    <span>{res.fileName}</span>
                    <span className="text-slate-500">•</span>
                    <span>Line {res.line}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1 truncate leading-relaxed">
                    {res.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <div className="p-4 border-t border-white/5 text-[10px] text-slate-500 flex items-center space-x-1">
        <span>Regex search options enabled by default</span>
      </div>
    </div>
  );
}
