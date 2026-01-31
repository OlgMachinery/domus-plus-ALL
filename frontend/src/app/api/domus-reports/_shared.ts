import { z } from "zod";

export const ReportTypeSchema = z.enum([
  "transactions",
  "income-expense",
  "by-category",
  "budgets",
  "annual-budget",
]);

export const PreviewBodySchema = z.object({
  report_type: ReportTypeSchema,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const ExportBodySchema = PreviewBodySchema.extend({
  format: z.enum(["html", "pdf", "xlsx"]),
});

export type ReportType = z.infer<typeof ReportTypeSchema>;

export function clampDateRange(from: string, to: string): { from: string; to: string } {
  // Ensure from <= to lexicographically since ISO date format.
  return from <= to ? { from, to } : { from: to, to: from };
}

export function isoDayStart(dateIso: string): string {
  return `${dateIso}T00:00:00.000Z`;
}

export function isoDayEnd(dateIso: string): string {
  return `${dateIso}T23:59:59.999Z`;
}

export function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
