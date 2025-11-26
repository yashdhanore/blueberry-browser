import React, { useState } from 'react'
import { Bot, Loader2, Check, X, Pause, Play, Square, AlertCircle, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@common/lib/utils'
import { Button } from '@common/components/Button'
import {
    Plan,
    PlanAction,
    PlanContent,
    PlanDescription,
    PlanFooter,
    PlanHeader,
    PlanTitle,
    PlanTrigger
} from './ai-elements/Plan'
import { Task, TaskContent, TaskHeader, TaskMeta } from './ai-elements/Task'

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
    const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact')

    const formatArgs = (args: any): string => {
        if (!args) return ''
        const str = JSON.stringify(args)
        return str.length > 60 ? str.slice(0, 60) + '...' : str
    }

    const isCompact = viewMode === 'compact'
    const toggleViewMode = () => {
        setViewMode((prev) => (prev === 'compact' ? 'detailed' : 'compact'))
    }

    const renderStatusBadge = () => {
        if (isRunning && !isPaused) {
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                    <Loader2 className="size-3 animate-spin" />
                    Running
                </span>
            )
        }

        if (isPaused) {
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500">
                    <Pause className="size-3" />
                    Paused
                </span>
            )
        }

        if (!isRunning && finalResponse) {
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                    <Check className="size-3" />
                    Completed
                </span>
            )
        }

        if (!isRunning && error) {
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                    <AlertCircle className="size-3" />
                    Error
                </span>
            )
        }

        return null
    }

    const ScreenshotBlock = () => (
        <Task>
            <TaskHeader>
                <span>Agent view</span>
                {screenshot && (
                    <TaskMeta>
                        Captured {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TaskMeta>
                )}
            </TaskHeader>
            <TaskContent>
                {screenshot ? (
                    <img
                        src={`data:image/png;base64,${screenshot}`}
                        alt="Agent view"
                        className="w-full rounded-xl border border-border/70"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 p-6 text-xs text-muted-foreground">
                        <span>No screenshot yet</span>
                        {isRunning && <span className="mt-1 text-[11px] text-muted-foreground/80">Agent is preparing a view...</span>}
                    </div>
                )}
            </TaskContent>
        </Task>
    )

    const ReasoningBlock = () =>
        currentReasoning ? (
            <Task>
                <TaskHeader>
                    <span>💭 Thinking</span>
                    {isRunning && (
                        <TaskMeta>
                            Turn {currentTurn} of {maxTurns}
                        </TaskMeta>
                    )}
                </TaskHeader>
                <TaskContent>
                    <p className="text-sm text-foreground/90">{currentReasoning}</p>
                </TaskContent>
            </Task>
        ) : null

    const ActionsBlock = () =>
        actions.length > 0 ? (
            <Task>
                <TaskHeader>
                    <span>📋 Actions</span>
                    <TaskMeta>{actions.length} step{actions.length !== 1 ? 's' : ''}</TaskMeta>
                </TaskHeader>
                <TaskContent>
                    <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                        {actions.map((action) => (
                            <div
                                key={action.id}
                                className={cn(
                                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors',
                                    action.status === 'pending' && 'border-border/60 bg-muted/40',
                                    action.status === 'completed' && 'border-emerald-500/40 bg-emerald-500/10',
                                    action.status === 'failed' && 'border-red-500/40 bg-red-500/10'
                                )}
                            >
                                {action.status === 'pending' && (
                                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                )}
                                {action.status === 'completed' && <Check className="size-3 text-emerald-500" />}
                                {action.status === 'failed' && <X className="size-3 text-red-500" />}
                                <span className="font-mono font-semibold">{action.type}</span>
                                <span className="truncate text-[11px] text-muted-foreground">{formatArgs(action.args)}</span>
                            </div>
                        ))}
                    </div>
                </TaskContent>
            </Task>
        ) : null

    const OutcomeBlock = () => {
        if (!isRunning && finalResponse) {
            return (
                <Task className="border-emerald-500/30 bg-emerald-500/5">
                    <TaskHeader>
                        <span className="text-emerald-600">✓ Completed</span>
                        {actions.length > 0 && (
                            <TaskMeta>
                                {actions.length} action{actions.length !== 1 ? 's' : ''} · {currentTurn} turn{currentTurn !== 1 ? 's' : ''}
                            </TaskMeta>
                        )}
                    </TaskHeader>
                    <TaskContent>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">{finalResponse}</p>
                    </TaskContent>
                </Task>
            )
        }

        if (!isRunning && error) {
            return (
                <Task className="border-red-500/30 bg-red-500/5">
                    <TaskHeader>
                        <span className="text-red-600">⚠️ Error</span>
                    </TaskHeader>
                    <TaskContent>
                        <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
                    </TaskContent>
                </Task>
            )
        }

        return null
    }

    return (
        <Plan className="w-full animate-fade-in" isStreaming={isRunning}>
            <PlanHeader>
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                        <Bot className="size-5" />
                    </div>
                    <div>
                        <PlanTitle>Browser Agent</PlanTitle>
                        <PlanDescription>{goal}</PlanDescription>
                    </div>
                </div>
                <PlanAction>
                    {renderStatusBadge()}
                    <PlanTrigger onClick={toggleViewMode}>
                        {isCompact ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
                    </PlanTrigger>
                </PlanAction>
            </PlanHeader>

            <PlanContent isCollapsed={false}>
                {isCompact ? (
                    <>
                        <ScreenshotBlock />
                        <OutcomeBlock />
                    </>
                ) : (
                    <>
                        {isRunning && !isPaused && (
                            <Task>
                                <TaskHeader>
                                    <span>⏱️ Progress</span>
                                    <TaskMeta>
                                        Turn {currentTurn} of {maxTurns}
                                    </TaskMeta>
                                </TaskHeader>
                                <TaskContent>
                                    <div className="h-2 w-full rounded-full bg-muted">
                                        <div
                                            className="h-2 rounded-full bg-primary transition-all"
                                            style={{ width: `${Math.min(100, (currentTurn / maxTurns) * 100)}%` }}
                                        />
                                    </div>
                                </TaskContent>
                            </Task>
                        )}
                        <ReasoningBlock />
                        <ScreenshotBlock />
                        <ActionsBlock />
                        <OutcomeBlock />
                    </>
                )}
            </PlanContent>

            <PlanFooter>
                {isRunning ? (
                    <>
                        {isPaused ? (
                            <Button onClick={onResume} variant="outline" size="sm" className="flex-1">
                                <Play className="size-3" />
                                Resume
                            </Button>
                        ) : (
                            <Button onClick={onPause} variant="outline" size="sm" className="flex-1">
                                <Pause className="size-3" />
                                Pause
                            </Button>
                        )}
                        <Button onClick={onCancel} variant="destructive" size="sm" className="flex-1">
                            <Square className="size-3" />
                            Cancel
                        </Button>
                    </>
                ) : (
                    <Button onClick={onReset} variant="outline" size="sm" className="w-full">
                        Dismiss
                    </Button>
                )}
            </PlanFooter>
        </Plan>
    )
}