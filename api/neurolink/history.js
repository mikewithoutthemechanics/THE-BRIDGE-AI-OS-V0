/**
 * NeuroLink History Storage
 * Tracks 24h+ state trends for anomaly detection and scheduling
 * Uses Vercel Blob for production, local filesystem for development
 */

const fs = require('fs');
const path = require('path');

let blobClient = null;
const IS_PROD = process.env.NODE_ENV === 'production';

// Try to load Vercel Blob for production
if (IS_PROD) {
  try {
    const { blob } = require('@vercel/blob');
    blobClient = blob;
  } catch (e) {
    console.warn('Vercel Blob not available, falling back to local storage');
  }
}

class NeuroHistory {
  constructor(storagePath = path.join(__dirname, '../../data/neuro-history')) {
    this.storagePath = storagePath;
    if (!IS_PROD && !fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Get date key for file storage (YYYY-MM-DD)
   */
  getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get blob key for Vercel Blob storage
   */
  getBlobKey(dateKey) {
    return `neuro-history/${dateKey}.json`;
  }

  /**
   * Load history for a specific day
   */
  async loadDay(dateKey) {
    if (IS_PROD && blobClient) {
      return this._loadDayBlob(dateKey);
    }
    return this._loadDayLocal(dateKey);
  }

  /**
   * Load from Vercel Blob
   */
  async _loadDayBlob(dateKey) {
    try {
      const blobKey = this.getBlobKey(dateKey);
      const response = await fetch(`${process.env.BLOB_READ_WRITE_TOKEN}/file/${blobKey}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn(`Failed to load neuro-history from Blob for ${dateKey}:`, err.message);
    }
    return this.createEmptyDay(dateKey);
  }

  /**
   * Load from local filesystem
   */
  _loadDayLocal(dateKey) {
    const filePath = path.join(this.storagePath, `${dateKey}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error(`Failed to load neuro-history for ${dateKey}:`, err.message);
    }
    return this.createEmptyDay(dateKey);
  }

  /**
   * Create empty day structure
   */
  createEmptyDay(dateKey) {
    return {
      date: dateKey,
      points: [],
      anomalies: [],
      peakWindows: {
        focus: [],
        fatigue: []
      }
    };
  }

  /**
   * Add a state point to history
   */
  async addPoint(state) {
    const dateKey = this.getDateKey();
    const day = await this.loadDay(dateKey);

    const point = {
      timestamp: state.timestamp,
      focus: state.focus.value,
      stress: state.stress.value,
      fatigue: state.fatigue.value,
      valence: state.emotion.valence.value,
      arousal: state.emotion.arousal.value,
      dominance: state.emotion.dominance.value,
      mode: state.source,
      intent: state.intent.label
    };

    day.points.push(point);

    // Detect anomalies
    this.detectAnomalies(day);

    // Find peak windows
    this.findPeakWindows(day);

    await this.saveDay(dateKey, day);
  }

  /**
   * Detect anomalies (burnout, sudden stress spikes, etc.)
   */
  detectAnomalies(day) {
    if (day.points.length < 10) return; // Need baseline

    const lastPoints = day.points.slice(-10);
    const avgFatigue = lastPoints.reduce((s, p) => s + p.fatigue, 0) / lastPoints.length;
    const avgStress = lastPoints.reduce((s, p) => s + p.stress, 0) / lastPoints.length;

    // Burnout pattern: sustained high stress + high fatigue
    if (avgStress > 0.75 && avgFatigue > 0.75) {
      if (!day.anomalies.includes('BURNOUT_RISK')) {
        day.anomalies.push('BURNOUT_RISK');
      }
    }

    // Stress spike
    const recentStress = lastPoints.map(p => p.stress);
    if (recentStress[recentStress.length - 1] > 0.85) {
      if (!day.anomalies.includes('HIGH_STRESS')) {
        day.anomalies.push('HIGH_STRESS');
      }
    }
  }

  /**
   * Find peak performance windows
   */
  findPeakWindows(day) {
    const threshold = {
      focus: 0.8,
      fatigue: 0.75
    };

    let focusWindow = null;
    let fatigueWindow = null;

    day.points.forEach((point, idx) => {
      // Focus peak
      if (point.focus > threshold.focus) {
        if (!focusWindow) {
          focusWindow = { start: point.timestamp, end: point.timestamp };
        } else {
          focusWindow.end = point.timestamp;
        }
      } else {
        if (focusWindow) {
          day.peakWindows.focus.push(focusWindow);
          focusWindow = null;
        }
      }

      // Fatigue peak
      if (point.fatigue > threshold.fatigue) {
        if (!fatigueWindow) {
          fatigueWindow = { start: point.timestamp, end: point.timestamp };
        } else {
          fatigueWindow.end = point.timestamp;
        }
      } else {
        if (fatigueWindow) {
          day.peakWindows.fatigue.push(fatigueWindow);
          fatigueWindow = null;
        }
      }
    });

    // Close any open windows
    if (focusWindow) day.peakWindows.focus.push(focusWindow);
    if (fatigueWindow) day.peakWindows.fatigue.push(fatigueWindow);
  }

  /**
   * Save day to storage
   */
  async saveDay(dateKey, day) {
    if (IS_PROD && blobClient) {
      await this._saveDayBlob(dateKey, day);
    } else {
      this._saveDayLocal(dateKey, day);
    }
  }

  /**
   * Save to Vercel Blob
   */
  async _saveDayBlob(dateKey, day) {
    try {
      const blobKey = this.getBlobKey(dateKey);
      const response = await fetch(`${process.env.BLOB_READ_WRITE_TOKEN}/file/${blobKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(day)
      });
      if (!response.ok) {
        console.error(`Failed to save neuro-history to Blob for ${dateKey}:`, response.statusText);
      }
    } catch (err) {
      console.error(`Failed to save neuro-history to Blob for ${dateKey}:`, err.message);
    }
  }

  /**
   * Save to local filesystem
   */
  _saveDayLocal(dateKey, day) {
    const filePath = path.join(this.storagePath, `${dateKey}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(day, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Failed to save neuro-history for ${dateKey}:`, err.message);
    }
  }

  /**
   * Get last N days of history
   */
  async getHistory(days = 1) {
    const result = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = this.getDateKey(date);
      const day = await this.loadDay(dateKey);
      if (day.points.length > 0) {
        result.push(day);
      }
    }

    return result;
  }

  /**
   * Get recent state points (last N states)
   */
  async getRecentStates(limit = 100) {
    const today = await this.loadDay(this.getDateKey());
    return today.points.slice(-limit);
  }

  /**
   * Get summary statistics for a day
   */
  async getDaySummary(dateKey) {
    const day = await this.loadDay(dateKey);
    if (day.points.length === 0) {
      return null;
    }

    const points = day.points;
    const stats = {
      date: dateKey,
      pointCount: points.length,
      avgFocus: points.reduce((s, p) => s + p.focus, 0) / points.length,
      avgStress: points.reduce((s, p) => s + p.stress, 0) / points.length,
      avgFatigue: points.reduce((s, p) => s + p.fatigue, 0) / points.length,
      maxStress: Math.max(...points.map(p => p.stress)),
      minFocus: Math.min(...points.map(p => p.focus)),
      anomalies: day.anomalies,
      peakFocusWindows: day.peakWindows.focus.length,
      peakFatigueWindows: day.peakWindows.fatigue.length
    };

    return stats;
  }
}

module.exports = {
  NeuroHistory
};
