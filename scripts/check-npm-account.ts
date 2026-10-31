import { execFileSync } from "node:child_process";

const REQUIRED_ACCOUNT = "thisisamank";

let account = "";
try {
  account = execFileSync("npm", ["whoami"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  account = "";
}

if (account !== REQUIRED_ACCOUNT) {
  console.error(`Refusing to publish: npm is logged in as "${account || "nobody"}", not "${REQUIRED_ACCOUNT}". Run \`npm login\` as ${REQUIRED_ACCOUNT}.`);
  process.exit(1);
}
