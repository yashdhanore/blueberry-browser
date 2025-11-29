import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

type ChatMode = 'chat' | 'agent'

interface ChatContextType {
    messages: Message[]
    isLoading: boolean
    mode: ChatMode

    // Chat actions
    sendMessage: (content: string, mode?: ChatMode) => Promise<void>
    clearChat: () => void
    setMode: (mode: ChatMode) => void

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
    const [mode, setMode] = useState<ChatMode>('chat')

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

    const sendMessage = useCallback(async (content: string, messageMode?: ChatMode) => {
        const currentMode = messageMode || mode
        setIsLoading(true)

        try {
            if (currentMode === 'agent') {
                // Send to agent
                const result = await window.sidebarAPI.runAgentTask(content)
                // Agent messages are updated via the sidebar-agent-messages event
                if (!result.success && result.error) {
                    console.error('Agent task failed:', result.error)
                }
            } else {
                // Send to LLM chat
                const messageId = Date.now().toString()
                await window.sidebarAPI.sendChatMessage({
                    message: content,
                    messageId: messageId
                })
                // Messages will be updated via the chat-messages-updated event
            }
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }, [mode])

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

        // Listen for agent message updates
        const handleAgentMessagesUpdated = (updatedAgentMessages: any[]) => {
            const convertedAgentMessages = updatedAgentMessages.map((msg: any) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp,
                isStreaming: false
            }))
            setAgentMessages(convertedAgentMessages)
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
    }, [])

    // Merge messages for display (combine LLM and agent messages, sorted by timestamp)
    const mergedMessages = React.useMemo(() => {
        const allMessages = [...messages, ...agentMessages]
        return allMessages.sort((a, b) => a.timestamp - b.timestamp)
    }, [messages, agentMessages])

    const value: ChatContextType = {
        messages: mergedMessages,
        isLoading,
        mode,
        sendMessage,
        clearChat,
        setMode,
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

