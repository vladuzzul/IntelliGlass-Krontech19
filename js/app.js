// Load lightweight internal alias resolver
require("./alias-resolver");

const fs = require("node:fs");
const path = require("node:path");
const { spawn: Spawn, spawnSync } = require("node:child_process");
const Log = require("logger");

// global absolute root path
global.root_path = path.resolve(`${__dirname}/../`);

// used to control fetch timeout for node_helpers
const { setGlobalDispatcher, Agent } = require("undici");

const Server = require("./server");
const Utils = require("./utils");

const { getEnvVarsAsObj } = require("#server_functions");
// common timeout value, provide environment override in case
const fetch_timeout = process.env.mmFetchTimeout !== undefined ? process.env.mmFetchTimeout : 30000;

// Get version number.
global.version = require(`${global.root_path}/package.json`).version;
global.mmTestMode = process.env.mmTestMode === "true";
Log.log(`Starting MagicMirror: v${global.version}`);

// Log system information.
Spawn("node ./js/systeminformation.js", { env: { ...process.env, ELECTRON_VERSION: `${process.versions.electron}` }, cwd: this.root_path, shell: true, detached: true, stdio: "inherit" });

const venvDir = path.join(global.root_path, ".venv");
const venvPython = process.platform === "win32"
	? path.join(venvDir, "Scripts", "python.exe")
	: path.join(venvDir, "bin", "python");
const defaultRequirementsFile = fs.existsSync(path.join(global.root_path, "requirements-finger.txt"))
	? "requirements-finger.txt"
	: "requirements.txt";
const requirementsFile = process.env.MM_FINGER_REQUIREMENTS || defaultRequirementsFile;
const requirementsPath = path.join(global.root_path, requirementsFile);
const useSystemSitePackages = process.env.MM_VENV_SYSTEM_SITE_PACKAGES === "1"
  || (process.platform === "linux" && process.env.MM_VENV_SYSTEM_SITE_PACKAGES !== "0");

/**
 *
 * @param command
 * @param args
 * @param label
 */
function runSyncOrExit (command, args, label) {
	const result = spawnSync(command, args, { cwd: global.root_path, stdio: "inherit" });
	if (result.error) {
		Log.error(`${label} failed:`, result.error);
		process.exit(1);
	}
	if (result.status !== 0) {
		Log.error(`${label} failed with exit code: ${result.status}`);
		process.exit(1);
	}
}

/**
 *
 * @param candidate
 */
function isPython3 (candidate) {
	const result = spawnSync(candidate, ["-c", "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)"], { stdio: "ignore" });
	return !result.error && result.status === 0;
}

/**
 *
 * @param candidate
 * @returns {{major: number, minor: number}|null}
 */
function getPythonVersion (candidate) {
	const result = spawnSync(candidate, ["-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"], { encoding: "utf8" });
	if (result.error || result.status !== 0) {
		return null;
	}

	const version = (result.stdout || "").trim();
	const [majorRaw, minorRaw] = version.split(".");
	const major = Number.parseInt(majorRaw, 10);
	const minor = Number.parseInt(minorRaw, 10);
	if (Number.isNaN(major) || Number.isNaN(minor)) {
		return null;
	}

	return { major, minor };
}

/**
 *
 */
function findBasePython () {
	const candidates = [];
	if (process.env.MM_FINGER_PYTHON) {
		candidates.push(process.env.MM_FINGER_PYTHON);
	}
	if (process.env.PYTHON) {
		candidates.push(process.env.PYTHON);
	}
	if (process.platform === "win32") {
		candidates.push("python");
	} else {
		candidates.push("python3.12", "python3.11", "python3.10", "python3", "python");
	}

	for (const candidate of candidates) {
		if (isPython3(candidate)) {
			return candidate;
		}
	}

	return null;
}

/**
 *
 */
function ensureVenv () {
	if (fs.existsSync(venvPython)) {
		const venvCfgPath = path.join(venvDir, "pyvenv.cfg");
		if (useSystemSitePackages && fs.existsSync(venvCfgPath)) {
			const venvCfg = fs.readFileSync(venvCfgPath, "utf8");
			const hasSystemSitePackages = (/include-system-site-packages\s*=\s*true/i).test(venvCfg);
			if (!hasSystemSitePackages) {
				Log.warn(
					"Existing .venv was created without system site-packages. "
					+ "Raspberry Pi camera packages from apt may be unavailable inside finger.py venv."
				);
				Log.warn(
					"Delete .venv and restart to recreate it with system site-packages, "
					+ "or set MM_VENV_SYSTEM_SITE_PACKAGES=0 to keep strict isolation."
				);
			}
		}
		return;
	}
	if (!fs.existsSync(requirementsPath)) {
		Log.error(`${requirementsFile} not found. Cannot create venv for finger.py.`);
		process.exit(1);
	}

	const basePython = findBasePython();
	if (!basePython) {
		Log.error("No system Python found to create a virtual environment.");
		process.exit(1);
	}
	const basePythonVersion = getPythonVersion(basePython);
	if (
		process.platform === "linux"
		&& process.arch === "arm64"
		&& basePythonVersion
		&& basePythonVersion.major === 3
		&& basePythonVersion.minor >= 13
	) {
		Log.error(
			"finger.py requires MediaPipe, and Linux ARM64 wheels are not available for Python 3.13+."
		);
		Log.error(
			`Detected ${basePython} (${basePythonVersion.major}.${basePythonVersion.minor}). `
			+ "Use Python 3.12/3.11 (for example via uv) and recreate .venv."
		);
		process.exit(1);
	}

	Log.log("Creating local Python venv for finger.py...");
	const venvArgs = ["-m", "venv"];
	if (useSystemSitePackages) {
		venvArgs.push("--system-site-packages");
	}
	venvArgs.push(venvDir);
	runSyncOrExit(basePython, venvArgs, "Virtualenv creation");

	Log.log(`Installing Python dependencies from ${requirementsFile}...`);
	runSyncOrExit(venvPython, ["-m", "pip", "install", "-r", requirementsPath], "Dependency install");
}

const disableFinger = process.env.MM_DISABLE_FINGER === "1";

if (!disableFinger) {
	ensureVenv();
}

if (!disableFinger) {
	const defaultTargetApp = process.platform === "darwin" ? "Electron" : "MagicMirror";
	const targetAppName = process.env.MM_TARGET_APP || defaultTargetApp;
	const fingerEnv = { ...process.env, MM_TARGET_APP: targetAppName };
	const fingerProc = Spawn(venvPython, ["finger.py"], {
		env: fingerEnv,
		cwd: global.root_path,
		stdio: "inherit"
	});

	fingerProc.on("error", (err) => {
		Log.error("Failed to start finger.py:", err);
		process.exit(1);
	});

	fingerProc.on("exit", (code, signal) => {
		if (signal) {
			Log.error(`finger.py exited due to signal: ${signal}`);
			process.exit(1);
		}
		if (code !== null && code !== 0) {
			Log.error(`finger.py exited with code: ${code}`);
			process.exit(1);
		}
	});
} else {
	Log.log("MM_DISABLE_FINGER=1 set, skipping finger.py startup.");
}

if (process.env.MM_CONFIG_FILE) {
	global.configuration_file = process.env.MM_CONFIG_FILE.replace(`${global.root_path}/`, "");
}

// FIXME: Hotfix Pull Request
// https://github.com/MagicMirrorOrg/MagicMirror/pull/673
if (process.env.MM_PORT) {
	global.mmPort = process.env.MM_PORT;
}

// The next part is here to prevent a major exception when there
// is no internet connection. This could probable be solved better.
process.on("uncaughtException", function (err) {
	// ignore strange exceptions under aarch64 coming from systeminformation:
	if (!err.stack.includes("node_modules/systeminformation")) {
		Log.error("Whoops! There was an uncaught exception...");
		Log.error(err);
		Log.error("MagicMirror² will not quit, but it might be a good idea to check why this happened. Maybe no internet connection?");
		Log.error("If you think this really is an issue, please open an issue on GitHub: https://github.com/MagicMirrorOrg/MagicMirror/issues");
	}
});

/**
 * The core app.
 * @class
 */
function App () {
	let nodeHelpers = [];
	let httpServer;
	let defaultModules;
	let env;

	/**
	 * Loads a specific module.
	 * @param {string} module The name of the module (including subpath).
	 */
	function loadModule (module) {
		const elements = module.split("/");
		const moduleName = elements[elements.length - 1];
		let moduleFolder = path.resolve(`${global.root_path}/${env.modulesDir}`, module);

		if (defaultModules.includes(moduleName)) {
			const defaultModuleFolder = path.resolve(`${global.root_path}/${global.defaultModulesDir}/`, module);
			if (!global.mmTestMode) {
				moduleFolder = defaultModuleFolder;
			} else {
				// running in test mode, allow defaultModules placed under moduleDir for testing
				if (env.modulesDir === "modules" || env.modulesDir === "tests/mocks") {
					moduleFolder = defaultModuleFolder;
				}
			}
		}

		const moduleFile = `${moduleFolder}/${moduleName}.js`;

		try {
			fs.accessSync(moduleFile, fs.constants.R_OK);
		} catch (e) {
			Log.warn(`No ${moduleFile} found for module: ${moduleName}.`);
		}

		const helperPath = `${moduleFolder}/node_helper.js`;

		let loadHelper = true;
		try {
			fs.accessSync(helperPath, fs.constants.R_OK);
		} catch (e) {
			loadHelper = false;
			Log.log(`No helper found for module: ${moduleName}.`);
		}

		// if the helper was found
		if (loadHelper) {
			let Module;
			try {
				Module = require(helperPath);
			} catch (e) {
				Log.error(`Error when loading ${moduleName}:`, e.message);
				return;
			}
			let m = new Module();

			if (m.requiresVersion) {
				Log.log(`Check MagicMirror² version for node helper '${moduleName}' - Minimum version: ${m.requiresVersion} - Current version: ${global.version}`);
				if (cmpVersions(global.version, m.requiresVersion) >= 0) {
					Log.log("Version is ok!");
				} else {
					Log.warn(`Version is incorrect. Skip module: '${moduleName}'`);
					return;
				}
			}

			m.setName(moduleName);
			m.setPath(path.resolve(moduleFolder));
			nodeHelpers.push(m);

			m.loaded();
		}
	}

	/**
	 * Loads all modules.
	 * @param {Module[]} modules All modules to be loaded
	 * @returns {Promise} A promise that is resolved when all modules been loaded
	 */
	async function loadModules (modules) {
		Log.log("Loading module helpers ...");

		for (let module of modules) {
			await loadModule(module);
		}

		Log.log("All module helpers loaded.");
	}

	/**
	 * Compare two semantic version numbers and return the difference.
	 * @param {string} a Version number a.
	 * @param {string} b Version number b.
	 * @returns {number} A positive number if a is larger than b, a negative
	 * number if a is smaller and 0 if they are the same
	 */
	function cmpVersions (a, b) {
		let i, diff;
		const regExStrip0 = /(\.0+)+$/;
		const segmentsA = a.replace(regExStrip0, "").split(".");
		const segmentsB = b.replace(regExStrip0, "").split(".");
		const l = Math.min(segmentsA.length, segmentsB.length);

		for (i = 0; i < l; i++) {
			diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10);
			if (diff) {
				return diff;
			}
		}
		return segmentsA.length - segmentsB.length;
	}

	/**
	 * Start the core app.
	 *
	 * It loads the config, then it loads all modules.
	 * @async
	 * @returns {Promise<object>} the config used
	 */
	this.start = async function () {
		const configObj = Utils.loadConfig();
		config = configObj.fullConf;
		Utils.checkConfigFile(configObj);

		global.defaultModulesDir = config.defaultModulesDir;
		defaultModules = require(`${global.root_path}/${global.defaultModulesDir}/defaultmodules`);

		Log.setLogLevel(config.logLevel);

		env = getEnvVarsAsObj();
		// check for deprecated css/custom.css and move it to new location
		if ((!fs.existsSync(`${global.root_path}/${env.customCss}`)) && (fs.existsSync(`${global.root_path}/css/custom.css`))) {
			try {
				fs.renameSync(`${global.root_path}/css/custom.css`, `${global.root_path}/${env.customCss}`);
				Log.warn(`WARNING! Your custom css file was moved from ${global.root_path}/css/custom.css to ${global.root_path}/${env.customCss}`);
			} catch (err) {
				Log.warn("WARNING! Your custom css file is currently located in the css folder. Please move it to the config folder!");
			}
		}

		// get the used module positions
		Utils.getModulePositions();

		let modules = [];
		for (const module of config.modules) {
			if (module.disabled) continue;
			if (module.module) {
				if (Utils.moduleHasValidPosition(module.position) || typeof (module.position) === "undefined") {
					// Only add this module to be loaded if it is not a duplicate (repeated instance of the same module)
					if (!modules.includes(module.module)) {
						modules.push(module.module);
					}
				} else {
					Log.warn("Invalid module position found for this configuration:" + `\n${JSON.stringify(module, null, 2)}`);
				}
			} else {
				Log.warn("No module name found for this configuration:" + `\n${JSON.stringify(module, null, 2)}`);
			}
		}

		setGlobalDispatcher(new Agent({ connect: { timeout: fetch_timeout } }));

		await loadModules(modules);

		httpServer = new Server(configObj);
		const { app, io } = await httpServer.open();
		Log.log("Server started ...");

		const nodePromises = [];
		for (let nodeHelper of nodeHelpers) {
			nodeHelper.setExpressApp(app);
			nodeHelper.setSocketIO(io);

			try {
				nodePromises.push(nodeHelper.start());
			} catch (error) {
				Log.error(`Error when starting node_helper for module ${nodeHelper.name}:`);
				Log.error(error);
			}
		}

		const results = await Promise.allSettled(nodePromises);

		// Log errors that happened during async node_helper startup
		results.forEach((result) => {
			if (result.status === "rejected") {
				Log.error(result.reason);
			}
		});

		Log.log("Sockets connected & modules started ...");

		return config;
	};

	/**
	 * Stops the core app. This calls each node_helper's STOP() function, if it
	 * exists.
	 *
	 * Added to fix #1056
	 * @returns {Promise} A promise that is resolved when all node_helpers and
	 * the http server has been closed
	 */
	this.stop = async function () {
		const nodePromises = [];
		for (let nodeHelper of nodeHelpers) {
			try {
				if (typeof nodeHelper.stop === "function") {
					nodePromises.push(nodeHelper.stop());
				}
			} catch (error) {
				Log.error(`Error when stopping node_helper for module ${nodeHelper.name}:`);
				Log.error(error);
			}
		}

		const results = await Promise.allSettled(nodePromises);

		// Log errors that happened during async node_helper stopping
		results.forEach((result) => {
			if (result.status === "rejected") {
				Log.error(result.reason);
			}
		});

		Log.log("Node_helpers stopped ...");

		// To be able to stop the app even if it hasn't been started (when
		// running with Electron against another server)
		if (!httpServer) {
			return Promise.resolve();
		}

		return httpServer.close();
	};

	/**
	 * Listen for SIGINT signal and call stop() function.
	 *
	 * Added to fix #1056
	 * Note: this is only used if running `server-only`. Otherwise
	 * this.stop() is called by app.on("before-quit"... in `electron.js`
	 */
	process.on("SIGINT", async () => {
		Log.log("[SIGINT] Received. Shutting down server...");
		setTimeout(() => {
			process.exit(0);
		}, 3000); // Force quit after 3 seconds
		await this.stop();
		process.exit(0);
	});

	/**
	 * Listen to SIGTERM signals so we can stop everything when we
	 * are asked to stop by the OS.
	 */
	process.on("SIGTERM", async () => {
		Log.log("[SIGTERM] Received. Shutting down server...");
		setTimeout(() => {
			process.exit(0);
		}, 3000); // Force quit after 3 seconds
		await this.stop();
		process.exit(0);
	});
}

module.exports = new App();
