const { exec } = require('child_process');
const { promisify } = require('util');
const pexec = promisify(exec);
async function pm2List() {
  try {
    const { stdout } = await pexec('pm2 jlist', { maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch { return []; }
}
async function pm2Action(name, action) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('invalid name');
  if (!['restart', 'reload', 'stop', 'start'].includes(action)) throw new Error('invalid action');
  const { stdout, stderr } = await pexec(`pm2 ${action} ${name}`, { maxBuffer: 1024 * 1024 });
  return { stdout, stderr };
}
module.exports = { pm2List, pm2Action };
