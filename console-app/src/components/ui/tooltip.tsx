import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";
import "./tooltip.css";

export const TooltipProvider = TooltipPrimitive.Provider;

export const Tooltip = TooltipPrimitive.Root;

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    multiline?: boolean;
    variant?: "default" | "success";
  }
>(
  (
    {
      className,
      sideOffset = 6,
      multiline = false,
      variant = "default",
      children,
      ...props
    },
    ref,
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "kubeara-tooltip",
          multiline && "kubeara-tooltip--multiline",
          variant === "success" && "kubeara-tooltip--success",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="kubeara-tooltip-arrow" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

type TooltipHintProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  align?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["align"];
  sideOffset?: number;
  multiline?: boolean;
  variant?: "default" | "success";
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
};

export function TooltipHint({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset,
  multiline = false,
  variant = "default",
  disabled = false,
  open,
  defaultOpen,
  onOpenChange,
  contentClassName,
}: TooltipHintProps) {
  if (
    disabled ||
    content == null ||
    (typeof content === "string" && content.trim() === "")
  ) {
    return children;
  }

  return (
    <Tooltip open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        multiline={multiline}
        variant={variant}
        className={contentClassName}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
