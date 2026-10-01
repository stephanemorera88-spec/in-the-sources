import type React from "react";
import Link from "next/link";

/*
 * Server-safe UI primitives shared by the app and marketing builders.
 * No hooks, no "use client": every component here renders in a Server
 * Component and can also be used from a Client Component.
 *
 * Design (SPEC.md): paper and ink, hairlines instead of cards, 44px pill
 * buttons, 13px uppercase labels in ink-50, blue only for focus rings and
 * link hover. Everything works at 390px width.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Layout ---------- */

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx("mx-auto w-full max-w-[1320px] px-5 md:px-8 lg:px-12", className)}>{children}</div>;
}

/* ---------- Button ---------- */

export type ButtonVariant = "primary" | "secondary";

const buttonBase =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium leading-none whitespace-nowrap no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-70 hover:text-paper",
  secondary: "border border-hairline-strong bg-paper text-ink hover:bg-paper-warm hover:text-ink",
};

type ButtonCommon = {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
};

export type ButtonAsButtonProps = ButtonCommon &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonCommon> & { href?: undefined };

export type ButtonAsLinkProps = ButtonCommon &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonCommon | "href"> & { href: string };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function stripCommon<T extends ButtonCommon>(props: T): Omit<T, keyof ButtonCommon> {
  const rest: Record<string, unknown> = { ...props };
  delete rest.variant;
  delete rest.className;
  delete rest.children;
  return rest as Omit<T, keyof ButtonCommon>;
}

/** 44px pill. Renders an <a> (next/link) when `href` is given, otherwise a <button type="button">. */
export function Button(props: ButtonProps) {
  const { variant = "primary", className, children } = props;
  const classes = cx(buttonBase, buttonVariants[variant], className);

  if (typeof props.href === "string") {
    const { href, ...anchorProps } = stripCommon(props);
    return (
      <Link href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const { type, ...buttonProps } = stripCommon(props);
  return (
    <button type={type ?? "button"} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */

const fieldBase =
  "w-full rounded-md border border-hairline-strong bg-paper px-3 text-[16px] text-ink placeholder:text-ink-50 focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, "min-h-[120px] py-2.5 leading-normal", className)} {...props} />;
}

/** 13px uppercase, 6% tracking, ink-50. */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cx("mb-1.5 block text-[13px] font-medium uppercase tracking-[0.06em] text-ink-50", className)}
      {...props}
    />
  );
}

/* ---------- Table ---------- */

/** Wraps the table in a horizontal scroller so a wide table never scrolls the page. */
export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cx("w-full border-collapse text-left text-[15px]", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx("border-b border-hairline-strong", className)} {...props} />;
}

export function Tbody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx("border-b border-hairline", className)} {...props} />;
}

export function Th({ className, scope = "col", ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cx(
        "border-b border-hairline-strong py-2.5 pr-4 text-[13px] font-medium uppercase tracking-[0.06em] whitespace-nowrap text-ink-50",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx("py-3 pr-4 align-top", className)} {...props} />;
}

/* ---------- Messages and headings ---------- */

/** Bordered paragraph for errors and empty states. */
export function Notice({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error";
  className?: string;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-4 py-3 text-[15px] leading-relaxed",
        tone === "error" ? "border-hairline-strong text-ink" : "border-hairline text-ink-70",
        className
      )}
    >
      {children}
    </p>
  );
}

const headingSizes = {
  h1: "text-[2rem] leading-[1.1] md:text-[2.5rem]",
  h2: "text-[1.5rem] leading-[1.2] md:text-[1.75rem]",
  h3: "text-[1.25rem] leading-[1.3]",
} as const;

/** Serif heading, weight 500, tight tracking. Defaults to h2. */
export function SectionHeading({
  children,
  as: Tag = "h2",
  className,
}: {
  children: React.ReactNode;
  as?: keyof typeof headingSizes;
  className?: string;
}) {
  return (
    <Tag className={cx("font-serif font-medium tracking-[-0.025em] text-ink", headingSizes[Tag], className)}>
      {children}
    </Tag>
  );
}
