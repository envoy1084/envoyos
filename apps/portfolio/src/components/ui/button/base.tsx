import { forwardRef, type ReactNode } from "react";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { useHoverCapable } from "@/hooks/use-hover-capable";
import { SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressScale?: number;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-content-primary shadow-control hover:bg-brand-hover active:bg-brand-active",
  secondary:
    "border border-border-control bg-surface-raised text-content-secondary shadow-control hover:border-line-control-hover hover:bg-surface-hover hover:text-content-primary active:bg-surface-active",
  ghost:
    "text-content-tertiary hover:bg-surface-hover hover:text-content-secondary active:bg-surface-active",
  outline:
    "border border-border-control bg-transparent text-content-secondary hover:border-line-control-hover hover:bg-surface-hover hover:text-content-primary active:bg-surface-active",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-5 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
  icon: "h-8 w-8",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      pressScale = 0.96,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    return (
      <motion.button
        ref={ref}
        type="button"
        whileTap={reduce ? undefined : { scale: pressScale }}
        whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
        transition={SPRING_PRESS}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium select-none",
          "transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
          VARIANT_CLASS[variant],
          SIZE_CLASS[size],
          className,
        )}
        {...rest}
      >
        {children}
      </motion.button>
    );
  },
);
