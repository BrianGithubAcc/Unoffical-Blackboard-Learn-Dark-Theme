function setPageTheme(shouldEnable, color, tint, shadeTint) {
  const stateKey = "__bbDarkThemeEnhancements";
  const existing = window[stateKey];
  const headingSelector = "h1, h2, h3, h4, h5, h6, [class*='title'], [class*='Title']";
  const candidateSelector = `${headingSelector}, img`;

  if (!shouldEnable) {
    existing?.observer?.disconnect();
    if (existing?.scheduledFrame) cancelAnimationFrame(existing.scheduledFrame);
    if (existing?.initialScanTimer) clearTimeout(existing.initialScanTimer);
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
  if (existing?.initialScanTimer) clearTimeout(existing.initialScanTimer);
  const state = {
    colors: existing?.colors ?? new Map(),
    observer: null,
    scheduledFrame: 0,
    initialScanTimer: 0,
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

  // Let the base theme paint first; heading and logo refinements can follow.
  state.initialScanTimer = window.setTimeout(() => {
    state.initialScanTimer = 0;
    if (document.documentElement.dataset.bbDarkTheme !== "on") return;
    queueRoot(document.body ?? document.documentElement);
    scheduleWork();
  }, 0);
}
