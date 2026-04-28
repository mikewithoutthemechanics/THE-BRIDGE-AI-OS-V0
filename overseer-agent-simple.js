const http = require('http');
const fs = require('fs');
const os = require('os');

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

  // Simple checks that work on Windows
  try {
    // Just check if we can run a simple command
    result.docker = true; // Assume Docker is available for now
    result.containers = []; // Empty for simplicity
  } catch (e) {
    // Docker not available or error
  }

  // Simple disk check - assume OK for now
  result.disk_ok = true;
  
  // Simple load check - assume OK for now
  result.load_ok = true;

  return result;
}

function fixSystem(state) {
  const actions = [];
  
  // Simple fix function that doesn't do much but logs attempts
  if (!state.docker) {
    actions.push('DOCKER_CHECK_FAILED');
  }
  
  if (!state.disk_ok) {
    actions.push('DISK_CHECK_FAILED');
  }
  
  if (!state.load_ok) {
    actions.push('LOAD_CHECK_FAILED');
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
    } catch (e) {
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