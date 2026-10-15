const toggleButton = document.querySelector("#toggle");
const stateLabel = document.querySelector("#state");
const hintLabel = document.querySelector("#hint");
const statusDot = document.querySelector("#status-dot");
const message = document.querySelector("#message");
const bannerSwatches = [...document.querySelectorAll(".banner-swatch")];
const defaultBannerColor = "#4b7ca8";
let bannerColor = defaultBannerColor;

let activeTabId;

function setEnabled(enabled) {
  toggleButton.setAttribute("aria-pressed", String(enabled));
  stateLabel.textContent = enabled ? "Dark theme is on" : "Dark theme is off";
  hintLabel.textContent = enabled ? "This tab is wearing its night colors." : "Theme applies only to the current tab.";
  statusDot.classList.toggle("is-on", enabled);
}

function showBannerColor() {
  for (const swatch of bannerSwatches) {
    const color = swatch.dataset.color;
    swatch.style.setProperty("--swatch-color", color);
    swatch.setAttribute("aria-pressed", String(color.toLowerCase() === bannerColor.toLowerCase()));
  }
}

async function readState(tabId) {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement?.dataset.bbDarkTheme === "on"
  });
  return Boolean(results[0]?.result);
}

function shadeBannerColor(color) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `#${channels.map((channel) => Math.round(channel * 0.48).toString(16).padStart(2, "0")).join("")}`;
}

function bannerColorWithAlpha(color, alpha) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

async function applyBannerColor(tabId) {
  if (!tabId || !(await readState(tabId))) return;
  const shade = shadeBannerColor(bannerColor);
  await browser.scripting.executeScript({
    target: { tabId },
    args: [bannerColor, bannerColorWithAlpha(bannerColor, 0.82), bannerColorWithAlpha(shade, 0.78)],
    func: (color, tint, shadeTint) => {
      document.documentElement.style.setProperty("--bb-course-banner-color", color);
      document.documentElement.style.setProperty("--bb-course-banner-tint", tint);
      document.documentElement.style.setProperty("--bb-course-banner-shade-tint", shadeTint);
    }
  });
}

async function updatePageEnhancements(tabId, enabled, courseBannerColor = bannerColor) {
  const shade = shadeBannerColor(courseBannerColor);
  await browser.scripting.executeScript({
    target: { tabId },
    args: [enabled, courseBannerColor, bannerColorWithAlpha(courseBannerColor, 0.82), bannerColorWithAlpha(shade, 0.78)],
    func: (shouldEnable, color, tint, shadeTint) => {
      const stateKey = "__bbDarkThemeEnhancements";
      const existing = window[stateKey];
      const headingSelector = "h1, h2, h3, h4, h5, h6, [class*='title'], [class*='Title']";
      const candidateSelector = `${headingSelector}, img`;

      if (!shouldEnable) {
        existing?.observer?.disconnect();
        if (existing?.scheduledFrame) cancelAnimationFrame(existing.scheduledFrame);
        for (const [element, [originalColor, originalPriority]] of existing?.colors ?? []) {
          if (!element.isConnected) continue;
          if (originalColor) element.style.setProperty("color", originalColor, originalPriority);
          else element.style.removeProperty("color");
        }
        document.querySelectorAll('[data-bb-dark-logo="on"]').forEach((image) => {
          image.removeAttribute("data-bb-dark-logo");
        });
        document.documentElement.style.removeProperty("--bb-course-banner-color");
        document.documentElement.style.removeProperty("--bb-course-banner-tint");
        document.documentElement.style.removeProperty("--bb-course-banner-shade-tint");
        delete window[stateKey];
        delete document.documentElement.dataset.bbDarkTheme;
        return;
      }

      document.documentElement.dataset.bbDarkTheme = "on";
      document.documentElement.style.setProperty("--bb-course-banner-color", color);
      document.documentElement.style.setProperty("--bb-course-banner-tint", tint);
      document.documentElement.style.setProperty("--bb-course-banner-shade-tint", shadeTint);
      existing?.observer?.disconnect();
      if (existing?.scheduledFrame) cancelAnimationFrame(existing.scheduledFrame);
      const state = {
        colors: existing?.colors ?? new Map(),
        observer: null,
        scheduledFrame: 0,
        pendingRoots: new Set(),
        pendingHeadings: new Set(),
        pendingRemoved: new Set()
      };

      const processHeadings = (headings) => {
        const corrections = [];
        for (const element of headings) {
          if (!element.isConnected) continue;
          const color = getComputedStyle(element).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (!color || (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000 > 135) continue;
          if (!state.colors.has(element)) {
            state.colors.set(element, [element.style.getPropertyValue("color"), element.style.getPropertyPriority("color")]);
          }
          corrections.push(element);
        }
        for (const element of corrections) element.style.setProperty("color", "#e7edf2", "important");
      };

      const processImages = (images) => {
        const textCache = new WeakMap();
        const textFor = (element) => {
          if (!textCache.has(element)) textCache.set(element, (element.textContent || "").trim());
          return textCache.get(element);
        };

        for (const image of images) {
          if (!image.isConnected || image.dataset.bbDarkLogo === "on") continue;
          const metadata = `${image.alt} ${image.title} ${image.className} ${image.currentSrc}`;
          if (/panopto|lecture[\s_-]*recording/i.test(metadata)) {
            image.dataset.bbDarkLogo = "on";
            continue;
          }
          let parent = image.parentElement;
          for (let level = 0; parent && level < 5; level += 1, parent = parent.parentElement) {
            const text = textFor(parent);
            if (text.length > 260) break;
            if (/lecture recordings/i.test(text)) {
              image.dataset.bbDarkLogo = "on";
              break;
            }
          }
        }
      };

      const collectCandidates = (root, headings, images) => {
        if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        const add = (element) => {
          if (element.tagName.toLowerCase() === "img") images.add(element);
          else headings.add(element);
        };
        if (root.nodeType === Node.ELEMENT_NODE && root.matches(candidateSelector)) add(root);
        root.querySelectorAll(candidateSelector).forEach(add);
      };

      const queueRoot = (root) => {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        for (let parent = root.parentElement; parent; parent = parent.parentElement) {
          if (state.pendingRoots.has(parent)) return;
        }
        for (const queued of state.pendingRoots) {
          if (root.contains(queued)) state.pendingRoots.delete(queued);
        }
        state.pendingRoots.add(root);
      };

      const queueLectureContext = (start) => {
        for (let context = start, level = 0; context && level < 5; context = context.parentElement, level += 1) {
          const text = (context.textContent || "").trim();
          if (text.length > 260) break;
          if (/lecture recordings/i.test(text)) {
            queueRoot(context);
            return;
          }
        }
      };

      const queueTextChange = (textNode) => {
        const parent = textNode.parentElement;
        if (!parent) return;
        const heading = parent.closest(headingSelector);
        if (heading) state.pendingHeadings.add(heading);
        if (/lecture[\s_-]*recording/i.test(textNode.data || "")) queueLectureContext(parent);
      };

      const restoreRemovedHeadings = (root) => {
        const removedHeadings = new Set();
        if (root.matches?.(headingSelector)) removedHeadings.add(root);
        root.querySelectorAll?.(headingSelector).forEach((element) => removedHeadings.add(element));
        for (const element of removedHeadings) {
          if (element.isConnected || !state.colors.has(element)) continue;
          const [originalColor, originalPriority] = state.colors.get(element);
          if (originalColor) element.style.setProperty("color", originalColor, originalPriority);
          else element.style.removeProperty("color");
          state.colors.delete(element);
        }
      };

      const scheduleWork = () => {
        if (state.scheduledFrame) return;
        state.scheduledFrame = requestAnimationFrame(() => {
          state.scheduledFrame = 0;
          if (document.documentElement.dataset.bbDarkTheme !== "on") return;

          for (const root of state.pendingRemoved) restoreRemovedHeadings(root);
          state.pendingRemoved.clear();

          const headings = new Set(state.pendingHeadings);
          const images = new Set();
          for (const root of state.pendingRoots) {
            if (root.isConnected) collectCandidates(root, headings, images);
          }
          state.pendingHeadings.clear();
          state.pendingRoots.clear();

          processHeadings(headings);
          processImages(images);
        });
      };

      const initialHeadings = new Set();
      const initialImages = new Set();
      collectCandidates(document.body ?? document.documentElement, initialHeadings, initialImages);
      processHeadings(initialHeadings);
      processImages(initialImages);

      state.observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "characterData") {
            queueTextChange(record.target);
            continue;
          }
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
              queueRoot(node);
              if (node.nodeType === Node.ELEMENT_NODE && node.childElementCount === 0 &&
                  /lecture[\s_-]*recording/i.test(node.textContent || "")) {
                queueLectureContext(node.parentElement ?? node);
              }
            } else if (node.nodeType === Node.TEXT_NODE) {
              queueTextChange(node);
            }
          }
          for (const node of record.removedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) state.pendingRemoved.add(node);
          }
        }
        if (state.pendingRoots.size || state.pendingHeadings.size || state.pendingRemoved.size) scheduleWork();
      });
      state.observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
      window[stateKey] = state;
    }
  });
}

async function initialize() {
  try {
    const saved = await browser.storage.local.get({ bannerColor: defaultBannerColor });
    if (/^#[\da-f]{6}$/i.test(saved.bannerColor)) bannerColor = saved.bannerColor;
  } catch {
    // The default palette remains available if local storage cannot be read.
  }
  if (!bannerSwatches.some((swatch) => swatch.dataset.color.toLowerCase() === bannerColor.toLowerCase())) {
    bannerColor = defaultBannerColor;
  }
  showBannerColor();

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    activeTabId = tab.id;
    const enabled = await readState(activeTabId);
    setEnabled(enabled);
    if (enabled) await applyBannerColor(activeTabId);
  } catch {
    toggleButton.disabled = true;
    stateLabel.textContent = "This page can’t be themed";
    hintLabel.textContent = "Open Blackboard Learn in a regular web tab.";
    message.textContent = "Firefox protects browser pages and some private tabs from extensions.";
  }
}

toggleButton.addEventListener("click", async () => {
  if (!activeTabId) return;

  toggleButton.disabled = true;
  message.textContent = "";

  try {
    const enabled = await readState(activeTabId);
    if (enabled) {
      await updatePageEnhancements(activeTabId, false);
      await browser.scripting.removeCSS({
        target: { tabId: activeTabId },
        files: ["theme.css"]
      });
      setEnabled(false);
    } else {
      await browser.scripting.insertCSS({
        target: { tabId: activeTabId },
        files: ["theme.css"]
      });
      await updatePageEnhancements(activeTabId, true, bannerColor);
      setEnabled(true);
    }
  } catch {
    message.textContent = "Couldn’t style this tab. Try refreshing Blackboard and clicking again.";
  } finally {
    toggleButton.disabled = false;
  }
});

async function saveAndApplyBannerColor(color) {
  bannerColor = color;
  showBannerColor();
  try {
    await Promise.all([
      browser.storage.local.set({ bannerColor }),
      applyBannerColor(activeTabId)
    ]);
  } catch {
    message.textContent = "Couldn’t save the banner color. Try reloading the extension.";
  }
}

for (const swatch of bannerSwatches) {
  swatch.addEventListener("click", () => saveAndApplyBannerColor(swatch.dataset.color));
}

initialize();
