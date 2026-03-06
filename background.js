// ═══════════════════════════════════════════════════════════════════════════════
// BMS TICKET SNIPER — ICC MEN'S T20 WORLD CUP 2026 FINAL
// ═══════════════════════════════════════════════════════════════════════════════

const BMS_EVENT_URL = "https://in.bookmyshow.com/sports/icc-men-s-t20-world-cup-2026-final/ET00476187";
// const BMS_EVENT_URL = "https://in.bookmyshow.com/sports/icc-men-s-t20-world-cup-2026-semi-final-1-kolkata/ET00483392";

// ═══════════════════════════════════════════════════════════════════════════════
// BMS TICKET SNIPER — ICC MEN'S T20 WORLD CUP 2026 FINAL
// ═══════════════════════════════════════════════════════════════════════════════

// const BMS_EVENT_URL = "https://in.bookmyshow.com/sports/icc-men-s-t20-world-cup-2026-final/ET00476187";

const CHECK_INTERVAL_MS = 500;  // how often to reload
const DOM_READY_WAIT_MS = 800;  // wait after page load for React to render
const FALLBACK_CHECK_MS = 4000; // fallback if onTabUpdated doesn't fire

// Words that confirm tickets are LIVE (case insensitive)
const LIVE_KEYWORDS = ["book now", "login to book", "buy now", "book ticket"];

// Words that mean NOT live — skip these even if they contain a live keyword
const DEAD_KEYWORDS = ["coming soon", "notify me", "remind me"];

// ─────────────────────────────────────────────────────────────────────────────

let watchTabId = null;
let done       = false;

console.log("[BMS] ✅ Sniper loaded");
init();

// ─── INIT ────────────────────────────────────────────────────────────────────

async function init() {
  const all      = await chrome.tabs.query({});
  const existing = all.find(t => t.url && t.url.includes("ET00476187"));

  if (existing) {
    watchTabId = existing.id;
    console.log("[BMS] Reusing tab:", watchTabId);
  } else {
    const tab  = await chrome.tabs.create({ url: BMS_EVENT_URL, active: false });
    watchTabId = tab.id;
    console.log("[BMS] Opened background tab:", watchTabId);
  }

  chrome.tabs.onUpdated.addListener(onTabUpdated);
  console.log("[BMS] Monitoring started — checking every", CHECK_INTERVAL_MS, "ms");
}

// ─── EVENT-DRIVEN LISTENER ───────────────────────────────────────────────────

function onTabUpdated(tabId, changeInfo) {
  if (done)                             return;
  if (tabId !== watchTabId)             return;
  if (changeInfo.status !== "complete") return;

  console.log("[BMS] Page ready — checking in", DOM_READY_WAIT_MS, "ms");
  setTimeout(checkAndAct, DOM_READY_WAIT_MS);
}

// ─── POLLING LOOP ────────────────────────────────────────────────────────────

async function loop() {
  if (done) return;
  console.log("[BMS] Reloading tab...");

  try {
    await chrome.tabs.reload(watchTabId, { bypassCache: true });
  } catch (e) {
    console.log("[BMS] Tab gone, reopening:", e.message);
    const tab  = await chrome.tabs.create({ url: BMS_EVENT_URL, active: false });
    watchTabId = tab.id;
  }

  setTimeout(async () => {
    if (done) return;
    await checkAndAct();
  }, FALLBACK_CHECK_MS);
}

// ─── CORE CHECK ──────────────────────────────────────────────────────────────

async function checkAndAct() {
  if (done) return;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: watchTabId },
      func:   findAndClickBookButton,
      args:   [LIVE_KEYWORDS, DEAD_KEYWORDS]
    });

    const result = results?.[0]?.result;
    console.log("[BMS] Result:", JSON.stringify(result));

    if (result?.found) {
      console.log("[BMS] 🚨 CLICKED! Text was:", result.text);
      done = true;
      await trigger();
    } else {
      console.log("[BMS] Not live yet:", result?.reason);
      setTimeout(loop, CHECK_INTERVAL_MS);
    }

  } catch (e) {
    console.log("[BMS] Inject error:", e.message);
    setTimeout(loop, 1500);
  }
}

// ─── FIND & CLICK (injected into BMS tab) ────────────────────────────────────
//
// CONFIRMED BMS STRUCTURE:
//   <a href="...">
//     <div><div><div>
//       <span>Book Now</span>   ← we just click THIS directly
//     </div></div></div>
//   </a>
//
// WHY CLICKING THE SPAN WORKS:
//   The span is inside the <a>, so clicking it bubbles up through the DOM.
//   React catches the bubbled event on the <a> and handles navigation.
//   No need to find the <a> at all — simpler = fewer failure points.
//
// We dispatch a real MouseEvent (bubbles: true) instead of .click()
// because React SPA apps use synthetic events and need real bubbling
// to trigger their onClick handlers correctly.

function findAndClickBookButton(liveKeywords, deadKeywords) {
  try {
    const spans = Array.from(document.querySelectorAll("span"));

    for (const span of spans) {
      const text      = (span.innerText || span.textContent || "").trim();
      const textLower = text.toLowerCase();

      // Must be short — real button text is under 40 chars
      if (text.length === 0 || text.length > 40) continue;

      // Must match a live keyword
      const isLive = liveKeywords.some(kw => textLower.includes(kw));
      if (!isLive) continue;

      // Must NOT match a dead keyword
      const isDead = deadKeywords.some(kw => textLower.includes(kw));
      if (isDead) continue;

      // Must be visible on screen
      const rect = span.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      // ✅ Found it — fire a real MouseEvent directly on the span
      // bubbles:true means it travels up to the <a> where React catches it
      span.dispatchEvent(new MouseEvent("click", {
        bubbles:    true,
        cancelable: true,
        view:       window,
        button:     0
      }));

      return { found: true, text, reason: "span clicked via MouseEvent" };
    }

    return { found: false, text: null, reason: "no live button span found" };

  } catch (e) {
    return { found: false, text: null, reason: "exception: " + e.message };
  }
}

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

async function trigger() {
  // 1. Focus tab — booking/queue page now loading here
  try {
    await chrome.tabs.update(watchTabId, { active: true });
    console.log("[BMS] ✅ Tab focused");
  } catch (e) {
    console.log("[BMS] ❌ Focus error:", e.message);
  }

  // 2. Desktop notification
  try {
    chrome.notifications.create("bms-final-alert", {
      type:     "basic",
      iconUrl:  "icon.png",
      title:    "🚨 ICC FINAL TICKETS LIVE!",
      message:  "Clicked! Leave the tab open — it will auto-redirect to seat selection.",
      priority: 2
    });
    console.log("[BMS] ✅ Notification sent");
  } catch (e) {
    console.log("[BMS] ❌ Notification error:", e.message);
  }

  // 3. Audio last — click is already done above
  await playViaOffscreen();
}

// ─── AUDIO ───────────────────────────────────────────────────────────────────

async function playViaOffscreen() {
  const mp3Url = chrome.runtime.getURL("hello.mp3");

  try {
    await chrome.offscreen.createDocument({
      url:           "offscreen.html",
      reasons:       ["AUDIO_PLAYBACK"],
      justification: "Alert when ICC Final tickets go live"
    });
  } catch (e) {
    // Already exists — fine
  }

  chrome.runtime.sendMessage({ type: "PLAY_AUDIO", url: mp3Url });
  console.log("[BMS] 🔊 Alarm triggered");
}