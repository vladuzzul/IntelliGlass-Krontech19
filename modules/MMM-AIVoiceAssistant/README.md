# MMM-AIVoiceAssistant

Voice-enabled AI assistant module made by us for IntelliGlass.

## Features

- Up-arrow activation (`ArrowDown`) including MMM-KeyBindings `KEYPRESS` support.
- Speech-to-text with `sttEngine` modes:
  - `auto` (browser STT first, OpenAI STT fallback)
  - `openai` (MediaRecorder + OpenAI transcription, recommended on Raspberry Pi)
  - `browser` (browser/Electron SpeechRecognition only)
- ChatGPT-only backend (`/v1/chat/completions`).
- Secure API key loading from environment variables (recommended).
- Multiline AI responses with loading and error states.
- Optional text-to-speech playback for AI replies.
- Centered overlay interface with polished card styling.
- Auto-expand to near full-screen when answers become long.
- Auto-stop for silence and max recording timeout.
- Configurable UI size and dark/light theme.
- Text to speech availability

## Installation

This repository already contains the module in:

`modules/MMM-AIVoiceAssistant`

## Recommended secrets setup

Set these environment variables before starting MagicMirror:

```bash
export SECRET_OPENAI_API_KEY="your-openai-key"
```

In `config/config.js`, enable secret redaction:

```js
hideConfigSecrets: true,
```

## Config example

```js
{
	"module": "MMM-AIVoiceAssistant",
	"position": "top_bar",
	"config": {
		"activationKey": "ArrowDown",
		"activationKeyStates": [
			"KEY_PRESSED",
			"KEY_LONGPRESSED"
		],
		"recognitionLanguage": "en-US",
		"sttEngine": "openai",
		"sttFallbackToOpenAI": true,
		"sttSilenceThreshold": 0.018,
		"sttOpenAI": {
			"model": "gpt-4o-mini-transcribe",
			"language": "en",
			"prompt": ""
		},
		"maxRecordingMs": 12000,
		"noSpeechTimeoutMs": 5000,
		"speechEndGraceMs": 900,
		"requestTimeoutMs": 25000,
		"promptPrefix": "Your name is 'Jarvis' and are a helpful assistant for IntelliGlass. Answer concisely and clearly.",
		"ui": {
			"theme": "dark",
			"fontSize": "22px"
		},
		"chatgpt": {
			"model": "gpt-4o-mini",
			"apiBase": "https://api.openai.com/v1",
			"apiKeyEnv": "SECRET_OPENAI_API_KEY",
			"apiKey": "OPENAI_API_KEY",
			"temperature": 0.7,
			"maxOutputTokens": 768
		},
		"listenToMMMKeyBindings": true,
		"enableKeyboardFallback": false,
		"microphonePermissionPreflight": true,
		"showTranscript": true,
		"systemPrompt": "",
		"ttsEnabled": true
	}
},
```

## Important notes

- On Raspberry Pi, prefer `sttEngine: "openai"` for reliability.
- `stt_network` from browser speech services is auto-fallbacked to OpenAI STT when `sttFallbackToOpenAI` is enabled.
- `ArrowUp` repeated rapidly is debounced via `triggerCooldownMs`.
- Long responses can automatically switch to near full-screen mode (configurable via `expandToFullscreenOnOverflow` and thresholds).
- Long responses can auto-scroll up/down smoothly (`autoScrollLongResponse`) with tunable speed and pause.
- Text-to-speech can be activated/deactivated with `ttsEnabled` (also available in RemoteApp Assistant page).
