const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');

const PORT = 7070;
const LOG = './overseer.log';
const STATE = './agent-state.json';

const now = () => new Date().toISOString();

function log(entry) {
  const line = JSON.stringify({ time: now(), ...entry });
  fs.appendFileSync(LOG, line + '\n');
}

function getState() {
  try {
    return JSON.parse(fs.readFileSync(STATE));
  } catch {
    return { status: 'INIT' };
  }
}

function setState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

function checkSystem() {
  const result = {
    docker: false,
    containers: [],
    disk_ok: true,
    load_ok: true,
  };

  try {
    execSync('docker ps', { stdio: 'ignore' });
    result.docker = true;
    result.containers = execSync('docker ps --format "{{.Names}}"')
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {}

  try {
    const disk = execSync("df / | tail -1 | awk '{print $5}'")
      .toString()
      .replace('%', '');
    result.disk_ok = Number(disk) < 90;
  } catch {}

  try {
    const load = execSync("uptime | awk -F'load average:' '{ print $2 }'")
      .toString()
      .split(',')[0];
    result.load_ok = Number(load) < 2;
  } catch {}

  return result;
}

function fixSystem(state) {
  const actions = [];

  if (!state.docker) {
    try {
      execSync('systemctl start docker');
      actions.push('DOCKER_STARTED');
    } catch {}
  }

  const required = ['prometheus', 'node-exporter', 'blackbox-exporter'];

  required.forEach((name) => {
    if (!state.containers.includes(name)) {
      try {
        execSync(`docker start ${name}`);
        actions.push(`RESTARTED_${name}`);
      } catch {
        actions.push(`MISSING_${name}`);
      }
    }
  });

  if (!state.disk_ok) {
    try {
      execSync('docker system prune -af');
      actions.push('DISK_CLEANED');
    } catch {}
  }

  return actions;
}

function overseerLoop() {
  const state = checkSystem();
  log({ type: 'STATE', state });

  const actions = fixSystem(state);
  if (actions.length > 0) {
    log({ type: 'FIX', actions });
  }

  setState(state);
}

const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.end(JSON.stringify(getState()));
  } else if (req.url === '/fix') {
    const state = checkSystem();
    const actions = fixSystem(state);
    res.end(JSON.stringify({ actions }));
  } else if (req.url === '/logs') {
    try {
      res.end(fs.readFileSync(LOG, 'utf-8'));
    } catch {
      res.end('No logs');
    }
  } else {
    res.end('OVERSEER ACTIVE');
  }
});

setInterval(overseerLoop, 5000);

server.listen(PORT, () => {
  console.log(`🧠 OVERSEER RUNNING → http://localhost:${PORT}`);
});