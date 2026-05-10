const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const helmet = require("helmet");
const socketio = require("socket.io");
const Log = require("logger");

const { ipAccessControl } = require("./ip_access_control");
const Utils = require("./utils");

const vendor = require("./vendor");

const { getHtml, getVersion, getEnvVars, cors, getConfigFilePath } = require("#server_functions");

/**
 *
 * @param basePath
 */
function normalizeBasePath (basePath) {
	if (typeof basePath !== "string" || basePath.trim() === "") return "/";
	const trimmed = basePath.trim();
	const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 *
 * @param value
 */
function escapeForDoubleQuote (value) {
	return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

/**
 *
 * @param source
 * @param key
 * @param value
 */
function replaceTopLevelString (source, key, value) {
	const regex = new RegExp(`(\\b${key}\\s*:\\s*)(["'])([^"']*)(\\2)`);
	if (!regex.test(source)) return source;
	return source.replace(regex, `$1"${escapeForDoubleQuote(value)}"`);
}

/**
 *
 * @param source
 * @param key
 * @param value
 */
function replaceTopLevelNumber (source, key, value) {
	const regex = new RegExp(`(\\b${key}\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)`);
	if (!regex.test(source)) return source;
	return source.replace(regex, `$1${value}`);
}

/**
 *
 * @param source
 */
function getModulesArrayRanges (source) {
	const modulesMatch = source.match(/\bmodules\s*:/);
	if (!modulesMatch) return [];
	const modulesIndex = modulesMatch.index;
	if (typeof modulesIndex !== "number" || modulesIndex < 0) return [];
	const arrayStart = source.indexOf("[", modulesIndex);
	if (arrayStart === -1) return [];

	const ranges = [];
	let bracketDepth = 0;
	let braceDepth = 0;
	let inString = null;
	let escape = false;
	let objStart = -1;

	for (let i = arrayStart; i < source.length; i++) {
		const ch = source[i];
		if (inString) {
			if (escape) {
				escape = false;
				continue;
			}
			if (ch === "\\") {
				escape = true;
				continue;
			}
			if (ch === inString) {
				inString = null;
			}
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "[") {
			bracketDepth += 1;
			continue;
		}
		if (ch === "]") {
			bracketDepth -= 1;
			if (bracketDepth === 0) break;
			continue;
		}
		if (bracketDepth < 1) continue;

		if (ch === "{") {
			if (braceDepth === 0) objStart = i;
			braceDepth += 1;
			continue;
		}
		if (ch === "}") {
			braceDepth -= 1;
			if (braceDepth === 0 && objStart !== -1) {
				ranges.push({ start: objStart, end: i + 1 });
				objStart = -1;
			}
		}
	}

	return ranges;
}

/**
 *
 * @param block
 */
function getModuleName (block) {
	const match = block.match(/(?:^|[\s,{])["']?module["']?\s*:\s*(["'])([^"']+)\1/);
	return match ? match[2] : null;
}

/**
 *
 * @param block
 * @param key
 * @param value
 */
function replaceNumberField (block, key, value) {
	const regex = new RegExp(`(${key}\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)`);
	if (!regex.test(block)) return block;
	return block.replace(regex, `$1${value}`);
}

/**
 *
 * @param source
 * @param openIndex
 */
function findMatchingBracket (source, openIndex) {
	if (openIndex < 0 || openIndex >= source.length || source[openIndex] !== "[") return -1;
	let bracketDepth = 0;
	let inString = null;
	let escape = false;

	for (let i = openIndex; i < source.length; i++) {
		const ch = source[i];
		if (inString) {
			if (escape) {
				escape = false;
				continue;
			}
			if (ch === "\\") {
				escape = true;
				continue;
			}
			if (ch === inString) inString = null;
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "[") {
			bracketDepth += 1;
			continue;
		}
		if (ch === "]") {
			bracketDepth -= 1;
			if (bracketDepth === 0) return i;
		}
	}

	return -1;
}

/**
 *
 * @param block
 * @param value
 */
function replaceCalendarUrl (block, value) {
	const calendarsMatch = block.match(/(\r?\n[ \t]*)calendars\s*:\s*\[/);
	if (!calendarsMatch || typeof calendarsMatch.index !== "number") return block;

	const calendarsIndent = calendarsMatch[1].replace(/\r?\n/, "");
	const eol = calendarsMatch[1].includes("\r\n") ? "\r\n" : "\n";
	const arrayStart = block.indexOf("[", calendarsMatch.index);
	const arrayEnd = findMatchingBracket(block, arrayStart);
	if (arrayStart === -1 || arrayEnd === -1) return block;

	const arrayChunk = block.slice(arrayStart, arrayEnd + 1);
	const escapedUrl = escapeForDoubleQuote(value);
	const urlRegex = /(url\s*:\s*)(["'])([^"']*)(\2)/;
	if (urlRegex.test(arrayChunk)) {
		const replacedArray = arrayChunk.replace(urlRegex, `$1"${escapedUrl}"`);
		return block.slice(0, arrayStart) + replacedArray + block.slice(arrayEnd + 1);
	}

	const firstObjStart = arrayChunk.indexOf("{");
	if (firstObjStart !== -1) {
		const firstObjEnd = findMatchingBrace(arrayChunk, firstObjStart);
		if (firstObjEnd !== -1) {
			const objectIndent = `${calendarsIndent}\t\t`;
			const insert = `${eol}${objectIndent}url: "${escapedUrl}",`;
			const replacedArray = arrayChunk.slice(0, firstObjStart + 1) + insert + arrayChunk.slice(firstObjStart + 1);
			return block.slice(0, arrayStart) + replacedArray + block.slice(arrayEnd + 1);
		}
	}

	const entryIndent = `${calendarsIndent}\t`;
	const fieldIndent = `${calendarsIndent}\t\t`;
	const newArray = `[${eol}${entryIndent}{${eol}${fieldIndent}url: "${escapedUrl}"${eol}${entryIndent}}${eol}${calendarsIndent}]`;
	return block.slice(0, arrayStart) + newArray + block.slice(arrayEnd + 1);
}

/**
 *
 * @param feeds
 * @param indent
 * @param eol
 */
function buildFeedsBlock (feeds, indent, eol) {
	const line = eol || "\n";
	if (!Array.isArray(feeds) || feeds.length === 0) {
		return `${indent}feeds: []`;
	}
	const feedIndent = `${indent}\t`;
	const entryIndent = `${indent}\t\t`;
	const entries = feeds.map((feed, index) => {
		const url = typeof feed === "string" ? feed : feed && feed.url;
		if (!url) return null;
		const rawTitleValue = feed && typeof feed === "object"
			? (typeof feed.title !== "undefined" ? feed.title : (typeof feed.name !== "undefined" ? feed.name : feed.label))
			: "";
		const rawTitle = rawTitleValue != null ? String(rawTitleValue).trim() : "";
		const title = rawTitle ? rawTitle : `Feed ${index + 1}`;
		return `${feedIndent}{${line}${entryIndent}title: "${escapeForDoubleQuote(title)}",${line}${entryIndent}url: "${escapeForDoubleQuote(url)}"${line}${feedIndent}}`;
	}).filter(Boolean).join(`,${line}`);
	if (!entries) return `${indent}feeds: []`;

	return `${indent}feeds: [${line}${entries}${line}${indent}]`;
}

/**
 *
 * @param block
 * @param feeds
 */
function replaceFeedsBlock (block, feeds) {
	const match = block.match(/(\r?\n[ \t]*)feeds\s*:\s*\[[\s\S]*?\]/);
	if (!match) return block;
	const indent = match[1].replace(/\r?\n/, "");
	const eol = match[1].includes("\r\n") ? "\r\n" : "\n";
	const feedsBlock = buildFeedsBlock(feeds, indent, eol);
	return block.replace(match[0], `${eol}${feedsBlock}`);
}

/**
 *
 * @param source
 * @param openIndex
 */
function findMatchingBrace (source, openIndex) {
	if (openIndex < 0 || openIndex >= source.length || source[openIndex] !== "{") return -1;
	let braceDepth = 0;
	let inString = null;
	let escape = false;

	for (let i = openIndex; i < source.length; i++) {
		const ch = source[i];
		if (inString) {
			if (escape) {
				escape = false;
				continue;
			}
			if (ch === "\\") {
				escape = true;
				continue;
			}
			if (ch === inString) inString = null;
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "{") {
			braceDepth += 1;
			continue;
		}
		if (ch === "}") {
			braceDepth -= 1;
			if (braceDepth === 0) return i;
		}
	}

	return -1;
}

/**
 *
 * @param rawCompliments
 */
function normalizeComplimentsPayload (rawCompliments) {
	if (!rawCompliments || typeof rawCompliments !== "object") return null;

	const groups = ["anytime", "morning", "afternoon", "evening"];
	const normalized = {};
	let hasValues = false;

	for (const group of groups) {
		const entries = Array.isArray(rawCompliments[group]) ? rawCompliments[group] : [];
		const cleaned = entries
			.map((entry) => (entry == null ? "" : String(entry).trim()))
			.filter((entry) => entry.length > 0)
			.slice(0, 100);
		normalized[group] = cleaned;
		if (cleaned.length > 0) hasValues = true;
	}

	const rawIntervalSeconds = Number(rawCompliments.updateIntervalSeconds);
	const hasValidInterval = Number.isFinite(rawIntervalSeconds)
	  && Number.isInteger(rawIntervalSeconds)
	  && rawIntervalSeconds >= 1
	  && rawIntervalSeconds <= 86400;

	if (!hasValues && !hasValidInterval) return null;

	return {
		compliments: hasValues ? normalized : null,
		updateIntervalMs: hasValidInterval ? rawIntervalSeconds * 1000 : null
	};
}

/**
 *
 * @param items
 * @param indent
 * @param eol
 */
function buildComplimentsArray (items, indent, eol) {
	const line = eol || "\n";
	if (!Array.isArray(items) || items.length === 0) return "[]";
	const values = items.map((item) => `${indent}\t"${escapeForDoubleQuote(item)}"`).join(`,${line}`);
	return `[${line}${values}${line}${indent}]`;
}

/**
 *
 * @param compliments
 * @param indent
 * @param eol
 */
function buildComplimentsConfigBlock (compliments, indent, eol) {
	const line = eol || "\n";
	const keys = ["anytime", "morning", "afternoon", "evening"];
	const groupIndent = `${indent}\t`;
	const entries = keys.map((key) => {
		const values = Array.isArray(compliments[key]) ? compliments[key] : [];
		const arr = buildComplimentsArray(values, `${groupIndent}\t`, line);
		return `${groupIndent}${key}: ${arr}`;
	}).join(`,${line}`);
	return `${indent}compliments: {${line}${entries}${line}${indent}}`;
}

/**
 *
 * @param block
 * @param compliments
 */
function replaceComplimentsBlock (block, compliments) {
	const eol = block.includes("\r\n") ? "\r\n" : "\n";
	const complimentsMatch = block.match(/(\r?\n[ \t]*)compliments\s*:\s*\{/);
	if (complimentsMatch && typeof complimentsMatch.index === "number") {
		const indent = complimentsMatch[1].replace(/\r?\n/, "");
		const openBraceIndex = block.indexOf("{", complimentsMatch.index);
		const closeBraceIndex = findMatchingBrace(block, openBraceIndex);
		if (openBraceIndex === -1 || closeBraceIndex === -1) return block;
		const replacement = `${eol}${buildComplimentsConfigBlock(compliments, indent, eol)}`;
		return block.slice(0, complimentsMatch.index) + replacement + block.slice(closeBraceIndex + 1);
	}

	const configMatch = block.match(/(\r?\n[ \t]*)config\s*:\s*\{/);
	if (configMatch && typeof configMatch.index === "number") {
		const configIndent = configMatch[1].replace(/\r?\n/, "");
		const openBraceIndex = block.indexOf("{", configMatch.index);
		const closeBraceIndex = findMatchingBrace(block, openBraceIndex);
		if (openBraceIndex === -1 || closeBraceIndex === -1) return block;
		const insertIndent = `${configIndent}\t`;
		const insert = `${eol}${buildComplimentsConfigBlock(compliments, insertIndent, eol)},`;
		return block.slice(0, openBraceIndex + 1) + insert + block.slice(openBraceIndex + 1);
	}

	const moduleMatch = block.match(/(\r?\n[ \t]*)module\s*:\s*["']compliments["']/);
	if (!moduleMatch || typeof moduleMatch.index !== "number") return block;
	const moduleIndent = moduleMatch[1].replace(/\r?\n/, "");
	const configIndent = `${moduleIndent}\t`;
	const moduleCloseIndex = block.lastIndexOf("}");
	if (moduleCloseIndex === -1) return block;

	const blockBeforeClose = block.slice(0, moduleCloseIndex).trimEnd();
	const lastCharBeforeClose = blockBeforeClose.slice(-1);
	const separator = (lastCharBeforeClose !== "{" && lastCharBeforeClose !== ",") ? `,${eol}` : eol;
	const configBlock = `${separator}${configIndent}config: {${eol}${buildComplimentsConfigBlock(compliments, `${configIndent}\t`, eol)}${eol}${configIndent}},`;
	return block.slice(0, moduleCloseIndex) + configBlock + block.slice(moduleCloseIndex);
}

/**
 *
 * @param block
 * @param updateIntervalMs
 */
function upsertComplimentsUpdateInterval (block, updateIntervalMs) {
	if (!Number.isFinite(updateIntervalMs) || updateIntervalMs < 1000) return block;
	const interval = Math.round(updateIntervalMs);
	const eol = block.includes("\r\n") ? "\r\n" : "\n";

	const existingMatch = block.match(/(\r?\n[ \t]*)updateInterval\s*:\s*[^,\r\n]+(,?)/);
	if (existingMatch) {
		const indent = existingMatch[1];
		const trailingComma = existingMatch[2] || ",";
		return block.replace(existingMatch[0], `${indent}updateInterval: ${interval}${trailingComma}`);
	}

	const configMatch = block.match(/(\r?\n[ \t]*)config\s*:\s*\{/);
	if (configMatch && typeof configMatch.index === "number") {
		const configIndent = configMatch[1].replace(/\r?\n/, "");
		const openBraceIndex = block.indexOf("{", configMatch.index);
		if (openBraceIndex === -1) return block;
		const insertLine = `${eol}${configIndent}\tupdateInterval: ${interval},`;
		return block.slice(0, openBraceIndex + 1) + insertLine + block.slice(openBraceIndex + 1);
	}

	const moduleMatch = block.match(/(\r?\n[ \t]*)module\s*:\s*["']compliments["']/);
	if (!moduleMatch || typeof moduleMatch.index !== "number") return block;
	const moduleIndent = moduleMatch[1].replace(/\r?\n/, "");
	const configIndent = `${moduleIndent}\t`;
	const moduleCloseIndex = block.lastIndexOf("}");
	if (moduleCloseIndex === -1) return block;

	const blockBeforeClose = block.slice(0, moduleCloseIndex).trimEnd();
	const lastCharBeforeClose = blockBeforeClose.slice(-1);
	const separator = (lastCharBeforeClose !== "{" && lastCharBeforeClose !== ",") ? `,${eol}` : eol;
	const configBlock = `${separator}${configIndent}config: {${eol}${configIndent}\tupdateInterval: ${interval},${eol}${configIndent}},`;
	return block.slice(0, moduleCloseIndex) + configBlock + block.slice(moduleCloseIndex);
}

/**
 *
 * @param value
 */
function isPlainObject (value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 *
 * @param value
 */
function isLikelySecretApiKey (value) {
	return typeof value === "string" && (/^sk-\S{10,}$/).test(value.trim());
}

/**
 *
 * @param rawAssistant
 */
function normalizeAssistantPayload (rawAssistant) {
	if (!isPlainObject(rawAssistant)) return null;

	const fields = {};
	const ui = {};
	const chatgpt = {};
	const sttOpenAI = {};

	const assignString = (target, key, value, minLen, maxLen, regex = null) => {
		if (typeof value !== "string") return;
		const trimmed = value.trim();
		if (trimmed.length < minLen || trimmed.length > maxLen) return;
		if (regex && !regex.test(trimmed)) return;
		target[key] = trimmed;
	};

	const assignNumber = (target, key, value, min, max, integer = false) => {
		if (typeof value === "undefined" || value === null || value === "") return;
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
		target[key] = integer
			? Math.round(parsed)
			: parsed;
	};

	assignString(fields, "activationKey", rawAssistant.activationKey, 1, 40);
	if (Array.isArray(rawAssistant.activationKeyStates)) {
		const allowedStates = new Set(["KEY_PRESSED", "KEY_LONGPRESSED", "KEY_UP", "KEY_DOWN", "KEY_HOLD"]);
		const states = rawAssistant.activationKeyStates
			.map((entry) => String(entry).trim())
			.filter((entry) => allowedStates.has(entry));
		if (states.length > 0) {
			fields.activationKeyStates = Array.from(new Set(states));
		}
	}

	if (typeof rawAssistant.listenToMMMKeyBindings === "boolean") {
		fields.listenToMMMKeyBindings = rawAssistant.listenToMMMKeyBindings;
	}
	if (typeof rawAssistant.enableKeyboardFallback === "boolean") {
		fields.enableKeyboardFallback = rawAssistant.enableKeyboardFallback;
	}
	if (typeof rawAssistant.microphonePermissionPreflight === "boolean") {
		fields.microphonePermissionPreflight = rawAssistant.microphonePermissionPreflight;
	}
	if (typeof rawAssistant.showTranscript === "boolean") {
		fields.showTranscript = rawAssistant.showTranscript;
	}
	if (typeof rawAssistant.ttsEnabled === "boolean") {
		fields.ttsEnabled = rawAssistant.ttsEnabled;
	}
	if (typeof rawAssistant.sttFallbackToOpenAI === "boolean") {
		fields.sttFallbackToOpenAI = rawAssistant.sttFallbackToOpenAI;
	}

	assignNumber(fields, "triggerCooldownMs", rawAssistant.triggerCooldownMs, 0, 120000, true);
	assignNumber(fields, "maxRecordingMs", rawAssistant.maxRecordingMs, 1000, 180000, true);
	assignNumber(fields, "noSpeechTimeoutMs", rawAssistant.noSpeechTimeoutMs, 500, 60000, true);
	assignNumber(fields, "speechEndGraceMs", rawAssistant.speechEndGraceMs, 100, 10000, true);
	assignNumber(fields, "requestTimeoutMs", rawAssistant.requestTimeoutMs, 1000, 180000, true);
	assignNumber(fields, "responseMaxLength", rawAssistant.responseMaxLength, 200, 50000, true);
	assignNumber(fields, "sttSilenceThreshold", rawAssistant.sttSilenceThreshold, 0.002, 0.2, false);

	assignString(fields, "recognitionLanguage", rawAssistant.recognitionLanguage, 2, 16, /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,6})?$/);
	if (typeof rawAssistant.sttEngine === "string") {
		const sttEngine = rawAssistant.sttEngine.trim().toLowerCase();
		if (["auto", "browser", "openai"].includes(sttEngine)) {
			fields.sttEngine = sttEngine;
		}
	}
	assignString(fields, "promptPrefix", rawAssistant.promptPrefix, 0, 2000);
	assignString(fields, "systemPrompt", rawAssistant.systemPrompt, 0, 4000);
	assignString(fields, "loadingText", rawAssistant.loadingText, 1, 120);
	assignString(fields, "placeholder", rawAssistant.placeholder, 1, 200);
	assignString(fields, "width", rawAssistant.width, 2, 50);
	assignString(fields, "minHeight", rawAssistant.minHeight, 2, 50);
	assignString(fields, "maxHeight", rawAssistant.maxHeight, 2, 50);

	const rawUi = isPlainObject(rawAssistant.ui)
		? rawAssistant.ui
		: null;
	if (rawUi) {
		if (typeof rawUi.theme === "string" && ["dark", "light", "auto"].includes(rawUi.theme.trim())) {
			ui.theme = rawUi.theme.trim();
		}
		assignString(ui, "fontSize", rawUi.fontSize, 2, 20);
		assignNumber(ui, "lineHeight", rawUi.lineHeight, 1, 3, false);
		assignString(ui, "borderRadius", rawUi.borderRadius, 1, 20);
		assignString(ui, "padding", rawUi.padding, 3, 40);
		assignNumber(ui, "backgroundOpacity", rawUi.backgroundOpacity, 0, 1, false);
	}

	const rawChatGpt = isPlainObject(rawAssistant.chatgpt)
		? rawAssistant.chatgpt
		: null;
	if (rawChatGpt) {
		assignString(chatgpt, "model", rawChatGpt.model, 2, 80);
		assignString(chatgpt, "apiBase", rawChatGpt.apiBase, 10, 120, /^https?:\/\//i);
		if (typeof rawChatGpt.apiKeyEnv === "string") {
			const apiKeyEnv = rawChatGpt.apiKeyEnv.trim();
			if ((/^[A-Z_][A-Z0-9_]*$/).test(apiKeyEnv)) {
				chatgpt.apiKeyEnv = apiKeyEnv;
			} else if (isLikelySecretApiKey(apiKeyEnv) && !chatgpt.apiKey) {
				chatgpt.apiKey = apiKeyEnv;
				chatgpt.apiKeyEnv = "SECRET_OPENAI_API_KEY";
			}
		}
		if (typeof rawChatGpt.apiKey === "string") {
			const apiKey = rawChatGpt.apiKey.trim();
			if (apiKey.length >= 10 && apiKey.length <= 300) {
				chatgpt.apiKey = apiKey;
			}
		}
		assignNumber(chatgpt, "temperature", rawChatGpt.temperature, 0, 2, false);
		assignNumber(chatgpt, "maxOutputTokens", rawChatGpt.maxOutputTokens, 64, 8192, true);
	}

	const rawSttOpenAI = isPlainObject(rawAssistant.sttOpenAI)
		? rawAssistant.sttOpenAI
		: null;
	if (rawSttOpenAI) {
		assignString(sttOpenAI, "model", rawSttOpenAI.model, 2, 120);
		assignString(sttOpenAI, "prompt", rawSttOpenAI.prompt, 0, 1200);
		if (typeof rawSttOpenAI.language === "string") {
			const sttLanguage = rawSttOpenAI.language.trim();
			if (!sttLanguage) {
				sttOpenAI.language = "";
			} else if ((/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,6})?$/).test(sttLanguage)) {
				sttOpenAI.language = sttLanguage;
			}
		}
	}

	if (
		Object.keys(fields).length === 0
		&& Object.keys(ui).length === 0
		&& Object.keys(chatgpt).length === 0
		&& Object.keys(sttOpenAI).length === 0
	) {
		return null;
	}

	return {
		fields,
		ui,
		chatgpt,
		sttOpenAI
	};
}

/**
 *
 * @param block
 */
function parseModuleBlockObject (block) {
	try {
		const parsed = vm.runInNewContext(`(${block})`, {}, { timeout: 100 });
		return isPlainObject(parsed)
			? parsed
			: null;
	} catch {
		return null;
	}
}

/**
 *
 * @param block
 * @param assistantUpdate
 */
function replaceAIAssistantBlock (block, assistantUpdate) {
	if (!assistantUpdate || !isPlainObject(assistantUpdate)) return block;
	const moduleObject = parseModuleBlockObject(block);
	if (!moduleObject || moduleObject.module !== "MMM-AIVoiceAssistant") {
		return block;
	}

	const before = JSON.stringify(moduleObject);
	if (!isPlainObject(moduleObject.config)) {
		moduleObject.config = {};
	}
	const nextConfig = moduleObject.config;

	// Enforce ChatGPT-only configuration and remove legacy provider switching.
	delete nextConfig.provider;
	delete nextConfig.providers;

	for (const [key, value] of Object.entries(assistantUpdate.fields || {})) {
		nextConfig[key] = value;
	}

	if (Object.keys(assistantUpdate.ui || {}).length > 0) {
		nextConfig.ui = isPlainObject(nextConfig.ui)
			? nextConfig.ui
			: {};
		Object.assign(nextConfig.ui, assistantUpdate.ui);
	}

	if (Object.keys(assistantUpdate.chatgpt || {}).length > 0) {
		nextConfig.chatgpt = isPlainObject(nextConfig.chatgpt)
			? nextConfig.chatgpt
			: {};
		if (
			typeof nextConfig.chatgpt.apiKeyEnv === "string"
			&& isLikelySecretApiKey(nextConfig.chatgpt.apiKeyEnv)
		) {
			nextConfig.chatgpt.apiKey = nextConfig.chatgpt.apiKeyEnv.trim();
			nextConfig.chatgpt.apiKeyEnv = "SECRET_OPENAI_API_KEY";
		}
		Object.assign(nextConfig.chatgpt, assistantUpdate.chatgpt);
	}

	if (Object.keys(assistantUpdate.sttOpenAI || {}).length > 0) {
		nextConfig.sttOpenAI = isPlainObject(nextConfig.sttOpenAI)
			? nextConfig.sttOpenAI
			: {};
		Object.assign(nextConfig.sttOpenAI, assistantUpdate.sttOpenAI);
	}

	const after = JSON.stringify(moduleObject);
	if (after === before) {
		return block;
	}

	return JSON.stringify(moduleObject, null, "\t");
}

const REMOTE_SOURCE_CHECK_TIMEOUT_MS = 5000;
const REMOTE_SOURCE_CHECK_MAX_URLS = 12;

/**
 *
 * @param newsUrls
 * @param calendarUrls
 */
function buildRemoteSourceCheckList (newsUrls, calendarUrls) {
	const requested = []
		.concat(Array.isArray(newsUrls) ? newsUrls : [])
		.concat(Array.isArray(calendarUrls) ? calendarUrls : []);
	const unique = new Set();
	const list = [];

	for (const entry of requested) {
		if (list.length >= REMOTE_SOURCE_CHECK_MAX_URLS) break;
		if (typeof entry !== "string") continue;
		const rawUrl = entry.trim();
		if (!rawUrl || unique.has(rawUrl)) continue;
		const checkUrl = (/^webcal:\/\//i).test(rawUrl)
			? `http://${rawUrl.replace(/^webcal:\/\//i, "")}`
			: rawUrl;

		let parsed;
		try {
			parsed = new URL(checkUrl);
		} catch {
			continue;
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;

		unique.add(rawUrl);
		list.push({
			requestedUrl: rawUrl,
			fetchUrl: parsed.toString()
		});
	}

	return list;
}

/**
 *
 * @param error
 */
function normalizeSourceCheckError (error) {
	if (!error) return "Unknown error";
	if (error.name === "AbortError") return "Request timed out";
	if (error.code === "ENOTFOUND") return "Host not found";
	if (error.code === "ECONNREFUSED") return "Connection refused";
	if (error.code === "ETIMEDOUT") return "Connection timed out";
	return error.message || "Network error";
}

/**
 *
 * @param io
 */
function getSocketClientCount (io) {
	if (!io) return 0;
	const engineCount = io.engine && Number.isFinite(io.engine.clientsCount)
		? io.engine.clientsCount
		: 0;
	let namespaceCount;
	try {
		namespaceCount = io.of("/") && io.of("/").sockets
			? io.of("/").sockets.size
			: 0;
	} catch {
		namespaceCount = 0;
	}
	return Math.max(engineCount, namespaceCount);
}

/**
 *
 * @param url
 */
async function checkRemoteSourceUrl (url) {
	const attempts = [
		{ method: "HEAD", headers: {} },
		{ method: "GET", headers: { Range: "bytes=0-0" } }
	];
	let lastFailure = null;

	for (let i = 0; i < attempts.length; i++) {
		const attempt = attempts[i];
		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), REMOTE_SOURCE_CHECK_TIMEOUT_MS);
		try {
			const response = await fetch(url, {
				method: attempt.method,
				redirect: "follow",
				signal: controller.signal,
				headers: {
					"User-Agent": "MagicMirror-RemoteApp-HealthCheck/1.0",
					...attempt.headers
				}
			});
			clearTimeout(timeoutHandle);

			if (response.ok) {
				return {
					available: true,
					status: response.status,
					method: attempt.method,
					error: null
				};
			}

			if (attempt.method === "HEAD" && [401, 403, 405, 501].includes(response.status)) {
				lastFailure = {
					available: false,
					status: response.status,
					method: attempt.method,
					error: `HTTP ${response.status}`
				};
				continue;
			}

			return {
				available: false,
				status: response.status,
				method: attempt.method,
				error: `HTTP ${response.status}`
			};
		} catch (error) {
			clearTimeout(timeoutHandle);
			lastFailure = {
				available: false,
				status: null,
				method: attempt.method,
				error: normalizeSourceCheckError(error)
			};
			if (attempt.method === "HEAD") {
				continue;
			}
			return lastFailure;
		}
	}

	return lastFailure || {
		available: false,
		status: null,
		method: "HEAD",
		error: "Unknown error"
	};
}

/**
 * Server
 * @param {object} configObj The MM config full and redacted
 * @class
 */
function Server (configObj) {
	const config = configObj.fullConf;
	const app = express();
	const port = process.env.MM_PORT || config.port;
	const basePath = normalizeBasePath(config.basePath);
	const withBasePath = (route) => `${basePath}${String(route).replace(/^\/+/, "")}`;
	const serverSockets = new Set();
	let server = null;

	/**
	 * Opens the server for incoming connections
	 * @returns {Promise} A promise that is resolved when the server listens to connections
	 */
	this.open = function () {
		return new Promise((resolve) => {
			if (config.useHttps) {
				const options = {
					key: fs.readFileSync(config.httpsPrivateKey),
					cert: fs.readFileSync(config.httpsCertificate)
				};
				server = https.Server(options, app);
			} else {
				server = http.Server(app);
			}
			const io = socketio(server, {
				cors: {
					origin: /.*$/,
					credentials: true
				},
				path: `${basePath}socket.io`,
				allowEIO3: true,
				pingInterval: 120000, // server → client ping every 2 mins
				pingTimeout: 120000 // wait up to 2 mins for client pong
			});

			server.on("connection", (socket) => {
				serverSockets.add(socket);
				socket.on("close", () => {
					serverSockets.delete(socket);
				});
			});

			Log.log(`Starting server on port ${port} ... `);

			// Add explicit error handling BEFORE calling listen so we can give user-friendly feedback
			server.once("error", (err) => {
				if (err && err.code === "EADDRINUSE") {
					const bindAddr = config.address || "localhost";
					const portInUseMessage = [
						"",
						"────────────────────────────────────────────────────────────────",
						` PORT IN USE: ${bindAddr}:${port}`,
						"",
						" Another process (most likely another MagicMirror instance)",
						" is already using this port.",
						"",
						" Stop the other process (free the port) or use a different port.",
						"────────────────────────────────────────────────────────────────"
					].join("\n");
					Log.error(portInUseMessage);
					return;
				}

				Log.error("Failed to start server:", err);
			});

			server.listen(port, config.address || "localhost");

			if (config.ipWhitelist instanceof Array && config.ipWhitelist.length === 0) {
				Log.warn("You're using a full whitelist configuration to allow for all IPs");
			}

			app.use(ipAccessControl(config.ipWhitelist));
			app.use(helmet(config.httpHeaders));
			app.use(express.json());
			app.use("/js", express.static(__dirname));
			app.use(withBasePath("RemoteApp"), express.static(path.resolve(`${global.root_path}/RemoteApp`)));

			if (config.hideConfigSecrets) {
				app.get("/config/config.env", (req, res) => {
					res.status(404).send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /config/config.env</pre>\n</body>\n</html>");
				});
			}

			let directories = ["/config", "/css", "/favicon.svg", "/defaultmodules", "/modules", "/node_modules/animate.css", "/node_modules/@fontsource", "/node_modules/@fortawesome", "/translations", "/tests/configs", "/tests/mocks"];
			for (const [key, value] of Object.entries(vendor)) {
				const dirArr = value.split("/");
				if (dirArr[0] === "node_modules") directories.push(`/${dirArr[0]}/${dirArr[1]}`);
			}
			const uniqDirs = [...new Set(directories)];
			for (const directory of uniqDirs) {
				app.use(directory, express.static(path.resolve(global.root_path + directory)));
			}

			const startUp = new Date();
			const getStartup = (req, res) => res.send(startUp);

			const getConfig = (req, res) => {
				try {
					const refreshed = Utils.loadConfig();
					const hideSecrets = refreshed && refreshed.fullConf ? refreshed.fullConf.hideConfigSecrets : false;
					if (hideSecrets) {
						res.send(refreshed.redactedConf);
					} else if (refreshed && refreshed.fullConf) {
						res.send(refreshed.fullConf);
					} else if (config.hideConfigSecrets) {
						res.send(configObj.redactedConf);
					} else {
						res.send(configObj.fullConf);
					}
				} catch (error) {
					Log.error("Error reloading config for /config:", error);
					if (config.hideConfigSecrets) {
						res.send(configObj.redactedConf);
					} else {
						res.send(configObj.fullConf);
					}
				}
			};
			app.get("/config", (req, res) => getConfig(req, res));

			app.post("/config", (req, res) => {
				Log.log("Updating config...");
				// read the config file
				fs.readFile(path.resolve(`${global.root_path}/config/config.js`), "utf8", (err, data) => {
					if (err) {
						Log.error("Error reading config file:", err);
						res.status(500).send("Error reading config file");
						return;
					}

					// replace the module config
					let newConfig = data;
					for (const [key, value] of Object.entries(req.body)) {
						const regex = new RegExp(`(module:\\s*['"]${key}['"],\\s*config:\\s*){([\\s\\S]*?)}`);
						newConfig = newConfig.replace(regex, `$1${JSON.stringify(value, null, 4)}`);
					}

					// write the new config file
					fs.writeFile(path.resolve(`${global.root_path}/config/config.js`), newConfig, "utf8", (err) => {
						if (err) {
							Log.error("Error writing config file:", err);
							res.status(500).send("Error writing config file");
							return;
						}

						Log.log("Config updated successfully");
						res.status(200).send("Config updated successfully");
					});
				});
			});

			app.get(withBasePath("remote/status"), (req, res) => {
				const clients = getSocketClientCount(io);
				res.status(200).json({ ok: true, clients, ts: Date.now() });
			});

			app.post(withBasePath("remote/source-health"), async (req, res) => {
				try {
					const payload = req && req.body ? req.body : {};
					const checkList = buildRemoteSourceCheckList(payload.newsUrls, payload.calendarUrls);
					if (checkList.length === 0) {
						res.status(200).json({ ok: true, results: [], ts: Date.now() });
						return;
					}

					const checks = await Promise.all(checkList.map(async ({ requestedUrl, fetchUrl }) => {
						const result = await checkRemoteSourceUrl(fetchUrl);
						return {
							url: requestedUrl,
							available: Boolean(result.available),
							status: Number.isInteger(result.status) ? result.status : null,
							method: result.method || null,
							error: typeof result.error === "string" ? result.error : null
						};
					}));

					res.status(200).json({
						ok: true,
						results: checks,
						ts: Date.now()
					});
				} catch (error) {
					Log.error("Error checking remote source health:", error);
					res.status(500).json({ ok: false, error: "Failed to check source health" });
				}
			});

			app.post(withBasePath("remote/command"), (req, res) => {
				const type = req && req.body ? req.body.type : null;
				if (type === "reload" || type === "apply_all") {
					const clients = getSocketClientCount(io);
					Log.info("Remote reload request received, notifying clients");
					io.emit("RELOAD");
					res.status(200).json({ ok: true, clients, reloaded: clients > 0 });
					return;
				}
				res.status(400).json({ ok: false, error: "Unsupported command" });
			});

			app.post(withBasePath("remote/config"), (req, res) => {
				const payload = req && req.body ? req.body : {};
				const updates = {};

				const weather = payload.weather || null;
				const lat = weather && typeof weather.lat !== "undefined" ? Number(weather.lat) : null;
				const lon = weather && typeof weather.lon !== "undefined" ? Number(weather.lon) : null;
				if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
					updates.weather = { lat, lon };
				}

				const calendar = payload.calendar || null;
				if (calendar && typeof calendar.url === "string") {
					const url = calendar.url.trim();
					if (url === "" || (/^https?:\/\//).test(url)) {
						updates.calendar = { url };
					}
				}
				const newsfeed = payload.newsfeed || null;
				if (newsfeed && Array.isArray(newsfeed.feeds)) {
					const feeds = newsfeed.feeds
						.map((feed) => {
							if (typeof feed === "string") {
								return { title: "", url: feed.trim() };
							}
							if (feed && typeof feed === "object") {
								const url = typeof feed.url === "string" ? feed.url.trim() : "";
								const titleValue = typeof feed.title !== "undefined"
									? feed.title
									: (typeof feed.name !== "undefined" ? feed.name : feed.label);
								const title = titleValue != null ? String(titleValue).trim() : "";
								return { title, url };
							}
							return null;
						})
						.filter((feed) => feed && feed.url && (/^https?:\/\//).test(feed.url));
					updates.newsfeed = { feeds };
				}
				const locale = payload.locale || null;
				if (locale && typeof locale.language === "string") {
					const lang = locale.language.trim();
					if (["ro", "en", "de", "hu", "ru", "it", "es", "fr"].includes(lang)) {
						updates.locale = Object.assign(updates.locale || {}, { language: lang });
					}
				}
				if (locale && typeof locale.timeFormat !== "undefined") {
					const tf = Number(locale.timeFormat);
					if (tf === 12 || tf === 24) {
						updates.locale = Object.assign(updates.locale || {}, { timeFormat: tf });
					}
				}
				const complimentsUpdate = normalizeComplimentsPayload(payload.compliments);
				if (complimentsUpdate) {
					updates.compliments = complimentsUpdate;
				}
				const assistantUpdate = normalizeAssistantPayload(payload.assistant);
				if (assistantUpdate) {
					updates.assistant = assistantUpdate;
				}
				if (Object.keys(updates).length === 0) {
					res.status(400).json({ ok: false, error: "No valid updates" });
					return;
				}
				const configFilePath = getConfigFilePath();
				fs.readFile(configFilePath, "utf8", (err, data) => {
					if (err) {
						Log.error("Error reading config file:", err);
						res.status(500).json({ ok: false, error: "Error reading config file" });
						return;
					}
					let newConfig = data;
					let changed = false;
					let weatherCount = 0;
					let calendarCount = 0;
					let newsfeedCount = 0;
					let complimentsCount = 0;
					let assistantCount = 0;
					let localeChanged = false;

					if (updates.locale && updates.locale.language) {
						const next = replaceTopLevelString(newConfig, "language", updates.locale.language);
						if (next !== newConfig) {
							newConfig = next;
							changed = true;
							localeChanged = true;
						}
					}
					if (updates.locale && updates.locale.timeFormat) {
						const next = replaceTopLevelNumber(newConfig, "timeFormat", updates.locale.timeFormat);
						if (next !== newConfig) {
							newConfig = next;
							changed = true;
							localeChanged = true;
						}
					}
					const ranges = getModulesArrayRanges(newConfig);
					for (let i = ranges.length - 1; i >= 0; i--) {
						const range = ranges[i];
						const block = newConfig.slice(range.start, range.end);
						const moduleName = getModuleName(block);
						let updatedBlock = block;

						if (moduleName === "weather" && updates.weather) {
							updatedBlock = replaceNumberField(updatedBlock, "lat", updates.weather.lat);
							updatedBlock = replaceNumberField(updatedBlock, "lon", updates.weather.lon);
							if (updatedBlock !== block) weatherCount += 1;
						}

						if (moduleName === "calendar" && updates.calendar) {
							updatedBlock = replaceCalendarUrl(updatedBlock, updates.calendar.url);
							if (updatedBlock !== block) calendarCount += 1;
						}

						if (moduleName === "newsfeed" && updates.newsfeed) {
							updatedBlock = replaceFeedsBlock(updatedBlock, updates.newsfeed.feeds);
							if (updatedBlock !== block) newsfeedCount += 1;
						}

						if (moduleName === "compliments" && updates.compliments) {
							if (updates.compliments.compliments) {
								updatedBlock = replaceComplimentsBlock(updatedBlock, updates.compliments.compliments);
							}
							if (Number.isFinite(updates.compliments.updateIntervalMs)) {
								updatedBlock = upsertComplimentsUpdateInterval(updatedBlock, updates.compliments.updateIntervalMs);
							}
							if (updatedBlock !== block) complimentsCount += 1;
						}

						if (moduleName === "MMM-AIVoiceAssistant" && updates.assistant) {
							updatedBlock = replaceAIAssistantBlock(updatedBlock, updates.assistant);
							if (updatedBlock !== block) assistantCount += 1;
						}
						if (updatedBlock !== block) {
							newConfig = newConfig.slice(0, range.start) + updatedBlock + newConfig.slice(range.end);
							changed = true;
						}
					}
					if (!changed) {
						const clients = getSocketClientCount(io);
						res.status(200).json({
							ok: true,
							updated: { weather: 0, calendar: 0, newsfeed: 0, compliments: 0, assistant: 0, locale: false },
							reloaded: false,
							clients
						});
						return;
					}
					fs.writeFile(configFilePath, newConfig, "utf8", (writeErr) => {
						if (writeErr) {
							Log.error("Error writing config file:", writeErr);
							res.status(500).json({ ok: false, error: "Error writing config file" });
							return;
						}
						Log.log("Remote config updated successfully");
						const clients = getSocketClientCount(io);
						Log.info("Remote config updated, notifying clients");
						io.emit("RELOAD");
						res.status(200).json({
							ok: true,
							updated: { weather: weatherCount, calendar: calendarCount, newsfeed: newsfeedCount, compliments: complimentsCount, assistant: assistantCount, locale: localeChanged },
							reloaded: clients > 0,
							clients
						});
					});
				});
			});
			app.get("/cors", async (req, res) => await cors(req, res));
			app.get("/version", (req, res) => getVersion(req, res));
			app.get("/startup", (req, res) => getStartup(req, res));
			app.get("/env", (req, res) => getEnvVars(req, res));
			app.get("/", (req, res) => getHtml(req, res));
			// Reload endpoint for watch mode - triggers browser reload
			app.get("/reload", (req, res) => {
				Log.info("Reload request received, notifying all clients");
				io.emit("RELOAD");
				res.status(200).send("OK");
			});
			server.on("listening", () => {
				resolve({
					app,
					io
				});
			});
		});
	};

	/**
	 * Closes the server and destroys all lingering connections to it.
	 * @returns {Promise} A promise that resolves when server has successfully shut down
	 */
	this.close = function () {
		return new Promise((resolve) => {
			for (const socket of serverSockets.values()) {
				socket.destroy();
			}
			server.close(resolve);
		});
	};
}

module.exports = Server;
