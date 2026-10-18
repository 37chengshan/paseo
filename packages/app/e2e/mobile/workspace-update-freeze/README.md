# Android input delay diagnostic

Diagnostic evidence for https://github.com/getpaseo/paseo/issues/4408, not a fix or a CI test.

Observed with the published Android 0.11.4 APK on an Android 16 emulator and a main
daemon at 7c7b6555f17a88cffddf484129cd04ad79704f59. The fixture has 400 active
workspaces sharing one checkout, plus a synthetic 110-turn conversation and a
five-minute mock-provider stream. Clean/dirty transitions emitted 400 workspace
updates each. The JavaScript thread reached 96–100% CPU, and tapping Open menu
did not expose Close sidebar within five seconds. The same process stayed alive.

This combines the many-workspace and streaming reports. It does not isolate which
work causes the delay, reproduce an allocation crash, or establish that the
contributor's byte-counting optimization fixes it. An emulator is not the affected
physical phone. No forced memory pressure, forced garbage collection, or fake
client responses are used. The daemon's existing mock provider supplies synthetic
agent output through the normal transport.

## Run

Use a disposable emulator with the published app installed and agent-device
0.20.3 or later. Preserve its previous state before changing its app installation.
Build the repository's server dependencies first. All commands below run from
the repository root in a disposable worktree.

1. Start `npx tsx packages/app/e2e/mobile/workspace-update-freeze/fixture.ts`.
   It writes an isolated home under `.dev/workspace-update-freeze`, starts an
   isolated daemon, and exposes it on local TCP port 45151. Do not use an existing
   daemon or point this script at real data.
2. Forward that port to the emulator, open the app with an agent-device session,
   and add a direct connection to that isolated daemon. Open the sidebar and
   verify that the Android reproduction project and workspace rows are visible.
3. Start `npx tsx packages/app/e2e/mobile/workspace-update-freeze/stream.ts`.
   Wait for `HISTORY_READY`. The script writes the agent ID to
   `.dev/workspace-update-freeze/history-ready` and starts the five-minute stream.
4. Open `paseo://h/diag515a/agent/<agent-id>` with agent-device, using the generated
   ID. Dismiss the notification prompt if present. Verify that the agent's text
   and Stop agent button are visible, then scroll the conversation.
5. Start `node packages/app/e2e/mobile/workspace-update-freeze/toggle.mjs` in a
   separate terminal. It toggles the fixture's tracked file every three seconds
   for 90 seconds. `events.json` records workspace updates observed by an actual
   subscribed daemon client; initial subscription updates are included.
6. While the toggles and stream are active, run:

   ```sh
   node packages/app/e2e/mobile/workspace-update-freeze/android.mjs <device-session>
   ```

   It taps Open menu and requires Close sidebar within five seconds. The observed
   failure was a timeout for Close sidebar while Open menu remained visible.
   This asserts an input delay, not an application crash or its root cause.

Stop the fixture with SIGTERM to close its client, proxy, and isolated daemon.
Close the agent-device session and restore the emulator's prior state afterward.
Do not interpret a passing run as disproving the physical-device reports.
