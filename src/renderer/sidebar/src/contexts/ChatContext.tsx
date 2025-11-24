import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

interface AgentAction {
    id: string
    type: string
    args: any
    status: 'pending' | 'completed' | 'failed'
    timestamp: number
    result?: any
    error?: string
}

interface AgentActivity {
    id: string
    type: 'agent-task'
    goal: string
    isRunning: boolean
    isPaused: boolean
    currentTurn: number
    maxTurns: number
    actions: AgentAction[]
    currentReasoning: string | null
    error: string | null
    finalResponse: string | null
    screenshot: string | null
    timestamp: number
}

interface ConversationMessageItem {
    id: string
    type: 'message'
    message: Message
}

interface ConversationAgentItem {
    id: string
    type: 'agent-activity'
    activity: AgentActivity
}

export type ConversationItem = ConversationMessageItem | ConversationAgentItem

interface ChatContextType {
    messages: Message[]
    isLoading: boolean
    conversationItems: ConversationItem[]
    activeAgentActivity: AgentActivity | null
    isAgentBusy: boolean

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void

    // Agent actions
    cancelAgentTask: () => Promise<void>
    pauseAgentTask: () => void
    resumeAgentTask: () => void
    dismissAgentActivity: (activityId: string) => void

    // Page content access
    getPageContent: () => Promise<string | null>
    getPageText: () => Promise<string | null>
    getCurrentUrl: () => Promise<string | null>
}

const ChatContext = createContext<ChatContextType | null>(null)

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [conversationItems, setConversationItems] = useState<ConversationItem[]>([])
    const [activeAgentItemId, setActiveAgentItemIdState] = useState<string | null>(null)
    const activeAgentItemIdRef = useRef<string | null>(null)

    const updateActiveAgentItemId = useCallback((id: string | null) => {
        activeAgentItemIdRef.current = id
        setActiveAgentItemIdState(id)
    }, [])

    const appendMessagesToConversation = useCallback((newMessages: Message[]) => {
        if (newMessages.length === 0) return
        setConversationItems(prev => {
            let changed = false
            const newMessageMap = new Map(newMessages.map(msg => [msg.id, msg]))
            const consumedIds = new Set<string>()

            const updated = prev.map(item => {
                if (item.type !== 'message') return item

                const latest = newMessageMap.get(item.message.id)
                if (!latest) return item

                consumedIds.add(latest.id)

                if (
                    latest.content !== item.message.content ||
                    latest.role !== item.message.role ||
                    latest.isStreaming !== item.message.isStreaming
                ) {
                    changed = true
                    return { ...item, message: latest }
                }

                return item
            })

            const additions: ConversationItem[] = newMessages
                .filter(msg => !consumedIds.has(msg.id))
                .map(msg => ({
                    id: msg.id,
                    type: 'message',
                    message: msg
                }))

            if (!changed && additions.length === 0) {
                return prev
            }

            return [...updated, ...additions]
        })
    }, [])

    // Load initial messages from main process
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const storedMessages = await window.sidebarAPI.getMessages()
                if (storedMessages && storedMessages.length > 0) {
                    // Convert CoreMessage format to our frontend Message format
                    const convertedMessages = storedMessages.map((msg: any, index: number) => ({
                        id: `msg-${index}`,
                        role: msg.role,
                        content: typeof msg.content === 'string'
                            ? msg.content
                            : msg.content.find((p: any) => p.type === 'text')?.text || '',
                        timestamp: Date.now(),
                        isStreaming: false
                    }))
                    setMessages(convertedMessages)
                    appendMessagesToConversation(convertedMessages)
                }
            } catch (error) {
                console.error('Failed to load messages:', error)
            }
        }
        loadMessages()
    }, [appendMessagesToConversation])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)

        try {
            const messageId = Date.now().toString()

            // Send message to main process (which will handle context)
            await window.sidebarAPI.sendChatMessage({
                message: content,
                messageId: messageId
            })

            // Messages will be updated via the chat-messages-updated event
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const clearChat = useCallback(async () => {
        try {
            await window.sidebarAPI.clearChat()
            setMessages([])
            setConversationItems([])
            updateActiveAgentItemId(null)
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [updateActiveAgentItemId])

    const applyAgentActivityUpdate = useCallback((updater: (activity: AgentActivity) => AgentActivity, targetId?: string) => {
        const resolvedId = targetId ?? activeAgentItemIdRef.current
        if (!resolvedId) return

        setConversationItems(prev =>
            prev.map(item =>
                item.type === 'agent-activity' && item.id === resolvedId
                    ? { ...item, activity: updater(item.activity) }
                    : item
            )
        )
    }, [])

    const cancelAgentTask = useCallback(async () => {
        try {
            await window.sidebarAPI.cancelAgent()
            applyAgentActivityUpdate(activity => ({
                ...activity,
                isRunning: false,
                isPaused: false
            }))
            updateActiveAgentItemId(null)
        } catch (error) {
            console.error('Failed to cancel agent:', error)
        }
    }, [applyAgentActivityUpdate, updateActiveAgentItemId])

    const pauseAgentTask = useCallback(() => {
        window.sidebarAPI.pauseAgent()
        applyAgentActivityUpdate(activity => ({ ...activity, isPaused: true }))
    }, [applyAgentActivityUpdate])

    const resumeAgentTask = useCallback(() => {
        window.sidebarAPI.resumeAgent()
        applyAgentActivityUpdate(activity => ({ ...activity, isPaused: false }))
    }, [applyAgentActivityUpdate])

    const dismissAgentActivity = useCallback((activityId: string) => {
        setConversationItems(prev => prev.filter(item =>
            !(item.type === 'agent-activity' && item.id === activityId)
        ))
        if (activeAgentItemIdRef.current === activityId) {
            updateActiveAgentItemId(null)
        }
    }, [updateActiveAgentItemId])

    const getPageContent = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageContent()
        } catch (error) {
            console.error('Failed to get page content:', error)
            return null
        }
    }, [])

    const getPageText = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageText()
        } catch (error) {
            console.error('Failed to get page text:', error)
            return null
        }
    }, [])

    const getCurrentUrl = useCallback(async () => {
        try {
            return await window.sidebarAPI.getCurrentUrl()
        } catch (error) {
            console.error('Failed to get current URL:', error)
            return null
        }
    }, [])

    // Set up message listeners
    useEffect(() => {
        // Listen for streaming response updates
        const handleChatResponse = (data: { messageId: string; content: string; isComplete: boolean }) => {
            if (data.isComplete) {
                setIsLoading(false)
            }
        }

        // Listen for message updates from main process
        const handleMessagesUpdated = (updatedMessages: any[]) => {
            const convertedMessages = updatedMessages.map((msg: any, index: number) => ({
                id: `msg-${index}`,
                role: msg.role,
                content: typeof msg.content === 'string'
                    ? msg.content
                    : msg.content.find((p: any) => p.type === 'text')?.text || '',
                timestamp: Date.now(),
                isStreaming: false
            }))
            setMessages(convertedMessages)
            appendMessagesToConversation(convertedMessages)
        }

        // Listen for agent updates
        const handleAgentUpdate = (update: { type: string; data: any }) => {
            console.log('[ChatContext] Received agent update:', update.type, update.data)

            switch (update.type) {
                case 'start': {
                    const activity: AgentActivity = {
                        id: `agent-${Date.now()}`,
                        type: 'agent-task',
                        goal: update.data.goal || 'Running agent task',
                        isRunning: true,
                        isPaused: false,
                        currentTurn: 0,
                        maxTurns: typeof update.data?.maxTurns === 'number' ? update.data.maxTurns : 20,
                        actions: [],
                        currentReasoning: null,
                        error: null,
                        finalResponse: null,
                        screenshot: null,
                        timestamp: Date.now()
                    }
                    const activityId = `agent-activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                    updateActiveAgentItemId(activityId)
                    setConversationItems(prev => [...prev, { id: activityId, type: 'agent-activity', activity }])
                    break
                }

                case 'turn':
                    applyAgentActivityUpdate(activity => ({ ...activity, currentTurn: update.data.turn }))
                    break

                case 'reasoning':
                    applyAgentActivityUpdate(activity => ({ ...activity, currentReasoning: update.data.reasoning }))
                    break

                case 'screenshot':
                    applyAgentActivityUpdate(activity => ({ ...activity, screenshot: update.data.screenshot || null }))
                    break

                case 'action':
                    applyAgentActivityUpdate(activity => ({
                        ...activity,
                        actions: [
                            ...activity.actions,
                            {
                                id: `action-${Date.now()}-${Math.random()}`,
                                type: update.data.name,
                                args: update.data.args,
                                status: 'pending',
                                timestamp: Date.now()
                            }
                        ]
                    }))
                    break

                case 'actionComplete':
                    applyAgentActivityUpdate(activity => ({
                        ...activity,
                        actions: activity.actions.map((action, index) =>
                            index === activity.actions.length - 1 && action.status === 'pending'
                                ? {
                                    ...action,
                                    status: update.data.success ? 'completed' : 'failed',
                                    result: update.data.result
                                }
                                : action
                        )
                    }))
                    break

                case 'complete':
                    applyAgentActivityUpdate(activity => ({
                        ...activity,
                        isRunning: false,
                        finalResponse: update.data.finalResponse || 'Task completed successfully',
                        currentReasoning: null
                    }))
                    updateActiveAgentItemId(null)
                    break

                case 'error':
                    applyAgentActivityUpdate(activity => ({
                        ...activity,
                        isRunning: false,
                        error: update.data.error,
                        currentReasoning: null
                    }))
                    updateActiveAgentItemId(null)
                    break

                case 'cancelled':
                    applyAgentActivityUpdate(activity => ({
                        ...activity,
                        isRunning: false,
                        isPaused: false,
                        currentReasoning: null
                    }))
                    updateActiveAgentItemId(null)
                    break

                case 'paused':
                    applyAgentActivityUpdate(activity => ({ ...activity, isPaused: true }))
                    break

                case 'resumed':
                    applyAgentActivityUpdate(activity => ({ ...activity, isPaused: false }))
                    break

                default:
                    break
            }
        }

        window.sidebarAPI.onChatResponse(handleChatResponse)
        window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)
        window.sidebarAPI.onAgentUpdate(handleAgentUpdate)

        return () => {
            window.sidebarAPI.removeChatResponseListener()
            window.sidebarAPI.removeMessagesUpdatedListener()
            window.sidebarAPI.removeAgentUpdateListener()
        }
    }, [appendMessagesToConversation, updateActiveAgentItemId])

    const activeAgentActivity = useMemo(() => {
        if (!activeAgentItemId) return null
        const entry = conversationItems.find(item => item.type === 'agent-activity' && item.id === activeAgentItemId) as ConversationAgentItem | undefined
        return entry?.activity ?? null
    }, [activeAgentItemId, conversationItems])

    const isAgentBusy = !!(activeAgentActivity && activeAgentActivity.isRunning)

    const value: ChatContextType = {
        messages,
        isLoading,
        conversationItems,
        activeAgentActivity,
        isAgentBusy,
        sendMessage,
        clearChat,
        cancelAgentTask,
        pauseAgentTask,
        resumeAgentTask,
        dismissAgentActivity,
        getPageContent,
        getPageText,
        getCurrentUrl
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}