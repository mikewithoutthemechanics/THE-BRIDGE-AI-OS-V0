/**
 * bridge.speech — Speech embodiment pipeline: transcript → reasoning → phonemes → TTS → visemes.
 */
import { node, edge, arrow, glowDef, signalDot, progressBar, pulse, panel, badge, THEME } from "../renderer/primitives.js";

export default {
  id:          "bridge.speech",
  name:        "Speech Embodiment Pipeline",
  description: "Full TTS pipeline: ASR → reasoning → phoneme alignment → viseme → audio.",
  tags:        ["speech", "tts", "phoneme", "viseme", "bridge"],
  version:     "1.0.0",

  run(input = {}) {
    const confidence = parseFloat((0.4 + Math.random() * 0.6).toFixed(2));
    const phonemes = ["AA","EE","OH","FV","BMP","TH","Rest","EE","AA"];
    const ttsMs = Math.floor(Math.random() * 300) + 80;
    return { confidence, phonemes, tts_ms: ttsMs, silence: confidence < 0.3, emotion: "neutral", prosody: { pitch: 1.0, tempo: 0.9, intensity: 0.7 } };
  },

  visualize(input = {}) {
    const d = this.run(input);
    const W = 900, H = 220;
    const defs = glowDef("g-speech", THEME.purple);

    const stages = [
      { l: "TRANSCRIPT",  m: "ASR input",         c: THEME.blue   },
      { l: "REASONING",   m: "intent + topic",    c: THEME.cyan   },
      { l: "LANGUAGE",    m: `conf=${d.confidence}`, c: d.silence ? THEME.pink : THEME.cyan },
      { l: "PHONEMES",    m: `${d.phonemes.length} frames`, c: THEME.purple },
      { l: "VISEME",      m: "lip sync map",      c: THEME.purple },
      { l: "TTS",         m: `${d.tts_ms}ms`,     c: THEME.orange },
      { l: "AUDIO",       m: "mpeg stream",        c: THEME.green  },
    ];

    const nW = 104, nH = 52, nY = 80, gap = 3;
    const totalW = stages.length * (nW + gap) - gap;
    const startX = (W - totalW) / 2;

    const nodes = stages.map((s, i) =>
      node(startX + i * (nW + gap), nY, nW, nH, s.l, s.m, s.c)
    ).join("\n");

    const edges = stages.slice(0, -1).map((s, i) => {
      const x1 = startX + i * (nW + gap) + nW;
      const x2 = startX + (i + 1) * (nW + gap);
      const midY = nY + nH / 2;
      return [edge(x1, midY, x2, midY, stages[i+1].c), arrow(x2, midY, stages[i+1].c)].join("\n");
    }).join("\n");

    // Phoneme timeline
    const phY = 158, phStartX = startX + 3 * (nW + gap), phW = 15;
    const phonemeLine = d.phonemes.map((ph, i) => {
      const col = ph === "Rest" ? THEME.muted : THEME.purple;
      return `<rect x="${phStartX + i * (phW + 2)}" y="${phY}" width="${phW}" height="20" rx="3" fill="${col}" fill-opacity="0.7"/>
              <text x="${phStartX + i * (phW + 2) + phW/2}" y="${phY + 13}" text-anchor="middle" fill="#fff" font-family="${THEME.font}" font-size="7">${ph}</text>`;
    }).join("\n");

    // Prosody bar
    const prosodyY = 185;
    const prosodyBars = ["pitch","tempo","intensity"].map((k, i) => {
      const v = d.prosody[k];
      return progressBar(startX + 3 * (nW + gap) + i * 60, prosodyY, 50, 5, v, THEME.purple);
    }).join("\n");

    // Animated signal
    const sig = signalDot(`M${startX + nW/2} ${nY + nH/2} L${startX + (stages.length - 1)*(nW+gap) + nW/2} ${nY + nH/2}`, "5s", THEME.purple);

    return panel(W, H,
      [defs, nodes, edges, phonemeLine, prosodyBars, sig].join("\n"),
      `SPEECH PIPELINE — confidence: ${d.confidence} | phonemes: ${d.phonemes.length} | TTS: ${d.tts_ms}ms | emotion: ${d.emotion}`
    );
  },

  steps: [
    { title: "Transcript Input",   detail: "Receive raw ASR transcript from speech-to-text" },
    { title: "Reasoning Engine",   detail: "Extract intent, topic, and emotional context" },
    { title: "Language Synthesis",  detail: "Build phoneme sequence from language model" },
    { title: "Viseme Mapping",     detail: "Map phonemes to lip-sync viseme frames" },
    { title: "TTS & Audio Output", detail: "Generate audio stream via text-to-speech engine" },
  ],
};
