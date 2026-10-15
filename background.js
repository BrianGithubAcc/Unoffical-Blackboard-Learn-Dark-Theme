const defaultBannerColor = "#4b7ca8";

function sitePattern(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) return null;
  return `${parsed.protocol}//${parsed.hostname}/*`;
}

function bannerColorWithAlpha(color, alpha) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function shadeBannerColor(color) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `#${channels.map((channel) => Math.round(channel * 0.48).toString(16).padStart(2, "0")).join("")}`;
}

async function applySavedTheme(tabId, pageUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    return;
  }

  const pattern = sitePattern(pageUrl);
  if (!pattern) return;

  const saved = await browser.storage.local.get({ enabledOrigins: [], bannerColor: defaultBannerColor });
  if (!saved.enabledOrigins.includes(parsedUrl.origin)) return;
  if (!(await browser.permissions.contains({ origins: [pattern] }))) return;

  const color = /^#[\da-f]{6}$/i.test(saved.bannerColor) ? saved.bannerColor : defaultBannerColor;
  const shade = shadeBannerColor(color);
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ["theme.css"]
  });
  await browser.scripting.executeScript({
    target: { tabId },
    args: [true, color, bannerColorWithAlpha(color, 0.82), bannerColorWithAlpha(shade, 0.78)],
    func: setPageTheme
  });
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  applySavedTheme(tabId, tab.url).catch(() => {});
});

async function restoreOpenTabs() {
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (!tab.id || !tab.url) return Promise.resolve();
    return applySavedTheme(tab.id, tab.url).catch(() => {});
  }));
}

browser.runtime.onStartup.addListener(restoreOpenTabs);
browser.runtime.onInstalled.addListener(restoreOpenTabs);
