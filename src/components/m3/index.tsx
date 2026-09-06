/**
 * Material Design 3 基礎組件
 * 只使用語義 token（primary / surface-container / outline …），不硬寫顏色。
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

/* ------------------------------- Button ---------------------------------- */

type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger";

export interface MdButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}

const buttonVariantClass: Record<ButtonVariant, string> = {
  filled: "bg-primary text-primary-foreground",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline text-primary bg-transparent",
  text: "text-primary bg-transparent",
  elevated: "bg-surface-container-low text-primary md-elevation-1",
  danger: "bg-error-container text-on-error-container",
};

export function MdButton({
  variant = "filled",
  icon,
  size = "md",
  className,
  children,
  ...props
}: MdButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "state-layer inline-flex items-center justify-center gap-2 rounded-full md-label-l transition-[box-shadow,opacity] disabled:pointer-events-none disabled:opacity-38",
        size === "md" ? "h-10 px-6" : "h-8 px-4 md-label-m",
        buttonVariantClass[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function MdIconButton({
  className,
  children,
  selected,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "state-layer inline-flex size-10 shrink-0 items-center justify-center rounded-full",
        selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Card ----------------------------------- */

export function MdCard({
  className,
  variant = "filled",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "filled" | "outlined" | "elevated" }) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-2xl",
        variant === "filled" && "bg-surface-container-low",
        variant === "outlined" && "border border-outline-variant bg-surface",
        variant === "elevated" && "bg-surface-container-low md-elevation-1",
        className,
      )}
    />
  );
}

/* --------------------------------- Chip ----------------------------------- */

const toneClass: Record<Tone, string> = {
  primary: "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-highest text-on-surface-variant",
};

export function MdChip({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-lg px-2 md-label-m whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MdFilterChip({
  selected,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "state-layer inline-flex h-8 items-center gap-1 rounded-lg border px-3 md-label-l whitespace-nowrap",
        selected
          ? "border-transparent bg-secondary-container text-on-secondary-container"
          : "border-outline text-on-surface-variant",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MdBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-4 text-error-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* --------------------------- Segmented Button ----------------------------- */

export function MdSegmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex overflow-hidden rounded-full border border-outline", className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "state-layer h-9 px-4 md-label-l transition-colors",
            i > 0 && "border-l border-outline",
            value === o.value
              ? "bg-secondary-container text-on-secondary-container"
              : "text-on-surface-variant",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- FAB ----------------------------------- */

export function MdFab({
  className,
  icon,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label?: string }) {
  return (
    <button
      {...props}
      className={cn(
        "state-layer inline-flex h-14 items-center gap-3 rounded-2xl bg-tertiary-container px-4 text-on-tertiary-container md-elevation-2",
        className,
      )}
    >
      {icon}
      {label && <span className="md-label-l pr-1">{label}</span>}
    </button>
  );
}

/* -------------------------------- Dialog ---------------------------------- */

export function MdDialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[88vh] w-full overflow-auto rounded-t-3xl bg-surface-container-high p-6 md-elevation-3 sm:max-w-lg sm:rounded-3xl"
      >
        <h2 className="md-headline-s text-on-surface">{title}</h2>
        <div className="mt-4 md-body-m text-on-surface-variant">{children}</div>
        {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ------------------------------ Text field -------------------------------- */

export function MdTextField({
  label,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={fieldId} className="md-label-m text-on-surface-variant">
        {label}
      </label>
      <input
        id={fieldId}
        {...props}
        className="h-12 rounded-lg border border-outline bg-surface-container-lowest px-4 md-body-m text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

export function MdSelect({
  label,
  className,
  id,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={fieldId} className="md-label-m text-on-surface-variant">
        {label}
      </label>
      <select
        id={fieldId}
        {...props}
        className="h-12 rounded-lg border border-outline bg-surface-container-lowest px-3 md-body-m text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      >
        {children}
      </select>
    </div>
  );
}

export function MdSwitch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="md-body-m text-on-surface">{label}</span>
      <span
        className={cn(
          "relative h-8 w-13 shrink-0 rounded-full border-2 transition-colors",
          checked ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-6 -translate-y-1/2 rounded-full transition-all",
            checked ? "left-6 bg-primary-foreground" : "left-1 size-4 bg-outline",
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------- Structure -------------------------------- */

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="md-title-m text-on-surface">
        {title}
        {count !== undefined && (
          <span className="ml-2 md-label-m text-on-surface-variant">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant px-4 py-8 text-center md-body-m text-on-surface-variant">
      {text}
    </div>
  );
}
