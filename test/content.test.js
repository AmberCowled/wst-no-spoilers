'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const CONSTANTS_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'constants.js'),
  'utf8',
);

const RAW_CONTENT_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'content', 'content.js'),
  'utf8',
);

// Strip 'use strict' (block-scopes declarations in eval) and the self-executing
// init() call (needs real chrome API). Wrap everything so functions land on window.
const CONTENT_SRC = RAW_CONTENT_SRC
  .replace(/^'use strict';\s*/m, '')
  .replace(/^init\(\)\.catch[\s\S]*$/m, '');

function createEnv() {
  const dom = new JSDOM('<!DOCTYPE html><html data-wst-ns="on"><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://www.wst.tv/',
  });
  const { window } = dom;

  // Polyfills for APIs missing in jsdom
  window.CSS = { escape: (s) => s.replace(/([^\w-])/g, '\\$1') };
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);

  // Mock chrome API
  window.chrome = {
    storage: {
      sync: {
        get: async () => ({ wstNsEnabled: true }),
        set: async () => {},
      },
      onChanged: { addListener: () => {} },
    },
  };

  // Load shared constants then content script
  window.eval(CONSTANTS_SRC);
  window.eval(CONTENT_SRC);

  return { dom, window, document: window.document };
}

// ─── EXISTING TESTS ─────────────────────────────────────────────────────────

describe('wrapDigitsInTextNode', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should wrap digit runs in mask spans', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = 'Score 5-3';
    document.body.appendChild(p);

    window.eval('wrapDigitsInElement(document.querySelector("p"))');

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.equal(spans.length, 2);
    assert.equal(spans[0].textContent, '5');
    assert.equal(spans[1].textContent, '3');
  });

  it('should skip digits after "Match" label', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = 'Winner of Match 2';
    document.body.appendChild(p);

    window.eval('wrapDigitsInElement(document.querySelector("p"))');

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.equal(spans.length, 0);
  });

  it('should not double-wrap already masked content', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = '7-4';
    document.body.appendChild(p);

    window.eval('wrapDigitsInElement(document.querySelector("p"))');
    window.eval('wrapDigitsInElement(document.querySelector("p"))');

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.equal(spans.length, 2);
  });
});

describe('maskCharsInTextNode', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should group consecutive spoiler characters into single spans', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = '12-7';
    document.body.appendChild(p);

    window.eval(`
      var w = document.createTreeWalker(document.querySelector("p"), NodeFilter.SHOW_TEXT);
      var n = w.nextNode();
      if (n) maskCharsInTextNode(n);
    `);

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.equal(spans.length, 1);
    assert.equal(spans[0].textContent, '12-7');
  });

  it('should not mask uppercase letters or non-spoiler chars', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = 'PLAYER A';
    document.body.appendChild(p);

    window.eval(`
      var w = document.createTreeWalker(document.querySelector("p"), NodeFilter.SHOW_TEXT);
      var n = w.nextNode();
      if (n) maskCharsInTextNode(n);
    `);

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.equal(spans.length, 0);
  });

  it('should mask lowercase s characters (intentional for score context)', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = 'session';
    document.body.appendChild(p);

    window.eval(`
      var w = document.createTreeWalker(document.querySelector("p"), NodeFilter.SHOW_TEXT);
      var n = w.nextNode();
      if (n) maskCharsInTextNode(n);
    `);

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.ok(spans.length > 0, 'should have masked s characters');
  });
});

describe('clearMasks', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should remove full masks', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.classList.add('wst-ns-mask');
    document.body.appendChild(p);

    window.eval('clearMasks()');

    assert.equal(p.classList.contains('wst-ns-mask'), false);
  });

  it('should remove inline masks and normalize text', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    const span = document.createElement('span');
    span.className = 'wst-ns-mask-inline';
    span.textContent = '5';
    p.appendChild(document.createTextNode('Score '));
    p.appendChild(span);
    document.body.appendChild(p);

    window.eval('clearMasks()');

    const spans = p.querySelectorAll('.wst-ns-mask-inline');
    assert.equal(spans.length, 0);
    assert.equal(p.textContent, 'Score 5');
  });
});

describe('applyMaskToNode', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should add wst-ns-mask class to element', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    document.body.appendChild(p);

    window.eval('applyMaskToNode(document.querySelector("p"))');

    assert.equal(p.classList.contains('wst-ns-mask'), true);
  });

  it('should not double-add the mask class', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.classList.add('wst-ns-mask');
    document.body.appendChild(p);

    window.eval('applyMaskToNode(document.querySelector("p"))');

    assert.equal(p.className, 'wst-ns-mask');
  });

  it('should ignore non-element nodes', () => {
    const { window } = env;
    window.eval('applyMaskToNode(null)');
    window.eval('applyMaskToNode(document.createTextNode("hi"))');
  });
});

// ─── NEW TESTS ──────────────────────────────────────────────────────────────

describe('scanWithRules root matching (#1)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should match root element when root matches a selector', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.className = 'w-6 text-center text-clear font-primary';
    document.body.appendChild(p);

    // Scan with the element itself as root
    window.eval('scanWithRules(document.querySelector("p.w-6"))');

    assert.equal(p.classList.contains('wst-ns-mask'), true);
  });

  it('should match root element when root has a matching attribute', () => {
    const { document, window } = env;
    const div = document.createElement('div');
    div.setAttribute('currentframe', '3');
    document.body.appendChild(div);

    window.eval('scanWithRules(document.querySelector("[currentframe]"))');

    assert.equal(div.classList.contains('wst-ns-mask'), true);
  });
});

describe('observer class attribute detection (#2)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should include "class" in the attributeFilter passed to observe()', () => {
    const { window } = env;
    // Mock MutationObserver to capture the observe options
    let capturedOptions = null;
    window.eval(`
      var _OrigMO = MutationObserver;
      MutationObserver = function(cb) {
        this._cb = cb;
        this.observe = function(target, opts) { _capturedOpts = opts; };
        this.disconnect = function() {};
      };
      var _capturedOpts = null;
      attachObserver();
      var _attrFilter = _capturedOpts ? _capturedOpts.attributeFilter : [];
      MutationObserver = _OrigMO;
    `);
    const filter = window.eval('JSON.stringify(_attrFilter)');
    const parsed = JSON.parse(filter);
    assert.ok(parsed.includes('class'), 'attributeFilter should include "class"');
    assert.ok(parsed.includes('currentframe'), 'attributeFilter should include "currentframe"');
  });
});

describe('flushPendingScans disconnected fallback (#3)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should trigger full rescan when a pending node is disconnected', () => {
    const { document, window } = env;
    // Add a score element to the body that should be caught by full rescan
    const p = document.createElement('p');
    p.className = 'w-6 text-center text-clear font-primary';
    document.body.appendChild(p);

    // Create a node, add it to pending via the observer callback, then disconnect it
    const tempDiv = document.createElement('div');
    document.body.appendChild(tempDiv);

    // Simulate what the observer callback does: add to pendingNodes and schedule flush
    // We mock the observer to capture its callback, then invoke it manually
    window.eval(`
      var _obsCb = null;
      var _OrigMO2 = MutationObserver;
      MutationObserver = function(cb) { _obsCb = cb; this.observe = function(){}; this.disconnect = function(){}; };
      attachObserver();
      MutationObserver = _OrigMO2;
    `);

    // Simulate a childList mutation adding tempDiv
    window.eval(`
      _obsCb([{ type: "childList", addedNodes: [document.querySelector("div")], removedNodes: [] }]);
    `);

    // Remove the div so it's disconnected before flush
    tempDiv.remove();

    // Flush — the disconnected node should trigger a full body rescan
    window.eval('flushPendingScans()');

    // The score element in body should have been masked by the full rescan
    assert.equal(p.classList.contains('wst-ns-mask'), true);
  });

  it('should scan connected nodes individually', () => {
    const { document, window } = env;
    const container = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'w-6 text-center text-clear font-primary';
    container.appendChild(p);
    document.body.appendChild(container);

    // Simulate observer callback adding the container
    window.eval(`
      var _obsCb2 = null;
      var _OrigMO3 = MutationObserver;
      MutationObserver = function(cb) { _obsCb2 = cb; this.observe = function(){}; this.disconnect = function(){}; };
      attachObserver();
      MutationObserver = _OrigMO3;
    `);

    window.eval(`
      _obsCb2([{ type: "childList", addedNodes: [document.querySelector("div")], removedNodes: [] }]);
    `);

    window.eval('flushPendingScans()');

    assert.equal(p.classList.contains('wst-ns-mask'), true);
  });
});

describe('safeInitialScan retry timing (#4)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should schedule 4 delayed scans with correct delays', () => {
    const { window } = env;

    const delays = [];
    const origSetTimeout = window.setTimeout;
    window.setTimeout = (fn, delay) => {
      if (delay > 0) delays.push(delay);
      return origSetTimeout(fn, 0);
    };

    window.eval('safeInitialScan()');

    window.setTimeout = origSetTimeout;

    assert.deepEqual(delays, [200, 600, 1500, 3000]);
  });
});

describe('fallback selectors (#5)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should use fallback when primary attribute selector matches nothing', () => {
    const { document, window } = env;
    // No element has currentframe, but one has data-frame (fallback)
    const div = document.createElement('div');
    div.setAttribute('data-frame', '1');
    document.body.appendChild(div);

    const matched = window.eval('scanWithRules(document.body)');

    assert.equal(div.classList.contains('wst-ns-mask'), true);
  });

  it('should prefer primary attribute over fallback', () => {
    const { document, window } = env;
    const primary = document.createElement('div');
    primary.setAttribute('currentframe', '2');
    document.body.appendChild(primary);

    const fallback = document.createElement('div');
    fallback.setAttribute('data-frame', '1');
    document.body.appendChild(fallback);

    window.eval('scanWithRules(document.body)');

    // Primary should be masked
    assert.equal(primary.classList.contains('wst-ns-mask'), true);
    // Fallback should NOT be masked (primary found matches)
    assert.equal(fallback.classList.contains('wst-ns-mask'), false);
  });
});

describe('equalize mode (#6)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should add wst-ns-equalize class', () => {
    const { document, window } = env;
    const div = document.createElement('div');
    div.className = 'winner';
    document.body.appendChild(div);

    window.eval('scanWithRules(document.body)');

    assert.equal(div.classList.contains('wst-ns-equalize'), true);
  });

  it('should remove wst-ns-equalize on clearMasks', () => {
    const { document, window } = env;
    const div = document.createElement('div');
    div.classList.add('wst-ns-equalize');
    document.body.appendChild(div);

    window.eval('clearMasks()');

    assert.equal(div.classList.contains('wst-ns-equalize'), false);
  });
});

describe('maskStatusBadges (#7)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should mask elements with status text', () => {
    const { document, window } = env;
    const span = document.createElement('span');
    span.textContent = 'Completed';
    document.body.appendChild(span);

    window.eval('maskStatusBadges(document.body)');

    assert.equal(span.classList.contains('wst-ns-mask'), true);
  });

  it('should skip elements with long text', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.textContent = 'The match was Completed after a long struggle between the two players in the final.';
    document.body.appendChild(p);

    window.eval('maskStatusBadges(document.body)');

    assert.equal(p.classList.contains('wst-ns-mask'), false);
  });
});

describe('maskDocumentTitle (#10)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should replace scores in document title', () => {
    const { document, window } = env;
    document.title = 'Player A 5 - 3 Player B';

    window.eval('maskDocumentTitle()');

    assert.equal(document.title, 'Player A ? - ? Player B');
  });

  it('should restore original title on clearMasks', () => {
    const { document, window } = env;
    document.title = 'Player A 5-3 Player B';

    window.eval('maskDocumentTitle()');
    assert.equal(document.title, 'Player A ? - ? Player B');

    window.eval('clearMasks()');
    assert.equal(document.title, 'Player A 5-3 Player B');
  });
});

describe('heuristicScoreScan (#12)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should catch score-like text in match-related containers', () => {
    const { document, window } = env;
    const container = document.createElement('div');
    container.className = 'match-result';
    const span = document.createElement('span');
    span.textContent = '5-3';
    container.appendChild(span);
    document.body.appendChild(container);

    const matched = window.eval('heuristicScoreScan(document.body)');

    assert.ok(matched > 0, 'should match score in match context');
    const masked = span.querySelectorAll('.wst-ns-mask-inline');
    assert.ok(masked.length > 0, 'digits should be wrapped');
  });

  it('should ignore score-like text outside match context', () => {
    const { document, window } = env;
    const container = document.createElement('div');
    container.className = 'unrelated-widget';
    const span = document.createElement('span');
    span.textContent = '5-3';
    container.appendChild(span);
    document.body.appendChild(container);

    const matched = window.eval('heuristicScoreScan(document.body)');

    assert.equal(matched, 0);
  });
});

describe('logDiagnostics (#13)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should warn when rules match zero elements', () => {
    const { window } = env;
    const warnings = [];
    const origWarn = window.console.warn;
    window.console.warn = (...args) => { warnings.push(args.join(' ')); };

    window.eval('logDiagnostics()');

    window.console.warn = origWarn;

    // With an empty body, all rules should match zero
    assert.ok(
      warnings.some((w) => w.includes('matched 0 elements')),
      'should warn about zero-match rules',
    );
    assert.ok(
      warnings.some((w) => w.includes('No elements matched any rule')),
      'should warn about total zero matches',
    );
  });

  it('should not warn when rules find elements', () => {
    const { document, window } = env;
    const warnings = [];
    const origWarn = window.console.warn;
    window.console.warn = (...args) => { warnings.push(args.join(' ')); };

    // Add an element matching the matchScore rule
    const p = document.createElement('p');
    p.className = 'w-6 text-center text-clear font-primary';
    document.body.appendChild(p);

    window.eval('logDiagnostics()');

    window.console.warn = origWarn;

    // Should NOT have the "No elements matched any rule" warning
    assert.ok(
      !warnings.some((w) => w.includes('No elements matched any rule')),
      'should not warn when some rules match',
    );
  });
});

// ─── N1–N6 NEWS SPOILER PREVENTION ─────────────────────────────────────────

describe('news card masking (N1/N2/N3)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should mask .article-card elements', () => {
    const { document, window } = env;
    const card = document.createElement('div');
    card.className = 'article-card';
    card.textContent = 'Trump Beats Robertson To Reach Final';
    document.body.appendChild(card);

    window.eval('scanWithRules(document.body)');

    assert.equal(card.classList.contains('wst-ns-mask'), true);
  });
});

describe('article title masking (N5)', () => {
  let env;

  it('should replace news page title with generic text', () => {
    // Create env with /news/ URL path
    const dom = new JSDOM('<!DOCTYPE html><html data-wst-ns="on"><body></body></html>', {
      runScripts: 'dangerously',
      url: 'https://www.wst.tv/news/2026/april/20/trump-wins-thriller/',
    });
    const { window } = dom;
    window.CSS = { escape: (s) => s.replace(/([^\w-])/g, '\\$1') };
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.chrome = { storage: { sync: { get: async () => ({}) }, onChanged: { addListener: () => {} } } };
    window.eval(CONSTANTS_SRC);
    window.eval(CONTENT_SRC);

    dom.window.document.title = 'Trump Wins Murphy Thriller - World Snooker Tour';
    window.eval('maskDocumentTitle()');

    assert.equal(dom.window.document.title, 'Article - World Snooker Tour');
  });

  it('should still use numeric pattern on non-news pages', () => {
    const { document, window } = env = createEnv();
    document.title = 'Player A 5 - 3 Player B';

    window.eval('maskDocumentTitle()');

    assert.equal(document.title, 'Player A ? - ? Player B');
  });
});

describe('click-to-reveal (N6)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should reveal news element on click and set data-wst-revealed', () => {
    const { document, window } = env;
    const card = document.createElement('div');
    card.className = 'article-card';
    const wrap = document.createElement('div');
    wrap.className = 'article-card__wrap wst-ns-mask';
    wrap.textContent = 'Spoiler Headline';
    card.appendChild(wrap);
    document.body.appendChild(card);

    // Simulate click via the handler function directly
    window.eval('handleRevealClick({ target: document.querySelector(".article-card__wrap"), preventDefault: function(){}, stopPropagation: function(){} })');

    assert.equal(wrap.classList.contains('wst-ns-mask'), false);
    assert.equal(wrap.getAttribute('data-wst-revealed'), 'true');
  });

  it('should NOT reveal score elements on click', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.className = 'w-6 text-center text-clear font-primary wst-ns-mask';
    document.body.appendChild(p);

    window.eval('handleRevealClick({ target: document.querySelector("p.w-6"), preventDefault: function(){}, stopPropagation: function(){} })');

    // Score should still be masked (not inside a news container)
    assert.equal(p.classList.contains('wst-ns-mask'), true);
  });

  it('should skip revealed elements on re-scan', () => {
    const { document, window } = env;
    const card = document.createElement('div');
    card.className = 'article-card';
    const wrap = document.createElement('div');
    wrap.className = 'article-card__wrap';
    wrap.setAttribute('data-wst-revealed', 'true');
    wrap.textContent = 'Revealed Headline';
    card.appendChild(wrap);
    document.body.appendChild(card);

    window.eval('scanWithRules(document.body)');

    // Should NOT be re-masked because data-wst-revealed is set
    assert.equal(wrap.classList.contains('wst-ns-mask'), false);
  });

  it('should clear data-wst-revealed on clearMasks', () => {
    const { document, window } = env;
    const el = document.createElement('div');
    el.setAttribute('data-wst-revealed', 'true');
    document.body.appendChild(el);

    window.eval('clearMasks()');

    assert.equal(el.hasAttribute('data-wst-revealed'), false);
  });
});

describe('article body masking (N4)', () => {
  it('should mask article body on /news/ pages', () => {
    const dom = new JSDOM('<!DOCTYPE html><html data-wst-ns="on"><body></body></html>', {
      runScripts: 'dangerously',
      url: 'https://www.wst.tv/news/2026/april/20/some-article/',
    });
    const { window } = dom;
    window.CSS = { escape: (s) => s.replace(/([^\w-])/g, '\\$1') };
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.chrome = { storage: { sync: { get: async () => ({}) }, onChanged: { addListener: () => {} } } };
    window.eval(CONSTANTS_SRC);
    window.eval(CONTENT_SRC);

    const body = dom.window.document.createElement('div');
    body.className = 'article-body';
    body.textContent = 'Match report content here...';
    dom.window.document.body.appendChild(body);

    window.eval('maskArticleBody()');

    assert.equal(body.classList.contains('wst-ns-mask'), true);
    assert.equal(body.getAttribute('data-wst-news-masked'), 'true');

    const btn = dom.window.document.querySelector('.wst-ns-reveal-btn');
    assert.ok(btn, 'reveal button should be injected');
    assert.equal(btn.textContent, 'Show article (may contain spoilers)');
  });

  it('should reveal body when button is clicked', () => {
    const dom = new JSDOM('<!DOCTYPE html><html data-wst-ns="on"><body></body></html>', {
      runScripts: 'dangerously',
      url: 'https://www.wst.tv/news/2026/april/20/some-article/',
    });
    const { window } = dom;
    window.CSS = { escape: (s) => s.replace(/([^\w-])/g, '\\$1') };
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.chrome = { storage: { sync: { get: async () => ({}) }, onChanged: { addListener: () => {} } } };
    window.eval(CONSTANTS_SRC);
    window.eval(CONTENT_SRC);

    const body = dom.window.document.createElement('div');
    body.className = 'article-body';
    body.textContent = 'Match report content here...';
    dom.window.document.body.appendChild(body);

    window.eval('maskArticleBody()');

    const btn = dom.window.document.querySelector('.wst-ns-reveal-btn');
    btn.click();

    assert.equal(body.classList.contains('wst-ns-mask'), false);
    assert.equal(body.getAttribute('data-wst-revealed'), 'true');
    assert.equal(dom.window.document.querySelector('.wst-ns-reveal-btn'), null, 'button should be removed');
  });

  it('should not mask article body on non-news pages', () => {
    const env = createEnv();
    const { document, window } = env;
    const body = document.createElement('div');
    body.className = 'article-body';
    document.body.appendChild(body);

    window.eval('maskArticleBody()');

    assert.equal(body.classList.contains('wst-ns-mask'), false);
  });
});

describe('isRevealableElement (N6/T1)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should return true for elements inside .article-card', () => {
    const { document, window } = env;
    const card = document.createElement('div');
    card.className = 'article-card';
    const title = document.createElement('h3');
    card.appendChild(title);
    document.body.appendChild(card);

    const result = window.eval('isRevealableElement(document.querySelector("h3"))');
    assert.equal(result, true);
  });

  it('should return false for score elements outside news containers', () => {
    const { document, window } = env;
    const p = document.createElement('p');
    p.className = 'w-6 text-center';
    document.body.appendChild(p);

    const result = window.eval('isRevealableElement(document.querySelector("p"))');
    assert.equal(result, false);
  });

  it('should return true for a.match elements', () => {
    const { document, window } = env;
    const a = document.createElement('a');
    a.className = 'match';
    document.body.appendChild(a);

    const result = window.eval('isRevealableElement(document.querySelector("a.match"))');
    assert.equal(result, true);
  });
});

describe('draw match masking (T1)', () => {
  let env;
  beforeEach(() => { env = createEnv(); });

  it('should mask a.match elements', () => {
    const { document, window } = env;
    const a = document.createElement('a');
    a.className = 'match';
    a.textContent = 'Player A vs Player B';
    document.body.appendChild(a);

    window.eval('scanWithRules(document.body)');

    assert.equal(a.classList.contains('wst-ns-mask'), true);
  });

  it('should reveal match on click and prevent navigation', () => {
    const { document, window } = env;
    const a = document.createElement('a');
    a.className = 'match wst-ns-mask';
    a.href = '/match/123';
    a.textContent = 'Player A vs Player B';
    document.body.appendChild(a);

    let defaultPrevented = false;
    let propagationStopped = false;
    window.eval(`handleRevealClick({
      target: document.querySelector("a.match"),
      preventDefault: function() { this._pd = true; },
      stopPropagation: function() { this._sp = true; }
    })`);

    assert.equal(a.classList.contains('wst-ns-mask'), false);
    assert.equal(a.getAttribute('data-wst-revealed'), 'true');
  });

  it('should clear inline masks within revealed match', () => {
    const { document, window } = env;
    const a = document.createElement('a');
    a.className = 'match wst-ns-mask';
    const span = document.createElement('span');
    span.className = 'wst-ns-mask-inline';
    span.textContent = '7';
    a.appendChild(document.createTextNode('Score: '));
    a.appendChild(span);
    document.body.appendChild(a);

    window.eval('handleRevealClick({ target: document.querySelector("a.match"), preventDefault: function(){}, stopPropagation: function(){} })');

    assert.equal(a.querySelectorAll('.wst-ns-mask-inline').length, 0, 'inline masks should be cleared');
    assert.ok(a.textContent.includes('7'), 'score text should remain visible');
  });

  it('should not re-mask revealed match on rescan', () => {
    const { document, window } = env;
    const a = document.createElement('a');
    a.className = 'match';
    a.setAttribute('data-wst-revealed', 'true');
    a.textContent = 'Player A vs Player B';
    document.body.appendChild(a);

    window.eval('scanWithRules(document.body)');

    assert.equal(a.classList.contains('wst-ns-mask'), false, 'should not be re-masked');
  });

  it('should not re-mask score digits inside revealed match', () => {
    const { document, window } = env;
    const a = document.createElement('a');
    a.className = 'match';
    a.setAttribute('data-wst-revealed', 'true');
    const scoreEl = document.createElement('span');
    scoreEl.className = 'text-clear text-\\[14px\\]';
    scoreEl.textContent = '7';
    a.appendChild(scoreEl);
    document.body.appendChild(a);

    window.eval('scanWithRules(document.body)');

    assert.equal(a.querySelectorAll('.wst-ns-mask-inline').length, 0, 'score digits inside revealed match should not be masked');
  });
});
