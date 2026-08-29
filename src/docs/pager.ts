import { spawn } from "node:child_process";

/**
 * Print `text`, paging through $PAGER / less when it's longer than the terminal.
 * Falls back to a plain write when not a TTY, on Windows without $PAGER, or if the pager fails.
 */
export async function printPaged(text: string, { noPager = false }: { noPager?: boolean } = {}): Promise<void> {
  const rows = process.stdout.rows ?? 0;
  const lines = text.split("\n").length;
  const canPage = process.stdout.isTTY && process.stdin.isTTY && !noPager && rows > 0 && lines > rows - 2;
  if (!canPage) {
    process.stdout.write(text);
    return;
  }
  const pagerEnv = process.env.PAGER?.trim();
  if (!pagerEnv && process.platform === "win32") {
    process.stdout.write(text);
    return;
  }
  const [cmd, ...args] = pagerEnv ? pagerEnv.split(/\s+/) : ["less", "-R", "-F", "-X"];
  await new Promise<void>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"] });
    } catch {
      process.stdout.write(text);
      resolve();
      return;
    }
    let fellBack = false;
    child.on("error", () => {
      if (!fellBack) {
        fellBack = true;
        process.stdout.write(text);
      }
      resolve();
    });
    child.on("close", () => resolve());
    child.stdin?.on("error", () => {
      /* pager closed early (q) */
    });
    child.stdin?.end(text);
  });
}
