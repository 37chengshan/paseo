import { useTranslation } from "react-i18next";
import { usageCopy } from "./copy";
import { useUsagePreferences } from "./display";
import { useHostUsage } from "./queries";
import { UsageSection } from "./usage-section";

/** A host's usage reports, for its settings page. */
export function HostUsageSection({ serverId }: { serverId: string }) {
  useTranslation();
  const { view, refresh } = useHostUsage(serverId);
  const { display } = useUsagePreferences(serverId);
  return (
    <UsageSection
      serverId={serverId}
      title={usageCopy.planUsage}
      view={view}
      display={display}
      onRefresh={refresh}
      testID="usage-card"
    />
  );
}
