/**
 * NeuroLink Attribution Setup
 * Initialize attribution logging when NeuroLink service starts
 *
 * Called from api/neurolink/index.js after NeuroLinkService is initialized
 */

'use strict';

const integration = require('../../lib/neurolink-attribution-integration');

/**
 * Wire attribution into NeuroLink service
 * Call this once when the NeuroLink service is initialized
 * @param {object} neuroLinkService - NeuroLinkService instance
 */
function initializeAttribution(neuroLinkService) {
  try {
    console.log('[NeuroLink Setup] Initializing attribution integration...');
    integration.setupNeuroLinkAttribution(neuroLinkService);
    console.log('[NeuroLink Setup] Attribution integration ready');
  } catch (err) {
    console.error('[NeuroLink Setup] Failed to initialize attribution:', err.message);
    // Don't fail startup — attribution is optional
  }
}

module.exports = {
  initializeAttribution,
};
