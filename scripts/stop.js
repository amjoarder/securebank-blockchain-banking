/**
 * Stops ONLY the processes recorded by this project in .run/processes.json,
 * and only after confirming each one's command line points inside this project folder.
 * Usage: npm run stop
 */
const { readPids, unregisterPid, stopOwnProcess } = require("./lib/runtime");

const entries = readPids();
if (entries.length === 0) {
  console.log("No Assignment 3 processes are recorded as running.");
}
for (const { name, pid } of entries) {
  if (stopOwnProcess(pid)) {
    console.log(`Stopped ${name} (PID ${pid}).`);
  } else {
    console.log(`Skipped ${name} (PID ${pid}): not running, or not an Assignment 3 process.`);
  }
  unregisterPid(pid);
}
