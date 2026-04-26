'use strict';

const fs = require('fs');
const OpenAI = require('openai');
const graphSchema = require('./schema');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
  'You extract entity-relationship graphs from diagrams and screenshots. ' +
  'Identify every distinct labeled node and directed edge. ' +
  'Use concise snake_case ids, preserve human-readable labels, and classify node type ' +
  '(process | state | input | output | decision | actor | data).';

async function imageToGraph(imageBuffer, mime) {
  const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
  const res = await client.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    response_format: { type: 'json_schema', json_schema: graphSchema },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract nodes and edges from this image.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      }
    ]
  });

  const graph = JSON.parse(res.choices[0].message.content);
  return {
    ...graph,
    semantic: {
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      density: graph.edges.length / (graph.nodes.length || 1),
      extracted_at: new Date().toISOString()
    }
  };
}

function imageToGraphFromPath(filePath, mime) {
  const buf = fs.readFileSync(filePath);
  return imageToGraph(buf, mime);
}

module.exports = { imageToGraph, imageToGraphFromPath };
