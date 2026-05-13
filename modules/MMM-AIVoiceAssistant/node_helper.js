const NodeHelper = require("node_helper");
const { Blob: BufferBlob } = require("buffer");
const { spawn } = require("node:child_process");
const path = require("node:path");

const INIT_NOTIFICATION = "MMM_AI_ASSISTANT_INIT";
const ASK_NOTIFICATION = "MMM_AI_ASSISTANT_ASK";
const RESPONSE_NOTIFICATION = "MMM_AI_ASSISTANT_RESPONSE";
const ERROR_NOTIFICATION = "MMM_AI_ASSISTANT_ERROR";
const TRANSCRIBE_NOTIFICATION = "MMM_AI_ASSISTANT_TRANSCRIBE";
const TRANSCRIBE_RESULT_NOTIFICATION = "MMM_AI_ASSISTANT_TRANSCRIBE_RESULT";
const TTS_NOTIFICATION = "MMM_AI_ASSISTANT_TTS";
const TTS_RESULT_NOTIFICATION = "MMM_AI_ASSISTANT_TTS_RESULT";

module.exports = NodeHelper.create({
	start () {
		this.instanceConfigs = {};
	},

	socketNotificationReceived (notification, payload) {
		if (notification === INIT_NOTIFICATION) {
			if (!payload?.instanceId) {
				return;
			}

			this.instanceConfigs[payload.instanceId] = this.normalizeInstanceConfig(payload.config);
			return;
		}

		if (notification === ASK_NOTIFICATION) {
			void this.processPrompt(payload);
			return;
		}

		if (notification === TRANSCRIBE_NOTIFICATION) {
			void this.processTranscription(payload);
			return;
		}

		if (notification === TTS_NOTIFICATION) {
			this.processSystemTts(payload);
		}
	},

	normalizeInstanceConfig (config) {
		const defaultChatGpt = {
			model: "gpt-4o-mini",
			apiBase: "https://api.openai.com/v1",
			apiKeyEnv: "SECRET_OPENAI_API_KEY",
			temperature: 0.7,
			maxOutputTokens: 768
		};
		const defaultSttOpenAI = {
			model: "gpt-4o-mini-transcribe",
			language: "",
			prompt: ""
		};
		const defaultTts = {
			enabled: true,
			engine: "browser",
			language: "",
			systemCommand: "espeak-ng",
			systemVoice: "",
			systemSpeed: 165,
			systemPitch: 50
		};

		return {
			requestTimeoutMs: config?.requestTimeoutMs || 25000,
			systemPrompt: config?.systemPrompt || "",
			chatgpt: { ...defaultChatGpt, ...(config?.chatgpt || {}) },
			sttOpenAI: { ...defaultSttOpenAI, ...(config?.sttOpenAI || {}) },
			tts: { ...defaultTts, ...(config?.tts || {}) }
		};
	},

	processSystemTts (payload) {
		const instanceId = payload?.instanceId;
		if (!instanceId) {
			return;
		}

		const instanceConfig = this.instanceConfigs[instanceId];
		const ttsConfig = instanceConfig?.tts || {};
		const text = String(payload?.text || "").trim();
		if (!text || !ttsConfig.enabled || String(ttsConfig.engine || "").toLowerCase() !== "system") {
			this.sendSocketNotification(TTS_RESULT_NOTIFICATION, {
				instanceId,
				ok: false
			});
			return;
		}

		const command = String(ttsConfig.systemCommand || "espeak-ng").trim();
		const args = this.buildSystemTtsArgs(command, text, ttsConfig);
		const child = spawn(command, args, {
			stdio: "ignore",
			windowsHide: true
		});

		child.on("error", (error) => {
			this.sendSocketNotification(TTS_RESULT_NOTIFICATION, {
				instanceId,
				ok: false,
				error: error.message || "System TTS failed."
			});
		});

		child.on("close", (code) => {
			this.sendSocketNotification(TTS_RESULT_NOTIFICATION, {
				instanceId,
				ok: code === 0,
				code
			});
		});
	},

	buildSystemTtsArgs (command, text, ttsConfig) {
		const executable = path.basename(command).toLowerCase();
		const language = String(ttsConfig.systemVoice || ttsConfig.language || "en-US").trim();
		const speed = Number.isFinite(Number(ttsConfig.systemSpeed))
			? Math.max(80, Math.min(450, Math.round(Number(ttsConfig.systemSpeed))))
			: 165;
		const pitch = Number.isFinite(Number(ttsConfig.systemPitch))
			? Math.max(0, Math.min(99, Math.round(Number(ttsConfig.systemPitch))))
			: 50;

		if (executable.includes("spd-say")) {
			return ["-l", language || "en", text];
		}

		return [
			"-v",
			this.normalizeEspeakVoice(language),
			"-s",
			String(speed),
			"-p",
			String(pitch),
			text
		];
	},

	normalizeEspeakVoice (language) {
		const normalized = String(language || "en-US").trim().toLowerCase().replace(/_/gu, "-");
		if (normalized === "en-us") {
			return "en-us";
		}
		if (normalized === "en-gb") {
			return "en-gb";
		}
		return normalized.split("-")[0] || "en";
	},

	async processPrompt (payload) {
		const instanceId = payload?.instanceId;
		const prompt = String(payload?.prompt || "").trim();
		if (!instanceId) {
			return;
		}

		if (!prompt) {
			this.sendError(instanceId, "Prompt is empty.", "empty_prompt");
			return;
		}

		const instanceConfig = this.instanceConfigs[instanceId];
		if (!instanceConfig) {
			this.sendError(instanceId, "Module is not initialized.", "not_initialized");
			return;
		}

		try {
			const responseText = await this.callChatGpt(instanceConfig, prompt);
			this.sendSocketNotification(RESPONSE_NOTIFICATION, {
				instanceId,
				provider: "chatgpt",
				response: responseText
			});
		} catch (error) {
			this.sendError(
				instanceId,
				error.message || "OpenAI request failed.",
				error.code || "request_failed"
			);
		}
	},

	async processTranscription (payload) {
		const instanceId = payload?.instanceId;
		if (!instanceId) {
			return;
		}

		const audioBase64 = String(payload?.audioBase64 || "").trim();
		if (!audioBase64) {
			this.sendError(instanceId, "Recorded audio is empty.", "stt_empty_audio");
			return;
		}

		const instanceConfig = this.instanceConfigs[instanceId];
		if (!instanceConfig) {
			this.sendError(instanceId, "Module is not initialized.", "not_initialized");
			return;
		}

		try {
			const transcript = await this.callOpenAiTranscription(instanceConfig, {
				audioBase64,
				mimeType: payload?.mimeType,
				model: payload?.model,
				language: payload?.language,
				prompt: payload?.prompt
			});
			this.sendSocketNotification(TRANSCRIBE_RESULT_NOTIFICATION, {
				instanceId,
				provider: "chatgpt",
				transcript
			});
		} catch (error) {
			this.sendError(
				instanceId,
				error.message || "Speech-to-text failed.",
				error.code || "stt_failed"
			);
		}
	},

	async callChatGpt (instanceConfig, prompt) {
		const chatgptConfig = instanceConfig.chatgpt;
		const apiKey = this.resolveApiKey(chatgptConfig, "SECRET_OPENAI_API_KEY");
		if (!apiKey) {
			throw this.makeError("missing_api_key", "Missing OpenAI API key. Set SECRET_OPENAI_API_KEY or add chatgpt.apiKey in assistant config.");
		}

		const apiBase = this.normalizeBaseUrl(chatgptConfig.apiBase, "https://api.openai.com/v1");
		const model = chatgptConfig.model || "gpt-4o-mini";
		const messages = [];
		if (instanceConfig.systemPrompt && instanceConfig.systemPrompt.trim().length > 0) {
			messages.push({
				role: "system",
				content: instanceConfig.systemPrompt.trim()
			});
		}
		messages.push({
			role: "user",
			content: prompt
		});

		const body = {
			model,
			messages,
			temperature: chatgptConfig.temperature,
			max_completion_tokens: chatgptConfig.maxOutputTokens
		};

		const data = await this.fetchJson({
			url: `${apiBase}/chat/completions`,
			timeoutMs: instanceConfig.requestTimeoutMs,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`
			},
			body
		});

		const content = data?.choices?.[0]?.message?.content;
		if (typeof content === "string" && content.trim().length > 0) {
			return content.trim();
		}

		if (Array.isArray(content)) {
			const text = content
				.map((part) => (part && typeof part.text === "string"
					? part.text
					: ""))
				.filter(Boolean)
				.join("\n")
				.trim();
			if (text) {
				return text;
			}
		}

		throw this.makeError("invalid_response", "ChatGPT returned an empty response.");
	},

	async callOpenAiTranscription (instanceConfig, transcriptionRequest) {
		if (typeof FormData === "undefined") {
			throw this.makeError("stt_runtime_error", "FormData is not available in this Node runtime.");
		}

		const chatgptConfig = instanceConfig.chatgpt;
		const apiKey = this.resolveApiKey(chatgptConfig, "SECRET_OPENAI_API_KEY");
		if (!apiKey) {
			throw this.makeError("missing_api_key", "Missing OpenAI API key. Set SECRET_OPENAI_API_KEY or add chatgpt.apiKey in assistant config.");
		}

		const apiBase = this.normalizeBaseUrl(chatgptConfig.apiBase, "https://api.openai.com/v1");
		const sttDefaults = instanceConfig.sttOpenAI || {};
		const model = String(transcriptionRequest.model || sttDefaults.model || "gpt-4o-mini-transcribe").trim();
		const language = this.normalizeSttLanguageCode(transcriptionRequest.language || sttDefaults.language || "");
		const prompt = String(transcriptionRequest.prompt || sttDefaults.prompt || "").trim();
		const mimeType = this.sanitizeMimeType(transcriptionRequest.mimeType);
		const audioBuffer = this.decodeBase64Audio(transcriptionRequest.audioBase64);
		if (audioBuffer.length < 1200) {
			throw this.makeError("stt_empty_audio", "Recorded audio is too short.");
		}
		if (audioBuffer.length > 15 * 1024 * 1024) {
			throw this.makeError("stt_audio_too_large", "Recorded audio is too large.");
		}

		const fileExtension = this.mimeTypeToExtension(mimeType);
		const audioBlob = new BufferBlob([audioBuffer], { type: mimeType });
		const formData = new FormData();
		formData.append("file", audioBlob, `speech.${fileExtension}`);
		formData.append("model", model);
		if (language) {
			formData.append("language", language);
		}
		if (prompt) {
			formData.append("prompt", prompt);
		}
		formData.append("response_format", "json");

		const data = await this.fetchMultipartJson({
			url: `${apiBase}/audio/transcriptions`,
			timeoutMs: instanceConfig.requestTimeoutMs,
			headers: {
				Authorization: `Bearer ${apiKey}`
			},
			formData
		});

		const transcript = typeof data?.text === "string"
			? data.text.trim()
			: "";
		if (!transcript) {
			throw this.makeError("stt_empty_transcript", "No speech recognized.");
		}
		return transcript;
	},

	normalizeSttLanguageCode (languageInput) {
		const raw = String(languageInput || "").trim();
		if (!raw) return "";
		const normalized = raw.toLowerCase().replace(/_/g, "-");
		const primarySubtag = normalized.split("-")[0];
		if (/^[a-z]{2,3}$/u.test(primarySubtag)) {
			return primarySubtag;
		}
		return "";
	},

	sanitizeMimeType (mimeType) {
		const normalized = String(mimeType || "").split(";")[0].trim().toLowerCase();
		if (!normalized || !/^audio\/[a-z0-9.+-]+$/u.test(normalized)) {
			return "audio/webm";
		}
		return normalized;
	},

	mimeTypeToExtension (mimeType) {
		const map = {
			"audio/webm": "webm",
			"audio/ogg": "ogg",
			"audio/mp4": "mp4",
			"audio/mpeg": "mp3",
			"audio/wav": "wav"
		};
		return map[mimeType] || "webm";
	},

	decodeBase64Audio (audioBase64) {
		try {
			return Buffer.from(String(audioBase64 || ""), "base64");
		} catch {
			throw this.makeError("stt_invalid_audio", "Failed to decode recorded audio.");
		}
	},

	normalizeBaseUrl (base, fallback) {
		return String(base || fallback).replace(/\/+$/u, "");
	},

	resolveApiKey (chatgptConfig, defaultEnv) {
		if (chatgptConfig.apiKey && String(chatgptConfig.apiKey).trim().length > 0) {
			return String(chatgptConfig.apiKey).trim();
		}

		const envName = String(chatgptConfig.apiKeyEnv || defaultEnv || "").trim();
		if (envName) {
			// Backward compatibility: some configs accidentally stored the raw key in apiKeyEnv.
			if (/^sk-\S{10,}$/u.test(envName)) {
				return envName;
			}

			if (process.env[envName]) {
				return String(process.env[envName]).trim();
			}
		}

		return "";
	},

	async fetchJson ({ url, headers, body, timeoutMs }) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal
			});

			const rawResponse = await response.text();
			let data = {};
			if (rawResponse) {
				try {
					data = JSON.parse(rawResponse);
				} catch {
					data = { raw: rawResponse };
				}
			}

			if (!response.ok) {
				throw this.makeHttpError(response.status, data);
			}

			return data;
		} catch (error) {
			if (error.name === "AbortError") {
				throw this.makeError("request_timeout", "OpenAI request timed out.");
			}

			if (error.code) {
				throw error;
			}

			throw this.makeError("network_error", error.message || "Network request failed.");
		} finally {
			clearTimeout(timeoutId);
		}
	},

	async fetchMultipartJson ({ url, headers, formData, timeoutMs }) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: formData,
				signal: controller.signal
			});

			const rawResponse = await response.text();
			let data = {};
			if (rawResponse) {
				try {
					data = JSON.parse(rawResponse);
				} catch {
					data = { raw: rawResponse };
				}
			}

			if (!response.ok) {
				throw this.makeHttpError(response.status, data);
			}

			return data;
		} catch (error) {
			if (error.name === "AbortError") {
				throw this.makeError("request_timeout", "OpenAI request timed out.");
			}

			if (error.code) {
				throw error;
			}

			throw this.makeError("network_error", error.message || "Network request failed.");
		} finally {
			clearTimeout(timeoutId);
		}
	},

	makeHttpError (statusCode, responseBody) {
		const message = responseBody?.error?.message || responseBody?.message || `Request failed (${statusCode})`;
		let code = "api_error";

		if (statusCode === 400) {
			code = "bad_request";
		} else if (statusCode === 401 || statusCode === 403) {
			code = "invalid_api_key";
		} else if (statusCode === 408 || statusCode === 504) {
			code = "request_timeout";
		} else if (statusCode === 429) {
			code = "rate_limited";
		} else if (statusCode >= 500) {
			code = "provider_unavailable";
		}

		return this.makeError(code, message);
	},

	makeError (code, message) {
		const error = new Error(message);
		error.code = code;
		return error;
	},

	sendError (instanceId, error, code) {
		this.sendSocketNotification(ERROR_NOTIFICATION, {
			instanceId,
			provider: "chatgpt",
			code,
			error
		});
	}
});
