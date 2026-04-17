const fs = require("fs");
const readline = require("readline");

const ENV_FILE = ".env";

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "TELEGRAM_TOKEN",
  "TELEGRAM_CHAT_ID"
];

function parseEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const lines = fs.readFileSync(ENV_FILE, "utf-8").split("\n");
  const env = {};
  lines.forEach(l => {
    const [k, v] = l.split("=");
    if (k && v) env[k.trim()] = v.trim();
  });
  return env;
}

function saveEnv(env) {
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(ENV_FILE, content);
}

async function promptMissing(env) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  for (const key of REQUIRED) {
    if (!env[key] || env[key].includes("your_") || env[key] === "") {
      env[key] = await new Promise(res =>
        rl.question(`Enter ${key}: `, res)
      );
    }
  }

  rl.close();
  saveEnv(env);
  return env;
}

module.exports = async function loadEnv() {
  let env = parseEnv();
  env = await promptMissing(env);
  return env;
};
