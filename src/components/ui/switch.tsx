"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Interruptor físico (docs/redesign-visual.md): trilho rebaixado que fica
 * cobalto quando ligado, com um botão claro por cima.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-[42px] shrink-0 items-center rounded-full bg-muted p-[3px] well [--well-ring:var(--control-edge)] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=checked]:[--tw-inset-shadow:inset_0_1px_3px_rgb(0_0_0/0.28)] data-[state=checked]:[--tw-inset-ring-shadow:inset_0_0_0_1px_var(--primary-edge)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[18px] rounded-full bg-white shadow-[0_0_0_1px_var(--key-edge),0_1px_3px_var(--key-drop)] transition-transform duration-200 data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0 dark:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
