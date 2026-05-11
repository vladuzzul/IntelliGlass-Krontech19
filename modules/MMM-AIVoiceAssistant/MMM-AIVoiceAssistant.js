/* global Module */

const INIT_NOTIFICATION = "MMM_AI_ASSISTANT_INIT";
const ASK_NOTIFICATION = "MMM_AI_ASSISTANT_ASK";
const RESPONSE_NOTIFICATION = "MMM_AI_ASSISTANT_RESPONSE";
const ERROR_NOTIFICATION = "MMM_AI_ASSISTANT_ERROR";
const TRANSCRIBE_NOTIFICATION = "MMM_AI_ASSISTANT_TRANSCRIBE";
const TRANSCRIBE_RESULT_NOTIFICATION = "MMM_AI_ASSISTANT_TRANSCRIBE_RESULT";

Module.register("MMM-AIVoiceAssistant", {
	defaults: {
		activationKey: "ArrowUp",
		activationKeyStates: ["KEY_PRESSED", "KEY_LONGPRESSED"],
		listenToMMMKeyBindings: true,
		enableKeyboardFallback: true,
		triggerCooldownMs: 1200,
		recognitionLanguage: "en-US",
		sttEngine: "auto",
		sttFallbackToOpenAI: true,
		sttSilenceThreshold: 0.018,
		sttOpenAI: {
			model: "gpt-4o-mini-transcribe",
			language: "",
			prompt: ""
		},
		maxRecordingMs: 12000,
		noSpeechTimeoutMs: 5000,
		speechEndGraceMs: 900,
		microphonePermissionPreflight: true,
		requestTimeoutMs: 25000,
		promptPrefix: "",
		systemPrompt: "",
		showTranscript: true,
		ttsEnabled: true,
		placeholder: "Gesture the peace sign, then speak.",
		loadingText: "Thinking",
		responseMaxLength: 6000,
		centerOnScreen: true,
		expandToFullscreenOnOverflow: true,
		fullscreenResponseThreshold: 900,
		fullscreenLineThreshold: 15,
		autoScrollLongResponse: true,
		autoScrollSpeedPxPerSecond: 20,
		autoScrollPauseMs: 1400,
		width: "min(70vw, 980px)",
		minHeight: "190px",
		maxHeight: "420px",
		ui: {
			theme: "dark",
			fontSize: "22px",
			lineHeight: 1.35,
			borderRadius: "12px",
			padding: "14px 18px",
			backgroundOpacity: 0.8
		},
		chatgpt: {
			model: "gpt-4o-mini",
			apiBase: "https://api.openai.com/v1",
			apiKeyEnv: "SECRET_OPENAI_API_KEY",
			temperature: 0.7,
			maxOutputTokens: 768
		}
	},

	start () {
		this.responseText = "";
		this.transcriptText = "";
		this.statusText = this.config.placeholder;
		this.errorText = "";
		this.lastTriggerAt = 0;
		this.isRecording = false;
		this.isLoading = false;
		this.isSuspended = false;
		this.speechDetected = false;
		this.latestTranscript = "";
		this.pendingStopReason = "";
		this.microphonePermissionGranted = false;
		this.recognitionFailed = false;
		this.keyboardHandler = null;
		this.recognition = null;
		this.mediaRecorder = null;
		this.mediaRecorderCtor = window.MediaRecorder || null;
		this.speechSynthesis = window.speechSynthesis || null;
		this.ttsUtterance = null;
		this.mediaStream = null;
		this.mediaChunks = [];
		this.selectedMimeType = "";
		this.activeCaptureType = "";
		this.recordingStartedAt = 0;
		this.lastSpeechAt = 0;
		this.audioContext = null;
		this.audioSourceNode = null;
		this.audioAnalyser = null;
		this.audioMonitorTimer = null;
		this.audioMonitorEnabled = false;
		this.noSpeechTimer = null;
		this.recordingTimer = null;
		this.speechEndTimer = null;
		this.speechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
		this.responseElement = null;
		this.shellElement = null;
		this.wrapperElement = null;
		this.autoScrollFrame = null;
		this.autoScrollPauseTimer = null;
		this.autoScrollSetupTimer = null;
		this.autoScrollTarget = null;
		this.autoScrollDirection = 1;
		this.autoScrollLastTick = 0;
		this.isSpeaking = false;
		this.sendSocketNotification(INIT_NOTIFICATION, {
			instanceId: this.identifier,
			config: this.getHelperConfig()
		});
	},

	getStyles () {
		return ["MMM-AIVoiceAssistant.css"];
	},

	getHelperConfig () {
		return {
			requestTimeoutMs: this.config.requestTimeoutMs,
			systemPrompt: this.config.systemPrompt,
			chatgpt: this.config.chatgpt,
			sttOpenAI: this.config.sttOpenAI
		};
	},

	notificationReceived (notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.attachKeyboardListener();
			return;
		}

		if (notification !== "KEYPRESS" || !this.config.listenToMMMKeyBindings) {
			return;
		}

		if (!payload || payload.keyName !== this.config.activationKey) {
			return;
		}

		if (!this.config.activationKeyStates.includes(payload.keyState)) {
			return;
		}

		void this.handleActivation("MMM-KeyBindings");
	},

	socketNotificationReceived (notification, payload) {
		if (!payload || payload.instanceId !== this.identifier) {
			return;
		}

		if (notification === TRANSCRIBE_RESULT_NOTIFICATION) {
			const transcript = String(payload.transcript || "").trim();
			if (!transcript) {
				this.isLoading = false;
				this.showError("No speech detected. Please try again.", "no_speech");
				return;
			}

			this.latestTranscript = transcript;
			this.transcriptText = transcript;
			this.errorText = "";
			void this.sendTranscriptToAI(transcript);
			return;
		}

		if (notification === RESPONSE_NOTIFICATION) {
			this.isLoading = false;
			this.errorText = "";
			this.responseText = this.limitResponseText(payload.response || "");
			this.statusText = "Ready";
			this.updateDom(0);
			this.speakResponse(this.responseText);
			return;
		}

		if (notification === ERROR_NOTIFICATION) {
			this.isLoading = false;
			this.showError(payload.error || "AI request failed.", payload.code);
		}
	},

	suspend () {
		this.isSuspended = true;
		this.cancelTtsPlayback();
		this.stopAutoScroll();
		this.clearAutoScrollSetupTimer();
		this.detachKeyboardListener();
		if (this.isRecording) {
			this.stopActiveRecording("suspend");
		}
	},

	resume () {
		this.isSuspended = false;
		this.attachKeyboardListener();
		this.queueAutoScrollSetup();
	},

	attachKeyboardListener () {
		if (!this.config.enableKeyboardFallback || this.keyboardHandler) {
			return;
		}

		this.keyboardHandler = (event) => {
			if (event.key !== this.config.activationKey || event.repeat) {
				return;
			}

			if (this.isEditableTarget(event.target)) {
				return;
			}

			event.preventDefault();
			void this.handleActivation("keyboard");
		};

		document.addEventListener("keydown", this.keyboardHandler, true);
	},

	detachKeyboardListener () {
		if (!this.keyboardHandler) {
			return;
		}

		document.removeEventListener("keydown", this.keyboardHandler, true);
		this.keyboardHandler = null;
	},

	isEditableTarget (target) {
		if (!target) {
			return false;
		}

		if (target.isContentEditable) {
			return true;
		}

		return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
	},

	resolveSttEngine () {
		const configured = typeof this.config.sttEngine === "string"
			? this.config.sttEngine.toLowerCase()
			: "auto";

		if (configured === "openai") {
			return "openai";
		}

		if (configured === "browser") {
			return this.speechRecognitionCtor ? "browser" : "openai";
		}

		return this.speechRecognitionCtor ? "browser" : "openai";
	},

	resetCaptureState () {
		this.cleanupMediaRecorderResources();
		this.clearTimers();
		this.pendingStopReason = "";
		this.recognitionFailed = false;
		this.speechDetected = false;
		this.latestTranscript = "";
		this.transcriptText = "";
		this.errorText = "";
		this.mediaChunks = [];
		this.selectedMimeType = "";
		this.recordingStartedAt = 0;
		this.lastSpeechAt = 0;
	},

	async handleActivation (source) {
		if (this.isSuspended) {
			return;
		}

		const now = Date.now();
		if ((now - this.lastTriggerAt) < this.config.triggerCooldownMs) {
			return;
		}

		this.lastTriggerAt = now;

		if (this.isRecording || this.isLoading) {
			return;
		}

		this.cancelTtsPlayback();

		try {
			await this.startRecording(source);
		} catch (error) {
			this.cleanupMediaRecorderResources();
			this.showError(error.message || "Failed to start voice recording.", "recording_start_error");
		}
	},

	async startRecording (source) {
		this.resetCaptureState();

		if (this.config.microphonePermissionPreflight) {
			await this.ensureMicrophonePermission();
		}

		const sttEngine = this.resolveSttEngine();
		if (sttEngine === "browser") {
			this.startBrowserRecognition(source);
			return;
		}

		await this.startOpenAIRecorderCapture(source);
	},

	startBrowserRecognition (source) {
		if (!this.speechRecognitionCtor) {
			throw new Error("SpeechRecognition is not available in this Electron runtime.");
		}

		this.activeCaptureType = "browser";
		this.isRecording = true;
		this.statusText = `Listening... (${source})`;
		this.updateDom(0);

		const recognition = new this.speechRecognitionCtor();
		this.recognition = recognition;
		recognition.lang = this.config.recognitionLanguage;
		recognition.continuous = false;
		recognition.interimResults = false;
		recognition.maxAlternatives = 1;

		recognition.onstart = () => {
			this.statusText = "Listening...";
			this.startNoSpeechTimeout();
			this.startRecordingTimeout();
			this.updateDom(0);
		};

		recognition.onspeechstart = () => {
			this.speechDetected = true;
			this.lastSpeechAt = Date.now();
			this.startRecordingTimeout();
			this.clearNoSpeechTimeout();
		};

		recognition.onspeechend = () => {
			if (!this.isRecording) {
				return;
			}

			this.clearSpeechEndTimeout();
			this.speechEndTimer = setTimeout(() => {
				this.stopRecognition("speechend");
			}, this.config.speechEndGraceMs);
		};

		recognition.onresult = (event) => {
			const results = [];
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const part = event.results[i]?.[0]?.transcript;
				if (part) {
					results.push(part);
				}
			}

			const transcript = results.join(" ").trim();
			if (transcript.length > 0) {
				this.latestTranscript = transcript;
				this.transcriptText = transcript;
				this.speechDetected = true;
				this.lastSpeechAt = Date.now();
				this.clearNoSpeechTimeout();
				this.updateDom(0);
			}
		};

		recognition.onerror = (event) => {
			this.clearTimers();
			this.recognitionFailed = true;
			this.isRecording = false;
			this.activeCaptureType = "";
			this.recognition = null;
			this.handleRecognitionError(event);
		};

		recognition.onend = () => {
			this.clearTimers();
			const spokenText = this.latestTranscript.trim();
			const stopReason = this.pendingStopReason;
			this.isRecording = false;
			this.activeCaptureType = "";
			this.recognition = null;

			if (this.recognitionFailed) {
				this.recognitionFailed = false;
				return;
			}

			if (stopReason === "suspend") {
				this.statusText = this.config.placeholder;
				this.updateDom(0);
				return;
			}

			if (spokenText.length === 0) {
				this.showError("No speech detected. Please try again.", "no_speech");
				return;
			}

			void this.sendTranscriptToAI(spokenText);
		};

		recognition.start();
	},

	async startOpenAIRecorderCapture (source) {
		if (!this.mediaRecorderCtor) {
			throw new Error("MediaRecorder is not available in this Electron runtime.");
		}

		const stream = await this.requestMicrophoneStream();
		const options = {};
		const preferredMimeType = this.selectRecorderMimeType();
		if (preferredMimeType) {
			options.mimeType = preferredMimeType;
		}

		let recorder;
		try {
			recorder = new this.mediaRecorderCtor(stream, options);
		} catch {
			recorder = new this.mediaRecorderCtor(stream);
		}

		this.mediaStream = stream;
		this.mediaRecorder = recorder;
		this.activeCaptureType = "openai";
		this.isRecording = true;
		this.statusText = `Listening... (${source})`;
		this.updateDom(0);

		this.selectedMimeType = recorder.mimeType || preferredMimeType || "audio/webm";
		this.recordingStartedAt = Date.now();
		this.lastSpeechAt = 0;
		this.mediaChunks = [];
		this.audioMonitorEnabled = this.setupAudioMonitor(stream);
		this.startNoSpeechTimeout();
		this.startRecordingTimeout();

		recorder.onstart = () => {
			this.statusText = "Listening...";
			this.updateDom(0);
		};

		recorder.ondataavailable = (event) => {
			if (!event || !event.data || event.data.size < 1) {
				return;
			}

			this.mediaChunks.push(event.data);

			if (!this.audioMonitorEnabled && event.data.size > 3000) {
				this.speechDetected = true;
				this.lastSpeechAt = Date.now();
				this.clearNoSpeechTimeout();
			}
		};

		recorder.onerror = (event) => {
			this.finishRecorderSession();
			this.cleanupMediaRecorderResources();
			const errorName = event && event.error && event.error.name
				? event.error.name
				: "unknown";
			this.showError("Audio recording failed.", `stt_record_${errorName}`);
		};

		recorder.onstop = () => {
			void this.handleOpenAIRecordingStop();
		};

		recorder.start(250);
	},

	selectRecorderMimeType () {
		if (!this.mediaRecorderCtor || typeof this.mediaRecorderCtor.isTypeSupported !== "function") {
			return "";
		}

		const candidates = [
			"audio/webm;codecs=opus",
			"audio/webm",
			"audio/ogg;codecs=opus",
			"audio/ogg",
			"audio/mp4"
		];

		for (const mimeType of candidates) {
			if (this.mediaRecorderCtor.isTypeSupported(mimeType)) {
				return mimeType;
			}
		}

		return "";
	},

	setupAudioMonitor (stream) {
		const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextCtor) {
			return false;
		}

		try {
			this.audioContext = new AudioContextCtor();
			this.audioSourceNode = this.audioContext.createMediaStreamSource(stream);
			this.audioAnalyser = this.audioContext.createAnalyser();
			this.audioAnalyser.fftSize = 1024;
			this.audioSourceNode.connect(this.audioAnalyser);

			const samples = new Uint8Array(this.audioAnalyser.fftSize);
			this.audioMonitorTimer = setInterval(() => {
				this.handleAudioMonitorTick(samples);
			}, 120);
			return true;
		} catch {
			this.clearAudioMonitor();
			return false;
		}
	},

	handleAudioMonitorTick (samples) {
		if (!this.isRecording || this.activeCaptureType !== "openai" || !this.audioAnalyser) {
			return;
		}

		this.audioAnalyser.getByteTimeDomainData(samples);
		let energy = 0;
		for (let i = 0; i < samples.length; i++) {
			const centered = (samples[i] - 128) / 128;
			energy += centered * centered;
		}
		const rms = Math.sqrt(energy / samples.length);
		const now = Date.now();
		const threshold = Number.isFinite(this.config.sttSilenceThreshold)
			? Math.max(0.002, Math.min(0.2, this.config.sttSilenceThreshold))
			: 0.018;

		if (rms >= threshold) {
			this.speechDetected = true;
			this.lastSpeechAt = now;
			this.clearNoSpeechTimeout();
			return;
		}

		if (this.speechDetected && this.lastSpeechAt > 0 && (now - this.lastSpeechAt) >= this.config.speechEndGraceMs) {
			this.stopMediaRecorder("speechend");
		}
	},

	finishRecorderSession () {
		this.clearTimers();
		this.isRecording = false;
		this.activeCaptureType = "";
	},

	stopActiveRecording (reason) {
		if (this.activeCaptureType === "browser") {
			this.stopRecognition(reason);
			return;
		}

		if (this.activeCaptureType === "openai") {
			this.stopMediaRecorder(reason);
		}
	},

	stopRecognition (reason) {
		if (!this.recognition) {
			return;
		}

		this.pendingStopReason = reason || "";
		try {
			this.recognition.stop();
		} catch {
			// recognition may already be stopped.
		}
	},

	stopMediaRecorder (reason) {
		if (!this.mediaRecorder) {
			return;
		}

		this.pendingStopReason = reason || "";
		try {
			if (this.mediaRecorder.state !== "inactive") {
				this.mediaRecorder.stop();
			}
		} catch {
			this.finishRecorderSession();
			this.cleanupMediaRecorderResources();
		}
	},

	async handleOpenAIRecordingStop () {
		const stopReason = this.pendingStopReason;
		const chunks = this.mediaChunks.slice();
		const audioType = this.selectedMimeType || "audio/webm";

		this.finishRecorderSession();
		this.cleanupMediaRecorderResources();

		if (stopReason === "suspend") {
			this.statusText = this.config.placeholder;
			this.updateDom(0);
			return;
		}

		if (!chunks.length) {
			this.showError("No speech detected. Please try again.", "no_speech");
			return;
		}
		if (!this.speechDetected && stopReason === "no-speech-timeout") {
			this.showError("No speech detected before timeout.", "no_speech");
			return;
		}

		const audioBlob = new Blob(chunks, { type: audioType });
		if (audioBlob.size < 1200) {
			this.showError("No speech detected. Please try again.", "no_speech");
			return;
		}

		void this.transcribeAudioBlob(audioBlob);
	},

	clearAudioMonitor () {
		if (this.audioMonitorTimer) {
			clearInterval(this.audioMonitorTimer);
			this.audioMonitorTimer = null;
		}
		if (this.audioSourceNode) {
			try {
				this.audioSourceNode.disconnect();
			} catch {
				// already disconnected
			}
			this.audioSourceNode = null;
		}
		this.audioAnalyser = null;
		if (this.audioContext) {
			try {
				void this.audioContext.close();
			} catch {
				// ignore close errors
			}
			this.audioContext = null;
		}
		this.audioMonitorEnabled = false;
	},

	cleanupMediaRecorderResources () {
		this.clearAudioMonitor();
		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach((track) => track.stop());
		}
		this.mediaRecorder = null;
		this.mediaStream = null;
		this.mediaChunks = [];
		this.selectedMimeType = "";
	},

	async ensureMicrophonePermission () {
		if (this.microphonePermissionGranted) {
			return;
		}

		const stream = await this.requestMicrophoneStream();
		this.microphonePermissionGranted = true;
		stream.getTracks().forEach((track) => track.stop());
	},

	async requestMicrophoneStream () {
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			throw new Error("Microphone API is not available in this browser.");
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			this.microphonePermissionGranted = true;
			return stream;
		} catch (error) {
			const message = error && error.name === "NotAllowedError"
				? "Microphone access denied. Please allow microphone permissions."
				: "Unable to access microphone. Check audio device and permissions.";
			throw new Error(message);
		}
	},

	handleRecognitionError (event) {
		const errorCode = event && event.error
			? event.error
			: "unknown";

		if (errorCode === "aborted" && this.pendingStopReason === "suspend") {
			this.statusText = this.config.placeholder;
			this.updateDom(0);
			return;
		}

		if (this.canFallbackToOpenAI(errorCode)) {
			void this.fallbackToOpenAIFromSpeechError(errorCode);
			return;
		}

		const mappedMessage = {
			"no-speech": "No speech detected before timeout.",
			"audio-capture": "Audio capture failed. Verify your microphone device.",
			network: "SpeechRecognition network error in Electron runtime.",
			"not-allowed": "Microphone permission denied.",
			"service-not-allowed": "Speech service is not allowed in this runtime.",
			"language-not-supported": `Language "${this.config.recognitionLanguage}" is not supported.`
		}[errorCode] || "Speech-to-text failed. Please try again.";

		this.showError(mappedMessage, `stt_${errorCode}`);
	},

	canFallbackToOpenAI (errorCode) {
		if (!this.config.sttFallbackToOpenAI) {
			return false;
		}
		if (!this.mediaRecorderCtor) {
			return false;
		}

		const fallbackCodes = new Set(["network", "service-not-allowed", "language-not-supported", "audio-capture", "not-allowed"]);
		return fallbackCodes.has(errorCode);
	},

	async fallbackToOpenAIFromSpeechError (errorCode) {
		this.resetCaptureState();
		this.statusText = "Speech service unavailable. Switching to OpenAI STT...";
		this.updateDom(0);
		try {
			await this.startOpenAIRecorderCapture(`fallback:${errorCode}`);
		} catch (error) {
			this.showError(error.message || "OpenAI STT fallback failed.", "stt_fallback_failed");
		}
	},

	startNoSpeechTimeout () {
		this.clearNoSpeechTimeout();
		this.noSpeechTimer = setTimeout(() => {
			if (!this.isRecording || this.speechDetected) {
				return;
			}

			this.pendingStopReason = "no-speech-timeout";
			this.stopActiveRecording("no-speech-timeout");
		}, this.config.noSpeechTimeoutMs);
	},

	clearNoSpeechTimeout () {
		if (!this.noSpeechTimer) {
			return;
		}

		clearTimeout(this.noSpeechTimer);
		this.noSpeechTimer = null;
	},

	startRecordingTimeout () {
		if (!Number.isFinite(this.config.maxRecordingMs) || this.config.maxRecordingMs < 1) {
			return;
		}

		if (this.recordingTimer) {
			clearTimeout(this.recordingTimer);
		}

		this.recordingTimer = setTimeout(() => {
			if (!this.isRecording) {
				return;
			}

			this.pendingStopReason = "recording-timeout";
			this.stopActiveRecording("recording-timeout");
		}, this.config.maxRecordingMs);
	},

	clearSpeechEndTimeout () {
		if (!this.speechEndTimer) {
			return;
		}

		clearTimeout(this.speechEndTimer);
		this.speechEndTimer = null;
	},

	clearTimers () {
		this.clearNoSpeechTimeout();
		this.clearSpeechEndTimeout();
		if (this.recordingTimer) {
			clearTimeout(this.recordingTimer);
			this.recordingTimer = null;
		}
	},

	async transcribeAudioBlob (audioBlob) {
		try {
			const audioBase64 = await this.blobToBase64(audioBlob);
			this.isLoading = true;
			this.statusText = "Transcribing";
			this.errorText = "";
			this.updateDom(0);

			this.sendSocketNotification(TRANSCRIBE_NOTIFICATION, {
				instanceId: this.identifier,
				audioBase64,
				mimeType: audioBlob.type || "audio/webm",
				model: this.config.sttOpenAI?.model || "",
				language: this.getSttLanguage(),
				prompt: this.config.sttOpenAI?.prompt || ""
			});
		} catch (error) {
			this.isLoading = false;
			this.showError(error.message || "Failed to encode recorded audio.", "stt_encode_error");
		}
	},

	blobToBase64 (blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Failed to encode recorded audio."));
			reader.onload = () => {
				if (typeof reader.result !== "string") {
					reject(new Error("Failed to encode recorded audio."));
					return;
				}
				const parts = reader.result.split(",");
				if (parts.length !== 2 || !parts[1]) {
					reject(new Error("Failed to encode recorded audio."));
					return;
				}
				resolve(parts[1]);
			};
			reader.readAsDataURL(blob);
		});
	},

	getSttLanguage () {
		const configuredLanguage = this.config.sttOpenAI && typeof this.config.sttOpenAI.language === "string"
			? this.config.sttOpenAI.language.trim()
			: "";
		if (configuredLanguage) {
			return configuredLanguage;
		}

		return String(this.config.recognitionLanguage || "").trim();
	},

	async sendTranscriptToAI (transcript) {
		const prompt = this.createPrompt(transcript);
		this.cancelTtsPlayback();
		this.isLoading = true;
		this.statusText = this.config.loadingText;
		this.errorText = "";
		this.updateDom(0);

		this.sendSocketNotification(ASK_NOTIFICATION, {
			instanceId: this.identifier,
			prompt
		});
	},

	createPrompt (transcript) {
		const prefix = (this.config.promptPrefix || "").trim();
		if (!prefix) {
			return transcript;
		}

		return `${prefix}\n\n${transcript}`;
	},

	limitResponseText (response) {
		if (response.length <= this.config.responseMaxLength) {
			return response;
		}

		return `${response.slice(0, this.config.responseMaxLength).trimEnd()}\n\n[Response truncated]`;
	},

	showError (message, code) {
		this.cancelTtsPlayback();
		this.errorText = `${message}${code ? ` (${code})` : ""}`;
		this.statusText = "Error";
		this.updateDom(0);
	},

	resolveTtsLanguage () {
		const configured = typeof this.config.ttsLanguage === "string"
			? this.config.ttsLanguage.trim()
			: "";
		if (configured) {
			return configured;
		}

		const sttLanguage = this.getSttLanguage();
		if (sttLanguage) {
			return sttLanguage;
		}

		return "en-US";
	},

	getTtsText (response) {
		const normalized = String(response || "")
			.replace(/\s+/g, " ")
			.trim();
		if (!normalized) {
			return "";
		}

		const maxLength = Number.isFinite(this.config.responseMaxLength)
			? Math.max(200, Math.floor(this.config.responseMaxLength))
			: 6000;
		if (normalized.length <= maxLength) {
			return normalized;
		}

		return normalized.slice(0, maxLength).trimEnd();
	},

	cancelTtsPlayback () {
		if (this.ttsUtterance) {
			this.ttsUtterance.onend = null;
			this.ttsUtterance.onerror = null;
		}
		this.ttsUtterance = null;

		if (this.speechSynthesis && typeof this.speechSynthesis.cancel === "function") {
			try {
				this.speechSynthesis.cancel();
			} catch {
				// Ignore platform-specific cancel errors.
			}
		}

		if (this.isSpeaking) {
			this.isSpeaking = false;
			this.updateDom(0);
		}
	},

	speakResponse (response) {
		if (!this.config.ttsEnabled || this.isRecording || this.isLoading) {
			return;
		}

		if (typeof window.SpeechSynthesisUtterance !== "function") {
			return;
		}

		if (!this.speechSynthesis || typeof this.speechSynthesis.speak !== "function") {
			return;
		}

		const ttsText = this.getTtsText(response);
		if (!ttsText) {
			return;
		}

		this.cancelTtsPlayback();

		let utterance;
		try {
			utterance = new window.SpeechSynthesisUtterance(ttsText);
		} catch {
			return;
		}

		utterance.lang = this.resolveTtsLanguage();
		utterance.rate = 1;
		utterance.pitch = 1;
		utterance.volume = 1;
		utterance.onstart = () => {
			if (!this.config.ttsEnabled) {
				this.cancelTtsPlayback();
				return;
			}
			this.isSpeaking = true;
			this.updateDom(0);
		};
		utterance.onend = () => {
			this.ttsUtterance = null;
			if (this.isSpeaking) {
				this.isSpeaking = false;
				this.updateDom(0);
			}
		};
		utterance.onerror = () => {
			this.ttsUtterance = null;
			if (this.isSpeaking) {
				this.isSpeaking = false;
				this.updateDom(0);
			}
		};

		this.ttsUtterance = utterance;

		try {
			this.speechSynthesis.cancel();
			this.speechSynthesis.speak(utterance);
		} catch {
			this.ttsUtterance = null;
			this.isSpeaking = false;
		}
	},

	resolveTheme () {
		const theme = this.config.ui?.theme || "dark";
		if (theme === "auto") {
			return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}

		return theme;
	},

	resolveVisualState () {
		if (this.errorText) {
			return "error";
		}

		if (this.isRecording) {
			return "recording";
		}

		if (this.isLoading) {
			return "loading";
		}

		if (this.isSpeaking) {
			return "speaking";
		}

		if (this.responseText) {
			return "ready";
		}

		return "idle";
	},

	getResponseLineCount () {
		if (!this.responseText) {
			return 0;
		}

		return this.responseText.split(/\r?\n/).length;
	},

	shouldUseExpandedLayout () {
		if (!this.config.expandToFullscreenOnOverflow || !this.responseText) {
			return false;
		}

		const responseThreshold = Number(this.config.fullscreenResponseThreshold);
		const lineThreshold = Number(this.config.fullscreenLineThreshold);
		const resolvedResponseThreshold = Number.isFinite(responseThreshold) && responseThreshold > 0
			? responseThreshold
			: 900;
		const resolvedLineThreshold = Number.isFinite(lineThreshold) && lineThreshold > 0
			? lineThreshold
			: 15;

		return this.responseText.length >= resolvedResponseThreshold
			|| this.getResponseLineCount() >= resolvedLineThreshold;
	},

	clearAutoScrollSetupTimer () {
		if (!this.autoScrollSetupTimer) {
			return;
		}

		clearTimeout(this.autoScrollSetupTimer);
		this.autoScrollSetupTimer = null;
	},

	stopAutoScroll () {
		if (this.autoScrollFrame) {
			cancelAnimationFrame(this.autoScrollFrame);
			this.autoScrollFrame = null;
		}

		if (this.autoScrollPauseTimer) {
			clearTimeout(this.autoScrollPauseTimer);
			this.autoScrollPauseTimer = null;
		}

		this.autoScrollTarget = null;
		this.autoScrollDirection = 1;
		this.autoScrollLastTick = 0;
	},

	queueAutoScrollSetup () {
		this.clearAutoScrollSetupTimer();
		this.autoScrollSetupTimer = setTimeout(() => {
			this.autoScrollSetupTimer = null;
			this.setupAutoScroll();
		}, 70);
	},

	setupAutoScroll () {
		const responseElement = this.responseElement;
		if (!responseElement || !responseElement.isConnected) {
			return;
		}

		if (this.isRecording || this.isLoading) {
			this.stopAutoScroll();
			if (this.shellElement) {
				this.shellElement.classList.remove("is-scrollable");
			}
			if (this.wrapperElement) {
				this.wrapperElement.classList.remove("is-scrollable");
			}
			return;
		}

		const scrollDistance = Math.max(0, responseElement.scrollHeight - responseElement.clientHeight);
		const isScrollable = scrollDistance > 6;
		if (this.shellElement) {
			this.shellElement.classList.toggle("is-scrollable", isScrollable);
		}
		if (this.wrapperElement) {
			this.wrapperElement.classList.toggle("is-scrollable", isScrollable);
		}

		if (!this.config.autoScrollLongResponse || !isScrollable) {
			this.stopAutoScroll();
			return;
		}

		responseElement.scrollTop = 0;
		this.startAutoScroll(responseElement);
	},

	startAutoScroll (responseElement) {
		this.stopAutoScroll();
		this.autoScrollTarget = responseElement;

		const configuredSpeed = Number(this.config.autoScrollSpeedPxPerSecond);
		const pixelsPerSecond = Number.isFinite(configuredSpeed) && configuredSpeed > 1
			? configuredSpeed
			: 20;
		const configuredPause = Number(this.config.autoScrollPauseMs);
		const pauseMs = Number.isFinite(configuredPause) && configuredPause >= 0
			? configuredPause
			: 1400;

		const tick = (timestamp) => {
			if (this.autoScrollTarget !== responseElement || !responseElement.isConnected) {
				this.stopAutoScroll();
				return;
			}

			const maxScrollTop = Math.max(0, responseElement.scrollHeight - responseElement.clientHeight);
			if (maxScrollTop <= 6) {
				this.stopAutoScroll();
				if (this.shellElement) {
					this.shellElement.classList.remove("is-scrollable");
				}
				if (this.wrapperElement) {
					this.wrapperElement.classList.remove("is-scrollable");
				}
				return;
			}

			if (!this.autoScrollLastTick) {
				this.autoScrollLastTick = timestamp;
			}

			const elapsed = timestamp - this.autoScrollLastTick;
			if (elapsed < 34) {
				this.autoScrollFrame = requestAnimationFrame(tick);
				return;
			}
			this.autoScrollLastTick = timestamp;

			const delta = (pixelsPerSecond * elapsed / 1000) * this.autoScrollDirection;
			let nextScroll = responseElement.scrollTop + delta;
			let reachedEdge = false;

			if (nextScroll >= maxScrollTop) {
				nextScroll = maxScrollTop;
				this.autoScrollDirection = -1;
				reachedEdge = true;
			} else if (nextScroll <= 0) {
				nextScroll = 0;
				this.autoScrollDirection = 1;
				reachedEdge = true;
			}

			responseElement.scrollTop = nextScroll;

			if (reachedEdge) {
				this.autoScrollLastTick = 0;
				this.autoScrollPauseTimer = setTimeout(() => {
					this.autoScrollPauseTimer = null;
					this.autoScrollFrame = requestAnimationFrame(tick);
				}, pauseMs);
				return;
			}

			this.autoScrollFrame = requestAnimationFrame(tick);
		};

		this.autoScrollFrame = requestAnimationFrame(tick);
	},

	getDom () {
		this.stopAutoScroll();
		this.clearAutoScrollSetupTimer();
		this.responseElement = null;
		this.shellElement = null;
		this.wrapperElement = null;

		const shell = document.createElement("div");
		shell.className = "mmm-ai-assistant-shell";
		if (this.config.centerOnScreen) {
			shell.classList.add("is-centered");
		}

		const wrapper = document.createElement("div");
		const theme = this.resolveTheme();
		const visualState = this.resolveVisualState();
		wrapper.className = `mmm-ai-assistant theme-${theme}`;
		if (this.isRecording) {
			wrapper.classList.add("is-recording");
		}
		if (this.isLoading) {
			wrapper.classList.add("is-loading");
		}
		if (this.errorText) {
			wrapper.classList.add("has-error");
		}
		wrapper.classList.add(`state-${visualState}`);

		wrapper.style.setProperty("--mmm-ai-width", this.config.width);
		wrapper.style.setProperty("--mmm-ai-min-height", this.config.minHeight);
		wrapper.style.setProperty("--mmm-ai-max-height", this.config.maxHeight);
		wrapper.style.setProperty("--mmm-ai-font-size", this.config.ui.fontSize);
		wrapper.style.setProperty("--mmm-ai-line-height", String(this.config.ui.lineHeight));
		wrapper.style.setProperty("--mmm-ai-border-radius", this.config.ui.borderRadius);
		wrapper.style.setProperty("--mmm-ai-padding", this.config.ui.padding);
		wrapper.style.setProperty("--mmm-ai-bg-opacity", String(this.config.ui.backgroundOpacity));

		const header = document.createElement("div");
		header.className = "mmm-ai-assistant-header";

		const title = document.createElement("div");
		title.className = "mmm-ai-assistant-title";
		title.textContent = "AI Assistant (chatgpt)";
		header.appendChild(title);

		const statePill = document.createElement("div");
		statePill.className = "mmm-ai-assistant-state-pill";
		statePill.textContent = visualState.toUpperCase();
		header.appendChild(statePill);

		wrapper.appendChild(header);

		const status = document.createElement("div");
		status.className = "mmm-ai-assistant-status";
		status.classList.add(`is-${visualState}`);
		status.textContent = this.statusText;
		wrapper.appendChild(status);

		if (this.config.showTranscript && this.transcriptText) {
			const transcript = document.createElement("div");
			transcript.className = "mmm-ai-assistant-transcript";
			transcript.textContent = `You: ${this.transcriptText}`;
			wrapper.appendChild(transcript);
		}

		const response = document.createElement("div");
		response.className = "mmm-ai-assistant-response";
		response.textContent = this.responseText || "Your AI response will appear here.";
		wrapper.appendChild(response);

		if (this.errorText) {
			const error = document.createElement("div");
			error.className = "mmm-ai-assistant-error";
			error.textContent = this.errorText;
			wrapper.appendChild(error);
		}

		shell.appendChild(wrapper);
		this.responseElement = response;
		this.shellElement = shell;
		this.wrapperElement = wrapper;
		this.queueAutoScrollSetup();
		return shell;
	}
});
