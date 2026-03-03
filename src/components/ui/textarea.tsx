"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useWikiAutocomplete } from "@/lib/hooks/use-wiki-autocomplete"
import { WikiLinkDropdown } from "./wiki-link-dropdown"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  teamId?: string | null;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onChange, onKeyDown, teamId, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null)

    const mergedRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node
        if (typeof forwardedRef === "function") {
          forwardedRef(node)
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
        }
      },
      [forwardedRef]
    )

    const {
      isOpen,
      suggestions,
      activeIndex,
      dropdownPosition,
      handleChange: acHandleChange,
      handleKeyDown: acHandleKeyDown,
      handleSelect,
    } = useWikiAutocomplete(internalRef, teamId)

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(e)
        acHandleChange(e.target.value, e.target.selectionStart)
      },
      [onChange, acHandleChange]
    )

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (acHandleKeyDown(e)) return
        onKeyDown?.(e)
      },
      [onKeyDown, acHandleKeyDown]
    )

    return (
      <div className="relative">
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={mergedRef}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          {...props}
        />
        {isOpen && suggestions.length > 0 && (
          <WikiLinkDropdown
            suggestions={suggestions}
            activeIndex={activeIndex}
            position={dropdownPosition}
            onSelect={handleSelect}
          />
        )}
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
