import { useMemo } from "react";
import { useInstalledPlugins } from "@/plugins/registry";
import type { InstalledPlugin, EvaluatedPluginFilePanelContribution } from "@/plugins/types";
import { filePanelCatalog, type RenderingFilePanel, type SourceFilePanel } from "./catalog";

export interface PluginFilePanel {
  id: string;
  builtin: false;
  files: EvaluatedPluginFilePanelContribution["files"];
  document: "text" | "bytes";
  maxBytes: number;
  plugin: InstalledPlugin;
  contribution: EvaluatedPluginFilePanelContribution;
}
export type FilePanel = RenderingFilePanel | PluginFilePanel | SourceFilePanel;

export function useFilePanels(serverId: string): readonly FilePanel[] {
  const plugins = useInstalledPlugins();
  return useMemo(
    () => hostFilePanels(plugins.filter((plugin) => plugin.serverId === serverId)),
    [plugins, serverId],
  );
}

/** Every host's panels; a plugin installed on several hosts contributes its panels once per host. */
export function useAllHostsFilePanels(): readonly FilePanel[] {
  const plugins = useInstalledPlugins();
  return useMemo(() => hostFilePanels(plugins), [plugins]);
}

function hostFilePanels(plugins: readonly InstalledPlugin[]): readonly FilePanel[] {
  return filePanelCatalog<PluginFilePanel>(
    plugins.flatMap((plugin) =>
      plugin.filePanels.map((contribution) => ({
        id: `plugin:${plugin.id}/${contribution.id}`,
        builtin: false,
        files: contribution.files,
        document: contribution.document,
        maxBytes: contribution.maxBytes,
        plugin,
        contribution,
      })),
    ),
  );
}
