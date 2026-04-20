import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const inputClasses =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onKeyDown, ...props }, ref) => {
    // Text-type inputs render as <textarea rows={1}> to suppress mobile autofill.
    // Browsers never offer password/card/address autofill on <textarea> elements.
    if (!type || type === "text") {
      return (
        <textarea
          rows={1}
          className={cn(inputClasses, "resize-none overflow-hidden", className)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
            // Forward the original handler with a type cast since callers expect InputElement
            onKeyDown?.(e as unknown as React.KeyboardEvent<HTMLInputElement>)
          }}
          ref={ref as unknown as React.Ref<HTMLTextAreaElement>}
          {...(props as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      )
    }

    return (
      <input
        type={type}
        className={cn(inputClasses, className)}
        onKeyDown={onKeyDown}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
