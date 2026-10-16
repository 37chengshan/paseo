"""Failing rendering probe for https://github.com/getpaseo/paseo/issues/4634.

Prepare the packaged Android app through agent-device: foreground a conversation
with a quiet running turn, close the sidebar, and leave the device untouched.
Run this probe, then repeat on an idle conversation while that turn continues.

The default 10 FPS ceiling tests the report's expectation of few redraws. It is
an investigation hypothesis, not an agreed product performance budget. Status
rings and tool-label shimmer also animate; a failure does not identify which
animation draws, prove whole-conversation repainting, or measure device heating.
This device-dependent probe is deliberately outside the regular test suite.
"""

import argparse
import json
import re
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", default="sh.paseo")
    parser.add_argument("--seconds", type=float, default=10)
    parser.add_argument("--max-fps", type=float, default=10)
    args = parser.parse_args()
    if args.seconds <= 0 or args.max_fps < 0:
        parser.error("seconds must be positive and max-fps must be nonnegative")

    command = ["adb", "shell", "dumpsys", "gfxinfo", args.package]
    subprocess.run(command + ["reset"], check=True, capture_output=True, text=True)
    started = time.monotonic()
    time.sleep(args.seconds)
    output = subprocess.check_output(command, text=True)
    elapsed = time.monotonic() - started
    counts = re.findall(r"^Total frames rendered:\s+(\d+)", output, re.MULTILINE)
    if not counts:
        raise RuntimeError("No frame counter found; verify the app is running")
    frames = int(counts[0])
    fps = frames / elapsed
    print(
        json.dumps({"frames": frames, "seconds": elapsed, "fps": fps,
                    "maximumFps": args.max_fps}),
        flush=True,
    )
    assert fps <= args.max_fps, (
        f"Quiet-turn redraw hypothesis failed: {fps:.1f} FPS exceeds "
        f"{args.max_fps:.1f} FPS. This establishes frame frequency, not cause."
    )


if __name__ == "__main__":
    main()
