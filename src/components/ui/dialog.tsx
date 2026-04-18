"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  // Once the keyboard is detected, lock offset until dialog unmounts.
  // This prevents the dialog from dropping when the user taps buttons
  // (which briefly dismiss the keyboard before it reopens).
  const lockedOffset = React.useRef(0)

  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return

    function applyOffset(el: HTMLDivElement, offset: number, viewportHeight: number) {
      el.style.bottom = `${offset}px`
      el.style.maxHeight = `${viewportHeight - 20}px`
    }

    function onResize() {
      const el = contentRef.current
      if (!el) return
      // On iOS Safari, the browser scrolls the page when the keyboard opens,
      // setting visualViewport.offsetTop to a non-zero value. We must subtract
      // that so we don't double-offset (once from iOS scroll + once from our bottom).
      const rawOffset = window.innerHeight - vv!.height
      const offset = rawOffset - (vv!.offsetTop || 0)

      if (rawOffset > 50) {
        // Keyboard visible — update to current height and lock
        lockedOffset.current = offset
        applyOffset(el, Math.max(0, offset), vv!.height)
      } else if (lockedOffset.current > 0) {
        // Keyboard dismissed but we had it before — keep locked position.
        // The user is still in the dialog; keyboard will reopen on next tap.
        // Use full window height for maxHeight since keyboard is gone.
        applyOffset(el, 0, window.innerHeight)
      }
    }

    vv.addEventListener("resize", onResize)
    vv.addEventListener("scroll", onResize)
    return () => {
      vv.removeEventListener("resize", onResize)
      vv.removeEventListener("scroll", onResize)
      lockedOffset.current = 0
    }
  }, [])

  // Re-apply locked offset after every render so content changes
  // (e.g. toggling "Save as task") don't drop the position.
  React.useEffect(() => {
    const el = contentRef.current
    if (!el || lockedOffset.current <= 0) return
    const vv = window.visualViewport
    if (!vv) return
    const rawOffset = window.innerHeight - vv.height
    const currentOffset = rawOffset - (vv.offsetTop || 0)
    if (rawOffset > 50) {
      // Keyboard is open — use actual offset (subtract iOS scroll)
      el.style.bottom = `${Math.max(0, currentOffset)}px`
      el.style.maxHeight = `${vv.height - 20}px`
    } else {
      // Keyboard closed momentarily — sit at bottom, full height
      el.style.bottom = "0px"
      el.style.maxHeight = `${window.innerHeight - 20}px`
    }
  })

  // Merge refs so we can track the DOM element directly
  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [ref]
  )

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={mergedRef}
        className={cn(
          // Base (mobile): bottom sheet pinned to bottom, slides up/down
          "dialog-content fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 border bg-background p-6 shadow-lg duration-200 max-h-[85vh] overflow-y-auto rounded-t-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          // Desktop (md+): centered dialog — position overrides via Tailwind, animation overrides via globals.css
          "md:inset-x-auto md:bottom-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:max-w-lg md:rounded-lg",
          className
        )}
        style={style}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center md:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse md:flex-row md:justify-end md:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
