'use strict';

module.exports = {
  name: 'image_graph',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string' }
          },
          required: ['id', 'label', 'type']
        }
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            label: { type: 'string' }
          },
          required: ['from', 'to', 'label']
        }
      }
    },
    required: ['nodes', 'edges']
  }
};
