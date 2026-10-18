# Android terminal keyboard diagnostic

This is a device diagnostic for #4811, not a CI test or an established release performance budget. It measures the real native terminal and real software keyboard through agent-device. It does not inject keyboard frames or replace the terminal.

Open a terminal against an isolated daemon, hide its keyboard, and leave Android animations enabled. Use an existing agent-device session bound to the app and device being measured. For example, from the repository root:

```sh
PASEO_AGENT_DEVICE_SESSION=terminal-keyboard-stutter \
  node packages/app/e2e/mobile/terminal-keyboard/stutter.android.mjs 20
```

Pass a maximum median janky-frame percentage explicitly. The example's 20% is a diagnostic comparison threshold, not an agreed product requirement. The script warms one complete cycle, measures five opening/closing cycles, saves raw Android frame metrics to `.dev/agent-device-artifacts/terminal-keyboard-stutter/frames.json`, then fails if either median exceeds the supplied threshold. `AGENT_DEVICE_STATE_DIR` and `ANDROID_SERIAL` are honored.

Each opening uses the terminal keyboard toggle, and each closing uses Android Back. Accessibility is read only before opening, because real-IME accessibility snapshots stalled during investigation. The script verifies that the real keyboard changes visibility, waits for three stable samples, and includes another 500 ms for delayed terminal refits. It leaves the keyboard hidden and keeps the caller's session open.

Compare the same app build mode, terminal contents, device, animation settings, and threshold. Development-build and emulator numbers do not establish release or physical-device performance. A failure reproduces frame drops; it does not identify their cause or prove a proposed fix.
