const toggleButton = document.querySelector("#toggle");
const stateLabel = document.querySelector("#state");
const hintLabel = document.querySelector("#hint");
const statusDot = document.querySelector("#status-dot");
const message = document.querySelector("#message");
const bannerSwatches = [...document.querySelectorAll(".banner-swatch")];
const defaultBannerColor = "#4b7ca8";
let bannerColor = defaultBannerColor;

let activeTabId;
let activeOrigin;
let activeOriginPattern;

function setEnabled(enabled) {
  toggleButton.setAttribute("aria-pressed", String(enabled));
  stateLabel.textContent = enabled ? "Dark theme is on" : "Dark theme is off";
  hintLabel.textContent = enabled ? "Theme stays on for this site." : "Turn it on to keep the theme on this site.";
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
    func: setPageTheme
  });
}

async function applyThemeToTab(tabId, courseBannerColor = bannerColor) {
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ["theme.css"]
  });
  await updatePageEnhancements(tabId, true, courseBannerColor);
}

async function updatePersistentSiteScript(type) {
  return browser.runtime.sendMessage({ type, origin: activeOrigin });
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
    const url = new URL(tab.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("This page cannot be themed.");
    activeOrigin = url.origin;
    activeOriginPattern = `${url.protocol}//${url.hostname}/*`;

    const saved = await browser.storage.local.get({ enabledOrigins: [] });
    const savedForSite = saved.enabledOrigins.includes(activeOrigin);
    const hasSitePermission = savedForSite && await browser.permissions.contains({ origins: [activeOriginPattern] });
    if (hasSitePermission) await updatePersistentSiteScript("register-theme-site");
    const enabled = hasSitePermission || await readState(activeTabId);
    setEnabled(enabled);
    if (hasSitePermission && !(await readState(activeTabId))) {
      await applyThemeToTab(activeTabId, bannerColor);
    } else if (enabled) {
      await applyBannerColor(activeTabId);
    }
  } catch {
    toggleButton.disabled = true;
    stateLabel.textContent = "This page can’t be themed";
    hintLabel.textContent = "Open Blackboard Learn in a regular web tab.";
    message.textContent = "Firefox protects browser pages and some private tabs from extensions.";
  }
}

toggleButton.addEventListener("click", async () => {
  if (!activeTabId || !activeOrigin || !activeOriginPattern) return;

  toggleButton.disabled = true;
  message.textContent = "";

  try {
    const enabled = toggleButton.getAttribute("aria-pressed") === "true";
    if (enabled) {
      const saved = await browser.storage.local.get({ enabledOrigins: [] });
      await browser.storage.local.set({
        enabledOrigins: saved.enabledOrigins.filter((origin) => origin !== activeOrigin)
      });
      await updatePersistentSiteScript("unregister-theme-site").catch(() => {});
      await updatePageEnhancements(activeTabId, false);
      await browser.scripting.removeCSS({
        target: { tabId: activeTabId },
        files: ["theme.css"]
      });
      setEnabled(false);
    } else {
      const granted = await browser.permissions.request({ origins: [activeOriginPattern] });
      if (!granted) {
        message.textContent = "Allow access to this site so the theme can stay on after you navigate.";
        return;
      }
      const saved = await browser.storage.local.get({ enabledOrigins: [] });
      await browser.storage.local.set({
        enabledOrigins: [...new Set([...saved.enabledOrigins, activeOrigin])]
      });
      const registered = await updatePersistentSiteScript("register-theme-site");
      if (!registered) throw new Error("Could not register the site theme script.");
      await applyThemeToTab(activeTabId, bannerColor);
      setEnabled(true);
    }
  } catch {
    message.textContent = "Couldn’t keep the theme on for this site. Try refreshing Blackboard and clicking again.";
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
