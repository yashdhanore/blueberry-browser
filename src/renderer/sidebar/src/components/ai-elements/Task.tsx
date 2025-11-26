import * as React from 'react'
import { cn } from '@common/lib/utils'

export type TaskProps = React.ComponentPropsWithoutRef<'div'>

export const Task: React.FC<TaskProps> = ({ className, ...props }) => (
    <div className={cn('rounded-2xl border border-dashed border-border/60 bg-muted/40 p-3', className)} {...props} />
)

export const TaskHeader: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => (
    <div className={cn('flex items-center justify-between text-xs font-semibold text-foreground', className)} {...props} />
)

export const TaskMeta: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => (
    <div className={cn('text-[11px] text-muted-foreground', className)} {...props} />
)

export const TaskContent: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => (
    <div className={cn('mt-3 space-y-2 text-sm text-foreground/90', className)} {...props} />
)

