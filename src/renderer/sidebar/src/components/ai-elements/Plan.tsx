import * as React from 'react'
import { cn } from '@common/lib/utils'
import { Button } from '@common/components/Button'

type PlanContextValue = {
    isStreaming: boolean
}

const PlanContext = React.createContext<PlanContextValue | null>(null)

const usePlanContext = () => {
    const ctx = React.useContext(PlanContext)
    if (!ctx) {
        throw new Error('Plan components must be rendered within <Plan>')
    }
    return ctx
}

export type PlanProps = React.ComponentPropsWithoutRef<'div'> & {
    isStreaming?: boolean
}

export const Plan: React.FC<PlanProps> = ({ isStreaming = false, className, children, ...props }) => (
    <PlanContext.Provider value={{ isStreaming }}>
        <div
            className={cn(
                'rounded-3xl border border-border/70 bg-background shadow-xl shadow-primary/5 ring-1 ring-primary/5 transition',
                className
            )}
            {...props}
        >
            {children}
        </div>
    </PlanContext.Provider>
)

export const PlanHeader: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => (
    <div className={cn('flex items-start gap-3 border-b border-border/60 px-5 py-4', className)} {...props} />
)

export const PlanTitle: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => {
    const { isStreaming } = usePlanContext()
    return (
        <div
            className={cn(
                'text-sm font-semibold text-foreground',
                isStreaming && 'animate-pulse text-muted-foreground',
                className
            )}
            {...props}
        />
    )
}

export const PlanDescription: React.FC<React.ComponentPropsWithoutRef<'p'>> = ({
    className,
    ...props
}) => {
    const { isStreaming } = usePlanContext()
    return (
        <p
            className={cn(
                'text-xs text-muted-foreground',
                isStreaming && 'animate-pulse text-muted-foreground/70',
                className
            )}
            {...props}
        />
    )
}

export const PlanAction: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => (
    <div className={cn('flex items-center gap-2', className)} {...props} />
)

export const PlanContent: React.FC<
    React.ComponentPropsWithoutRef<'div'> & {
        isCollapsed?: boolean
    }
> = ({ isCollapsed, className, ...props }) => (
    <div
        className={cn('space-y-4 px-5 py-4', isCollapsed && 'hidden', className)}
        aria-hidden={isCollapsed}
        {...props}
    />
)

export const PlanFooter: React.FC<React.ComponentPropsWithoutRef<'div'>> = ({ className, ...props }) => (
    <div className={cn('flex flex-wrap gap-2 border-t border-border/60 px-5 py-4', className)} {...props} />
)

export type PlanTriggerProps = React.ComponentProps<typeof Button>

export const PlanTrigger: React.FC<PlanTriggerProps> = ({ className, children, ...props }) => (
    <Button
        variant="ghost"
        size="icon"
        className={cn('size-8 rounded-full border border-transparent hover:border-border', className)}
        {...props}
    >
        {children}
    </Button>
)

