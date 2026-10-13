// oxlint-disable-next-line no-restricted-imports
import * as React from "react";
import { cn } from "cn";
import { Label as LabelPrimitive } from "radix-ui";

function Label({
  className,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const generatedId = React.useId();
  const childArray = React.Children.toArray(children);
  const controlIndex = childArray.findIndex(isControl);
  const content = childArray.map((child, index) =>
    index === controlIndex && isControl(child)
      ? React.cloneElement(child, { id: generatedId })
      : child,
  );
  return (
    <LabelPrimitive.Root
      data-slot="label"
      htmlFor={generatedId}
      className={cn(
        "grid w-full gap-2 text-sm leading-normal font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {content}
    </LabelPrimitive.Root>
  );
}

function isControl(child: React.ReactNode): child is React.ReactElement<{ id?: string }> {
  return React.isValidElement<{ id?: string }>(child);
}

export { Label };
