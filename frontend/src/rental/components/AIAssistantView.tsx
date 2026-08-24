import { Calendar, Car, DollarSign, ListTodo, Users, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useRef, useEffect, useCallback } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';
import { api, streamChatMessage } from '../../lib/api';
import type { ChatMessageResponse, ChatStreamEvent, ChatStreamTechnicalDetails } from '../../lib/api';
import { FleetChatStructuredContent } from './ai-chat/FleetChatStructuredContent';
import { FleetChatTechnicalErrorDetails } from './ai-chat/FleetChatTechnicalErrorDetails';
import { renderSafeMarkdown } from '../lib/ai-chat/safe-markdown';
import {
  mapProgressContent,
  sanitizeUserVisibleText,
} from '../lib/ai-chat/fleet-chat-response-display';
import type { FleetChatStructuredPayload } from '../lib/ai-chat/fleet-chat-response.types';

interface AIAssistantViewProps {
  isDarkMode: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  structured?: FleetChatStructuredPayload;
  isError?: boolean;
  technicalDetails?: ChatStreamTechnicalDetails;
}

export function AIAssistantView({ isDarkMode }: AIAssistantViewProps) {
  const { t, locale: appLocale } = useLanguage();
  const locale = appLocale === 'en' ? 'en' : 'de';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
          structured: m.structured,
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

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isTyping]);

  const handleSend = useCallback(
    (text?: string) => {
      const msg = text || input.trim();
      if (!msg || isTyping || !orgId) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: msg,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);
      setThinkingLabel(null);

      streamAbortRef.current?.abort();

      let settled = false;
      streamAbortRef.current = streamChatMessage(orgId, msg, (evt: ChatStreamEvent) => {
        if (evt.event === 'status') {
          if (evt.data.agentReady) setAgentReady(true);
        } else if (evt.event === 'progress') {
          if (evt.data.content) {
            setThinkingLabel(mapProgressContent(evt.data.type, evt.data.content, locale));
          }
        } else if (evt.event === 'result') {
          settled = true;
          if (!agentReady) setAgentReady(true);
          const aiMsg: ChatMessage = {
            id: evt.data.id || `ai-${Date.now()}`,
            role: 'assistant',
            content: sanitizeUserVisibleText(evt.data.content),
            timestamp: new Date(evt.data.createdAt),
            structured: evt.data.structured,
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else if (evt.event === 'error') {
          settled = true;
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: sanitizeUserVisibleText(
              evt.data.message || "I'm sorry, something went wrong. Please try again.",
            ),
            timestamp: new Date(),
            isError: true,
            technicalDetails: evt.data.technicalDetails,
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
      }, () => {
        if (!settled) {
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content:
              "It looks like there's a connection issue. Please check your network and try again.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
        setIsTyping(false);
        setThinkingLabel(null);
        streamAbortRef.current = null;
      });
    },
    [input, isTyping, orgId, agentReady, locale],
  );

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
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
    } catch {
      /* best-effort */
    }
  };

  const handleRetry = useCallback(
    (msgId: string) => {
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx < 1) return;
      const prevUserMsg = messages.slice(0, idx).reverse().find((m) => m.role === 'user');
      if (prevUserMsg) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        handleSend(prevUserMsg.content);
      }
    },
    [messages, handleSend],
  );

  const glass = 'surface-solid border border-border';

  const messageCount = messages.filter((m) => m.role === 'user').length;

  return (
    <div
      data-testid="ai-assistant-root"
      className="flex flex-1 min-h-0 min-w-0 w-full max-w-[1400px] mx-auto gap-0 overflow-hidden"
    >
      {/* Desktop sidebar — hidden on mobile to preserve chat column width */}
      <aside
        className={`hidden lg:flex w-[260px] shrink-0 rounded-l-2xl overflow-hidden flex-col min-w-0 ${glass}`}
        aria-label={t('aiChat.sidebar.info')}
      >
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

        <div className="px-3 pb-3">
          <div className={`rounded-lg p-3 surface-solid`}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  error
                    ? 'bg-status-attention'
                    : agentReady
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                } animate-pulse`}
              />
              <span className={`text-[11px] font-semibold text-muted-foreground`}>
                {error
                  ? t('aiChat.status.unavailable')
                  : agentReady
                    ? t('aiChat.status.available')
                    : t('aiChat.status.preparing')}
              </span>
            </div>
            <p className={`text-[10px] text-muted-foreground`}>
              {t('aiChat.branding.dataBasis')}
            </p>
            {messageCount > 0 && (
              <p className={`text-[10px] mt-1 text-muted-foreground`}>
                {t(messageCount === 1 ? 'aiChat.sessionMessage' : 'aiChat.sessionMessages', {
                  count: String(messageCount),
                })}
              </p>
            )}
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto px-3 pb-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: isDarkMode ? 'rgba(100,100,100,0.3) transparent' : 'rgba(200,200,200,0.5) transparent',
          }}
        >
          <div
            className={`text-xs font-semibold uppercase tracking-wider px-2 py-1.5 text-muted-foreground`}
          >
            {t('aiChat.capabilities')}
          </div>
          {capabilities.map((cap) => {
            const CapIcon = cap.icon;
            return (
              <div
                key={cap.key}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg mb-0.5 text-muted-foreground`}
              >
                <CapIcon
                  className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-purple-500/60' : 'text-purple-400/60'}`}
                />
                <span className="text-[11px] font-medium min-w-0 break-words">{t(cap.key as any)}</span>
              </div>
            );
          })}

          <div className={`mt-4 rounded-lg p-3 ${isDarkMode ? 'surface-premium' : 'bg-muted/60'}`}>
            <p className={`text-[10px] font-semibold mb-1 text-muted-foreground`}>
              {t('aiChat.aboutTitle')}
            </p>
            <p className={`text-[10px] leading-relaxed text-muted-foreground`}>
              {t('aiChat.aboutDesc')}
            </p>
          </div>
        </div>
      </aside>

      {/* Main chat column — single scroll region for messages */}
      <div
        data-testid="ai-chat-compose"
        className={`flex-1 flex flex-col min-h-0 min-w-0 rounded-2xl overflow-hidden ${glass}`}
      >
        <div
          className="shrink-0 px-3 py-2.5 border-b flex items-center gap-2 sm:gap-3 min-w-0 border-border/60"
        >
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}
          >
            <Icon name="sparkles" className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`text-base sm:text-lg font-semibold truncate text-foreground`}>
              {t('aiChat.title')}
            </h2>
            <p className={`text-[11px] sm:text-xs truncate text-muted-foreground`}>
              {t('aiChat.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleNewChat}
              title={t('aiChat.newChat')}
              className={`lg:hidden p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}
            >
              <Icon name="plus" className="w-4 h-4" />
            </button>
            {messages.length > 0 && (
              <button
                onClick={handleNewChat}
                title="Clear conversation"
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}
              >
                <Icon name="trash-2" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div
            className={`shrink-0 px-4 py-2 flex items-center gap-2 text-xs min-w-0 ${isDarkMode ? 'bg-red-900/20 text-red-400 border-b border-red-800/30' : 'bg-red-50 text-red-600 border-b border-red-100'}`}
          >
            <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-[10px] font-semibold hover:underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          data-testid="ai-chat-messages"
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: isDarkMode ? 'rgba(100,100,100,0.3) transparent' : 'rgba(200,200,200,0.5) transparent',
          }}
        >
          {!historyLoaded ? (
            <div className="flex items-center justify-center h-full min-h-[12rem]">
              <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
            </div>
          ) : messages.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-4 sm:mt-8 min-w-0">
              <div className="text-center mb-3">
                <div
                  className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-gradient-to-br from-purple-500/20 to-violet-500/15' : 'bg-gradient-to-br from-purple-100 to-violet-50'}`}
                >
                  <Icon name="sparkles" className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h2 className={`text-lg font-bold tracking-tight mb-2 text-foreground`}>
                  {t('aiChat.title')}
                </h2>
                <p className={`text-xs px-2 text-muted-foreground`}>
                  {t('aiChat.welcomeDesc')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-3">
                {capabilities.map((cap) => {
                  const CapIcon = cap.icon;
                  return (
                    <div
                      key={cap.key}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg min-w-0 surface-solid`}
                    >
                      <CapIcon className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                      <span className={`text-[11px] font-semibold min-w-0 break-words text-muted-foreground`}>
                        {t(cap.key as any)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-wider mb-3 text-center text-muted-foreground`}
                >
                  {t('aiChat.tryAsking')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {suggestions.map((s) => {
                    const SIcon = s.icon;
                    return (
                      <button
                        key={s.key}
                        onClick={() => handleSend(t(s.key as any))}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group min-w-0 surface-solid hover:bg-muted border border-border/60 hover:border-border"
                      >
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50'}`}
                        >
                          <SIcon className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                        </div>
                        <span className={`text-xs font-semibold min-w-0 break-words ${isDarkMode ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {t(s.key as any)}
                        </span>
                        <Icon
                          name="chevron-right"
                          className={`w-3.5 h-3.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5 min-w-0 w-full">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 sm:gap-3 min-w-0 w-full ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}
                    >
                      <Icon name="sparkles" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                    </div>
                  )}
                  <div
                    className={`min-w-0 max-w-[min(100%,42rem)] sm:max-w-[88%] lg:max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}
                  >
                    <div
                      className={`rounded-lg px-3 py-2 min-w-0 overflow-hidden break-words [overflow-wrap:anywhere] ${
                        msg.role === 'user'
                          ? isDarkMode
                            ? 'bg-purple-600/20 border border-purple-500/20'
                            : 'bg-purple-50 border border-purple-200/40'
                          : msg.isError
                            ? isDarkMode
                              ? 'bg-red-900/15 border border-red-800/30'
                              : 'bg-red-50 border border-red-100'
                            : isDarkMode
                              ? 'surface-premium'
                              : 'bg-muted/80'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className={`text-xs min-w-0 break-words text-foreground`}>
                          {msg.content}
                        </p>
                      ) : (
                        <div
                          className={`min-w-0 break-words [overflow-wrap:anywhere] ${isDarkMode ? 'text-muted-foreground' : 'text-foreground'}`}
                          role={msg.isError ? 'alert' : undefined}
                          aria-live={msg.isError ? 'polite' : undefined}
                        >
                          {msg.structured && !msg.isError ? (
                            <FleetChatStructuredContent
                              structured={msg.structured}
                              content={msg.content}
                              isDarkMode={isDarkMode}
                              locale={locale}
                            />
                          ) : (
                            <>
                              {renderSafeMarkdown(msg.content, { isDarkMode })}
                              {msg.isError && msg.technicalDetails && (
                                <FleetChatTechnicalErrorDetails
                                  technicalDetails={msg.technicalDetails}
                                  locale={locale}
                                  isDarkMode={isDarkMode}
                                />
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1 mt-1.5 ml-1">
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          {copiedId === msg.id ? (
                            <Icon name="check" className="w-3 h-3 text-green-500" />
                          ) : (
                            <Icon name="copy" className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          <Icon name="thumbs-up" className="w-3 h-3" />
                        </button>
                        <button
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          <Icon name="thumbs-down" className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleRetry(msg.id)}
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          <Icon name="rotate-ccw" className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDarkMode ? 'bg-status-ai-soft' : 'bg-status-info-soft/80'}`}
                    >
                      <Icon name="user" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-status-ai' : 'text-status-info'}`} />
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-2 sm:gap-3 min-w-0">
                  <div
                    className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}
                  >
                    <Icon name="sparkles" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  </div>
                  <div className={`rounded-lg px-3 py-2 surface-solid`}>
                    <div className="flex items-center gap-2">
                      <Icon
                        name="loader-2"
                        className={`w-3.5 h-3.5 animate-spin ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`}
                      />
                      <span className={`text-xs text-muted-foreground`}>
                        {thinkingLabel || t('aiChat.thinking')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div
          className="shrink-0 px-3 py-3 border-t pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-border/60"
        >
          <div className="max-w-3xl mx-auto min-w-0">
            <div
              className="flex items-end gap-2 sm:gap-3 rounded-lg px-3 py-2 min-w-0 bg-muted/80 border border-border focus-within:border-purple-300 transition-colors"
            >
              <textarea
                ref={inputRef}
                data-testid="ai-chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('aiChat.inputPlaceholder')}
                rows={1}
                className={`flex-1 min-w-0 bg-transparent outline-none text-xs resize-none max-h-32 placeholder:text-muted-foreground text-foreground`}
                style={{ minHeight: '24px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = '24px';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                aria-label={t('aiChat.send')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                  input.trim() && !isTyping
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon name="send" className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className={`text-[10px] sm:text-xs text-center mt-2 px-1 text-muted-foreground`}>
              {t('aiChat.footer', { basis: t('aiChat.branding.dataBasis') })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
