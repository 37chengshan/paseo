import type { ComponentProps } from "react";
import type { ExplorerFile } from "@/stores/session-store";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import type { FilePanel } from "./panels";
import type { SourceFilePanel } from "./catalog";
import { BuiltinFilePanelView } from "./builtin";
import { PluginFilePanelHost } from "./plugin-host";
import { bytesDocument, textDocument } from "./document";

/** Renders a file panel as the file tab's body. Source is the tab's own editor, not hosted here. */
export function FilePanelView(
  props: Omit<ComponentProps<typeof BuiltinFilePanelView>, "panel"> & {
    panel: Exclude<FilePanel, SourceFilePanel>;
    preview: ExplorerFile;
    bytes: Uint8Array | null;
    location: WorkspaceFileLocation;
    navigationRevision: number;
    setText?: (text: string) => void;
  },
) {
  const { panel, preview } = props;
  if (panel.builtin) return <BuiltinFilePanelView {...props} panel={panel} />;
  let document;
  if (panel.document === "text") document = textDocument(props.content, props.setText);
  else if (props.bytes && props.documentPreviewUri)
    document = bytesDocument(props.bytes, props.documentPreviewUri);
  if (!document) return null;
  return (
    <PluginFilePanelHost
      workspaceRoot={props.workspaceRoot}
      panel={panel}
      preview={preview}
      location={props.location}
      navigationRevision={props.navigationRevision}
      document={document}
    />
  );
}
