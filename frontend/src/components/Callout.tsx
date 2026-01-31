import * as React from "react";

type CalloutVariant = "verify" | "warning" | "danger" | "tip" | "info";

const variantToEmoji: Record<CalloutVariant, string> = {
  verify: "✅",
  warning: "⚠️",
  danger: "❌",
  tip: "👉",
  info: "ℹ️",
};

const variantToClassName: Record<CalloutVariant, string> = {
  verify: "callout callout-success",
  warning: "callout callout-warning",
  danger: "callout callout-danger",
  tip: "callout callout-info",
  info: "callout callout-info",
};

export function Callout({
  variant,
  title,
  children,
}: {
  variant: CalloutVariant;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={variantToClassName[variant]} role="note">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0" aria-hidden>
          {variantToEmoji[variant]}
        </div>
        <div className="min-w-0">
          {title ? <div className="font-semibold">{title}</div> : null}
          <div className="mt-1 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}
