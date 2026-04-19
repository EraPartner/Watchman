import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-s-2",
    "font-sans font-[500]",
    "rounded-r-2",
    "transition-colors duration-fast ease-out-q",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
    "disabled:opacity-50 disabled:pointer-events-none",
    "select-none",
  ],
  {
    variants: {
      variant: {
        ghost: [
          "bg-transparent text-[var(--text-md)]",
          "hover:bg-[var(--surface-2)] hover:text-[var(--text-hi)]",
        ],
        tonal: [
          "bg-[var(--surface-2)] text-[var(--text-hi)]",
          "shadow-[inset_0_0_0_1px_var(--hairline)]",
          "hover:bg-[var(--surface-3)]",
        ],
        accent: [
          "bg-[var(--accent)] text-[var(--accent-contrast)]",
          "hover:brightness-110",
        ],
      },
      size: {
        sm: "h-7 px-s-3 text-fs-label",
        md: "h-9 px-s-4 text-fs-body",
        lg: "h-11 px-s-5 text-fs-body",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "tonal", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
