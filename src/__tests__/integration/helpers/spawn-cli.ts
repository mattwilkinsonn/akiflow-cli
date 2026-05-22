import { spawn } from "bun";
import { join } from "node:path";

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
}

// Resolve repo root from this file's location:
// src/__tests__/integration/helpers/spawn-cli.ts → up 4 → repo root
const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

/**
 * Spawn the CLI as a subprocess and capture stdout/stderr/exit code.
 *
 * Uses `bun run src/index.ts` (interpreted) rather than the compiled
 * binary — faster for test iteration and same code path. Phase 10
 * includes a separate built-binary smoke test.
 */
export async function spawnCli(
  args: string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> {
  const proc = spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
    stdin: opts.stdin ? "pipe" : "inherit",
  });

  if (opts.stdin && proc.stdin) {
    const writer = (
      proc.stdin as {
        getWriter: () => {
          write: (b: Uint8Array) => Promise<void>;
          close: () => Promise<void>;
        };
      }
    ).getWriter();
    await writer.write(new TextEncoder().encode(opts.stdin));
    await writer.close();
  }

  const timeout = opts.timeoutMs ?? 10_000;
  const timer = setTimeout(() => {
    proc.kill();
  }, timeout);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}
