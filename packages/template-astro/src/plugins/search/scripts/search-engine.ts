/**
 * Search engine — the full client-side search experience: index loading, tag
 * cloud, suggestions, and results rendering. Heavy (~35 KB), so it is lazy-
 * loaded by `search-bootstrap.ts` rather than inlined into every page.
 *
 * Ported verbatim from SearchExperience.astro's inline <script>, which was
 * never type-checked; @ts-nocheck preserves that behavior rather than
 * introducing (and risking) a full re-typing of DOM-heavy search code.
 */
// @ts-nocheck

/** Post index item (from posts/index.json) — P3-5 typed. */
export interface SearchIndexItem {
  id: string;
  title: string;
  date?: string;
  tags?: string[];
  summary?: string;
  status?: string;
}

export interface SearchEngineConfig {
  instanceId: string;
  mode: 'page' | 'overlay';
  locale: string;
  routePrefix: string;
  searchSuggestionsEnabled: boolean;
  fullTextSearchEnabled: boolean;
  indexUrl: string;
  fullIndexUrl: string;
  initialTitle: string;
  initialTags: string[];
  featuredLabel: string;
  noTagsLabel: string;
}

// Index caches — shared across soft-navigation re-inits so we only fetch once.
let _lightIndex: any[] | null = null;
let _lightIndexPromise: Promise<any[]> | null = null;
let _fullIndex: any[] | null = null;
let _fullIndexPromise: Promise<any[]> | null = null;
let _allTagData: { name: string; count: number }[] | null = null;

// Per-instance controllers — one active init per instanceId (soft-nav re-init
// aborts the previous one).
const _controllers = new Map<string, AbortController>();

export function initSearchExperience(config: SearchEngineConfig) {
  const {
    instanceId,
    mode,
    locale,
    routePrefix,
    searchSuggestionsEnabled,
    fullTextSearchEnabled,
    indexUrl,
    fullIndexUrl,
    initialTitle,
    initialTags,
    featuredLabel,
    noTagsLabel,
  } = config;

  // Abort any prior init for this instance, then start fresh.
  const prev = _controllers.get(instanceId);
  if (prev) prev.abort();
  const _controller = new AbortController();
  _controllers.set(instanceId, _controller);
  const { signal } = _controller;

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function navigateTo(url) {
    window.location.href = url;
  }

  // Highlight every case-insensitive occurrence of `query` in `text` (HTML-escaped).
  // Returns plain escaped text when `query` is empty.
  function highlightMatches(text, query) {
    const str = String(text || '');
    const q = String(query || '').trim();
    if (!q) return esc(str);
    const lower = str.toLowerCase();
    const qLower = q.toLowerCase();
    let out = '';
    let last = 0;
    let idx = lower.indexOf(qLower);
    while (idx !== -1) {
      out += esc(str.slice(last, idx));
      out += '<mark class="match">' + esc(str.slice(idx, idx + q.length)) + '</mark>';
      last = idx + q.length;
      idx = lower.indexOf(qLower, last);
    }
    out += esc(str.slice(last));
    return out;
  }

  // Excerpt budget + sentence/paragraph boundary characters for body snippets.
  const EXCERPT_BACKTRACK = 80; // max chars to back up to a clean boundary
  const EXCERPT_LENGTH = 160;   // target snippet length
  const SENTENCE_BOUNDARIES = ['\n', '。', '！', '？', '!', '?', '.', '；', ';', '…'];

  function lastBoundary(str) {
    let idx = -1;
    for (const ch of SENTENCE_BOUNDARIES) {
      const i = str.lastIndexOf(ch);
      if (i > idx) idx = i;
    }
    return idx;
  }

  // Build a body excerpt around the first query match: back up to a paragraph/
  // sentence start (within EXCERPT_BACKTRACK), then extend forward to length.
  function makeBodyExcerpt(body, query) {
    const text = String(body || '');
    const q = String(query || '').trim();
    if (!q) return text.slice(0, EXCERPT_LENGTH);
    const matchIdx = text.toLowerCase().indexOf(q.toLowerCase());
    if (matchIdx === -1) return text.slice(0, EXCERPT_LENGTH);

    let start = Math.max(0, matchIdx - EXCERPT_BACKTRACK);
    const lookback = text.slice(start, matchIdx);
    const b = lastBoundary(lookback);
    if (b >= 0) start += b + 1;

    const end = Math.min(text.length, start + EXCERPT_LENGTH);
    let excerpt = text.slice(start, end).trim();
    if (start > 0) excerpt = '…' + excerpt;
    if (end < text.length) excerpt = excerpt + '…';
    return excerpt;
  }

  // Exact (case-preserved) first matched substring of `query` in `body`, or ''.
  // Used to build the #:~:text= fragment so the browser scrolls to + highlights
  // the same occurrence the excerpt was centered on.
  function firstMatchText(body, query) {
    const text = String(body || '');
    const q = String(query || '').trim();
    if (!q) return '';
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    return idx === -1 ? '' : text.slice(idx, idx + q.length);
  }

  async function loadLightIndex() {
    if (_lightIndex) return _lightIndex;
    if (!_lightIndexPromise) {
      _lightIndexPromise = fetch(indexUrl, { cache: 'force-cache' })
        .then((r) => { if (!r.ok) throw new Error('index fetch failed: ' + r.status); return r.json(); })
        .then((raw) => {
          // posts/index.json is object-keyed; inject the key as `id`.
          _lightIndex = Array.isArray(raw)
            ? raw
            : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
          return _lightIndex;
        })
        .finally(() => { _lightIndexPromise = null; });
    }
    return _lightIndexPromise;
  }

  async function loadFullIndex() {
    if (_fullIndex) return _fullIndex;
    if (!_fullIndexPromise) {
      _fullIndexPromise = fetch(fullIndexUrl, { cache: 'force-cache' })
        .then((r) => { if (!r.ok) throw new Error('full index fetch failed: ' + r.status); return r.json(); })
        .then((raw) => {
          _fullIndex = Array.isArray(raw) ? raw : Object.values(raw);
          return _fullIndex;
        })
        .finally(() => { _fullIndexPromise = null; });
    }
    return _fullIndexPromise;
  }

  function computeAllTagData(entries) {
    const counts = new Map();
    (entries || []).forEach((p) => {
      (p.tags || []).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    const arr = Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
    arr.sort((a, b) => {
      if (a.name === 'featured' || a.name === '精选') return -1;
      if (b.name === 'featured' || b.name === '精选') return 1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }

  async function loadSearchEntries() {
    // Full-text search matches body; the full index is already published-only.
    if (fullTextSearchEnabled) {
      try {
        const full = await loadFullIndex();
        if (full && full.length) return full;
      } catch (e) { /* fall back to light index */ }
    }
    const light = await loadLightIndex();
    // Light index may include drafts — match getPublishedPosts() semantics.
    return light.filter((p) => p.status === undefined || p.status === 'published');
  }

  const root = document.querySelector(`[data-search-experience="${instanceId}"]`);
  if (!root) return;

  const searchBoxRoot = root.querySelector(`[data-searchbox-id="${instanceId}"]`);
  const input = searchBoxRoot?.querySelector('#search-input');

  // i18n: read the SSR-injected search.* translations (single source = locales
  // JSON, injected by SearchExperience as [data-role="search-i18n"]).
  const i18nScript = root.querySelector('[data-role="search-i18n"]');
  const i18nMap: Record<string, string> = i18nScript
    ? (JSON.parse(i18nScript.textContent || '{}') as Record<string, string>)
    : {};
  const t = (key: string, params: Record<string, string | number> = {}) => {
    const template = i18nMap[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
  };

  const parsedInitialTags = [...initialTags];

  // State
  let searchQuery = initialTitle;
  let selectedTags = [...parsedInitialTags];
  let isTagCloudOpen = false;
  let isSearching = false;

  // Suggestion state
  let suggestionQuery = initialTitle || '';
  let suggestions = [];
  let activeSuggestionIndex = -1;
  let isSuggesting = false;

  // DOM elements (scoped to this experience's root)
  const tagTrigger = searchBoxRoot?.querySelector('#tag-trigger');
  const tagCloud = root.querySelector('#tag-cloud');
  const tagsGridEl = root.querySelector('#tags-grid');
  const suggestionList = root.querySelector('#suggestion-list');
  const resultsContent = root.querySelector('#results-content');
  const resultsContainer = root.querySelector('#results-container');
  const contentWrapper = root.querySelector('#content-wrapper');

  function syncSearchBoxValue(value) {
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function initSearchFromURL() {
    // Only the Search page owns keyword/tags URL state. The overlay can be
    // opened from any page (e.g. /blogs?featured=1); it must not inherit
    // that page's params or rewrite its URL.
    if (mode !== 'page') return;
    const currentPath = window.location.pathname.replace(/\/+$/, '');
    const searchPath = `${routePrefix}/search`.replace(/\/+$/, '');
    if (currentPath !== searchPath) return;

    const urlParams = new URLSearchParams(window.location.search);
    const keyword = urlParams.get("keyword") || "";
    const tags = urlParams.get("tags") || "";
    const view = urlParams.get("view") || "";

    if (view === "tags") {
      isTagCloudOpen = true;
      syncTagTriggerState();
      updateCenteredMode();
      updateVisibility();
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      return;
    }

    if (keyword || tags) {
      if (keyword) {
        searchQuery = keyword;
        suggestionQuery = keyword;
        syncSearchBoxValue(keyword);
      }

      if (tags) {
        const tagList = tags.split(",").filter((x) => x.trim());
        selectedTags = [...new Set([...selectedTags, ...tagList])];
        tagList.forEach((tag) => {
          const tagElement = root.querySelector(`.tag-cloud-item[data-tag="${CSS.escape(tag)}"]`);
          if (tagElement) tagElement.classList.add("selected");
        });
        renderTagChips();
      }

      syncTagTriggerState();
      updateCenteredMode();
      updateVisibility();

      setTimeout(() => {
        performSearch();
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }, 100);
    }
  }

  function sortTagsList(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    return [...tags].sort((a, b) => {
      if (a === "featured" || a === "精选") return -1;
      if (b === "featured" || b === "精选") return 1;
      return a.localeCompare(b);
    });
  }

  function isAnyTagsSelected() {
    return selectedTags.length > 0;
  }

  function isSearchActive() {
    return searchQuery.trim().length > 0 || isAnyTagsSelected();
  }

  function updateCenteredMode() {
    if (mode !== 'page') return;
    root.classList.toggle(
      "centered-mode",
      !isSearchActive() && !isTagCloudOpen && !isSuggesting,
    );
  }

  function updatePanelVisibility() {
    if (isSuggesting) {
      if (suggestionList) { suggestionList.style.display = "block"; suggestionList.style.zIndex = "10"; }
      if (tagCloud) { tagCloud.style.display = "none"; tagCloud.style.zIndex = "1"; }
      if (resultsContainer) { resultsContainer.style.display = "none"; resultsContainer.style.zIndex = "1"; }
    } else if (isTagCloudOpen) {
      if (suggestionList) { suggestionList.style.display = "none"; suggestionList.style.zIndex = "1"; }
      if (tagCloud) { tagCloud.style.display = "flex"; tagCloud.style.zIndex = "10"; }
      if (resultsContainer) { resultsContainer.style.display = "none"; resultsContainer.style.zIndex = "1"; }
    } else {
      if (suggestionList) { suggestionList.style.display = "none"; suggestionList.style.zIndex = "1"; }
      if (tagCloud) { tagCloud.style.display = "none"; tagCloud.style.zIndex = "1"; }
      if (resultsContainer) { resultsContainer.style.display = "flex"; resultsContainer.style.zIndex = "10"; }
    }
  }

  function updateVisibility() {
    const shouldShow = isSearchActive() || isTagCloudOpen || isSuggesting;

    if (shouldShow) {
      if (contentWrapper) {
        contentWrapper.style.display = "block";
        void contentWrapper.offsetHeight;
        contentWrapper.classList.add("visible");
      }
      updatePanelVisibility();
    } else {
      if (contentWrapper) {
        contentWrapper.classList.remove("visible");
        setTimeout(() => {
          if (signal.aborted) return;
          if (!isSearchActive() && !isTagCloudOpen && !isSuggesting) {
            contentWrapper.style.display = "none";
            if (tagCloud) tagCloud.style.display = "none";
            if (suggestionList) suggestionList.style.display = "none";
            if (resultsContainer) resultsContainer.style.display = "none";
          }
        }, 400);
      }
    }
  }

  function renderTagCloud() {
    if (!tagsGridEl) return;
    if (!_allTagData || !_allTagData.length) {
      // 无 tag placeholder
      tagsGridEl.innerHTML = `<div class="tags-empty">${esc(noTagsLabel || '')}</div>`;
      return;
    }
    tagsGridEl.innerHTML = _allTagData.map((tagData) => {
      const isF = tagData.name === "featured" || tagData.name === "精选";
      return `
        <button class="tag-cloud-item${isF ? " featured" : ""}" data-tag="${esc(tagData.name)}">
          ${esc(isF ? featuredLabel : tagData.name)}
          <span class="tag-count">${tagData.count}</span>
        </button>
      `;
    }).join("");
  }

  function renderTagChips() {
    const selectedTagsHeader = root.querySelector("#selected-tags-header");
    const selectedTagsList = root.querySelector("#selected-tags-list");

    if (!selectedTagsList) return;

    if (selectedTags.length > 0) {
      if (selectedTagsHeader) selectedTagsHeader.style.display = "flex";

      selectedTagsList.innerHTML = sortTagsList(selectedTags)
        .map((tag) => {
          const isF = tag === "featured" || tag === "精选";
          return `
          <span class="selected-tag-chip ${isF ? "featured" : ""}">
            #${esc(isF ? featuredLabel : tag)}
            <button class="chip-remove ${isF ? "featured" : ""}" data-tag="${esc(tag)}" title="移除标签">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </span>
        `;
        })
        .join("");

      selectedTagsList.querySelectorAll(".chip-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const tag = btn.getAttribute("data-tag");
          selectedTags = selectedTags.filter((t) => t !== tag);
          const cloudItem = root.querySelector(`.tag-cloud-item[data-tag="${CSS.escape(tag)}"]`);
          if (cloudItem) cloudItem.classList.remove("selected");
          syncTagTriggerState();
          renderTagChips();
          filterPosts();
          updateCenteredMode();
          updateVisibility();
        }, { signal });
      });
    } else {
      if (selectedTagsHeader) selectedTagsHeader.style.display = "none";
      selectedTagsList.innerHTML = "";
    }
  }

  function syncTagTriggerState() {
    if (tagTrigger) {
      tagTrigger.classList.toggle("active", selectedTags.length > 0 || isTagCloudOpen);
      tagTrigger.classList.toggle("selected", selectedTags.length > 0);
      const hasFeatured = selectedTags.some((tag) => tag === "featured" || tag === "精选");
      tagTrigger.classList.toggle("featured", hasFeatured);

      const tagCountEl = tagTrigger.querySelector(".tag-count");
      if (selectedTags.length > 0) {
        if (!tagCountEl) {
          const countEl = document.createElement("span");
          countEl.className = "tag-count";
          countEl.textContent = selectedTags.length;
          tagTrigger.appendChild(countEl);
        } else {
          tagCountEl.textContent = selectedTags.length;
        }
      } else {
        if (tagCountEl) tagCountEl.remove();
      }
    }

    searchBoxRoot?.dispatchEvent(
      new CustomEvent("searchbox:selection-change", {
        detail: { selectedTagsCount: selectedTags.length },
      }),
    );
  }

  function applyOverlayExternalState() {
    if (mode !== 'overlay') return;
    const overlay = document.querySelector('[data-global-search-overlay]') as HTMLElement | null;
    if (!overlay) return;
    const keyword = overlay.dataset.searchKeyword || '';
    const tags = (overlay.dataset.searchTags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const view = overlay.dataset.searchView || '';

    searchQuery = keyword;
    suggestionQuery = keyword;
    selectedTags = [...new Set(tags)];
    isTagCloudOpen = view === 'tags';

    syncSearchBoxValue(keyword);
    root.querySelectorAll('.tag-cloud-item.selected').forEach((el) => el.classList.remove('selected'));
    selectedTags.forEach((tag) => {
      root.querySelector(`.tag-cloud-item[data-tag="${CSS.escape(tag)}"]`)?.classList.add('selected');
    });
    syncTagTriggerState();
    renderTagChips();
    filterPosts();
    updateCenteredMode();
    updateVisibility();
  }

  async function localSearch(keyword, tags = []) {
    let entries = await loadSearchEntries();
    const kw = String(keyword || '').trim().toLowerCase();

    if (kw) {
      entries = entries.filter((p) => {
        if ((p.title || '').toLowerCase().includes(kw)) return true;
        if ((p.summary || '').toLowerCase().includes(kw)) return true;
        if (fullTextSearchEnabled && (p.body || '').toLowerCase().includes(kw)) return true;
        return false;
      });
    }

    if (tags && tags.length > 0) {
      const wanted = tags.map((t) => String(t).trim().toLowerCase());
      entries = entries.filter((p) => {
        const postTags = (p.tags || []).map((x) => String(x).trim().toLowerCase());
        return wanted.every((t) => postTags.includes(t));
      });
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return entries;
  }

  async function fetchSearchResults(keyword, tags = []) {
    return localSearch(keyword, tags);
  }

  async function filterPosts() {
    if (!resultsContent) return;
    const query = searchQuery.trim();

    if (!query && selectedTags.length === 0) {
      resultsContent.innerHTML = "";
      const loadingState = root.querySelector("#loading-state");
      if (loadingState) loadingState.style.display = "none";
      const emptyState = root.querySelector("#empty-state");
      if (emptyState) emptyState.style.display = "none";
      return;
    }

    const loadingState = root.querySelector("#loading-state");
    if (loadingState) loadingState.style.display = "block";

    try {
      const filtered = await fetchSearchResults(query, selectedTags);
      if (signal.aborted) return;

      if (loadingState) loadingState.style.display = "none";

      const resultsHeader = root.querySelector("#results-header");
      const resultsTitle = root.querySelector("#results-title");
      const resultsCount = root.querySelector("#results-count");

      if (filtered.length === 0) {
        resultsContent.innerHTML = "";
        const emptyState = root.querySelector("#empty-state");
        if (emptyState) emptyState.style.display = "block";
        if (resultsHeader) resultsHeader.style.display = "none";
      } else {
        const emptyState = root.querySelector("#empty-state");
        if (emptyState) emptyState.style.display = "none";

        if (resultsHeader) resultsHeader.style.display = "flex";

        if (resultsTitle && resultsCount) {
          let searchDescription = "";

          if (searchQuery.trim()) {
            searchDescription += `"${searchQuery.trim()}"`;
          }

          if (selectedTags.length > 0) {
            if (searchQuery.trim()) searchDescription += " + ";
            if (selectedTags.length === 1) {
              searchDescription += `"${selectedTags[0]}"`;
            } else {
              const extraCount = selectedTags.length - 1;
  searchDescription += `"${selectedTags[0]}"${extraCount > 0 ? t("search.tagsCount", { count: extraCount }) : ""}`;
            }
          }

          if (!searchDescription) searchDescription = t("search.allPosts");

          resultsTitle.textContent = t("search.resultDescription", { searchDescription });
          resultsCount.textContent = t("search.items", { count: filtered.length });
        }

        resultsContent.innerHTML = filtered
          .map((post) => {
            const isF = (tag) => tag === "featured" || tag === "精选";
            const kwLower = query.toLowerCase();
            const body = String(post.body || "");
            const bodyHasMatch = fullTextSearchEnabled && !!query && body.toLowerCase().includes(kwLower);
            // Link to the first body match via a #:~:text= fragment so the post
            // page scrolls to (and highlights) the same occurrence.
            const matchedText = bodyHasMatch ? firstMatchText(body, query) : "";
            const postHref = matchedText
              ? `${routePrefix}/post/${post.id}#:~:text=${encodeURIComponent(matchedText)}`
              : `${routePrefix}/post/${post.id}`;

            // Summary: excerpt around the first body match (full-text on) vs the
            // precomputed summary (fallback to body head), each with matches highlighted.
            const summaryHtml = bodyHasMatch
              ? highlightMatches(makeBodyExcerpt(body, query), query)
              : highlightMatches(post.summary || body.slice(0, EXCERPT_LENGTH), query);

            const tagsHtml =
              post.tags && post.tags.length > 0
                ? `<div class="se--post-tags">${sortTagsList(post.tags)
                    .map((tag) => {
                      const matched = selectedTags.some((t) => String(t).toLowerCase() === String(tag).toLowerCase());
                      return `<span class="tag-display${isF(tag) ? " featured" : ""}${matched ? " match" : ""}">#${esc(isF(tag) ? featuredLabel : tag)}</span>`;
                    })
                    .join("")}</div>`
                : "";

            return `
            <article class="result-card mtl-surface interactive glowable scalable" data-post-id="${esc(String(post.id))}" data-href="${esc(postHref)}">
              <div class="s__post-header">
                <h3 class="card-post-title">${highlightMatches(post.title, query)}</h3>
                <span class="post-date">${new Date(post.date).toLocaleDateString(locale)}</span>
              </div>
              ${tagsHtml}
              <div class="post-summary">${summaryHtml}</div>
            </article>
          `;
          })
          .join("");

        resultsContent.querySelectorAll(".result-card").forEach((card) => {
          card.addEventListener("click", () => {
            const href = card.getAttribute("data-href");
            if (href) { navigateTo(href); return; }
            const postId = card.getAttribute("data-post-id");
            if (!postId) return;
            navigateTo(`${routePrefix}/post/${postId}`);
          }, { signal });
        });
      }
    } catch (error) {
      console.error("[Search] Error filtering posts:", error);
      const loadingState = root.querySelector("#loading-state");
      if (loadingState) loadingState.style.display = "none";
      const emptyState = root.querySelector("#empty-state");
      if (emptyState) emptyState.style.display = "block";
      resultsContent.innerHTML = "";
    }
  }

  function toggleTagCloud() {
    isTagCloudOpen = !isTagCloudOpen;
    syncTagTriggerState();
    updateCenteredMode();
    updateVisibility();
  }

  async function performSearch() {
    const isActive = searchQuery.trim() || isAnyTagsSelected();
    if (!isActive || isSearching) {
      if (!isActive) {
        isTagCloudOpen = false;
        updateCenteredMode();
        updateVisibility();
      }
      return;
    }

    isSearching = true;
    isTagCloudOpen = false;

    // Dismiss the suggestion panel (including its empty placeholder) so the
    // results — not a stale suggestion list — are what show next.
    hideSuggestions();

    await filterPosts();

    if (searchQuery.trim()) {
      document.title = `Search: ${searchQuery} - Chronicle`;
    } else {
      document.title = "Search - Chronicle";
    }

    isSearching = false;
  }

  // ── Suggestion (联想) logic — only active when the flag is on ──

  function hideSuggestions() {
    isSuggesting = false;
    activeSuggestionIndex = -1;
    if (suggestionList) {
      suggestionList.style.display = "none";
      suggestionList.innerHTML = "";
    }
    updateCenteredMode();
    updateVisibility();
  }

  function cancelSuggestions() {
    // Esc: revert any temporary completion back to the raw query.
    if (input) input.value = suggestionQuery;
    hideSuggestions();
  }

  function updateActiveSuggestion() {
    const items = suggestionList ? suggestionList.querySelectorAll('.suggestion-item') : [];
    items.forEach((el, i) => {
      el.classList.toggle('active', i === activeSuggestionIndex);
    });
    if (!input) return;
    const active = suggestions[activeSuggestionIndex];
    if (active && active.type === 'post') {
      input.value = active.title; // temp completion — no input event, no suggestionQuery change
    } else {
      input.value = suggestionQuery; // revert temp completion
    }
  }

  function renderSuggestions() {
    if (!suggestionList) return;
    if (suggestions.length === 0) {
      // No matches — keep the panel open with a placeholder rather than
      // collapsing it (which reads as "nothing happened").
      suggestionList.innerHTML = `<div class="suggestion-empty">${esc(t("search.suggestionEmpty"))}</div>`;
      suggestionList.style.display = 'block';
      isSuggesting = true;
      activeSuggestionIndex = -1;
      updateCenteredMode();
      updateVisibility();
      return;
    }
    const tagIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>';
    const postIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';

    suggestionList.innerHTML = suggestions.map((s, i) => {
      if (s.type === 'tag') {
        const isF = s.name === 'featured' || s.name === '精选';
        return `<div class="suggestion-item suggestion-tag${isF ? ' featured' : ''}" data-index="${i}"><span class="suggestion-kind">${tagIcon}</span><span>${esc(isF ? featuredLabel : s.name)}</span></div>`;
      }
      return `<div class="suggestion-item suggestion-post" data-index="${i}"><span class="suggestion-kind">${postIcon}</span><span>${esc(s.title)}</span></div>`;
    }).join('');
    suggestionList.style.display = 'block';
    isSuggesting = true;
    activeSuggestionIndex = -1;
    updateCenteredMode();
    updateVisibility();
  }

  async function updateSuggestions() {
    if (!searchSuggestionsEnabled) return;
    const kw = suggestionQuery.trim().toLowerCase();
    if (!kw) {
      hideSuggestions();
      return;
    }

    try {
      const light = await loadLightIndex();
      if (signal.aborted) return;

      // Tag suggestions — quick name match on the tag cloud data.
      const tagSuggestions = (_allTagData || [])
        .filter((tg) => tg.name.toLowerCase().includes(kw))
        .slice(0, 5)
        .map((tg) => ({ type: 'tag', name: tg.name, count: tg.count }));

      // Post suggestions — title match only; summary/tags/body are search
      // criteria, not suggestion criteria.
      const posts = light.filter((p) => p.status === undefined || p.status === 'published');
      const postSuggestions = posts
        .filter((p) => (p.title || '').toLowerCase().includes(kw))
        .slice(0, 5)
        .map((p) => ({ type: 'post', id: p.id, title: p.title, date: p.date }));

      suggestions = [...tagSuggestions, ...postSuggestions];
      renderSuggestions();
    } catch (e) {
      /* suggestions are best-effort */
    }
  }

  function confirmSuggestion(item) {
    if (!item) return;
    if (item.type === 'tag') {
      if (!selectedTags.includes(item.name)) {
        selectedTags.push(item.name);
        const cloudItem = root.querySelector(`.tag-cloud-item[data-tag="${CSS.escape(item.name)}"]`);
        if (cloudItem) cloudItem.classList.add('selected');
      }
      // The partial keyword was only a means to find the tag — clear it.
      searchQuery = '';
      suggestionQuery = '';
      if (input) input.value = '';
      hideSuggestions();
      renderTagChips();
      syncTagTriggerState();
      performSearch();
    } else {
      // Post — search the completed title.
      searchQuery = item.title;
      suggestionQuery = item.title;
      if (input) input.value = item.title;
      hideSuggestions();
      performSearch();
    }
  }

  if (searchSuggestionsEnabled) {
    // Capture-phase keydown on document so it runs before SearchBox's own
    // input-level Enter handler — lets us intercept Tab/Enter/Esc for suggestions.
    document.addEventListener('keydown', (e) => {
      if (!input) return;
      if (document.activeElement !== input) return;

      if (e.key === 'Tab') {
        if (isSuggesting && suggestions.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const dir = e.shiftKey ? -1 : 1;
          if (activeSuggestionIndex === -1) {
            activeSuggestionIndex = dir > 0 ? 0 : suggestions.length - 1;
          } else {
            activeSuggestionIndex = (activeSuggestionIndex + dir + suggestions.length) % suggestions.length;
          }
          updateActiveSuggestion();
        }
        return;
      }

      if (e.key === 'Enter') {
        if (isSuggesting && activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
          e.preventDefault();
          e.stopPropagation();
          confirmSuggestion(suggestions[activeSuggestionIndex]);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isSuggesting) {
          e.preventDefault();
          e.stopPropagation();
          cancelSuggestions();
        }
      }
    }, true);

    if (input) {
      // 100ms debounce so suggestions don't thrash on every keystroke.
      let suggestionDebounceTimer = null;
      const scheduleSuggestions = () => {
        if (suggestionDebounceTimer) clearTimeout(suggestionDebounceTimer);
        suggestionDebounceTimer = setTimeout(() => {
          if (signal.aborted) return;
          updateSuggestions();
        }, 100);
      };

      input.addEventListener('input', (e) => {
        // Only real user typing drives the suggestion query (programmatic
        // syncSearchBoxValue dispatches an untrusted `input` event).
        if (e && e.isTrusted === false) return;
        suggestionQuery = input.value;
        scheduleSuggestions();
      }, { signal });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (document.activeElement !== input) hideSuggestions();
        }, 150);
      }, { signal });

      if (suggestionList) {
        suggestionList.addEventListener('mouseover', (e) => {
          const itemEl = e.target.closest('.suggestion-item');
          if (!itemEl) return;
          activeSuggestionIndex = Number(itemEl.getAttribute('data-index'));
          updateActiveSuggestion();
        }, { signal });

        suggestionList.addEventListener('click', (e) => {
          const itemEl = e.target.closest('.suggestion-item');
          if (!itemEl) return;
          const item = suggestions[Number(itemEl.getAttribute('data-index'))];
          confirmSuggestion(item);
        }, { signal });
      }
    }
  }

  searchBoxRoot?.addEventListener("searchbox:submit", (event) => {
    const detail = event.detail || {};
    if (searchSuggestionsEnabled) {
      // Both button and enter honor the raw query; the suggestion layer
      // confirms completions itself via the capture keydown handler.
      searchQuery = suggestionQuery;
    } else {
      searchQuery = String(detail.query || "");
    }
    syncTagTriggerState();
    performSearch();
  }, { signal });

  searchBoxRoot?.addEventListener("searchbox:clear", () => {
    searchQuery = "";
    suggestionQuery = "";
    selectedTags = [];

    root.querySelectorAll(".tag-cloud-item.selected").forEach((item) => {
      item.classList.remove("selected");
    });

    hideSuggestions();
    syncTagTriggerState();
    renderTagChips();
    updateCenteredMode();
    updateVisibility();
    filterPosts();
  }, { signal });

  searchBoxRoot?.addEventListener("searchbox:toggle-tag-cloud", () => {
    hideSuggestions();
    toggleTagCloud();
  }, { signal });

  if (tagsGridEl) {
    tagsGridEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".tag-cloud-item");
      if (!btn) return;
      const tag = btn.getAttribute("data-tag");
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter((t) => t !== tag);
        btn.classList.remove("selected");
      } else {
        selectedTags.push(tag);
        btn.classList.add("selected");
      }
      syncTagTriggerState();
      renderTagChips();
    }, { signal });
  }

  // ── Initialize ──
  async function prime() {
    try {
      const light = await loadLightIndex();
      if (signal.aborted) return;
      _allTagData = computeAllTagData(light.filter((p) => p.status === undefined || p.status === 'published'));
      renderTagCloud();
    } catch (e) { /* tag cloud stays empty; search still works via filter */ }

    if (signal.aborted) return;
    if (parsedInitialTags.length > 0) {
      renderTagChips();
      parsedInitialTags.forEach((tag) => {
        root.querySelector(`.tag-cloud-item[data-tag="${CSS.escape(tag)}"]`)?.classList.add("selected");
      });
    }

    syncTagTriggerState();
    filterPosts();
    updateCenteredMode();
    updateVisibility();

    setTimeout(() => {
      if (!signal.aborted) initSearchFromURL();
    }, 100);

    if (initialTitle || parsedInitialTags.length > 0) {
      window.history.replaceState({}, "", `${routePrefix}/search`);
    }
    applyOverlayExternalState();
  }

  function resetExperience() {
    searchQuery = '';
    suggestionQuery = '';
    selectedTags = [];
    isTagCloudOpen = false;
    hideSuggestions();
    syncSearchBoxValue('');
    root.querySelectorAll('.tag-cloud-item.selected').forEach((el) => el.classList.remove('selected'));
    syncTagTriggerState();
    renderTagChips();
    filterPosts();
    updateCenteredMode();
    updateVisibility();
  }

  if (mode === 'page') {
    prime();
  } else {
    // Overlay: lazy-load the index on first open, and reset on close so the
    // next open starts clean. Delegated to document so it survives soft navs.
    document.addEventListener('chronicle:global-search-open', () => prime(), { signal });
    document.addEventListener('chronicle:global-search-close', () => resetExperience(), { signal });
    document.addEventListener('chronicle:search-apply', () => applyOverlayExternalState(), { signal });

    // If the overlay is already open when we (lazily) init — e.g. the user
    // pressed Cmd+K before the engine module finished loading — prime now.
    const overlay = document.querySelector('[data-global-search-overlay]');
    if (overlay && !overlay.hidden) prime();
  }
}

export function disposeAllSearchExperiences() {
  for (const c of _controllers.values()) c.abort();
  _controllers.clear();
}
