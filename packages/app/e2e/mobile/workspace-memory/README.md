# Android workspace memory diagnostic

Supplemental reproduction for [#4408](https://github.com/getpaseo/paseo/issues/4408), using the production 0.11.2 APK on an Android 16 emulator. This tests an adapted failure: opening the sidebar with 800 projects, each containing one workspace, produced a `LOW_MEMORY` exit after 66–90 seconds. It does not reproduce the reported 18-second cold-start ANR or establish its cause.

Before running:

- Use a dedicated emulator with the production APK installed and notifications permission settled. Bind the agent-device session to that emulator before running.
- Pair the app with an isolated daemon containing 800 active workspaces, each in its own project. Use Project grouping and leave projects expanded. The observed fixture used existing directories inside a Git checkout, with workspace titles permuted by `(index * 317) % 800`, no agents, and no terminals.
- Record the daemon revision, emulator RAM and Java heap settings, and the project/workspace distribution. Device memory pressure controls whether Android kills the app.

Run from the repository root with the agent-device session, Android serial, and an artifact directory:

```sh
node packages/app/e2e/mobile/workspace-memory/android.mjs workspace-memory emulator-5556 .dev/workspace-memory
```

The test cold-starts the paired app, opens its sidebar, samples memory and the process ID every five seconds for two minutes, and verifies that closing the sidebar responds. A process exit or restart fails the assertion. Memory, exit records, and logs stay in the supplied artifact directory.

Control: repeat with 800 workspaces grouped into one project. That distribution survived the two-minute automated check and responded to closing the sidebar, with total PSS near 300 MB. The project-per-workspace fixture reached about 2.5 GB PSS before Android recorded `LOW_MEMORY`; its Java heap rose and fell rather than showing the reporter's full-heap ANR. Neither result proves that shared collators would fix the report.

This diagnostic is deliberately outside CI and contains no production change.
