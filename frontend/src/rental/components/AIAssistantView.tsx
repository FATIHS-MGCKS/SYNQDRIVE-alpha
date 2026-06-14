import { Calendar, Car, DollarSign, ListTodo, Users, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useRef, useEffect, useCallback } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';
import { api, streamChatMessage } from '../../lib/api';
import type { ChatMessageResponse, ChatStreamEvent } from '../../lib/api';

interface AIAssistantViewProps {
  isDarkMode: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIAssistantView({ isDarkMode }: AIAssistantViewProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const suggestions = [
    { key: 'aiChat.suggestion.fleetStatus', icon: Car },
    { key: 'aiChat.suggestion.revenue', icon: DollarSign },
    { key: 'aiChat.suggestion.maintenance', icon: Wrench },
    { key: 'aiChat.suggestion.bookings', icon: Calendar },
    { key: 'aiChat.suggestion.topVehicles', icon: Car },
    { key: 'aiChat.suggestion.overdueTasks', icon: ListTodo },
  ];

  const capabilities = [
    { key: 'aiChat.cap.fleet', icon: Car },
    { key: 'aiChat.cap.bookings', icon: Calendar },
    { key: 'aiChat.cap.finance', icon: DollarSign },
    { key: 'aiChat.cap.maintenance', icon: Wrench },
    { key: 'aiChat.cap.customers', icon: Users },
    { key: 'aiChat.cap.tasks', icon: ListTodo },
  ];

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    (async () => {
      try {
        const [agentInfo, history] = await Promise.all([
          api.chat.getAgent(orgId),
          api.chat.getHistory(orgId, 200),
        ]);

        if (cancelled) return;

        if (agentInfo.agent) setAgentReady(true);

        const loaded: ChatMessage[] = history.map((m: ChatMessageResponse) => ({
          id: m.id || `hist-${Date.now()}-${Math.random()}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.createdAt),
        }));

        setMessages(loaded);
        setHistoryLoaded(true);
      } catch (err: any) {
        if (!cancelled) {
          setHistoryLoaded(true);
          setError(err?.message || 'Failed to load chat history');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback((text?: string) => {
    const msg = text || input.trim();
    if (!msg || isTyping || !orgId) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setThinkingLabel(null);

    // Cancel any in-flight stream before starting a new one.
    streamAbortRef.current?.abort();

    let settled = false;
    streamAbortRef.current = streamChatMessage(
      orgId,
      msg,
      (evt: ChatStreamEvent) => {
        if (evt.event === 'status') {
          if (evt.data.agentReady) setAgentReady(true);
        } else if (evt.event === 'progress') {
          if (evt.data.content) setThinkingLabel(evt.data.content);
        } else if (evt.event === 'result') {
          settled = true;
          if (!agentReady) setAgentReady(true);
          const aiMsg: ChatMessage = {
            id: evt.data.id || `ai-${Date.now()}`,
            role: 'assistant',
            content: evt.data.content,
            timestamp: new Date(evt.data.createdAt),
          };
          setMessages(prev => [...prev, aiMsg]);
        } else if (evt.event === 'error') {
          settled = true;
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: evt.data.message || "I'm sorry, something went wrong. Please try again.",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      },
      () => {
        // onDone — connection closed; surface a fallback only if nothing arrived.
        if (!settled) {
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: "It looks like there's a connection issue. Please check your network and try again.",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
        }
        setIsTyping(false);
        setThinkingLabel(null);
        streamAbortRef.current = null;
      },
    );
  }, [input, isTyping, orgId, agentReady]);

  useEffect(() => {
    return () => { streamAbortRef.current?.abort(); };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNewChat = async () => {
    if (!orgId) return;
    setMessages([]);
    setInput('');
    setError(null);
    try {
      await api.chat.clearHistory(orgId);
    } catch { /* best-effort */ }
  };

  const handleRetry = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 1) return;
    const prevUserMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
    if (prevUserMsg) {
      setMessages(prev => prev.filter(m => m.id !== msgId));
      handleSend(prevUserMsg.content);
    }
  }, [messages, handleSend]);

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800'
    : 'bg-white border border-gray-200';

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: import('react').ReactElement[] = [];
    let tableMode = false;
    let tableRows: string[][] = [];
    let tableHeaders: string[] = [];

    const flushTable = () => {
      if (tableHeaders.length > 0) {
        elements.push(
          <div key={`table-${elements.length}`} className="my-3 overflow-x-auto">
            <table className={`w-full text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <thead>
                <tr className={isDarkMode ? 'border-b border-neutral-700' : 'border-b border-gray-200'}>
                  {tableHeaders.map((h, i) => (
                    <th key={i} className={`px-3 py-2 text-left text-[11px] font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{h.trim()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri} className={isDarkMode ? 'border-b border-neutral-800' : 'border-b border-gray-100'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-xs">{cell.trim()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableHeaders = [];
      tableRows = [];
      tableMode = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').filter(c => c.trim() !== '');
        if (!tableMode) {
          tableMode = true;
          tableHeaders = cells;
          continue;
        }
        if (cells.every(c => /^[-:]+$/.test(c.trim()))) continue;
        tableRows.push(cells);
        continue;
      } else if (tableMode) {
        flushTable();
      }

      if (!line.trim()) {
        elements.push(<div key={`br-${i}`} className="h-2" />);
        continue;
      }

      let processed = line;

      if (/^\d+\.\s/.test(processed)) {
        const content = processed.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={`li-${i}`} className="flex gap-2 ml-1 mb-1">
            <span className={`text-xs shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{processed.match(/^\d+/)?.[0]}.</span>
            <span className="text-[10px]" dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        );
        continue;
      }

      if (processed.startsWith('- ')) {
        const content = processed.slice(2);
        elements.push(
          <div key={`bullet-${i}`} className="flex gap-2 ml-1 mb-1">
            <span className={`text-xs shrink-0 mt-1 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`}>•</span>
            <span className="text-[10px]" dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        );
        continue;
      }

      elements.push(
        <p key={`p-${i}`} className="text-xs mb-1" dangerouslySetInnerHTML={{ __html: processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
      );
    }

    if (tableMode) flushTable();

    return elements;
  };

  const messageCount = messages.filter(m => m.role === 'user').length;

  return (
    <div className="flex h-[calc(100vh-120px)] max-w-[1400px] mx-auto gap-0">
      {/* Left sidebar - Chat info */}
      <div className={`w-[260px] shrink-0 rounded-l-2xl overflow-hidden flex flex-col ${glass}`}>
        {/* New chat button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              isDarkMode
                ? 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/20'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/50'
            }`}
          >
            <Icon name="plus" className="w-5 h-5" />
            {t('aiChat.newChat')}
          </button>
        </div>

        {/* Agent status */}
        <div className="px-3 pb-3">
          <div className={`rounded-lg p-3 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50/80'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${agentReady ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
              <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {agentReady ? 'DIMO Agent Connected' : 'Agent Initializing...'}
              </span>
            </div>
            <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Powered by DIMO Vehicle Intelligence
            </p>
            {messageCount > 0 && (
              <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {messageCount} message{messageCount !== 1 ? 's' : ''} in this session
              </p>
            )}
          </div>
        </div>

        {/* Capabilities */}
        <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'thin', scrollbarColor: isDarkMode ? 'rgba(100,100,100,0.3) transparent' : 'rgba(200,200,200,0.5) transparent' }}>
          <div className={`text-xs font-semibold uppercase tracking-wider px-2 py-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            Capabilities
          </div>
          {capabilities.map(cap => {
            const Icon = cap.icon;
            return (
              <div key={cap.key} className={`flex items-center gap-2 px-2 py-2 rounded-lg mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-purple-500/60' : 'text-purple-400/60'}`} />
                <span className="text-[11px] font-medium">{t(cap.key as any)}</span>
              </div>
            );
          })}

          <div className={`mt-4 rounded-lg p-3 ${isDarkMode ? 'bg-neutral-800/40' : 'bg-gray-50/60'}`}>
            <p className={`text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>About this assistant</p>
            <p className={`text-[10px] leading-relaxed ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              This AI assistant uses the DIMO Agents API to analyze your fleet data, vehicle telemetry, and operational metrics in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className={`flex-1 flex flex-col rounded-r-2xl overflow-hidden border-l-0 ${glass}`} style={{ borderLeft: 'none' }}>
        {/* Chat header */}
        <div className={`px-3 py-2.5 border-b flex items-center gap-3 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}>
            <Icon name="sparkles" className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          </div>
          <div className="flex-1">
            <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('aiChat.title')}</h2>
            <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('aiChat.subtitle')}</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              title="Clear conversation"
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <Icon name="trash-2" className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className={`px-4 py-2 flex items-center gap-2 text-xs ${isDarkMode ? 'bg-red-900/20 text-red-400 border-b border-red-800/30' : 'bg-red-50 text-red-600 border-b border-red-100'}`}>
            <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-[10px] font-semibold hover:underline">Dismiss</button>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'thin', scrollbarColor: isDarkMode ? 'rgba(100,100,100,0.3) transparent' : 'rgba(200,200,200,0.5) transparent' }}>
          {!historyLoaded ? (
            <div className="flex items-center justify-center h-full">
              <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
            </div>
          ) : messages.length === 0 ? (
            /* Welcome screen */
            <div className="max-w-2xl mx-auto mt-8">
              <div className="text-center mb-3">
                <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-gradient-to-br from-purple-500/20 to-violet-500/15' : 'bg-gradient-to-br from-purple-100 to-violet-50'}`}>
                  <Icon name="sparkles" className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h2 className={`text-lg font-bold tracking-tight mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('aiChat.title')}</h2>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('aiChat.welcomeDesc')}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                {capabilities.map(cap => {
                  const Icon = cap.icon;
                  return (
                    <div key={cap.key} className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50/80'}`}>
                      <Icon className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                      <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t(cap.key as any)}</span>
                    </div>
                  );
                })}
              </div>

              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Try asking...
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {suggestions.map(s => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.key}
                        onClick={() => handleSend(t(s.key as any))}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all group ${
                          isDarkMode
                            ? 'bg-neutral-800/40 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700'
                            : 'bg-white hover:bg-gray-50 border border-gray-200/60 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
                          <Icon className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                        </div>
                        <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t(s.key as any)}</span>
                        <Icon name="chevron-right" className={`w-3.5 h-3.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Chat messages */
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}>
                      <Icon name="sparkles" className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                    </div>
                  )}
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                    <div className={`rounded-lg px-3 py-2 ${
                      msg.role === 'user'
                        ? isDarkMode
                          ? 'bg-purple-600/20 border border-purple-500/20'
                          : 'bg-purple-50 border border-purple-200/40'
                        : isDarkMode
                          ? 'bg-neutral-800'
                          : 'bg-gray-50/80'
                    }`}>
                      {msg.role === 'user' ? (
                        <p className={`text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{msg.content}</p>
                      ) : (
                        <div className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                          {renderMarkdown(msg.content)}
                        </div>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1 mt-1.5 ml-1">
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}
                        >
                          {copiedId === msg.id ? <Icon name="check" className="w-3 h-3 text-green-500" /> : <Icon name="copy" className="w-3 h-3" />}
                        </button>
                        <button className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                          <Icon name="thumbs-up" className="w-3 h-3" />
                        </button>
                        <button className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                          <Icon name="thumbs-down" className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleRetry(msg.id)}
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}
                        >
                          <Icon name="rotate-ccw" className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDarkMode ? 'bg-indigo-500/15' : 'bg-indigo-100/80'}`}>
                      <Icon name="user" className={`w-5 h-5 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}>
                    <Icon name="sparkles" className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  </div>
                  <div className={`rounded-lg px-3 py-2 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50/80'}`}>
                    <div className="flex items-center gap-2">
                      <Icon name="loader-2" className={`w-3.5 h-3.5 animate-spin ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                      <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{thinkingLabel || t('aiChat.thinking')}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className={`px-3 py-3 border-t ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
          <div className="max-w-3xl mx-auto">
            <div className={`flex items-end gap-3 rounded-lg px-3 py-2 ${
              isDarkMode
                ? 'bg-neutral-800 border border-neutral-700 focus-within:border-purple-500/40'
                : 'bg-gray-50/80 border border-gray-200 focus-within:border-purple-300'
            } transition-colors`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('aiChat.inputPlaceholder')}
                rows={1}
                className={`flex-1 bg-transparent outline-none text-xs resize-none max-h-32 placeholder:text-gray-400 ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}
                style={{ minHeight: '24px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = '24px';
                  target.style.height = target.scrollHeight + 'px';
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                  input.trim() && !isTyping
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                    : isDarkMode ? 'bg-neutral-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                }`}
              >
                <Icon name="send" className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className={`text-xs text-center mt-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              SYNQDRIVE AI · Powered by DIMO Agents · Verify important fleet data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
