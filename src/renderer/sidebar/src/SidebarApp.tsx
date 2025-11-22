import React, { useEffect, useState } from 'react';
import { ChatProvider } from './contexts/ChatContext';
import { AgentProvider } from './contexts/AgentContext';
import { Chat } from './components/Chat';
import { AgentPanel } from './components/AgentPanel';
import { useDarkMode } from '@common/hooks/useDarkMode';
import { MessageSquare, Bot } from 'lucide-react';
import { cn } from '@common/lib/utils';

type SidebarView = 'chat' | 'agent';

const SidebarContent: React.FC = () => {
    const { isDarkMode } = useDarkMode();
    const [view, setView] = useState<SidebarView>('agent'); // Default to agent for testing

    // Apply dark mode class to the document
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    return (
        <div className="h-screen flex flex-col bg-background border-l border-border">
            {/* View Tabs */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setView('chat')}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors',
                        view === 'chat'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <MessageSquare className="size-4" />
                    Chat
                </button>
                <button
                    onClick={() => setView('agent')}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors',
                        view === 'agent'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <Bot className="size-4" />
                    Agent
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {view === 'chat' ? <Chat /> : <AgentPanel />}
            </div>
        </div>
    );
};

export const SidebarApp: React.FC = () => {
    return (
        <ChatProvider>
            <AgentProvider>
                <SidebarContent />
            </AgentProvider>
        </ChatProvider>
    );
};

