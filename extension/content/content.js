const INLINE_MASK_CLASS = "wst-ns-mask-inline";
const STORAGE_KEY = "wstNsEnabled";

let observer = null;

/** Runs of ASCII digits inside text nodes */
const DIGITS_PATTERN = /\d+/g;

/** Do not blur digits that refer to a round label (e.g. "Winner of Match 2"). */
const DIGITS_AFTER_MATCH_LABEL = /\bMatch\s+$/i;

/**
 * MASK RULES CONFIG
 */
const MASK_RULES = [
	{
		name: "matchScore",
		selector: "p.w-6.text-center.text-clear.font-primary",
		mode: "full",
	},

	{
		name: "drawScore",
		selector: `.${CSS.escape("text-clear")}.${CSS.escape("text-[14px]")}`,
		mode: "digits",
	},

	{
		name: "landingScore",
		selector: "p.ml-auto.font-bold",
		mode: "digits",
		exactClass: "ml-auto font-bold",
	},

	{
		name: "matchCenterScore",
		selector: "p.text-xs.font-bold.text-white.font-secondary",
		mode: "digits",
	},

	{
		name: "matchCenterScoreXS",
		selector: "p.text-xs.font-bold.font-primary",
		mode: "digits",
	},

	{
		name: "framesDataSection",
		attribute: "currentframe",
		mode: "full",
	},

	{
		name: "matchDataSectionLeft",
		selector:
			"p.flex.items-center.justify-start.col-span-1.font-bold.text-clear.font-xl",
		mode: "charMask",
	},

	{
		name: "matchDataSectionRight",
		selector:
			"p.flex.items-center.justify-end.col-span-1.font-bold.text-clear.font-xl",
		mode: "charMask",
	},
];

/**
 * HELPERS
 */

function applyMaskToNode(el) {
	if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
	if (el.classList.contains("wst-ns-mask")) return;
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

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (SPOILER_CHAR_PATTERN.test(char)) {
			if (i > lastIndex) {
				frag.appendChild(document.createTextNode(text.slice(lastIndex, i)));
			}

			const span = document.createElement("span");
			span.className = INLINE_MASK_CLASS;
			span.textContent = char;
			frag.appendChild(span);

			lastIndex = i + 1;
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
	}
}

function scanAttributes(rule) {
	const elements = document.querySelectorAll(`[${rule.attribute}]`);
	elements.forEach((el) => processElementWithRule(el, rule));
}

function scanWithRules(root) {
	for (const rule of MASK_RULES) {
		let elements = [];

		try {
			if (rule.selector) {
				elements = root.querySelectorAll(rule.selector);
			} else if (rule.attribute) {
				elements = root.querySelectorAll(`[${rule.attribute}]`);
			}
		} catch {
			continue;
		}

		elements.forEach((el) => processElementWithRule(el, rule));
	}
}

/**
 * CLEANUP
 */

function clearInlineMasks() {
	document.querySelectorAll(`.${INLINE_MASK_CLASS}`).forEach((span) => {
		const parent = span.parentNode;
		if (!parent) return;
		parent.replaceChild(document.createTextNode(span.textContent ?? ""), span);
		parent.normalize();
	});
}

function clearMasks() {
	document.querySelectorAll(".wst-ns-mask").forEach((el) => {
		el.classList.remove("wst-ns-mask");
	});
	clearInlineMasks();
}

function setDocumentState(enabled) {
	document.documentElement.setAttribute("data-wst-ns", enabled ? "on" : "off");
}

/**
 * 🔥 SAFE INITIAL SCAN (replaces heavy rescan logic)
 */

function safeInitialScan() {
	if (!document.body) return;

	scanWithRules(document.body);

	// small delayed pass for late hydration (React/SPAs)
	setTimeout(() => {
		scanWithRules(document.body);
	}, 200);
}

/**
 * OBSERVER
 */
function attachObserver() {
	disconnectObserver();

	observer = new MutationObserver((mutations) => {
		let attributeSweepNeeded = false;

		for (const m of mutations) {
			// -----------------------------
			// 1. New DOM nodes
			// -----------------------------
			if (m.type === "childList") {
				for (const n of m.addedNodes) {
					if (n.nodeType !== Node.ELEMENT_NODE) continue;
					scanWithRules(n);
				}
			}

			// -----------------------------
			// 2. Text changes (rare but important)
			// -----------------------------
			if (m.type === "characterData") {
				const parent = m.target.parentElement;
				if (parent) scanWithRules(parent);
			}

			// -----------------------------
			// 3. Attribute changes (FIXED)
			// -----------------------------
			if (m.type === "attributes") {
				attributeSweepNeeded = true;

				const el = m.target;
				if (el && el.nodeType === Node.ELEMENT_NODE) {
					// only reprocess this element, not addedNodes (they don't exist here)
					scanWithRules(el);
				}
			}
		}

		// -----------------------------
		// 4. Lightweight recovery sweep for late-hydrated attributes
		// -----------------------------
		if (attributeSweepNeeded) {
			for (const rule of MASK_RULES) {
				if (rule.attribute) {
					scanAttributes(rule);
				}
			}
		}
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
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
	clearMasks();
	setDocumentState(enabled);

	if (!enabled) return;

	safeInitialScan();
	attachObserver();
}

async function init() {
	const stored = await chrome.storage.sync.get(STORAGE_KEY);
	const enabled = stored[STORAGE_KEY] !== false;

	await refreshMasking(enabled);

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== "sync") return;
		if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;

		const next = changes[STORAGE_KEY].newValue !== false;

		refreshMasking(next).catch(() => {
			document.documentElement.setAttribute("data-wst-ns", "off");
		});
	});
}

init().catch(() => {
	document.documentElement.setAttribute("data-wst-ns", "off");
});
