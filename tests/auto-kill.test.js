// auto-kill.js — JSON responses + SIWE-exempt + rate-limit regression guard.
//
// Prevents the client-side SIWE login crash:
//   "Unexpected token 'b', 'banned' is not valid JSON"
// which was caused by auto-kill.js returning plain-text error bodies.

describe('auto-kill middleware', () => {
  let autoKill;

  beforeAll(() => {
    process.env.AUTO_KILL_MAX_REQUESTS = '3';
    process.env.AUTO_KILL_WINDOW_MS    = '1000';
    process.env.AUTO_KILL_REFRESH_MS   = '0';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    jest.resetModules();
    autoKill = require('../auto-kill');
  });

  const req = (ip, path) => ({ ip, connection: { remoteAddress: ip }, path, url: path });
  const res = () => ({
    statusCode: 200, body: null, headersSent: false,
    status(c) { this.statusCode = c; return this; },
    json(x)   { this.body = x; this.headersSent = true; return this; },
    send(x)   { this.body = x; this.headersSent = true; return this; },
  });

  test('loopback passes through', async () => {
    const r = res(); let nexted = false;
    await autoKill(req('127.0.0.1', '/api/foo'), r, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(r.headersSent).toBe(false);
  });

  test('/api/siwe/* is always exempt (even under hammering)', async () => {
    for (let i = 0; i < 50; i++) {
      const r = res(); let nexted = false;
      await autoKill(req('1.1.1.1', '/api/siwe/verify'), r, () => { nexted = true; });
      expect(nexted).toBe(true);
      expect(r.headersSent).toBe(false);
    }
  });

  test('rate limit triggers JSON 429 then subsequent 403 banned — never plain text', async () => {
    const ip = '9.9.9.9';
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = res(); let nexted = false;
      await autoKill(req(ip, '/api/foo'), r, () => { nexted = true; });
      statuses.push(nexted ? 'passthrough' : { status: r.statusCode, body: r.body });
    }
    expect(statuses.slice(0, 3)).toEqual(['passthrough', 'passthrough', 'passthrough']);
    expect(statuses[3]).toMatchObject({ status: 429, body: { ok: false, error: 'rate_limited' } });
    expect(statuses[4]).toMatchObject({ status: 403, body: { ok: false, error: 'banned' } });
    expect(statuses[5]).toMatchObject({ status: 403, body: { ok: false, error: 'banned' } });
    // All error bodies are objects — no plain-text `res.send('banned')`.
    for (const s of statuses.slice(3)) expect(typeof s.body).toBe('object');
  });

  test('banned IP can still reach /api/siwe to sign in', async () => {
    // Seed ban state within this test so it does not rely on execution order.
    const ip = '7.7.7.7';
    for (let i = 0; i < 5; i++) {
      await autoKill(req(ip, '/api/foo'), res(), () => {});
    }

    const r = res(); let nexted = false;
    await autoKill(req(ip, '/api/siwe/nonce'), r, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(r.headersSent).toBe(false);
  });

  test('loadBansFromDb is exported as a named function on the module', () => {
    expect(typeof autoKill.loadBansFromDb).toBe('function');
  });
});
