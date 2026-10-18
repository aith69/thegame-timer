(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");

  let since = null; // timestamp (ms) of the last loss, server clock
  let offset = 0;   // server clock - device clock, so a wrong device clock doesn't matter

  function render() {
    if (since === null) return;
    const s = Math.max(0, Math.floor((Date.now() + offset - since) / 1000));
    $("d").textContent = Math.floor(s / 86400);
    $("h").textContent = pad(Math.floor((s % 86400) / 3600));
    $("m").textContent = pad(Math.floor((s % 3600) / 60));
    $("s").textContent = pad(s % 60);
  }

  // Re-render right after each second boundary instead of polling.
  function tick() {
    render();
    const elapsed = since === null ? 0 : Date.now() + offset - since;
    setTimeout(tick, 1000 - (((elapsed % 1000) + 1000) % 1000) + 20);
  }

  function apply(state) {
    offset = state.now - Date.now();
    since = state.since;
    $("since").textContent =
      "Since " + new Date(since).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    $("err").hidden = true;
    render();
  }

  async function load() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      apply(await res.json());
    } catch (e) {
      $("err").hidden = false;
    }
  }

  $("lost").addEventListener("click", async () => {
    if (!confirm("Lost The Game? The timer will be reset.")) return;
    const button = $("lost");
    button.disabled = true;
    try {
      const res = await fetch("/api/lost", { method: "POST", headers: { "X-Requested-With": "thegame" } });
      if (!res.ok) throw new Error(res.status);
      apply(await res.json());
    } catch (e) {
      alert("Can't reach the server. Nothing was saved.");
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });

  load();
  tick();
})();
