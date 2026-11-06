import type { Socket } from "node:net";
import type { IPty } from "node-pty";

/**
 * Compatibility shim for the pinned node-pty 1.2.0-beta.18.
 * Its bundled-ConPTY path leaves the output worker alive when a terminal exits
 * without another output chunk. Release it AFTER onExit, when output has drained.
 * Keep this isolated: these are private members, checked by the subprocess
 * lifecycle regression test. Reassess this shim when upgrading node-pty.
 */
export function releaseWindowsPty(terminal: IPty): void {
  if (process.platform !== "win32") return;
  const agent = (
    terminal as IPty & {
      _agent: {
        _inSocket: Socket;
        _conoutSocketWorker: { dispose(): void };
      };
    }
  )._agent;
  agent._inSocket.destroy();
  agent._conoutSocketWorker.dispose();
}
