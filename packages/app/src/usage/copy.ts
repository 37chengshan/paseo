import type { UsageProblem } from "@getpaseo/protocol/messages";
import { i18n } from "@/i18n/i18next";
import { formatAgo } from "./format";

// User-facing copy for the usage surfaces, kept in one file so localization is a
// single-file change.
export const usageCopy = {
  problem: (problem: UsageProblem, now: Date = new Date()): string => {
    if (problem.kind === "no_quota") return problem.detail;
    const remedy = problem.refreshedBy
      ? i18n.t("providerUsage.runToRefresh", { command: problem.refreshedBy })
      : i18n.t("providerUsage.signInAgain");
    if (problem.kind === "rejected")
      return i18n.t("providerUsage.loginRejected", { status: problem.status, remedy });
    return i18n.t("providerUsage.loginExpired", {
      relativeTime: formatAgo(problem.expiresAt, now.getTime()),
      remedy,
    });
  },
  get title() {
    return i18n.t("providerUsage.title");
  },
  get planUsage() {
    return i18n.t("providerUsage.title");
  },
  get options() {
    return i18n.t("providerUsage.options");
  },
  get refresh() {
    return i18n.t("providerUsage.refresh");
  },
  get refreshAll() {
    return i18n.t("providerUsage.refreshAll");
  },
  get refreshing() {
    return i18n.t("providerUsage.refreshing");
  },
  get refreshFailed() {
    return i18n.t("providerUsage.refreshFailed");
  },
  get loading() {
    return i18n.t("providerUsage.loading");
  },
  get empty() {
    return i18n.t("providerUsage.empty");
  },
  get noHosts() {
    return i18n.t("providerUsage.noHosts");
  },
  get errorTitle() {
    return i18n.t("providerUsage.errorTitle");
  },
  agentError: (reason: string) => i18n.t("providerUsage.agentError", { reason }),
  hostUnavailable: (host: string) => i18n.t("providerUsage.hostUnavailable", { host }),
  hostUpgradeRequired: (host: string) => i18n.t("providerUsage.hostUpgradeRequired", { host }),
  get clientUnavailable() {
    return i18n.t("providerUsage.clientUnavailable");
  },
  get retry() {
    return i18n.t("providerUsage.retry");
  },
  get pin() {
    return i18n.t("providerUsage.pin");
  },
  get unpin() {
    return i18n.t("providerUsage.unpin");
  },
  get displayAs() {
    return i18n.t("providerUsage.displayAs");
  },
  get displayUsed() {
    return i18n.t("providerUsage.displayUsed");
  },
  get displayRemaining() {
    return i18n.t("providerUsage.displayRemaining");
  },
  get showInSidebar() {
    return i18n.t("providerUsage.showInSidebar");
  },
  get showInSidebarHint() {
    return i18n.t("providerUsage.showInSidebarHint");
  },
} as const;
