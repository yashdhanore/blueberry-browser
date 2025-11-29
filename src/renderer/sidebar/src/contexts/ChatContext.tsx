import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void

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
    const [agentMessages, setAgentMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(new Set())

    // Load initial messages from main process
    useEffect(() => {
        const loadMessages = async () => {
            try {
                // Load LLM chat messages
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

                // Load agent messages
                const storedAgentMessages = await window.sidebarAPI.getAgentMessages()
                if (storedAgentMessages && storedAgentMessages.length > 0) {
                    const convertedAgentMessages = storedAgentMessages.map((msg: any) => ({
                        id: msg.id,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp,
                        isStreaming: false
                    }))
                    setAgentMessages(convertedAgentMessages)
                }
            } catch (error) {
                console.error('Failed to load messages:', error)
            }
        }
        loadMessages()
    }, [])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)

        // Create optimistic user message - show immediately
        const messageId = Date.now().toString()
        const optimisticMessage: Message = {
            id: messageId,
            role: 'user',
            content: content,
            timestamp: Date.now(),
            isStreaming: false
        }

        // Add to both arrays optimistically (we'll deduplicate when backend confirms)
        setMessages(prev => [...prev, optimisticMessage])
        setAgentMessages(prev => [...prev, optimisticMessage])
        setPendingMessageIds(prev => new Set(prev).add(messageId))

        try {
            const result = await window.sidebarAPI.processUserMessage({
                message: content,
                messageId: messageId
            })

            // Remove from pending once backend processes it
            setPendingMessageIds(prev => {
                const next = new Set(prev)
                next.delete(messageId)
                return next
            })

            // For agent mode, the result contains success/error info
            if (result.mode === 'agent' && !result.success && result.error) {
                console.error('Agent task failed:', result.error)
            }
        } catch (error) {
            console.error('Failed to send message:', error)
            // Remove from pending on error
            setPendingMessageIds(prev => {
                const next = new Set(prev)
                next.delete(messageId)
                return next
            })
            setIsLoading(false)
        }
        // Note: isLoading will be set to false by event listeners when messages arrive
    }, [])

    const clearChat = useCallback(async () => {
        try {
            // Clear both LLM and agent messages
            await window.sidebarAPI.clearChat()
            await window.sidebarAPI.clearAgentHistory()
            setMessages([])
            setAgentMessages([])
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
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

        // Listen for message updates from main process (LLM chat)
        const handleMessagesUpdated = (updatedMessages: any[]) => {
            // Convert CoreMessage format to our frontend Message format
            setMessages(prev => {
                const convertedMessages = updatedMessages.map((msg: any, index: number) => {
                    // Extract text content
                    const textContent = typeof msg.content === 'string' 
                        ? msg.content 
                        : msg.content.find((p: any) => p.type === 'text')?.text || ''

                    // If this is a user message matching a pending one, keep the pending ID
                    let messageId = `msg-${index}`
                    if (msg.role === 'user' && textContent) {
                        const pendingMatch = Array.from(pendingMessageIds).find(id => {
                            const pendingMsg = prev.find(m => m.id === id)
                            return pendingMsg?.content === textContent
                        })
                        if (pendingMatch) {
                            messageId = pendingMatch
                            setPendingMessageIds(prevPending => {
                                const next = new Set(prevPending)
                                next.delete(pendingMatch)
                                return next
                            })
                            
                            // Remove optimistic message from agentMessages since this is chat mode
                            setAgentMessages(prevAgent => 
                                prevAgent.filter(m => m.id !== pendingMatch)
                            )
                        }
                    }

                    return {
                        id: messageId,
                        role: msg.role,
                        content: textContent,
                        timestamp: Date.now(),
                        isStreaming: false
                    }
                })

                // Replace with backend messages, but keep any pending messages not yet confirmed
                const backendIds = new Set(convertedMessages.map(m => m.id))
                const pendingToKeep = prev.filter(m => 
                    pendingMessageIds.has(m.id) && !backendIds.has(m.id)
                )
                return [...convertedMessages, ...pendingToKeep]
            })
        }

        // Listen for agent message updates
        const handleAgentMessagesUpdated = (updatedAgentMessages: any[]) => {
            setAgentMessages(prev => {
                const convertedAgentMessages = updatedAgentMessages.map((msg: any) => {
                    // If this is a user message matching a pending one, keep the pending ID
                    let messageId = msg.id
                    if (msg.role === 'user') {
                        const pendingMatch = Array.from(pendingMessageIds).find(id => {
                            const pendingMsg = prev.find(m => m.id === id)
                            return pendingMsg?.content === msg.content
                        })
                        if (pendingMatch) {
                            messageId = pendingMatch
                            setPendingMessageIds(prevPending => {
                                const next = new Set(prevPending)
                                next.delete(pendingMatch)
                                return next
                            })
                            
                            // Remove optimistic message from messages since this is agent mode
                            setMessages(prevChat => 
                                prevChat.filter(m => m.id !== pendingMatch)
                            )
                        }
                    }

                    return {
                        id: messageId,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp,
                        isStreaming: false
                    }
                })

                // Replace with backend messages, but keep any pending messages not yet confirmed
                const backendIds = new Set(convertedAgentMessages.map(m => m.id))
                const pendingToKeep = prev.filter(m => 
                    pendingMessageIds.has(m.id) && !backendIds.has(m.id)
                )
                return [...convertedAgentMessages, ...pendingToKeep]
            })
            setIsLoading(false)
        }

        window.sidebarAPI.onChatResponse(handleChatResponse)
        window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)
        window.sidebarAPI.onAgentMessages(handleAgentMessagesUpdated)

        return () => {
            window.sidebarAPI.removeChatResponseListener()
            window.sidebarAPI.removeMessagesUpdatedListener()
            window.sidebarAPI.removeAgentMessagesListener()
        }
    }, [pendingMessageIds])

    // Merge messages for display (combine LLM and agent messages, sorted by timestamp)
    // Deduplicate by content and timestamp to avoid showing the same message twice
    const mergedMessages = React.useMemo(() => {
        const allMessages = [...messages, ...agentMessages]
        const seen = new Map<string, Message>()
        
        // Deduplicate: if same content and role within 5 seconds, keep only one
        for (const msg of allMessages) {
            const key = `${msg.role}:${msg.content}`
            const existing = seen.get(key)
            
            if (!existing) {
                seen.set(key, msg)
            } else {
                // If timestamps are very close (within 5 seconds), it's likely a duplicate
                const timeDiff = Math.abs(msg.timestamp - existing.timestamp)
                if (timeDiff < 5000) {
                    // Keep the one with the earlier timestamp (likely the optimistic one)
                    if (msg.timestamp < existing.timestamp) {
                        seen.set(key, msg)
                    }
                } else {
                    // Different times, keep both
                    seen.set(key, msg)
                }
            }
        }
        
        const uniqueMessages = Array.from(seen.values())
        return uniqueMessages.sort((a, b) => a.timestamp - b.timestamp)
    }, [messages, agentMessages])

    const value: ChatContextType = {
        messages: mergedMessages,
        isLoading,
        sendMessage,
        clearChat,
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

