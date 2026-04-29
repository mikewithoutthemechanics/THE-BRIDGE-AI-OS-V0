const http = require('http');
const { execSync } = require('child_process');
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

  // Check Docker
  try {
    execSync('docker version', { stdio: 'ignore' });
    result.docker = true;
    
    // Get container list (Windows compatible)
    try {
      const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
      result.containers = output
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    } catch (e) {
      // If ps fails, just leave containers empty
    }
  } catch (e) {
    // Docker not available
  }

  // Check disk usage (Windows alternative)
  try {
    // Use wmic to get disk usage on Windows
    const output = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size', { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    if (lines.length >= 3) {
      const parts = lines[2].trim().split(/\s+/);
      if (parts.length >= 2) {
        const freeSpace = parseInt(parts[0]);
        const totalSize = parseInt(parts[1]);
        const usedPercentage = ((totalSize - freeSpace) / totalSize) * 100;
        result.disk_ok = usedPercentage < 90;
      }
    }
  } catch (e) {
    // If wmic fails, assume disk is OK
  }

  // Check load average (Windows alternative using typeperf)
  try {
    // Get processor queue length as a simple load indicator
    const output = execSync('typeperf "\\System\\Processor Queue Length" -sc 1', { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    if (lines.length >= 3) {
      const valuePart = lines[2].split(',')[1];
      const loadValue = parseFloat(valuePart.replace(/"/g, ''));
      // Consider load OK if queue length < 2 (similar to original threshold)
      result.load_ok = loadValue < 2;
    }
  } catch (e) {
    // If typeperf fails, assume load is OK
  }

  return result;
}

function fixSystem(state) {
  const actions = [];

  if (!state.docker) {
    try {
      // On Windows, try to start Docker service
      execSync('net start com.docker.service');
      actions.push('DOCKER_STARTED');
    } catch (e) {
      // Ignore if Docker service start fails
    }
  }

  // Skip container checking for now since we don't have those specific containers
  // In a real scenario, you'd check for Windows-specific services or containers

  // Disk cleanup (Windows)
  if (!state.disk_ok) {
    try {
      // Clean temporary files
      execSync('rmdir /s /q %TEMP%', { stdio: 'ignore' });
      actions.push('DISK_CLEANED');
    } catch (e) {
      // Ignore cleanup errors
    }
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