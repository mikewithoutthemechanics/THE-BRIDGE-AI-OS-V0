'use strict';
/**
 * lib/neurolink/features.js — EEG Feature Extraction
 *
 * Extracts canonical frequency-band powers from preprocessed EEG signals
 * and computes derived metrics (engagement index, relaxation index, etc.).
 *
 * Standard EEG bands:
 *   Delta (0.5–4 Hz)  — deep sleep, unconscious processing
 *   Theta (4–8 Hz)    — drowsiness, light sleep, meditation
 *   Alpha (8–12 Hz)   — relaxed awareness, eyes closed
 *   Beta  (12–30 Hz)  — active thinking, focus, problem solving
 *   Gamma (30–50 Hz)  — higher cognition, binding, peak performance
 */
const { psd, bandPower } = require('./dsp');

/**
 * Extract all canonical EEG features from a single-channel signal.
 * @param {Float64Array} signal - preprocessed EEG signal (one window, ~1-2 seconds)
 * @param {number} sampleRate - Hz (default 256)
 * @returns {Object} feature vector
 */
function extractFeatures(signal, sampleRate = 256) {
  const spectrum = psd(signal, sampleRate);

  const delta = bandPower(spectrum, 0.5, 4);
  const theta = bandPower(spectrum, 4, 8);
  const alpha = bandPower(spectrum, 8, 12);
  const beta  = bandPower(spectrum, 12, 30);
  const gamma = bandPower(spectrum, 30, 50);

  const totalPower = delta + theta + alpha + beta + gamma;
  const safe = (v) => (totalPower > 0 ? v / totalPower : 0);

  return {
    // Absolute band powers (µV²/Hz)
    delta, theta, alpha, beta, gamma,
    totalPower,

    // Relative band powers (0–1, normalized)
    relDelta: safe(delta),
    relTheta: safe(theta),
    relAlpha: safe(alpha),
    relBeta:  safe(beta),
    relGamma: safe(gamma),

    // Derived ratios (standard neurofeedback metrics)
    engagementIndex:  (alpha + theta) > 0 ? beta / (alpha + theta) : 0,
    relaxationIndex:  beta > 0 ? alpha / beta : 0,
    fatigueIndex:     alpha > 0 ? theta / alpha : 0,
    cognitiveLoad:    (delta + theta) > 0 ? (beta + gamma) / (delta + theta) : 0,

    // Asymmetry (requires multi-channel — placeholder for single channel)
    frontalAsymmetry: 0,

    // Signal quality indicators
    signalQuality: computeSignalQuality(signal, totalPower),
    sampleCount: signal.length,
    ts: Date.now(),
  };
}

/**
 * Extract features from multi-channel EEG data.
 * Averages features across channels, computes asymmetry from frontal pair.
 * @param {Float64Array[]} channels - array of channel signals
 * @param {number} sampleRate
 * @returns {Object} averaged feature vector
 */
function extractMultiChannelFeatures(channels, sampleRate = 256) {
  if (channels.length === 0) return extractFeatures(new Float64Array(256), sampleRate);
  if (channels.length === 1) return extractFeatures(channels[0], sampleRate);

  const features = channels.map(ch => extractFeatures(ch, sampleRate));

  // Average all scalar features
  const avg = {};
  const keys = Object.keys(features[0]).filter(k => typeof features[0][k] === 'number');
  for (const k of keys) {
    avg[k] = features.reduce((s, f) => s + f[k], 0) / features.length;
  }

  // Frontal asymmetry: compare left (ch0) vs right (ch1) alpha
  // Positive = left > right = approach motivation
  // Negative = right > left = withdrawal motivation
  if (features.length >= 2) {
    const leftAlpha = features[0].alpha;
    const rightAlpha = features[1].alpha;
    const maxAlpha = Math.max(leftAlpha, rightAlpha, 0.001);
    avg.frontalAsymmetry = (leftAlpha - rightAlpha) / maxAlpha;
  }

  avg.channelCount = channels.length;
  avg.ts = Date.now();
  return avg;
}

/**
 * Estimate signal quality from 0 (useless) to 100 (excellent).
 * Based on: total power in physiological range, absence of flatlines, variance.
 */
function computeSignalQuality(signal, totalPower) {
  if (signal.length < 10) return 0;

  // Check for flatline (variance too low)
  let sum = 0, sumSq = 0;
  for (let i = 0; i < signal.length; i++) {
    sum += signal[i];
    sumSq += signal[i] * signal[i];
  }
  const mean = sum / signal.length;
  const variance = sumSq / signal.length - mean * mean;

  if (variance < 0.001) return 5; // flatline

  // Check for saturation (too many max-amplitude samples)
  let saturated = 0;
  for (let i = 0; i < signal.length; i++) {
    if (Math.abs(signal[i]) > 100) saturated++;
  }
  const saturationRatio = saturated / signal.length;

  // Score: penalize low power, high saturation, low variance
  let quality = 80;
  if (totalPower < 0.1) quality -= 30;
  if (saturationRatio > 0.1) quality -= saturationRatio * 200;
  if (variance < 1) quality -= 20;
  if (variance > 0.5 && totalPower > 0.1 && saturationRatio < 0.05) quality = 95;

  return Math.max(0, Math.min(100, Math.round(quality)));
}

module.exports = {
  extractFeatures,
  extractMultiChannelFeatures,
  computeSignalQuality,
};
