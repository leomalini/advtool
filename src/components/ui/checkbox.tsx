"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[5px] bg-muted well transition-shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/60",
        // Marcado: vira tecla cobalto (luz em cima, borda na cor da base).
        "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:[--tw-inset-shadow:inset_0_1px_0_rgb(255_255_255/0.25)] data-[state=checked]:[--tw-inset-ring-shadow:inset_0_0_0_1px_var(--primary-edge)]",
        "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:[--tw-inset-ring-shadow:inset_0_0_0_1px_var(--primary-edge)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
