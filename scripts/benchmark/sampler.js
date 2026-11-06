/**
 * Per-process CPU and memory sampler for the benchmark Hardhat node.
 *
 * Windows: one long-lived PowerShell process polls Get-Process -Id <pid> every intervalMs and prints
 *   epochMs,cpuMsDelta,wallMsDelta,workingSetBytes,privateBytes
 * CPU % of one core   = cpuMsDelta / wallMsDelta × 100          (can exceed 100 if multi-threaded)
 * CPU % of machine    = CPU % of one core / logical CPU count
 * Memory              = working set (resident memory) of the Hardhat node process
 *
 * Only the Hardhat node's PID is measured — not the whole system and not the benchmark client.
 */
const os = require("os");
const { spawn } = require("child_process");

class ResourceSampler {
  constructor(pid, intervalMs = 250) {
    this.pid = pid;
    this.intervalMs = intervalMs;
    this.samples = [];
    this.cores = os.cpus().length;
  }

  start() {
    if (process.platform !== "win32") throw new Error("ResourceSampler currently supports Windows only.");
    const script = `
      $ErrorActionPreference = 'Stop'
      $p = Get-Process -Id ${Number(this.pid)}
      $prevCpu = $p.TotalProcessorTime.TotalMilliseconds
      $sw = [Diagnostics.Stopwatch]::StartNew(); $prevT = 0.0
      while ($true) {
        Start-Sleep -Milliseconds ${Number(this.intervalMs)}
        try { $p = Get-Process -Id ${Number(this.pid)} } catch { break }
        $cpu = $p.TotalProcessorTime.TotalMilliseconds; $t = $sw.Elapsed.TotalMilliseconds
        $line = [string]::Format([Globalization.CultureInfo]::InvariantCulture, "{0},{1},{2},{3},{4}",
          [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), ($cpu - $prevCpu), ($t - $prevT), $p.WorkingSet64, $p.PrivateMemorySize64)
        [Console]::Out.WriteLine($line)
        [Console]::Out.Flush()
        $prevCpu = $cpu; $prevT = $t
      }`;
    this.proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let buffer = "";
    this.proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const [t, cpuMs, wallMs, ws, priv] = line.split(",").map(Number);
        if (!Number.isFinite(t) || !(wallMs > 0)) continue;
        const cpuCorePct = (cpuMs / wallMs) * 100;
        this.samples.push({
          t,
          tStart: t - wallMs,
          cpuCorePct,
          cpuMachinePct: cpuCorePct / this.cores,
          memoryMB: ws / 1048576,
          privateMB: priv / 1048576,
        });
      }
    });
    return this.waitForFirstSample();
  }

  async waitForFirstSample(timeoutMs = 15000) {
    const start = Date.now();
    while (!this.samples.length) {
      if (Date.now() - start > timeoutMs) throw new Error("Resource sampler produced no samples");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Samples whose measurement interval overlaps [fromMs, toMs] (epoch ms). */
  window(fromMs, toMs) {
    return this.samples.filter((s) => s.t >= fromMs && s.tStart <= toMs);
  }

  stop() {
    if (this.proc && !this.proc.killed) this.proc.kill();
  }
}

module.exports = { ResourceSampler };
