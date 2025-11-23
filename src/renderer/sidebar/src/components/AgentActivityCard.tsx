import React from 'react'
import { Bot, Loader2, Check, X, Pause, Play, Square, AlertCircle } from 'lucide-react'
import { cn } from '@common/lib/utils'
import { Button } from '@common/components/Button'

interface AgentAction {
    id: string
    type: string
    args: any
    status: 'pending' | 'completed' | 'failed'
    timestamp: number
    result?: any
    error?: string
}

interface AgentActivityCardProps {
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
    onCancel: () => void
    onPause: () => void
    onResume: () => void
    onReset: () => void
}

export const AgentActivityCard: React.FC<AgentActivityCardProps> = ({
    goal,
    isRunning,
    isPaused,
    currentTurn,
    maxTurns,
    actions,
    currentReasoning,
    error,
    finalResponse,
    screenshot,
    onCancel,
    onPause,
    onResume,
    onReset
}) => {
    const formatArgs = (args: any): string => {
        if (!args) return ''
        const str = JSON.stringify(args)
        return str.length > 60 ? str.slice(0, 60) + '...' : str
    }

    return (
        <div className="w-full animate-fade-in">
            <div className="border border-primary/20 rounded-2xl p-4 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <Bot className="size-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-sm">Browser Agent</h3>
                            {isRunning && !isPaused && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                                    <Loader2 className="size-3 animate-spin text-green-600 dark:text-green-400" />
                                    <span className="text-xs text-green-600 dark:text-green-400">Running</span>
                                </div>
                            )}
                            {isPaused && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                                    <Pause className="size-3 text-yellow-600 dark:text-yellow-400" />
                                    <span className="text-xs text-yellow-600 dark:text-yellow-400">Paused</span>
                                </div>
                            )}
                            {!isRunning && finalResponse && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                                    <Check className="size-3 text-green-600 dark:text-green-400" />
                                    <span className="text-xs text-green-600 dark:text-green-400">Completed</span>
                                </div>
                            )}
                            {!isRunning && error && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
                                    <AlertCircle className="size-3 text-red-600 dark:text-red-400" />
                                    <span className="text-xs text-red-600 dark:text-red-400">Error</span>
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-foreground/80">{goal}</p>
                    </div>
                </div>

                {/* Turn Progress */}
                {isRunning && (
                    <div className="mb-3 text-xs text-muted-foreground">
                        Turn {currentTurn} of {maxTurns}
                    </div>
                )}

                {/* Current Reasoning */}
                {isRunning && currentReasoning && (
                    <div className="mb-3 p-3 rounded-lg bg-background/50 border border-border">
                        <div className="text-xs font-medium text-muted-foreground mb-1.5">💭 Thinking</div>
                        <p className="text-sm text-foreground/90 line-clamp-3">{currentReasoning}</p>
                    </div>
                )}

                {/* Screenshot Preview */}
                {screenshot && isRunning && (
                    <div className="mb-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1.5">👁️ Agent View</div>
                        <img
                            src={`data:image/png;base64,${screenshot}`}
                            alt="Agent view"
                            className="w-full rounded-lg border border-border"
                        />
                    </div>
                )}

                {/* Actions List */}
                {actions.length > 0 && (
                    <div className="mb-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1.5">📋 Actions</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {actions.map((action) => (
                                <div
                                    key={action.id}
                                    className={cn(
                                        'flex items-center gap-2 p-2 rounded-lg text-xs transition-colors',
                                        action.status === 'pending' && 'bg-muted/50',
                                        action.status === 'completed' && 'bg-green-500/10',
                                        action.status === 'failed' && 'bg-red-500/10'
                                    )}
                                >
                                    {action.status === 'pending' && (
                                        <Loader2 className="size-3 animate-spin flex-shrink-0 text-muted-foreground" />
                                    )}
                                    {action.status === 'completed' && (
                                        <Check className="size-3 flex-shrink-0 text-green-600 dark:text-green-400" />
                                    )}
                                    {action.status === 'failed' && (
                                        <X className="size-3 flex-shrink-0 text-red-600 dark:text-red-400" />
                                    )}
                                    <span className="font-mono font-medium">{action.type}</span>
                                    <span className="text-muted-foreground truncate text-xs">
                                        {formatArgs(action.args)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Final Response */}
                {!isRunning && finalResponse && (
                    <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5">
                            ✓ Completed
                        </div>
                        <p className="text-sm text-green-700 dark:text-green-300">{finalResponse}</p>
                        {actions.length > 0 && (
                            <p className="text-xs text-green-600/60 dark:text-green-400/60 mt-1.5">
                                Completed {actions.length} action{actions.length !== 1 ? 's' : ''} in {currentTurn} turn{currentTurn !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                )}

                {/* Error Message */}
                {!isRunning && error && (
                    <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">
                            Error
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}

                {/* Controls */}
                <div className="flex gap-2">
                    {isRunning && (
                        <>
                            {isPaused ? (
                                <Button
                                    onClick={onResume}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                >
                                    <Play className="size-3 mr-1.5" />
                                    Resume
                                </Button>
                            ) : (
                                <Button
                                    onClick={onPause}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                >
                                    <Pause className="size-3 mr-1.5" />
                                    Pause
                                </Button>
                            )}
                            <Button
                                onClick={onCancel}
                                variant="destructive"
                                size="sm"
                                className="flex-1"
                            >
                                <Square className="size-3 mr-1.5" />
                                Cancel
                            </Button>
                        </>
                    )}
                    {!isRunning && (
                        <Button
                            onClick={onReset}
                            variant="outline"
                            size="sm"
                            className="w-full"
                        >
                            Dismiss
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}