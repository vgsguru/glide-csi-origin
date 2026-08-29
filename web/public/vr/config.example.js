/**
 * Glide VR — configuration template.
 *
 * Copy to `config.js` (gitignored) and fill in your own keys.
 *
 * These keys ship inside the client, exactly as they already do inside the
 * Android APK. Firestore is guarded by security rules keyed on the signed-in
 * uid, not by key secrecy, so a leaked browser key still reads nothing.
 */

export const FIREBASE = {
  projectId: 'manage-buddy',
  apiKey: 'YOUR_FIREBASE_WEB_API_KEY',
  authDomain: 'manage-buddy.firebaseapp.com',
};

// Same providers the phone uses, so answers match across devices.
export const GROQ_KEY = 'YOUR_GROQ_API_KEY';
export const GEMINI_KEY = 'YOUR_GEMINI_API_KEY';

export const GROQ_CHAT_MODEL = 'openai/gpt-oss-120b';
export const GROQ_STT_MODEL = 'whisper-large-v3-turbo';
export const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const GEMINI_TTS_VOICE = 'Kore';

export const WAKE_PHRASES = ['hey glide', 'hey glyde', 'hay glide', 'a glide', 'hey guide'];
