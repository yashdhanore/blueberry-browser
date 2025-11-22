import React, { useState } from 'react';
import { Play, Square, Pause, PlayCircle, Bot, Check, X, Loader2 } from 'lucide-react';
import { useAgent } from '../contexts/AgentContext';
import { cn } from '@common/lib/utils';
import { Button } from '@common/components/Button';

export const AgentPanel: React.FC = () => {
  const {
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
  } = useAgent();

  const [inputGoal, setInputGoal] = useState('');

  const handleStart = async () => {
    if (!inputGoal.trim()) return;
    await startTask(inputGoal.trim());
    setInputGoal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  const formatArgs = (args: any): string => {
    if (!args) return '';
    const str = JSON.stringify(args);
    return str.length > 40 ? str.slice(0, 40) + '...' : str;
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="size-5 text-primary" />
        <h2 className="font-semibold">Browser Agent</h2>
      </div>

      {/* Input (show when not running and no result) */}
      {!isRunning && !finalResponse && !error && (
        <div className="flex flex-col gap-2">
          <textarea
            value={inputGoal}
            onChange={(e) => setInputGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like me to do?&#10;&#10;Examples:&#10;• Search for weather in Stockholm&#10;• Find the latest news about AI&#10;• Navigate to github.com"
            className="w-full p-3 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={6}
          />
          <Button onClick={handleStart} disabled={!inputGoal.trim()}>
            <Play className="size-4 mr-2" />
            Start Task
          </Button>
        </div>
      )}

      {/* Running State */}
      {isRunning && (
        <>
          {/* Goal */}
          <div className="p-3 rounded-lg bg-muted">
            <div className="text-xs text-muted-foreground mb-1">Goal</div>
            <div className="text-sm">{goal}</div>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              {isPaused ? (
                <Pause className="size-4 text-yellow-500" />
              ) : (
                <Loader2 className="size-4 animate-spin text-primary" />
              )}
              {isPaused ? 'Paused' : 'Running...'}
            </span>
            <span className="text-muted-foreground">
              Turn {currentTurn}/{maxTurns}
            </span>
          </div>

          {/* Current Reasoning */}
          {currentReasoning && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Thinking...</div>
              <div className="line-clamp-3">{currentReasoning}</div>
            </div>
          )}

          {/* Action History */}
          <div className="flex-1 overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-2">Actions</div>
            <div className="flex flex-col gap-1">
              {actions.map((action) => (
                <div
                  key={action.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded text-sm',
                    action.status === 'pending' && 'bg-muted/50',
                    action.status === 'completed' && 'bg-green-500/10',
                    action.status === 'failed' && 'bg-red-500/10'
                  )}
                >
                  {action.status === 'pending' && <Loader2 className="size-3 animate-spin flex-shrink-0" />}
                  {action.status === 'completed' && <Check className="size-3 text-green-500 flex-shrink-0" />}
                  {action.status === 'failed' && <X className="size-3 text-red-500 flex-shrink-0" />}
                  <span className="font-mono text-xs">{action.type}</span>
                  <span className="text-muted-foreground text-xs truncate">{formatArgs(action.args)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            {isPaused ? (
              <Button onClick={resumeTask} variant="outline" className="flex-1">
                <PlayCircle className="size-4 mr-2" />
                Resume
              </Button>
            ) : (
              <Button onClick={pauseTask} variant="outline" className="flex-1">
                <Pause className="size-4 mr-2" />
                Pause
              </Button>
            )}
            <Button onClick={cancelTask} variant="destructive" className="flex-1">
              <Square className="size-4 mr-2" />
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* Error State */}
      {error && !isRunning && (
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="text-xs text-red-600 dark:text-red-400 mb-1 font-semibold">Error</div>
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => goal && startTask(goal)} variant="outline" className="flex-1">
              Retry
            </Button>
            <Button onClick={resetAgent} variant="outline" className="flex-1">
              New Task
            </Button>
          </div>
        </div>
      )}

      {/* Complete State */}
      {finalResponse && !isRunning && (
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-semibold">Completed!</div>
            <div className="text-sm text-green-600 dark:text-green-400">{finalResponse}</div>
          </div>

          {/* Show action summary */}
          {actions.length > 0 && (
            <div className="p-3 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground mb-2">
                Completed {actions.length} action{actions.length !== 1 ? 's' : ''} in {currentTurn} turn{currentTurn !== 1 ? 's' : ''}
              </div>
              <div className="flex flex-col gap-1">
                {actions.slice(-5).map((action) => (
                  <div key={action.id} className="flex items-center gap-2 text-xs">
                    <Check className="size-3 text-green-500 flex-shrink-0" />
                    <span className="font-mono">{action.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={resetAgent} variant="outline">
            <Play className="size-4 mr-2" />
            New Task
          </Button>
        </div>
      )}
    </div>
  );
};
