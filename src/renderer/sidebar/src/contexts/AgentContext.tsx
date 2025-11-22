import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AgentAction {
  id: string;
  type: string;
  args: any;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
  result?: any;
  error?: string;
}

interface AgentContextType {
  // State
  isRunning: boolean;
  isPaused: boolean;
  goal: string | null;
  currentTurn: number;
  maxTurns: number;
  actions: AgentAction[];
  currentReasoning: string | null;
  error: string | null;
  finalResponse: string | null;

  // Actions
  startTask: (goal: string) => Promise<void>;
  cancelTask: () => Promise<void>;
  pauseTask: () => void;
  resumeTask: () => void;
  resetAgent: () => void;
}

const AgentContext = createContext<AgentContextType | null>(null);

export const useAgent = () => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within AgentProvider');
  }
  return context;
};

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [goal, setGoal] = useState<string | null>(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [maxTurns] = useState(20);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [currentReasoning, setCurrentReasoning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalResponse, setFinalResponse] = useState<string | null>(null);

  // Start task
  const startTask = useCallback(async (taskGoal: string) => {
    // Reset state
    setIsRunning(true);
    setIsPaused(false);
    setGoal(taskGoal);
    setCurrentTurn(0);
    setActions([]);
    setCurrentReasoning(null);
    setError(null);
    setFinalResponse(null);

    const result = await window.sidebarAPI.startAgent(taskGoal);
    if (!result.success) {
      setError(result.error || 'Failed to start agent');
      setIsRunning(false);
    }
  }, []);

  // Cancel task
  const cancelTask = useCallback(async () => {
    await window.sidebarAPI.cancelAgent();
    setIsRunning(false);
    setIsPaused(false);
  }, []);

  // Pause/Resume
  const pauseTask = useCallback(() => {
    window.sidebarAPI.pauseAgent();
    setIsPaused(true);
  }, []);

  const resumeTask = useCallback(() => {
    window.sidebarAPI.resumeAgent();
    setIsPaused(false);
  }, []);

  // Reset to idle state
  const resetAgent = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setGoal(null);
    setCurrentTurn(0);
    setActions([]);
    setCurrentReasoning(null);
    setError(null);
    setFinalResponse(null);
  }, []);

  // Listen for updates from main process
  useEffect(() => {
    const handleUpdate = (update: { type: string; data: any }) => {
      console.log('[AgentContext] Received update:', update.type, update.data);

      switch (update.type) {
        case 'start':
          setGoal(update.data.goal);
          setIsRunning(true);
          break;

        case 'turn':
          setCurrentTurn(update.data.turn);
          break;

        case 'reasoning':
          setCurrentReasoning(update.data.reasoning);
          break;

        case 'action':
          setActions((prev) => [
            ...prev,
            {
              id: `action-${Date.now()}-${Math.random()}`,
              type: update.data.name,
              args: update.data.args,
              status: 'pending',
              timestamp: Date.now(),
            },
          ]);
          break;

        case 'actionComplete':
          setActions((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.status === 'pending') {
              last.status = update.data.success ? 'completed' : 'failed';
              last.result = update.data.result;
            }
            return updated;
          });
          break;

        case 'complete':
          setIsRunning(false);
          setFinalResponse(update.data.finalResponse || 'Task completed successfully');
          break;

        case 'error':
          setIsRunning(false);
          setError(update.data.error);
          break;

        case 'cancelled':
          setIsRunning(false);
          setIsPaused(false);
          break;

        case 'paused':
          setIsPaused(true);
          break;

        case 'resumed':
          setIsPaused(false);
          break;
      }
    };

    window.sidebarAPI.onAgentUpdate(handleUpdate);
    return () => window.sidebarAPI.removeAgentUpdateListener();
  }, []);

  const value: AgentContextType = {
    isRunning,
    isPaused,
    goal,
    currentTurn,
    maxTurns,
    actions,
    currentReasoning,
    error,
    finalResponse,
    startTask,
    cancelTask,
    pauseTask,
    resumeTask,
    resetAgent,
  };

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
};
