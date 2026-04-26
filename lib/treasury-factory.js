'use strict';

/**
 * Treasury Service Factory
 * Manages singleton instance and lazy initialization
 */

const TreasuryService = require('../services/treasury-service');

let treasuryServiceInstance = null;

/**
 * Initialize Treasury Service with database
 * Call this once during app startup after connecting to DB
 */
function initTreasuryService(db) {
  if (!treasuryServiceInstance) {
    treasuryServiceInstance = new TreasuryService(db);
    console.log('[Treasury Factory] Service initialized');
  }
  return treasuryServiceInstance;
}

/**
 * Get Treasury Service instance (lazy-loads if needed with provided DB)
 */
function getTreasuryService(db = null) {
  if (!treasuryServiceInstance && db) {
    return initTreasuryService(db);
  }
  if (!treasuryServiceInstance) {
    throw new Error('[Treasury Factory] Service not initialized. Call initTreasuryService(db) first.');
  }
  return treasuryServiceInstance;
}

module.exports = {
  initTreasuryService,
  getTreasuryService,
};
