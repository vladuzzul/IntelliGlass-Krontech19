(function () {
	const root = document.getElementById("spotify-player");
	if (!root) return;

	const artworkEl = document.getElementById("spotify-artwork");
	const titleEl = document.getElementById("spotify-title");
	const artistEl = document.getElementById("spotify-artist");
	const statusEl = document.getElementById("spotify-status");
	const audioEl = document.getElementById("spotify-audio");

	const STORAGE_KEY = "intelliglass-spotify-auth";
	const POLL_MS = 7000;

	let pollTimer = null;
	let lastTrackId = "";
	let lastPreviewUrl = "";

	function setText (el, text) {
		if (el) el.textContent = typeof text === "string" ? text : String(text || "");
	}

	function setArtwork (url) {
		if (!artworkEl) return;
		if (!url) {
			artworkEl.removeAttribute("src");
			artworkEl.classList.add("is-empty");
			return;
		}
		if (artworkEl.src !== url) {
			artworkEl.src = url;
		}
		artworkEl.classList.remove("is-empty");
	}

	function updateAudio (previewUrl, isPlaying) {
		if (!audioEl) return;
		if (!previewUrl) {
			if (!audioEl.paused) audioEl.pause();
			audioEl.removeAttribute("src");
			lastPreviewUrl = "";
			return;
		}
		if (previewUrl !== lastPreviewUrl) {
			audioEl.src = previewUrl;
			lastPreviewUrl = previewUrl;
		}
		audioEl.volume = 0.9;
		if (isPlaying) {
			audioEl.play().catch(function () { return null; });
		} else if (!audioEl.paused) {
			audioEl.pause();
		}
	}

	function renderEmpty (title, status) {
		setText(titleEl, title || "Nothing playing");
		setText(artistEl, "");
		setText(statusEl, status || "Idle");
		setArtwork("");
		updateAudio("", false);
	}

	function renderTrack (track) {
		if (!track) {
			renderEmpty("Nothing playing", "Idle");
			return;
		}
		setText(titleEl, track.title || "Unknown track");
		setText(artistEl, track.artist || "");
		setText(statusEl, track.status || (track.isPlaying ? "Playing" : "Paused"));
		setArtwork(track.artworkUrl || "");
		updateAudio(track.previewUrl || "", track.isPlaying);
	}

	function normalizeNowPlaying (data) {
		if (!data || typeof data !== "object") return null;
		if (data.item) {
			const item = data.item;
			const title = item && typeof item.name === "string" ? item.name : "";
			const artist = item && Array.isArray(item.artists)
				? item.artists.map((a) => (a && a.name ? a.name : "")).filter(Boolean).join(", ")
				: "";
			const images = item && item.album && Array.isArray(item.album.images) ? item.album.images : [];
			const artworkUrl = images[0] && images[0].url ? images[0].url : "";
			const previewUrl = item && typeof item.preview_url === "string" ? item.preview_url : "";
			return {
				id: item && typeof item.id === "string" ? item.id : "",
				title,
				artist,
				artworkUrl,
				previewUrl,
				isPlaying: Boolean(data.is_playing),
				status: data.is_playing ? "Playing" : "Paused"
			};
		}

		if (typeof data.title === "string" || typeof data.artist === "string") {
			return {
				id: typeof data.id === "string" ? data.id : "",
				title: typeof data.title === "string" ? data.title : "",
				artist: typeof data.artist === "string" ? data.artist : "",
				artworkUrl: typeof data.artworkUrl === "string" ? data.artworkUrl : "",
				previewUrl: typeof data.previewUrl === "string" ? data.previewUrl : "",
				isPlaying: Boolean(data.isPlaying),
				status: typeof data.status === "string" ? data.status : (data.isPlaying ? "Playing" : "Paused")
			};
		}

		return null;
	}

	function readAuth () {
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed.accessToken !== "string") return null;
			return {
				accessToken: parsed.accessToken,
				expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null
			};
		} catch (e) {
			return null;
		}
	}

	async function fetchNowPlayingFromEndpoint (endpoint) {
		try {
			const res = await fetch(endpoint, { cache: "no-store" });
			if (!res.ok) {
				renderEmpty("Spotify unavailable", `Error ${res.status}`);
				return;
			}
			const data = await res.json();
			const track = normalizeNowPlaying(data);
			if (!track) {
				renderEmpty("Nothing playing", "Idle");
				return;
			}
			renderTrack(track);
		} catch (e) {
			renderEmpty("Spotify unavailable", "Offline");
		}
	}

	async function fetchNowPlayingFromSpotify (auth) {
		if (!auth || !auth.accessToken) {
			renderEmpty("Spotify not connected", "Not connected");
			return;
		}
		if (auth.expiresAt && Date.now() > auth.expiresAt) {
			renderEmpty("Token expired", "Token expired");
			return;
		}
		try {
			const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=track", {
				headers: { Authorization: `Bearer ${auth.accessToken}` },
				cache: "no-store"
			});
			if (res.status === 204) {
				renderEmpty("Nothing playing", "Idle");
				return;
			}
			if (res.status === 401) {
				renderEmpty("Unauthorized", "Unauthorized");
				return;
			}
			if (!res.ok) {
				renderEmpty("Spotify error", `Error ${res.status}`);
				return;
			}
			const data = await res.json();
			const track = normalizeNowPlaying(data);
			if (!track) {
				renderEmpty("Nothing playing", "Idle");
				return;
			}
			if (track.id && track.id === lastTrackId) {
				setText(statusEl, track.isPlaying ? "Playing" : "Paused");
				updateAudio(track.previewUrl || "", track.isPlaying);
				return;
			}
			lastTrackId = track.id || "";
			renderTrack(track);
		} catch (e) {
			renderEmpty("Spotify unavailable", "Offline");
		}
	}

	function refreshNowPlaying () {
		const endpoint = typeof window.spotifyNowPlayingEndpoint === "string"
			? window.spotifyNowPlayingEndpoint.trim()
			: "";
		if (endpoint) {
			fetchNowPlayingFromEndpoint(endpoint);
			return;
		}
		const auth = readAuth();
		fetchNowPlayingFromSpotify(auth);
	}

	function startPolling () {
		refreshNowPlaying();
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = setInterval(refreshNowPlaying, POLL_MS);
	}

	window.setSpotifyNowPlaying = function (payload) {
		const track = normalizeNowPlaying(payload);
		if (!track) return;
		lastTrackId = track.id || "";
		renderTrack(track);
	};

	window.spotifyPlayer = {
		refresh: refreshNowPlaying
	};

	startPolling();
})();
