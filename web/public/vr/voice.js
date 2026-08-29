/**
 * Glide VR — hands-free voice.
 *
 * In a headset there is no keyboard worth using, so voice is the primary input,
 * not a convenience. The loop runs continuously:
 *
 *   mic -> energy VAD -> utterance -> Groq Whisper -> "hey glide"? -> agent -> Gemini TTS
 *
 * The Web Speech API would be simpler, but Meta's browser does not ship the
 * Google speech backend it depends on, so recognition is done over the network
 * against Whisper. The VAD is what keeps that affordable: audio is only ever
 * uploaded for an actual utterance, never as a continuous stream.
 */

import { GROQ_KEY, GROQ_STT_MODEL, GEMINI_KEY, GEMINI_TTS_MODEL, GEMINI_TTS_VOICE, WAKE_PHRASES } from './config.js';

export const Phase = {
  Off: 'off',
  Waiting: 'waiting',   // listening for "hey glide"
  Listening: 'listening', // wake word heard, capturing the question
  Thinking: 'thinking',
  Speaking: 'speaking',
};

export class Voice {
  constructor({ onPhase, onTranscript, onLevel, onQuestion, onError }) {
    this.onPhase = onPhase || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onLevel = onLevel || (() => {});
    this.onQuestion = onQuestion || (async () => {});
    this.onError = onError || (() => {});

    this.phase = Phase.Off;
    this.level = 0;
    this.stream = null;
    this.ctx = null;
    this.recorder = null;
    this.chunks = [];
    this.speaking = false;
    this.speechStartIdx = -1;
    this.silenceMs = 0;
    this.voicedMs = 0;
    this.noiseFloor = 0.006;
    this.calibrating = 0;
    this.armedUntil = 0;      // window after the wake word to ask a question
    this.source = null;
    this.playing = null;
  }

  setPhase(p) {
    if (this.phase === p) return;
    this.phase = p;
    this.onPhase(p);
  }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const src = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    this.analyser = analyser;
    this.buf = new Float32Array(analyser.fftSize);

    this.startRecorder();
    this.setPhase(Phase.Waiting);
    this.calibrating = 20; // ~1s of frames to learn the room
    this.tick();
  }

  stop() {
    try { this.recorder?.state !== 'inactive' && this.recorder.stop(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.ctx?.close(); } catch {}
    this.stream = null;
    this.ctx = null;
    this.recorder = null;
    this.stopSpeaking();
    this.setPhase(Phase.Off);
  }

  startRecorder() {
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      .find((m) => MediaRecorder.isTypeSupported(m)) || '';
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.mime = mime || 'audio/webm';
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
      // Keep memory bounded: the header chunk plus the last ~45 seconds.
      if (this.chunks.length > 460) this.chunks.splice(1, this.chunks.length - 460);
    };
    this.recorder.start(100);
  }

  /** ~50 Hz loop: measure level, run the VAD state machine. */
  tick = () => {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buf);

    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);

    // Smooth for the visualiser, raw for the decision.
    this.level = this.level * 0.7 + rms * 0.3;
    this.onLevel(Math.min(1, this.level * 14));

    if (this.calibrating > 0) {
      this.noiseFloor = this.noiseFloor * 0.8 + rms * 0.2;
      this.calibrating--;
      requestAnimationFrame(this.tick);
      return;
    }

    // Do not listen to ourselves talking.
    if (this.phase !== Phase.Speaking && this.phase !== Phase.Thinking) {
      const threshold = Math.max(this.noiseFloor * 3.2, 0.011);
      const frame = 1000 / 50;

      if (rms > threshold) {
        this.voicedMs += frame;
        this.silenceMs = 0;
        if (!this.speaking && this.voicedMs > 120) {
          this.speaking = true;
          // Rewind a few chunks so the first syllable is not clipped.
          this.speechStartIdx = Math.max(1, this.chunks.length - 4);
        }
      } else {
        if (this.speaking) this.silenceMs += frame;
        this.voicedMs = Math.max(0, this.voicedMs - frame);
        // Trailing silence ends the utterance.
        if (this.speaking && this.silenceMs > 700) this.endUtterance();
      }

      // Wake window lapsed with nothing said -- go back to waiting.
      if (this.phase === Phase.Listening && !this.speaking && Date.now() > this.armedUntil) {
        this.setPhase(Phase.Waiting);
        this.onTranscript('');
      }
    }

    requestAnimationFrame(this.tick);
  };

  async endUtterance() {
    const startIdx = this.speechStartIdx;
    this.speaking = false;
    this.silenceMs = 0;
    this.voicedMs = 0;
    this.speechStartIdx = -1;

    if (startIdx < 1 || this.chunks.length - startIdx < 3) return; // too short to be words

    // The first chunk carries the container header; without it the slice will
    // not decode.
    const blob = new Blob([this.chunks[0], ...this.chunks.slice(startIdx)], { type: this.mime });
    if (blob.size < 2000) return;

    const wasArmed = this.phase === Phase.Listening;
    if (wasArmed) this.setPhase(Phase.Thinking);

    let text = '';
    try {
      text = await this.transcribe(blob);
    } catch (e) {
      if (wasArmed) {
        this.onError('I could not hear that clearly.');
        this.setPhase(Phase.Waiting);
      }
      return;
    }

    const clean = text.trim();
    if (!clean) {
      if (wasArmed) this.setPhase(Phase.Waiting);
      return;
    }

    if (wasArmed) {
      this.onTranscript(clean);
      await this.ask(clean);
      return;
    }

    // Not armed: only react to the wake phrase.
    const low = clean.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const hit = WAKE_PHRASES.find((p) => low.includes(p));
    if (!hit) return;

    const after = low.slice(low.indexOf(hit) + hit.length).trim();
    if (after.length > 2) {
      // "Hey Glide, what did I spend?" -- one breath, act on it.
      this.onTranscript(after);
      this.setPhase(Phase.Thinking);
      await this.ask(after);
    } else {
      // Just the wake word. Open a window and wait for the question.
      this.armedUntil = Date.now() + 7000;
      this.setPhase(Phase.Listening);
      this.onTranscript('');
    }
  }

  async ask(question) {
    this.setPhase(Phase.Thinking);
    try {
      const reply = await this.onQuestion(question);
      if (reply) await this.speak(reply);
      else this.setPhase(Phase.Waiting);
    } catch (e) {
      this.onError(e.message || 'Something went wrong.');
      this.setPhase(Phase.Waiting);
    }
  }

  // -------------------------------------------------------------------------
  // Speech to text
  // -------------------------------------------------------------------------

  async transcribe(blob) {
    const form = new FormData();
    form.append('file', blob, 'utterance.webm');
    form.append('model', GROQ_STT_MODEL);
    form.append('language', 'en');
    form.append('temperature', '0');
    // Priming the decoder with the wake word makes it far likelier to come back
    // spelled the way we match on.
    form.append('prompt', 'Hey Glide. A question about spending, income, rupees, or recurring payments.');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`stt ${res.status}`);
    const json = await res.json();
    return json.text || '';
  }

  // -------------------------------------------------------------------------
  // Text to speech
  // -------------------------------------------------------------------------

  /** "Rs.12,000" read literally is "R S dot twelve comma zero zero zero". */
  humanize(text) {
    return String(text)
      .replace(/Rs\.?\s?([0-9,]+)/g, (_, n) => `${n.replace(/,/g, '')} rupees`)
      .replace(/\bp10\b/g, 'the tenth percentile')
      .replace(/\bp50\b/g, 'the median')
      .replace(/\bp90\b/g, 'the ninetieth percentile')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async speak(text) {
    this.setPhase(Phase.Speaking);
    const spoken = this.humanize(text);
    try {
      const pcm = await this.geminiTts(spoken);
      await this.play(pcm);
    } catch {
      await this.browserTts(spoken);
    }
    // Straight back to the wake word, so it is a conversation, not a queue.
    this.setPhase(Phase.Waiting);
  }

  async geminiTts(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
        },
      }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const json = await res.json();
    const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) throw new Error('tts empty');

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return this.wav(bytes, 24000);
  }

  /** Gemini returns headerless PCM L16; a decoder needs the 44-byte preamble. */
  wav(pcm, rate) {
    const out = new ArrayBuffer(44 + pcm.length);
    const v = new DataView(out);
    const ascii = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    ascii(0, 'RIFF');
    v.setUint32(4, 36 + pcm.length, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);       // PCM
    v.setUint16(22, 1, true);       // mono
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    ascii(36, 'data');
    v.setUint32(40, pcm.length, true);
    new Uint8Array(out, 44).set(pcm);
    return out;
  }

  async play(arrayBuffer) {
    const buffer = await this.ctx.decodeAudioData(arrayBuffer);
    await new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.ctx.destination);
      src.onended = resolve;
      this.playing = src;
      src.start();
    });
    this.playing = null;
  }

  browserTts(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1.0;
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }

  stopSpeaking() {
    try { this.playing?.stop(); } catch {}
    this.playing = null;
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  /** Press-to-talk, for when the room is too loud for a wake word. */
  arm() {
    this.stopSpeaking();
    this.armedUntil = Date.now() + 8000;
    this.setPhase(Phase.Listening);
  }
}
