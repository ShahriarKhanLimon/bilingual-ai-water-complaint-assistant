// Netlify Function: receives a recorded audio clip and returns its transcript using Groq Whisper.
// The Groq API key is read from the GROQ_API_KEY environment variable and never reaches the browser.
const headers = { "Content-Type": "application/json" };

const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // Netlify limits request bodies to about 6 MB, base64 adds roughly a third

// Groq decides the audio format from the file extension, so it must match what the browser recorded
const EXTENSION_BY_MIME_TYPE = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const reply = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
  if (!process.env.GROQ_API_KEY) return reply(500, { error: "Groq API key is not configured." });
  try {
    const { audioBase64, mimeType } = JSON.parse(event.body || "{}");
    if (!audioBase64) return reply(400, { error: "No audio was received." });

    const baseMimeType = String(mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
    const extension = EXTENSION_BY_MIME_TYPE[baseMimeType];
    if (!extension) return reply(400, { error: "This audio format is not supported." });

    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (audioBuffer.length > MAX_AUDIO_BYTES) return reply(413, { error: "The recording is too large. Please record a shorter report." });

    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: baseMimeType }), `report.${extension}`);
    form.append("model", "whisper-large-v3");
    form.append("prompt", "This is a residential water complaint. Preserve the resident's name exactly. Preserve the flat or apartment number exactly, including letters, digits, and hyphens. The speaker says: My name is [name], spelled [letters]. My flat number is [flat], spelled [letters and digits]. My problem is [problem]. Do not translate or invent names or flat numbers.");
    form.append("response_format", "json");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "Groq could not transcribe the audio.");
    return reply(200, { transcript: payload.text || "" });
  } catch (error) {
    return reply(500, { error: error.message || "Could not transcribe the report." });
  }
};
