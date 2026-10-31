// research-harness Pages site: theme toggle, chapter rail, contents scroll-spy, copy buttons.
// The first-paint theme is set by the inline snippet in each page's <head>.

(() => {
	const root = document.documentElement;
	const KEY = "rh-theme";

	// Theme toggle (sun/moon), same affordance as the research web header.
	const toggle = document.querySelector(".theme-toggle");
	const syncToggle = () => {
		if (!toggle) return;
		const dark = root.dataset.theme === "dark";
		toggle.setAttribute("aria-pressed", String(dark));
		toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
	};
	syncToggle();
	toggle?.addEventListener("click", () => {
		root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
		try {
			localStorage.setItem(KEY, root.dataset.theme);
		} catch {}
		syncToggle();
	});
	matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
		let stored = null;
		try {
			stored = localStorage.getItem(KEY);
		} catch {}
		if (stored) return;
		root.dataset.theme = e.matches ? "dark" : "light";
		syncToggle();
	});

	// Chapter rail: click seeks; playback marks the current chapter and fills its bar.
	const video = document.getElementById("demo");
	const chapters = [...document.querySelectorAll(".chapter")];
	if (video && chapters.length) {
		const starts = chapters.map((c) => Number(c.dataset.t));
		const scroller = document.querySelector(".rail-scroll");
		let current = -1;
		const indexAt = (t) => {
			let i = 0;
			while (i + 1 < starts.length && starts[i + 1] <= t + 0.05) i++;
			return i;
		};
		const mark = () => {
			const t = video.currentTime;
			const i = indexAt(t);
			const end = starts[i + 1] ?? (Number.isFinite(video.duration) ? video.duration : starts[i] + 30);
			const p = Math.min(1, Math.max(0, (t - starts[i]) / Math.max(0.1, end - starts[i])));
			if (i !== current) {
				chapters[current]?.removeAttribute("aria-current");
				chapters[i].setAttribute("aria-current", "true");
				current = i;
				// Keep the active chapter visible inside the rail without moving the page.
				if (scroller && scroller.scrollHeight > scroller.clientHeight) {
					const row = chapters[i];
					const top = row.offsetTop - scroller.clientHeight / 2 + row.offsetHeight / 2;
					scroller.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
				}
			}
			chapters[i].style.setProperty("--p", p.toFixed(3));
		};
		for (const c of chapters) {
			c.addEventListener("click", () => {
				video.currentTime = Number(c.dataset.t);
				video.play().catch(() => {});
			});
		}
		video.addEventListener("timeupdate", mark);
		video.addEventListener("seeked", mark);
		video.addEventListener("loadedmetadata", mark);
		mark();
	}

	// Contents scroll-spy on doc pages.
	const tocLinks = [...document.querySelectorAll(".toc nav a[href^='#']")];
	if (tocLinks.length) {
		const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
		const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
		let active = null;
		const update = () => {
			const line = window.scrollY + 120;
			let pick = heads[0];
			for (const h of heads) {
				if (h.offsetTop <= line) pick = h;
				else break;
			}
			const link = byId.get(pick.id);
			if (link === active) return;
			active?.removeAttribute("aria-current");
			link.setAttribute("aria-current", "true");
			active = link;
		};
		addEventListener("scroll", update, { passive: true });
		update();
		// On narrow screens the contents is a disclosure; close it after a jump.
		const details = document.querySelector("details.toc");
		if (details && matchMedia("(max-width: 1039px)").matches) details.open = false;
		for (const a of tocLinks) {
			a.addEventListener("click", () => {
				if (details && matchMedia("(max-width: 1039px)").matches) details.open = false;
			});
		}
	}

	// Copy buttons on code blocks.
	for (const btn of document.querySelectorAll(".code .copy")) {
		btn.addEventListener("click", async () => {
			const text = btn.parentElement.querySelector("pre").innerText.replace(/\n$/, "");
			try {
				await navigator.clipboard.writeText(text);
				btn.dataset.done = "";
				btn.setAttribute("aria-label", "Copied");
				setTimeout(() => {
					delete btn.dataset.done;
					btn.setAttribute("aria-label", "Copy code");
				}, 1600);
			} catch {
				btn.setAttribute("aria-label", "Copy failed - select the text instead");
			}
		});
	}
})();
