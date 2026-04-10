'use strict';
/**
 * lib/neurolink/dsp.js — Digital Signal Processing for EEG
 *
 * Pure-JS implementation of the core DSP pipeline:
 *   RAW EEG → Bandpass (1–50 Hz) → Notch (50/60 Hz) → Artifact removal → Windowing
 *
 * Operates on Float64Array buffers. No external dependencies.
 * Designed for real-time: each function processes one window (<5ms at 256Hz, 512 samples).
 */

// ── FFT (Cooley-Tukey radix-2) ──────────────────────────────────────────────
// Returns complex spectrum as [re0, im0, re1, im1, ...] interleaved

function fft(real, imag) {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = real[i + j];
        const uIm = imag[i + j];
        const vRe = real[i + j + len / 2] * curRe - imag[i + j + len / 2] * curIm;
        const vIm = real[i + j + len / 2] * curIm + imag[i + j + len / 2] * curRe;
        real[i + j] = uRe + vRe;
        imag[i + j] = uIm + vIm;
        real[i + j + len / 2] = uRe - vRe;
        imag[i + j + len / 2] = uIm - vIm;
        const tmpRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = tmpRe;
      }
    }
  }
}

/**
 * Compute power spectral density from a time-domain signal.
 * @param {Float64Array} signal - time-domain samples
 * @param {number} sampleRate - Hz (e.g. 256)
 * @returns {{ frequencies: Float64Array, power: Float64Array }}
 */
function psd(signal, sampleRate) {
  // Zero-pad to next power of 2
  const n = 1 << Math.ceil(Math.log2(signal.length));
  const real = new Float64Array(n);
  const imag = new Float64Array(n);

  // Apply Hanning window
  for (let i = 0; i < signal.length; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (signal.length - 1)));
    real[i] = signal[i] * w;
  }

  fft(real, imag);

  const halfN = n / 2;
  const power = new Float64Array(halfN);
  const frequencies = new Float64Array(halfN);
  const binWidth = sampleRate / n;

  for (let i = 0; i < halfN; i++) {
    frequencies[i] = i * binWidth;
    power[i] = (real[i] * real[i] + imag[i] * imag[i]) / n;
  }

  return { frequencies, power };
}

// ── Filters ──────────────────────────────────────────────────────────────────

/**
 * Simple IIR bandpass filter (2nd order Butterworth approximation).
 * For real-time EEG: lowCut=1 Hz, highCut=50 Hz.
 */
function bandpassFilter(signal, lowCut, highCut, sampleRate = 256) {
  const out = new Float64Array(signal.length);
  const dt = 1 / sampleRate;
  const rc1 = 1 / (2 * Math.PI * lowCut);
  const rc2 = 1 / (2 * Math.PI * highCut);
  const alpha1 = dt / (rc1 + dt);
  const alpha2 = rc2 / (rc2 + dt);

  // High-pass (removes DC drift + low freq)
  let hp = 0;
  const hpOut = new Float64Array(signal.length);
  for (let i = 1; i < signal.length; i++) {
    hp = alpha2 * (hp + signal[i] - signal[i - 1]);
    hpOut[i] = hp;
  }

  // Low-pass (removes high freq noise)
  out[0] = hpOut[0];
  for (let i = 1; i < signal.length; i++) {
    out[i] = out[i - 1] + alpha1 * (hpOut[i] - out[i - 1]);
  }

  return out;
}

/**
 * Notch filter to remove power line interference (50 Hz or 60 Hz).
 * Uses a twin-T notch topology approximation.
 */
function notchFilter(signal, notchFreq = 50, sampleRate = 256, Q = 30) {
  const out = new Float64Array(signal.length);
  const w0 = 2 * Math.PI * notchFreq / sampleRate;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosW0 = Math.cos(w0);

  const b0 = 1;
  const b1 = -2 * cosW0;
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  // Normalize coefficients
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0;
  const na1 = a1 / a0, na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    out[i] = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = out[i];
  }

  return out;
}

/**
 * Simple artifact rejection: discard samples with amplitude > threshold.
 * Replaces artifacts with interpolated values.
 */
function removeArtifacts(signal, threshold = 150) {
  const out = new Float64Array(signal);
  for (let i = 1; i < out.length - 1; i++) {
    if (Math.abs(out[i]) > threshold) {
      // Linear interpolation from neighbors
      out[i] = (out[i - 1] + out[i + 1]) / 2;
    }
  }
  return out;
}

/**
 * Full preprocessing pipeline.
 * @param {Float64Array} rawSignal - raw EEG samples (single channel)
 * @param {number} sampleRate - Hz
 * @param {number} lineFreq - power line frequency (50 or 60)
 * @returns {Float64Array} cleaned signal
 */
function preprocess(rawSignal, sampleRate = 256, lineFreq = 50) {
  const filtered = bandpassFilter(rawSignal, 1, 50, sampleRate);
  const notched = notchFilter(filtered, lineFreq, sampleRate);
  return removeArtifacts(notched);
}

// ── Band power extraction ────────────────────────────────────────────────────

/**
 * Compute average power in a frequency band from a PSD.
 * @param {Object} psdResult - output from psd()
 * @param {number} lowFreq - band lower bound (Hz)
 * @param {number} highFreq - band upper bound (Hz)
 * @returns {number} average power in band
 */
function bandPower(psdResult, lowFreq, highFreq) {
  let sum = 0, count = 0;
  for (let i = 0; i < psdResult.frequencies.length; i++) {
    if (psdResult.frequencies[i] >= lowFreq && psdResult.frequencies[i] < highFreq) {
      sum += psdResult.power[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

module.exports = {
  fft,
  psd,
  bandpassFilter,
  notchFilter,
  removeArtifacts,
  preprocess,
  bandPower,
};
