import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

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

interface ChatContextType {
    messages: Message[]
    isLoading: boolean
    agentActivity: AgentActivity | null

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void

    // Agent actions
    cancelAgentTask: () => Promise<void>
    pauseAgentTask: () => void
    resumeAgentTask: () => void
    resetAgent: () => void

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
    const [agentActivity, setAgentActivity] = useState<AgentActivity | null>(null)

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
                }
            } catch (error) {
                console.error('Failed to load messages:', error)
            }
        }
        loadMessages()
    }, [])

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
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [])

    const cancelAgentTask = useCallback(async () => {
        try {
            await window.sidebarAPI.cancelAgent()
            setAgentActivity(prev => prev ? { ...prev, isRunning: false, isPaused: false } : null)
        } catch (error) {
            console.error('Failed to cancel agent:', error)
        }
    }, [])

    const pauseAgentTask = useCallback(() => {
        window.sidebarAPI.pauseAgent()
        setAgentActivity(prev => prev ? { ...prev, isPaused: true } : null)
    }, [])

    const resumeAgentTask = useCallback(() => {
        window.sidebarAPI.resumeAgent()
        setAgentActivity(prev => prev ? { ...prev, isPaused: false } : null)
    }, [])

    const resetAgent = useCallback(() => {
        setAgentActivity(null)
    }, [])

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
            // Convert CoreMessage format to our frontend Message format
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
        }

        // Listen for agent updates
        const handleAgentUpdate = (update: { type: string; data: any }) => {
            console.log('[ChatContext] Received agent update:', update.type, update.data)

            setAgentActivity(prev => {
                if (update.type === 'start') {
                    return {
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
                }

                if (!prev) return prev

                switch (update.type) {
                    case 'turn':
                        return { ...prev, currentTurn: update.data.turn }

                    case 'reasoning':
                        return { ...prev, currentReasoning: update.data.reasoning }

                    case 'screenshot':
                        return { ...prev, screenshot: update.data.screenshot || null }

                    case 'action':
                        return {
                            ...prev,
                            actions: [
                                ...prev.actions,
                                {
                                    id: `action-${Date.now()}-${Math.random()}`,
                                    type: update.data.name,
                                    args: update.data.args,
                                    status: 'pending',
                                    timestamp: Date.now(),
                                }
                            ]
                        }

                    case 'actionComplete':
                        return {
                            ...prev,
                            actions: prev.actions.map((action, index) =>
                                index === prev.actions.length - 1 && action.status === 'pending'
                                    ? {
                                        ...action,
                                        status: update.data.success ? 'completed' : 'failed',
                                        result: update.data.result
                                    }
                                    : action
                            )
                        }

                    case 'complete':
                        return {
                            ...prev,
                            isRunning: false,
                            finalResponse: update.data.finalResponse || 'Task completed successfully'
                        }

                    case 'error':
                        return {
                            ...prev,
                            isRunning: false,
                            error: update.data.error
                        }

                    case 'cancelled':
                        return { ...prev, isRunning: false, isPaused: false }

                    case 'paused':
                        return { ...prev, isPaused: true }

                    case 'resumed':
                        return { ...prev, isPaused: false }

                    default:
                        return prev
                }
            })
        }

        window.sidebarAPI.onChatResponse(handleChatResponse)
        window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)
        window.sidebarAPI.onAgentUpdate(handleAgentUpdate)

        return () => {
            window.sidebarAPI.removeChatResponseListener()
            window.sidebarAPI.removeMessagesUpdatedListener()
            window.sidebarAPI.removeAgentUpdateListener()
        }
    }, [])

    const value: ChatContextType = {
        messages,
        isLoading,
        agentActivity,
        sendMessage,
        clearChat,
        cancelAgentTask,
        pauseAgentTask,
        resumeAgentTask,
        resetAgent,
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