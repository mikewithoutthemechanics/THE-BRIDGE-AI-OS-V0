/**
 * BRIDGE AI OS — AP2-v3 SSE Streaming Handler
 *
 * Server-Sent Events streaming for real-time token output during agent execution.
 */

'use strict';

let contract;
try { contract = require('./contract'); } catch (_) { contract = null; }

/**
 * Create an SSE stream writer bound to a response object.
 * @param {object} res - Express response object
 * @param {string} agentName - agent identifier for envelope tagging
 * @returns {{ sendChunk: Function, sendComplete: Function, sendError: Function }}
 */
function createStream(res, agentName) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx/CF buffering off
  res.flushHeaders();

  // Initial CF-safe comment frame + connection event
  res.write(':\n\n');
  res.write('data: ' + JSON.stringify({ status: 'connected', agent: agentName, ts: new Date().toISOString() }) + '\n\n');

  // Keepalive every 25s so Cloudflare's 100s idle timeout doesn't kill long agent runs
  const keepAlive = setInterval(() => {
    try { res.write(':\n\n'); } catch (_) { clearInterval(keepAlive); }
  }, 25000);
  res.on('close', () => clearInterval(keepAlive));

  return {
    /**
     * Send a streaming text chunk.
     * @param {string} text - content fragment
     * @param {number} index - zero-based chunk sequence
     */
    sendChunk(text, index) {
      const data = contract
        ? contract.streamChunk(agentName, text, index)
        : JSON.stringify({ status: 'chunk', agent: agentName, data: { content: text, index }, meta: { version: 'ap2-v3', ts: new Date().toISOString() } });
      res.write('data: ' + data + '\n\n');
    },

    /**
     * Send a completion event and close the stream.
     * @param {object} result - final result payload
     */
    sendComplete(result) {
      clearInterval(keepAlive);
      res.write('data: ' + JSON.stringify({
        status: 'complete',
        agent: agentName,
        data: result,
        meta: { version: 'ap2-v3', ts: new Date().toISOString() },
      }) + '\n\n');
      res.end();
    },

    /**
     * Send an error event and close the stream.
     * @param {string} error - error message
     */
    sendError(error) {
      clearInterval(keepAlive);
      res.write('data: ' + JSON.stringify({
        status: 'error',
        agent: agentName,
        error,
        meta: { version: 'ap2-v3', ts: new Date().toISOString() },
      }) + '\n\n');
      res.end();
    },
  };
}

module.exports = { createStream };
