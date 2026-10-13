// oxlint-disable-next-line no-restricted-imports
import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-[300px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
