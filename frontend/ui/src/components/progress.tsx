// oxlint-disable-next-line no-restricted-imports
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "cn";

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root>;

function Progress({ className, value = null, max = 100, ...props }: ProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const progressValue = value === null ? null : Math.min(Math.max(value, 0), safeMax);
  const percentage = progressValue === null ? 0 : (progressValue / safeMax) * 100;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={progressValue}
      max={safeMax}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      aria-valuenow={value ?? undefined}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={undefined}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
