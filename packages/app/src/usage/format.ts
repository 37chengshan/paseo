import { i18n } from "@/i18n/i18next";
import type { UsageDisplayAs } from "./preferences";
import type { UsageBalanceUnit } from "./types";

const providerUsageLabels = {
  session: { label: "Session", key: "providerUsage.labels.session" },
  weekly: { label: "Weekly", key: "providerUsage.labels.weekly" },
  monthly: { label: "Monthly", key: "providerUsage.labels.monthly" },
  code_review: { label: "Code review", key: "providerUsage.labels.codeReview" },
  credits: { label: "Credits", key: "providerUsage.labels.credits" },
  monthly_credits: { label: "Monthly credits", key: "providerUsage.labels.monthlyCredits" },
} as const;

export function formatProviderUsageLabel(id: string, label: string): string {
  const reviewPrefix = "Code review · ";
  if (id.startsWith("code_review:") && label.startsWith(reviewPrefix)) {
    const periodId = id.slice("code_review:".length);
    const periodLabel = label.slice(reviewPrefix.length);
    return `${i18n.t(providerUsageLabels.code_review.key)} · ${formatProviderUsageLabel(periodId, periodLabel)}`;
  }
  const standard =
    providerUsageLabels[id as keyof typeof providerUsageLabels] ??
    (id === "five_hour" ? providerUsageLabels.session : undefined);
  return standard?.label === label ? i18n.t(standard.key) : label;
}

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function formatPct(value: number, locale?: string): string {
  const resolvedLocale = locale ?? i18n.resolvedLanguage;
  return new Intl.NumberFormat(resolvedLocale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(clampPct(value) / 100);
}

/** A localized percentage that says whether it is used or remaining. */
export function formatDisplayPct(
  value: number,
  displayAs: UsageDisplayAs,
  locale?: string,
): string {
  const percentage = formatPct(value, locale);
  return displayAs === "used"
    ? i18n.t("providerUsage.values.used", { percentage })
    : i18n.t("providerUsage.values.remaining", { amount: percentage });
}

type RelativeDuration = { unit: "now" } | { unit: "minutes" | "hours" | "days"; count: number };

function formatCount(value: number): string {
  return new Intl.NumberFormat(i18n.resolvedLanguage).format(value);
}

function relativeDuration(iso: string, now: number): RelativeDuration | null {
  const diffMs = new Date(iso).getTime() - now;
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) return { unit: "now" };
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return { unit: "days", count: diffDays };
  if (diffHours > 0) return { unit: "hours", count: diffHours };
  return { unit: "minutes", count: diffMinutes };
}

function formatRelativeDuration(duration: RelativeDuration): string | null {
  switch (duration.unit) {
    case "now":
      return null;
    case "days":
      return i18n.t("providerUsage.duration.days", {
        count: duration.count,
        value: formatCount(duration.count),
      });
    case "hours":
      return i18n.t("providerUsage.duration.hours", {
        count: duration.count,
        value: formatCount(duration.count),
      });
    case "minutes":
      return i18n.t("providerUsage.duration.minutes", {
        count: duration.count,
        value: formatCount(duration.count),
      });
  }
}

export function formatResetLabel(
  iso: string | null | undefined,
  retained = false,
  now = Date.now(),
): string | null {
  if (!iso) return null;
  const rel = relativeDuration(iso, now);
  if (!rel) return null;
  if (rel.unit === "now" && retained) return i18n.t("providerUsage.timing.resetTimePassed");
  if (rel.unit === "now") return i18n.t("providerUsage.timing.resettingNow");
  const duration = formatRelativeDuration(rel);
  return duration ? i18n.t("providerUsage.timing.resetsIn", { duration }) : null;
}

export function formatRunsOutLabel(
  iso: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!iso) return null;
  const rel = relativeDuration(iso, now);
  if (!rel) return null;
  if (rel.unit === "now") return i18n.t("providerUsage.timing.runsOutNow");
  const duration = formatRelativeDuration(rel);
  return duration ? i18n.t("providerUsage.timing.runsOutIn", { duration }) : null;
}

export function formatAgo(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const diffMs = now - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs < 60_000) return i18n.t("providerUsage.timing.justNow");
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) {
    return i18n.t("providerUsage.timing.daysAgo", {
      count: diffDays,
      value: formatCount(diffDays),
    });
  }
  if (diffHours > 0) {
    return i18n.t("providerUsage.timing.hoursAgo", {
      count: diffHours,
      value: formatCount(diffHours),
    });
  }
  return i18n.t("providerUsage.timing.minutesAgo", {
    count: diffMinutes,
    value: formatCount(diffMinutes),
  });
}

/** A balance amount as the app's language writes it: "$1,234.50", "12,345". */
export function formatAmount(value: number, unit: UsageBalanceUnit, locale?: string): string {
  switch (unit) {
    case "usd":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(value);
    case "tokens":
      return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    default:
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
}
