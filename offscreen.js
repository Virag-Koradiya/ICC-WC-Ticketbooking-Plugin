chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PLAY_AUDIO") {
    const audio = new Audio(msg.url);
    audio.volume = 1.0;
    audio.loop = true;
    audio.play()
      .then(() => console.log("[OFFSCREEN] Playing audio ✅"))
      .catch(e => console.log("[OFFSCREEN] Play failed:", e.message));
  }
});