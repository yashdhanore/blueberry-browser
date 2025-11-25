import * as React from 'react'
import { cn } from '@common/lib/utils'
import { Button } from '@common/components/Button'

export type SuggestionsProps = React.ComponentPropsWithoutRef<'div'>

export const Suggestions = React.forwardRef<HTMLDivElement, SuggestionsProps>(
    ({ className, children, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'w-full overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden',
                className
            )}
            {...props}
        >
            <div className="flex w-max flex-nowrap items-center gap-2">{children}</div>
        </div>
    )
)
Suggestions.displayName = 'Suggestions'

export type SuggestionProps = Omit<React.ComponentProps<typeof Button>, 'onClick' | 'children'> & {
    suggestion: string
    onClick?: (suggestion: string) => void
    children?: React.ReactNode
}

export const Suggestion: React.FC<SuggestionProps> = ({
    suggestion,
    onClick,
    className,
    variant = 'outline',
    size = 'sm',
    children,
    ...props
}) => {
    const handleClick = () => onClick?.(suggestion)

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            className={cn(
                'cursor-pointer rounded-full border-border bg-background/70 px-4 text-xs font-medium text-foreground/90 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
                className
            )}
            onClick={handleClick}
            {...props}
        >
            {children ?? suggestion}
        </Button>
    )
}

