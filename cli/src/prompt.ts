import { createInterface } from "node:readline/promises";
import { text } from "node:stream/consumers";

export async function readSecretValue(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await text(process.stdin)).replace(/\r?\n$/, "");
  }

  process.stderr.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          finish();
          return resolve(value);
        }
        if (char === "\u0003") {
          finish();
          process.exit(130);
        }
        value = char === "\u007f" ? value.slice(0, -1) : value + char;
      }
    };
    const finish = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
    };
    process.stdin.on("data", onData);
  });
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const readline = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await readline.question(`${question} [y/N] `);
  readline.close();
  return answer.trim().toLowerCase() === "y";
}
