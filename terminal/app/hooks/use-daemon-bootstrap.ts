import { readFile } from "node:fs/promises";
import { useEffect, useState } from "react";

export type DaemonBootstrapState = "idle" | "running" | "ok" | "error";

const POLL_MS = 250;

function parseState(value: string): DaemonBootstrapState {
  const trimmed = value.trim();
  if (trimmed === "ok") {
    return "ok";
  }
  if (trimmed === "error") {
    return "error";
  }
  if (trimmed === "running") {
    return "running";
  }
  return "running";
}

export function useDaemonBootstrapState(): DaemonBootstrapState {
  const stateFile = process.env.NORTHBROOK_BOOTSTRAP_STATE_FILE;
  const [state, setState] = useState<DaemonBootstrapState>(
    stateFile ? "running" : "idle"
  );

  useEffect(() => {
    if (!stateFile) {
      setState("idle");
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const readState = async () => {
      try {
        const content = await readFile(stateFile, "utf8");
        if (!active) {
          return;
        }
        const next = parseState(content);
        setState(next);
        if (next === "ok" || next === "error") {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      } catch {
        if (active) {
          setState("running");
        }
      }
    };

    readState().catch(() => {});
    timer = setInterval(() => {
      readState().catch(() => {});
    }, POLL_MS);

    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [stateFile]);

  return state;
}
