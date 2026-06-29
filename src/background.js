chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_COOKIES") {
    handleGetCookies(message, sendResponse);
    return true;
  }
  if (message.type === "SET_COOKIE") {
    handleSetCookie(message, sendResponse);
    return true;
  }
  if (message.type === "DELETE_COOKIE") {
    handleDeleteCookie(message, sendResponse);
    return true;
  }
  if (message.type === "CHECK_PERMISSION") {
    handleCheckPermission(message, sendResponse);
    return true;
  }
  if (message.type === "REQUEST_PERMISSION") {
    handleRequestPermission(message, sendResponse);
    return true;
  }
});

async function handleCheckPermission(message, sendResponse) {
  try {
    const hasCookies = await chrome.permissions.contains({ permissions: ["cookies"] });
    const hasAllUrls = await chrome.permissions.contains({ origins: ["<all_urls>"] });
    const hasCurrentSite = message.url
      ? await chrome.permissions.contains({ origins: [new URL(message.url).origin + "/*"] })
      : false;

    sendResponse({ hasCookies, hasAllUrls, hasCurrentSite });
  } catch (e) {
    sendResponse({ hasCookies: false, hasAllUrls: false, hasCurrentSite: false });
  }
}

async function handleRequestPermission(message, sendResponse) {
  try {
    const permsToRequest = { permissions: ["cookies"] };

    if (message.scope === "all") {
      permsToRequest.origins = ["<all_urls>"];
    } else if (message.scope === "site" && message.url) {
      permsToRequest.origins = [new URL(message.url).origin + "/*"];
    }

    const granted = await chrome.permissions.request(permsToRequest);
    sendResponse({ granted });
  } catch (e) {
    sendResponse({ granted: false, error: e.message });
  }
}

async function handleGetCookies(message, sendResponse) {
  try {
    const details = {};
    if (message.url) details.url = message.url;
    const cookies = await chrome.cookies.getAll(details);
    sendResponse({ cookies });
  } catch (e) {
    sendResponse({ cookies: [], error: e.message });
  }
}

async function handleSetCookie(message, sendResponse) {
  try {
    const cookie = await chrome.cookies.set(message.cookie);
    sendResponse({ success: true, cookie });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleDeleteCookie(message, sendResponse) {
  try {
    await chrome.cookies.remove({ url: message.url, name: message.name });
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}
