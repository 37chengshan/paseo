import { execFileSync } from "node:child_process";

const session = process.argv[2];
if (!session) throw new Error("Pass the agent-device session connected to the Android fixture");

function device(...args) {
  return execFileSync("agent-device", [...args, "--session", session], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: 30_000,
  });
}

device("wait", 'label="Open menu"', "5000");
device("press", 'label="Open menu"', "--settle");
device("wait", 'label="Close sidebar"', "5000");
