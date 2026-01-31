// NOTE: The active DOMUS+ app lives under /frontend.
// This root-level component is kept as a no-op placeholder to avoid
// TypeScript errors in workspaces where root deps aren't installed.

export type CalloutVariant = "verify" | "warning" | "danger" | "tip" | "info";

export function Callout(_: {
  variant: CalloutVariant;
  title?: string;
  children: unknown;
}) {
  return null;
}
