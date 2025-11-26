import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { ArrowUp, Plus, RefreshCcw } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { cn } from '@common/lib/utils'
import { Button } from '@common/components/Button'
import { AgentActivityCard } from './AgentActivityCard'
import { Suggestion, Suggestions } from './ai-elements/Suggestions'

const SMART_SUGGESTION_COUNT = 3

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

// Auto-scroll hook
const useAutoScroll = (count: number) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevCount = useRef(0)

    useLayoutEffect(() => {
        if (count > prevCount.current) {
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'end'
                })
            }, 100)
        }
        prevCount.current = count
    }, [count])

    return scrollRef
}

// User Message Component - appears on the right
const UserMessage: React.FC<{ content: string }> = ({ content }) => (
    <div className="relative max-w-[85%] ml-auto animate-fade-in">
        <div className="bg-muted dark:bg-muted/50 rounded-3xl px-6 py-4">
            <div className="text-foreground" style={{ whiteSpace: 'pre-wrap' }}>
                {content}
            </div>
        </div>
    </div>
)

// Streaming Text Component
const StreamingText: React.FC<{ content: string }> = ({ content }) => {
    const [displayedContent, setDisplayedContent] = useState('')
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        if (currentIndex < content.length) {
            const timer = setTimeout(() => {
                setDisplayedContent(content.slice(0, currentIndex + 1))
                setCurrentIndex(currentIndex + 1)
            }, 10)
            return () => clearTimeout(timer)
        }
        return undefined
    }, [content, currentIndex])

    return (
        <div className="whitespace-pre-wrap text-foreground">
            {displayedContent}
            {currentIndex < content.length && (
                <span className="inline-block w-2 h-5 bg-primary/60 dark:bg-primary/40 ml-0.5 animate-pulse" />
            )}
        </div>
    )
}

// Markdown Renderer Component
const Markdown: React.FC<{ content: string }> = ({ content }) => (
    <div className="prose prose-sm dark:prose-invert max-w-none
                    prose-headings:text-foreground prose-p:text-foreground
                    prose-strong:text-foreground prose-ul:text-foreground
                    prose-ol:text-foreground prose-li:text-foreground
                    prose-a:text-primary hover:prose-a:underline
                    prose-code:bg-muted prose-code:px-1 prose-code:py-0.5
                    prose-code:rounded prose-code:text-sm prose-code:text-foreground
                    prose-pre:bg-muted dark:prose-pre:bg-muted/50 prose-pre:p-3
                    prose-pre:rounded-lg prose-pre:overflow-x-auto">
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                // Custom code block styling
                code: ({ node, className, children, ...props }) => {
                    const inline = !className
                    return inline ? (
                        <code className="bg-muted dark:bg-muted/50 px-1 py-0.5 rounded text-sm text-foreground" {...props}>
                            {children}
                        </code>
                    ) : (
                        <code className={className} {...props}>
                            {children}
                        </code>
                    )
                },
                // Custom link styling
                a: ({ children, href }) => (
                    <a
                        href={href}
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {children}
                    </a>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    </div>
)

// Assistant Message Component - appears on the left
const AssistantMessage: React.FC<{ content: string; isStreaming?: boolean }> = ({
    content,
    isStreaming
}) => (
    <div className="relative w-full animate-fade-in">
        <div className="py-1">
            {isStreaming ? (
                <StreamingText content={content} />
            ) : (
                <Markdown content={content} />
            )}
        </div>
    </div>
)

// Loading Indicator with spinning star
const LoadingIndicator: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        setIsVisible(true)
    }, [])

    return (
        <div className={cn(
            "transition-transform duration-300 ease-in-out",
            isVisible ? "scale-100" : "scale-0"
        )}>
            ...
        </div>
    )
}

// Smart Suggestions Component
const SmartSuggestions: React.FC<{
    suggestions: string[]
    isLoading: boolean
    error: string | null
    disabled: boolean
    onSelect: (suggestion: string) => void
    onRefresh: () => void
    collapsed: boolean
    onToggleCollapsed: () => void
}> = ({ suggestions, isLoading, error, disabled, onSelect, onRefresh, collapsed, onToggleCollapsed }) => {
    const renderPlaceholder = () => (
        <Suggestions className="mt-3">
            {Array.from({ length: SMART_SUGGESTION_COUNT }).map((_, index) => (
                <div
                    key={`placeholder-${index}`}
                    className="h-8 w-32 rounded-full bg-muted/60 dark:bg-muted/40 animate-pulse"
                />
            ))}
        </Suggestions>
    )

    return (
        <div className="w-full rounded-3xl border border-border/70 bg-secondary/20 p-4 shadow-inner shadow-primary/5">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Smart suggestions</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isLoading}
                        className={cn(
                            'inline-flex size-7 items-center justify-center rounded-full border border-transparent text-muted-foreground/80 transition hover:border-border hover:text-foreground',
                            isLoading && 'cursor-not-allowed opacity-60'
                        )}
                        aria-label="Refresh smart suggestions"
                    >
                        <RefreshCcw className={cn('size-3.5', isLoading && 'animate-spin')} />
                    </button>
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className="rounded-full border border-border px-3 py-1 text-[11px] font-medium text-foreground/70 transition hover:border-primary/40 hover:text-primary"
                    >
                        {collapsed ? 'Show' : 'Hide'}
                    </button>
                </div>
            </div>

            {error && !collapsed && (
                <p className="mt-2 text-[11px] text-destructive">{error}</p>
            )}

            {collapsed ? (
                <p className="mt-2 text-[11px] text-muted-foreground">Suggestions hidden. Tap Show.</p>
            ) : suggestions.length === 0 && isLoading ? (
                renderPlaceholder()
            ) : (
                <Suggestions className="mt-3">
                    {suggestions.map((suggestion) => (
                        <Suggestion
                            key={suggestion}
                            suggestion={suggestion}
                            disabled={disabled}
                            onClick={onSelect}
                        />
                    ))}
                </Suggestions>
            )}
        </div>
    )
}

// Chat Input Component
const ChatInput: React.FC<{
    onSend: (message: string) => void
    disabled: boolean
}> = ({ onSend, disabled }) => {
    const [value, setValue] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            const scrollHeight = textareaRef.current.scrollHeight
            const newHeight = Math.min(scrollHeight, 200) // Max 200px
            textareaRef.current.style.height = `${newHeight}px`
        }
    }, [value])

    const handleSubmit = () => {
        if (value.trim() && !disabled) {
            onSend(value.trim())
            setValue('')
            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = '24px'
            }
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <div className={cn(
            "w-full border p-3 rounded-3xl bg-background dark:bg-secondary",
            "shadow-chat animate-spring-scale outline-none transition-all duration-200",
            isFocused ? "border-primary/20 dark:border-primary/30" : "border-border"
        )}>
            {/* Input Area */}
            <div className="w-full px-3 py-2">
                <div className="w-full flex items-start gap-3">
                    <div className="relative flex-1 overflow-hidden">
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            onKeyDown={handleKeyDown}
                            placeholder="Send a message..."
                            className="w-full resize-none outline-none bg-transparent
                                     text-foreground placeholder:text-muted-foreground
                                     min-h-[24px] max-h-[200px]"
                            rows={1}
                            style={{ lineHeight: '24px' }}
                        />
                    </div>
                </div>
            </div>

            {/* Send Button */}
            <div className="w-full flex items-center gap-1.5 px-1 mt-2 mb-1">
                <div className="flex-1" />
                <button
                    onClick={handleSubmit}
                    disabled={disabled || !value.trim()}
                    className={cn(
                        "size-9 rounded-full flex items-center justify-center",
                        "transition-all duration-200",
                        "bg-primary text-primary-foreground",
                        "hover:opacity-80 disabled:opacity-50"
                    )}
                >
                    <ArrowUp className="size-5" />
                </button>
            </div>
        </div>
    )
}

// Conversation Turn Component
interface ConversationTurn {
    user?: Message
    assistant?: Message
}

const ConversationTurnComponent: React.FC<{
    turn: ConversationTurn
    isLoading?: boolean
}> = ({ turn, isLoading }) => (
    <div className="pt-12 flex flex-col gap-8">
        {turn.user && <UserMessage content={turn.user.content} />}
        {turn.assistant && (
            <AssistantMessage
                content={turn.assistant.content}
                isStreaming={turn.assistant.isStreaming}
            />
        )}
        {isLoading && (
            <div className="flex justify-start">
                <LoadingIndicator />
            </div>
        )}
    </div>
)

// Main Chat Component
export const Chat: React.FC = () => {
    const {
        conversationItems,
        isLoading,
        isAgentBusy,
        sendMessage,
        clearChat,
        cancelAgentTask,
        pauseAgentTask,
        resumeAgentTask,
        dismissAgentActivity,
        getCurrentUrl
    } = useChat()
    const scrollRef = useAutoScroll(conversationItems.length)
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)
    const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
    const fetchPromiseRef = useRef<Promise<void> | null>(null)
    const hasFetchedSuggestionsRef = useRef(false)
    const currentUrlRef = useRef<string | null>(null)
    const assistantKeyRef = useRef<string>('initial')
    const [areSuggestionsCollapsed, setAreSuggestionsCollapsed] = useState(false)

    const lastItem = conversationItems[conversationItems.length - 1]
    const showLoadingAfterLastTurn = isLoading &&
        lastItem?.type === 'message' &&
        lastItem.message.role === 'user'

    const normalizeNarrative = useCallback((value: string | null | undefined) => {
        if (!value) return ''
        return value
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[“”"'.!,;:]/g, '')
            .trim()
    }, [])

    const agentNarrativeCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const item of conversationItems) {
            if (item.type !== 'agent-activity') continue
            if (item.activity.isRunning) continue

            const finalResponse = normalizeNarrative(item.activity.finalResponse)
            const error = normalizeNarrative(item.activity.error)

            if (finalResponse) {
                counts.set(finalResponse, (counts.get(finalResponse) ?? 0) + 1)
            }

            if (error) {
                counts.set(error, (counts.get(error) ?? 0) + 1)
            }
        }
        return counts
    }, [conversationItems, normalizeNarrative])

    const narrativeCounts = new Map(agentNarrativeCounts)

    const shouldHideAssistantNarrative = (content: string) => {
        const normalized = normalizeNarrative(content)
        if (!normalized) return false
        const remaining = narrativeCounts.get(normalized)
        if (!remaining) return false
        if (remaining <= 1) {
            narrativeCounts.delete(normalized)
        } else {
            narrativeCounts.set(normalized, remaining - 1)
        }
        return true
    }

    const fetchSuggestions = useCallback(async (options?: { force?: boolean }) => {
        if (fetchPromiseRef.current) {
            if (!options?.force) {
                return fetchPromiseRef.current
            }
            try {
                await fetchPromiseRef.current
            } catch {
                // ignored - previous error already surfaced
            }
        }

        const nextFetch = (async () => {
            setSuggestionsError(null)
            setIsSuggestionsLoading(true)
            try {
                const result = await window.sidebarAPI.getSmartSuggestions(SMART_SUGGESTION_COUNT)
                if (Array.isArray(result) && result.length > 0) {
                    setSuggestions(result)
                } else {
                    setSuggestions([])
                }
            } catch (error) {
                console.error('Failed to load smart suggestions:', error)
                setSuggestionsError("Couldn't load suggestions. Try again.")
            } finally {
                setIsSuggestionsLoading(false)
                fetchPromiseRef.current = null
            }
        })()

        fetchPromiseRef.current = nextFetch
        return nextFetch
    }, [])

    const lastAssistantMessageKey = useMemo(() => {
        for (let i = conversationItems.length - 1; i >= 0; i--) {
            const item = conversationItems[i]
            if (item.type === 'message' && item.message.role === 'assistant') {
                return `${item.message.id}-${item.message.content.length}`
            }
        }
        return 'none'
    }, [conversationItems])

    useEffect(() => {
        let cancelled = false

        const maybeRefetch = async () => {
            let url: string | null = null
            try {
                url = await getCurrentUrl()
            } catch (error) {
                console.warn('Failed to resolve current URL for suggestions:', error)
            }

            if (cancelled) return

            const normalizedUrl = url ?? null
            const urlChanged = normalizedUrl !== currentUrlRef.current
            const assistantChanged = lastAssistantMessageKey !== assistantKeyRef.current

            if (!hasFetchedSuggestionsRef.current || urlChanged || assistantChanged) {
                currentUrlRef.current = normalizedUrl
                assistantKeyRef.current = lastAssistantMessageKey
                hasFetchedSuggestionsRef.current = true
                await fetchSuggestions()
            }
        }

        maybeRefetch()

        return () => {
            cancelled = true
        }
    }, [getCurrentUrl, lastAssistantMessageKey, fetchSuggestions])

    const handleRefreshSuggestions = useCallback(() => {
        fetchSuggestions({ force: true })
    }, [fetchSuggestions])

    const handleSuggestionSelect = useCallback(async (suggestion: string) => {
        const trimmed = suggestion.trim()
        if (!trimmed || isLoading || isAgentBusy) return
        setAreSuggestionsCollapsed(true)
        try {
            await sendMessage(trimmed)
        } catch (error) {
            console.error('Failed to send suggestion as message:', error)
        } finally {
            fetchSuggestions({ force: true })
        }
    }, [isLoading, isAgentBusy, sendMessage, fetchSuggestions])

    const handleToggleSuggestionsCollapsed = useCallback(() => {
        setAreSuggestionsCollapsed(prev => !prev)
    }, [])

    const handleUserSend = useCallback((content: string) => {
        const normalized = content.trim()
        if (!normalized) return
        setAreSuggestionsCollapsed(true)
        sendMessage(normalized)
        fetchSuggestions({ force: true })
    }, [sendMessage, fetchSuggestions])

    const renderedConversation: React.ReactNode[] = []
    for (let i = 0; i < conversationItems.length; i++) {
        const item = conversationItems[i]

        if (item.type === 'message') {
            if (item.message.role === 'assistant' && shouldHideAssistantNarrative(item.message.content)) {
                continue
            }
            if (item.message.role === 'user') {
                const turn: ConversationTurn = { user: item.message }
                const next = conversationItems[i + 1]
                if (next?.type === 'message' && next.message.role === 'assistant') {
                    turn.assistant = next.message
                    i++
                }
                const shouldShowLoading = showLoadingAfterLastTurn && !turn.assistant && i === conversationItems.length - 1
                renderedConversation.push(
                    <ConversationTurnComponent
                        key={`turn-${turn.user?.id ?? turn.assistant?.id ?? i}`}
                        turn={turn}
                        isLoading={shouldShowLoading}
                    />
                )
            } else {
                renderedConversation.push(
                    <ConversationTurnComponent
                        key={`turn-${item.id}`}
                        turn={{ assistant: item.message }}
                    />
                )
            }
            continue
        }

        renderedConversation.push(
            <div className="pt-12" key={item.id}>
                <AgentActivityCard
                    goal={item.activity.goal}
                    isRunning={item.activity.isRunning}
                    isPaused={item.activity.isPaused}
                    currentTurn={item.activity.currentTurn}
                    maxTurns={item.activity.maxTurns}
                    actions={item.activity.actions}
                    currentReasoning={item.activity.currentReasoning}
                    error={item.activity.error}
                    finalResponse={item.activity.finalResponse}
                    screenshot={item.activity.screenshot}
                    onCancel={cancelAgentTask}
                    onPause={pauseAgentTask}
                    onResume={resumeAgentTask}
                    onReset={() => dismissAgentActivity(item.id)}
                />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="h-8 max-w-3xl mx-auto px-4">
                    {/* New Chat Button - Floating */}
                    {conversationItems.some(item => item.type === 'message') && (
                        <Button
                            onClick={clearChat}
                            title="Start new chat"
                            variant="ghost"
                        >
                            <Plus className="size-4" />
                            New Chat
                        </Button>
                    )}
                </div>

                <div className="pb-4 relative max-w-3xl mx-auto px-4">

                    {conversationItems.length === 0 ? (
                        // Empty State
                        <div className="flex items-center justify-center h-full min-h-[400px]">
                            <div className="text-center animate-fade-in max-w-md mx-auto gap-2 flex flex-col">
                                <h3 className="text-2xl font-bold">🫐</h3>
                                <p className="text-muted-foreground text-sm">
                                    Press ⌘E to toggle the sidebar
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {renderedConversation}
                        </>
                    )}

                    {/* Scroll anchor */}
                    <div ref={scrollRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 flex flex-col gap-3">
                <SmartSuggestions
                    suggestions={suggestions}
                    isLoading={isSuggestionsLoading}
                    error={suggestionsError}
                    disabled={isLoading || isAgentBusy}
                    onSelect={handleSuggestionSelect}
                    onRefresh={handleRefreshSuggestions}
                    collapsed={areSuggestionsCollapsed}
                    onToggleCollapsed={handleToggleSuggestionsCollapsed}
                />
                <ChatInput
                    onSend={handleUserSend}
                    disabled={isLoading || isAgentBusy}
                />
            </div>
        </div>
    )
}