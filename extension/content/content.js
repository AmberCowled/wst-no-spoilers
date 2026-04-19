'use strict';

const INLINE_MASK_CLASS = "wst-ns-mask-inline";
// STORAGE_KEY is provided by constants.js (loaded before this script)
const STORAGE_KEY = WST_NS_STORAGE_KEY;

let observer = null;

/** Runs of ASCII digits inside text nodes */
const DIGITS_PATTERN = /\d+/g;

/** Do not blur digits that refer to a round label (e.g. "Winner of Match 2"). */
const DIGITS_AFTER_MATCH_LABEL = /\bMatch\s+$/i;

/** Score pattern in document titles (e.g. "3 - 5" or "3:5") */
const TITLE_SCORE_PATTERN = /\d+\s*[-:]\s*\d+/g;

/** Status words that reveal match outcomes */
const STATUS_BADGE_PATTERN =
	/\b(Completed|Conceded|W\/O|Walkover|Retired)\b/i;

/** Saved original document title for restore */
let savedDocumentTitle = null;

/**
 * MASK RULES CONFIG
 *
 * These selectors target Tailwind CSS utility classes on wst.tv and will break
 * if the site changes its markup. When masking stops working, update the
 * selectors below and bump the "verified" date.
 *
 * Last full verification: 2026-04-19
 */
const MASK_RULES = [
	{
		name: "matchScore",
		selector: "p.w-6.text-center.text-clear.font-primary",
		mode: "full", // verified 2026-04-19
	},

	{
		name: "drawScore",
		// NOTE: uses Tailwind arbitrary value text-[14px] — extra fragile
		selector: `.${CSS.escape("text-clear")}.${CSS.escape("text-[14px]")}`,
		mode: "digits", // verified 2026-04-19
	},

	{
		name: "landingScore",
		selector: "p.ml-auto.font-bold",
		mode: "digits", // verified 2026-04-19
		exactClass: "ml-auto font-bold",
	},

	{
		name: "matchCenterScore",
		selector: "p.text-xs.font-bold.text-white.font-secondary",
		mode: "digits", // verified 2026-04-19
	},

	{
		name: "matchCenterScoreXS",
		selector: "p.text-xs.font-bold.font-primary",
		mode: "digits", // verified 2026-04-19
	},

	{
		name: "framesDataSection",
		attribute: "currentframe",
		fallbackSelector: "[data-frame], [class*='frame']",
		mode: "full", // verified 2026-04-19
	},

	{
		name: "matchDataSectionLeft",
		selector:
			"p.flex.items-center.justify-start.col-span-1.font-bold.text-clear.font-xl",
		mode: "charMask", // verified 2026-04-19
	},

	{
		name: "matchDataSectionRight",
		selector:
			"p.flex.items-center.justify-end.col-span-1.font-bold.text-clear.font-xl",
		mode: "charMask", // verified 2026-04-19
	},

	// #10 — Breadcrumb scores
	{
		name: "breadcrumbScore",
		selector: "nav[aria-label='breadcrumb']",
		mode: "digits",
	},

	// #6 — Winner/loser visual indicators (placeholder — update selector from live site)
	{
		name: "winnerIndicator",
		selector: "[class*='winner'], [class*='loser'], [data-winner]",
		mode: "equalize",
	},

	// #8 — Century breaks (placeholder — update selector from live site)
	{
		name: "centuryBreaks",
		selector: "[class*='century'], [class*='break']",
		mode: "digits",
	},

	// #9 — Session scores (placeholder — update selector from live site)
	{
		name: "sessionScores",
		selector: "[class*='session-score'], [class*='session'] .score",
		mode: "digits",
	},

	// N1/N2/N3 — Blur entire news card (headline, snippet, image in one go)
	{
		name: "newsCard",
		selector: ".article-card",
		mode: "full",
	},
];

/**
 * HELPERS
 */

/** N6 — Selectors for news containers where click-to-reveal is allowed */
const NEWS_CONTAINERS =
	".article-card, .news-hero, .article-body, .article-content, [class*='article']";

function isNewsElement(el) {
	if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
	return el.closest(NEWS_CONTAINERS) !== null;
}

function applyMaskToNode(el) {
	if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
	if (el.classList.contains("wst-ns-mask")) return;
	// N6 — Skip elements the user has already revealed
	if (el.hasAttribute("data-wst-revealed")) return;
	el.classList.add("wst-ns-mask");
}

function hasAllClasses(el, classList) {
	return classList.every((c) => el.classList.contains(c));
}

/**
 * DIGIT MASKING
 */

function wrapDigitsInElement(container) {
	if (!container?.querySelectorAll) return;

	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode(textNode) {
			const { nodeValue } = textNode;
			if (!nodeValue || !/\d/.test(nodeValue)) {
				return NodeFilter.FILTER_REJECT;
			}

			let el = textNode.parentElement;
			while (el) {
				if (el.classList?.contains(INLINE_MASK_CLASS)) {
					return NodeFilter.FILTER_REJECT;
				}
				el = el.parentElement;
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	const nodes = [];
	let tn = walker.nextNode();
	while (tn) {
		nodes.push(tn);
		tn = walker.nextNode();
	}

	for (const textNode of nodes) {
		wrapDigitsInTextNode(textNode);
	}
}

function wrapDigitsInTextNode(textNode) {
	const text = textNode.nodeValue;
	if (!text) return;

	let lastIndex = 0;
	const frag = document.createDocumentFragment();
	let wrappedAny = false;

	DIGITS_PATTERN.lastIndex = 0;
	let m = DIGITS_PATTERN.exec(text);

	while (m !== null) {
		const start = m.index;
		const digitText = m[0];
		const skipForMatchLabel = DIGITS_AFTER_MATCH_LABEL.test(
			text.slice(0, start),
		);

		if (start > lastIndex) {
			frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
		}

		if (skipForMatchLabel) {
			frag.appendChild(document.createTextNode(digitText));
		} else {
			wrappedAny = true;
			const span = document.createElement("span");
			span.className = INLINE_MASK_CLASS;
			span.textContent = digitText;
			frag.appendChild(span);
		}

		lastIndex = DIGITS_PATTERN.lastIndex;
		m = DIGITS_PATTERN.exec(text);
	}

	if (!wrappedAny) return;

	if (lastIndex < text.length) {
		frag.appendChild(document.createTextNode(text.slice(lastIndex)));
	}

	textNode.parentNode?.replaceChild(frag, textNode);
}

/**
 * CHAR MASKING
 */

const SPOILER_CHAR_PATTERN = /[0-9,%.s-]/;

function maskCharsLikeDigits(container) {
	if (!container?.querySelectorAll) return;

	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			return node.nodeValue && SPOILER_CHAR_PATTERN.test(node.nodeValue)
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_REJECT;
		},
	});

	let node;
	while ((node = walker.nextNode())) {
		maskCharsInTextNode(node);
	}
}

function maskCharsInTextNode(textNode) {
	const text = textNode.nodeValue;
	if (!text) return;

	let lastIndex = 0;
	const frag = document.createDocumentFragment();
	let changed = false;

	let runStart = -1;
	for (let i = 0; i <= text.length; i++) {
		const isSpoiler = i < text.length && SPOILER_CHAR_PATTERN.test(text[i]);

		if (isSpoiler && runStart === -1) {
			runStart = i;
		} else if (!isSpoiler && runStart !== -1) {
			if (runStart > lastIndex) {
				frag.appendChild(
					document.createTextNode(text.slice(lastIndex, runStart)),
				);
			}

			const span = document.createElement("span");
			span.className = INLINE_MASK_CLASS;
			span.textContent = text.slice(runStart, i);
			frag.appendChild(span);

			lastIndex = i;
			runStart = -1;
			changed = true;
		}
	}

	if (!changed) return;

	if (lastIndex < text.length) {
		frag.appendChild(document.createTextNode(text.slice(lastIndex)));
	}

	textNode.parentNode?.replaceChild(frag, textNode);
}

/**
 * CORE ENGINE
 */

function processElementWithRule(el, rule) {
	if (rule.exactClass && el.className?.trim() !== rule.exactClass) return;
	if (rule.classMatch && !hasAllClasses(el, rule.classMatch)) return;
	if (rule.condition && !rule.condition(el)) return;

	if (rule.mode === "full") {
		applyMaskToNode(el);
	} else if (rule.mode === "digits") {
		wrapDigitsInElement(el);
	} else if (rule.mode === "charMask") {
		maskCharsLikeDigits(el);
	} else if (rule.mode === "equalize") {
		if (el && el.nodeType === Node.ELEMENT_NODE) {
			el.classList.add("wst-ns-equalize");
		}
	}
}

function scanAttributes(rule) {
	let elements = document.querySelectorAll(`[${rule.attribute}]`);
	if (elements.length === 0 && rule.fallbackSelector) {
		try {
			elements = document.querySelectorAll(rule.fallbackSelector);
		} catch {
			// invalid fallback selector — skip
		}
	}
	elements.forEach((el) => processElementWithRule(el, rule));
	return elements.length;
}

/**
 * Scans root and its descendants for MASK_RULES matches.
 * Returns the total number of matched elements.
 */
function scanWithRules(root) {
	let totalMatched = 0;

	for (const rule of MASK_RULES) {
		let elements = [];

		try {
			if (rule.selector) {
				elements = Array.from(root.querySelectorAll(rule.selector));
				// #1 — Also check the root element itself
				if (
					root.nodeType === Node.ELEMENT_NODE &&
					root.matches(rule.selector)
				) {
					elements.push(root);
				}
			} else if (rule.attribute) {
				elements = Array.from(
					root.querySelectorAll(`[${rule.attribute}]`),
				);
				// #1 — Check root for attribute match too
				if (
					root.nodeType === Node.ELEMENT_NODE &&
					root.hasAttribute(rule.attribute)
				) {
					elements.push(root);
				}
			}

			// #5 — Try fallback selector when primary matches zero
			if (elements.length === 0 && rule.fallbackSelector) {
				elements = Array.from(
					root.querySelectorAll(rule.fallbackSelector),
				);
				if (
					root.nodeType === Node.ELEMENT_NODE &&
					root.matches(rule.fallbackSelector)
				) {
					elements.push(root);
				}
			}
		} catch {
			continue;
		}

		for (const el of elements) {
			processElementWithRule(el, rule);
		}
		totalMatched += elements.length;
	}

	// #7 — Mask status badges within the scanned subtree
	totalMatched += maskStatusBadges(root);

	return totalMatched;
}

/**
 * #7 — STATUS BADGE MASKING
 * Uses a TreeWalker to find elements with status words that reveal outcomes.
 * Only masks elements with short text (≤30 chars) to skip prose paragraphs.
 */
function maskStatusBadges(root) {
	if (!root || root.nodeType !== Node.ELEMENT_NODE) return 0;

	let masked = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			return node.nodeValue && STATUS_BADGE_PATTERN.test(node.nodeValue)
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_REJECT;
		},
	});

	let node;
	while ((node = walker.nextNode())) {
		const el = node.parentElement;
		if (!el) continue;
		const text = el.textContent || "";
		if (text.length > 30) continue;
		if (el.classList.contains("wst-ns-mask")) continue;
		el.classList.add("wst-ns-mask");
		masked++;
	}
	return masked;
}

/**
 * DOCUMENT TITLE MASKING
 * N5 — On /news/ pages, replaces the headline portion with "Article".
 * #10 — On other pages, replaces numeric score patterns with "? - ?".
 */
function maskDocumentTitle() {
	const title = document.title;
	if (!title) return;
	if (savedDocumentTitle !== null) return;

	// N5 — News page: mask the entire headline before the site suffix
	if (/^\/news\b/.test(location.pathname)) {
		const suffixIndex = title.lastIndexOf(" - ");
		if (suffixIndex > 0) {
			savedDocumentTitle = title;
			document.title = "Article" + title.slice(suffixIndex);
			return;
		}
	}

	// #10 — All pages: mask numeric score patterns
	if (TITLE_SCORE_PATTERN.test(title)) {
		savedDocumentTitle = title;
		TITLE_SCORE_PATTERN.lastIndex = 0;
		document.title = title.replace(TITLE_SCORE_PATTERN, "? - ?");
	}
}

function restoreDocumentTitle() {
	if (savedDocumentTitle !== null) {
		document.title = savedDocumentTitle;
		savedDocumentTitle = null;
	}
}

/**
 * N4 — ARTICLE BODY MASKING
 * On /news/ pages, blurs the article body and injects a reveal button.
 */
const ARTICLE_BODY_SELECTOR =
	".article-body, .article-content, [class*='article'] > .prose";

function maskArticleBody() {
	if (!/^\/news\b/.test(location.pathname)) return;

	const bodies = document.querySelectorAll(ARTICLE_BODY_SELECTOR);
	for (const body of bodies) {
		if (body.hasAttribute("data-wst-news-masked")) continue;
		if (body.hasAttribute("data-wst-revealed")) continue;

		body.setAttribute("data-wst-news-masked", "true");
		body.classList.add("wst-ns-mask");

		// Inject reveal button before the body
		const btn = document.createElement("button");
		btn.className = "wst-ns-reveal-btn";
		btn.textContent = "Show article (may contain spoilers)";
		btn.addEventListener("click", () => {
			body.classList.remove("wst-ns-mask");
			body.setAttribute("data-wst-revealed", "true");
			btn.remove();
		});
		body.parentNode?.insertBefore(btn, body);
	}
}

/**
 * N6 — CLICK-TO-REVEAL HANDLER
 * Delegated click listener for news-masked elements.
 * Scores keep pointer-events:none and are not affected.
 */
let revealHandlerAttached = false;

function handleRevealClick(e) {
	const masked = e.target.closest(".wst-ns-mask");
	if (!masked) return;
	if (!isNewsElement(masked)) return;

	// Prevent navigation — let the user read first, click again to navigate
	e.preventDefault();
	e.stopPropagation();

	masked.classList.remove("wst-ns-mask");
	masked.setAttribute("data-wst-revealed", "true");
}

function attachRevealHandler() {
	if (revealHandlerAttached) return;
	document.body?.addEventListener("click", handleRevealClick, true);
	revealHandlerAttached = true;
}

function detachRevealHandler() {
	document.body?.removeEventListener("click", handleRevealClick, true);
	revealHandlerAttached = false;
}

/**
 * #12 — HEURISTIC FALLBACK SCANNER
 * Finds small elements with score-like text inside match-related containers.
 * Only called when primary rules find nothing.
 */
function heuristicScoreScan(root) {
	if (!root || root.nodeType !== Node.ELEMENT_NODE) return 0;

	const SCORE_TEXT = /^\d+(\s*[-:]\s*\d+)?$/;
	const MATCH_CONTEXT = /match|score|result/i;

	let matched = 0;
	const candidates = root.querySelectorAll("p, span, td, div");

	for (const el of candidates) {
		const text = (el.textContent || "").trim();
		if (text.length > 10) continue;
		if (!SCORE_TEXT.test(text)) continue;

		// Check for match-related context in parent classes
		let parent = el.parentElement;
		let hasContext = false;
		while (parent && parent !== root) {
			if (MATCH_CONTEXT.test(parent.className || "")) {
				hasContext = true;
				break;
			}
			parent = parent.parentElement;
		}
		if (!hasContext) continue;

		wrapDigitsInElement(el);
		matched++;
	}
	return matched;
}

/**
 * #13 — DIAGNOSTIC LOGGING
 * Checks each rule's match count and warns when selectors find nothing.
 */
function logDiagnostics() {
	let totalAll = 0;

	for (const rule of MASK_RULES) {
		let count = 0;
		try {
			if (rule.selector) {
				count = document.querySelectorAll(rule.selector).length;
			} else if (rule.attribute) {
				count = document.querySelectorAll(
					`[${rule.attribute}]`,
				).length;
			}
		} catch {
			// invalid selector — count stays 0
		}

		if (count === 0) {
			console.warn(
				`[WST No-Spoilers] Rule "${rule.name}" matched 0 elements`,
			);
		}
		totalAll += count;
	}

	if (totalAll === 0) {
		console.warn(
			"[WST No-Spoilers] No elements matched any rule — selectors may be outdated",
		);
	}
}

/**
 * CLEANUP
 */

function clearInlineMasks() {
	const parents = new Set();
	document.querySelectorAll(`.${INLINE_MASK_CLASS}`).forEach((span) => {
		const parent = span.parentNode;
		if (!parent) return;
		parents.add(parent);
		parent.replaceChild(document.createTextNode(span.textContent ?? ""), span);
	});
	for (const parent of parents) {
		parent.normalize();
	}
}

function clearMasks() {
	document.querySelectorAll(".wst-ns-mask").forEach((el) => {
		el.classList.remove("wst-ns-mask");
	});
	// #6 — Remove equalize class
	document.querySelectorAll(".wst-ns-equalize").forEach((el) => {
		el.classList.remove("wst-ns-equalize");
	});
	clearInlineMasks();
	// #10 — Restore original document title
	restoreDocumentTitle();
	// N6 — Clear all revealed state
	document.querySelectorAll("[data-wst-revealed]").forEach((el) => {
		el.removeAttribute("data-wst-revealed");
	});
	// N4 — Remove reveal buttons and article body masking markers
	document.querySelectorAll(".wst-ns-reveal-btn").forEach((btn) => {
		btn.remove();
	});
	document.querySelectorAll("[data-wst-news-masked]").forEach((el) => {
		el.removeAttribute("data-wst-news-masked");
	});
}

function setDocumentState(enabled) {
	document.documentElement.setAttribute("data-wst-ns", enabled ? "on" : "off");
}

/**
 * SAFE INITIAL SCAN — exponential backoff for Nuxt/Vue hydration (#4)
 */

const SCAN_DELAYS = [200, 600, 1500, 3000];

function safeInitialScan() {
	if (!document.body) return;

	scanWithRules(document.body);
	maskDocumentTitle();
	maskArticleBody();

	SCAN_DELAYS.forEach((delay, i) => {
		setTimeout(() => {
			const matched = scanWithRules(document.body);

			// Sweep attribute-based rules each pass
			for (const rule of MASK_RULES) {
				if (rule.attribute) scanAttributes(rule);
			}

			maskDocumentTitle();
			maskArticleBody();

			// On the final pass, run diagnostics and heuristic fallback
			if (i === SCAN_DELAYS.length - 1) {
				logDiagnostics();
				if (matched === 0) {
					heuristicScoreScan(document.body);
				}
			}
		}, delay);
	});
}

/**
 * OBSERVER
 */

let pendingRafId = null;
let pendingNodes = new Set();
let pendingAttributeSweep = false;

function flushPendingScans() {
	pendingRafId = null;

	// #3 — Track whether any node was disconnected
	let needsFullRescan = false;

	for (const node of pendingNodes) {
		if (node.isConnected) {
			scanWithRules(node);
		} else {
			needsFullRescan = true;
		}
	}
	pendingNodes.clear();

	// #3 — Rescan entire body when nodes were transiently disconnected
	if (needsFullRescan && document.body) {
		scanWithRules(document.body);
	}

	if (pendingAttributeSweep) {
		pendingAttributeSweep = false;
		for (const rule of MASK_RULES) {
			if (rule.attribute) scanAttributes(rule);
		}
	}

	// #10 — Check document title on each flush
	maskDocumentTitle();
	// N4 — Check for article body on each flush
	maskArticleBody();
}

function scheduleFlush() {
	if (pendingRafId === null) {
		pendingRafId = requestAnimationFrame(flushPendingScans);
	}
}

function attachObserver() {
	disconnectObserver();

	observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.type === "childList") {
				for (const n of m.addedNodes) {
					if (n.nodeType !== Node.ELEMENT_NODE) continue;
					pendingNodes.add(n);
				}
			}

			if (m.type === "characterData") {
				const parent = m.target.parentElement;
				if (parent) pendingNodes.add(parent);
			}

			if (m.type === "attributes") {
				pendingAttributeSweep = true;
				const el = m.target;
				if (el && el.nodeType === Node.ELEMENT_NODE) {
					pendingNodes.add(el);
				}
			}
		}

		scheduleFlush();
	});

	// #2 — Include "class" in attributeFilter for Vue hydration
	const attrFilter = MASK_RULES.filter((r) => r.attribute).map(
		(r) => r.attribute,
	);
	attrFilter.push("class");

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: attrFilter,
	});
}

function disconnectObserver() {
	if (observer) {
		observer.disconnect();
		observer = null;
	}
}

/**
 * LIFECYCLE
 */

async function refreshMasking(enabled) {
	disconnectObserver();
	detachRevealHandler();
	clearMasks();
	setDocumentState(enabled);

	if (!enabled) return;

	safeInitialScan();
	attachObserver();
	attachRevealHandler();
}

async function init() {
	const stored = await chrome.storage.sync.get(STORAGE_KEY);
	const enabled = stored[STORAGE_KEY] !== false;

	await refreshMasking(enabled);

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== "sync") return;
		if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;

		const next = changes[STORAGE_KEY].newValue !== false;

		refreshMasking(next).catch((err) => {
			console.warn("[WST No-Spoilers] failed to refresh masking:", err);
			document.documentElement.setAttribute("data-wst-ns", "off");
		});
	});
}

init().catch((err) => {
	console.warn("[WST No-Spoilers] init failed:", err);
	document.documentElement.setAttribute("data-wst-ns", "off");
});
