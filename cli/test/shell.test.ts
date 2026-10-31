import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { exportLine, hookScript } from "../src/shell.ts";

const TRICKY = `it's "quoted" $HOME \`whoami\` $(id) \\ \n second line`;

for (const shell of ["bash", "zsh"] as const) {
  test(`${shell}: exported values survive quoting unchanged`, () => {
    const output = execFileSync(shell, ["-c", `${exportLine("VALUE", TRICKY)}; printf '%s' "$VALUE"`], { encoding: "utf8" });
    assert.equal(output, TRICKY);
  });

  test(`${shell}: the hook script is valid syntax`, () => {
    execFileSync(shell, ["-n", "-c", hookScript(shell)]);
  });
}
