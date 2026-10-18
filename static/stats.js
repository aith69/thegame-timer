(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  const nLoss = (n) => (n === 1 ? "1 loss" : `${n} losses`);
  const maxOf = (a) => a.reduce((x, y) => Math.max(x, y), 0);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function dur(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const hh = Math.floor((s % 86400) / 3600);
    const mm = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${hh}h`;
    if (hh) return `${hh}h ${mm}m`;
    if (mm) return `${mm}m ${s % 60}s`;
    return `${s}s`;
  }

  const fmtDate = (t) => new Date(t).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  const fmtDateTime = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  // Vertical bar chart. items: [{ v, label, tip, hi }]
  function chart(id, items, caption) {
    const root = $(id);
    root.textContent = "";
    const max = Math.max(maxOf(items.map((i) => i.v)), 1);
    const cols = h("div", "cols");
    cols.style.setProperty("--n", items.length);
    const cap = h("p", "cap", caption);
    let selected = null;
    for (const it of items) {
      const col = h("button", "col" + (it.hi ? " hi" : ""));
      col.type = "button";
      col.title = it.tip;
      const plot = h("span", "plot");
      const fill = h("i", "fill");
      fill.style.height = (it.v / max) * 100 + "%";
      plot.appendChild(fill);
      col.appendChild(plot);
      col.appendChild(h("span", "x", it.label));
      col.addEventListener("click", () => {
        if (selected) selected.classList.remove("sel");
        col.classList.add("sel");
        selected = col;
        cap.textContent = it.tip;
      });
      cols.appendChild(col);
    }
    root.appendChild(cols);
    root.appendChild(cap);
  }

  function fillList(id, rows) {
    const ul = $(id);
    ul.textContent = "";
    for (const [left, right] of rows) {
      const li = h("li");
      li.appendChild(h("span", "", left));
      li.appendChild(h("span", "", right));
      ul.appendChild(li);
    }
  }

  function countChart(id, counts, labels, tipOf, hiCaption, fallbackCaption) {
    const max = maxOf(counts);
    const items = counts.map((v, i) => ({ v, label: labels[i], tip: tipOf(i, v), hi: max > 0 && v === max }));
    chart(id, items, max > 0 ? hiCaption(counts.indexOf(max), max) : fallbackCaption);
  }

  function render(events, now) {
    const losses = events.filter((e) => e.type === "lost");

    // A streak is the time between one event and the next loss.
    const streaks = [];
    let prev = null;
    for (const e of events) {
      if (prev !== null && e.type === "lost") streaks.push({ from: prev, to: e.t, len: e.t - prev });
      prev = e.t;
    }
    const current = { from: prev, to: null, len: Math.max(0, now - prev), running: true };
    const lens = streaks.map((s) => s.len);
    const record = Math.max(current.len, maxOf(lens));
    const isRecord = streaks.length > 0 && current.len >= maxOf(lens);
    const tracked = now - events[0].t;
    const perWeek = tracked >= 7 * DAY ? (losses.length / (tracked / (7 * DAY))).toFixed(1) : "–";

    // Summary tiles
    const tiles = $("tiles");
    tiles.textContent = "";
    const tileData = [
      ["Current streak", dur(current.len), isRecord ? "New record!" : "since " + fmtDate(current.from), isRecord],
      ["Record", dur(record)],
      ["Total losses", String(losses.length)],
      ["Losses per week", perWeek],
      ["Average streak", lens.length ? dur(mean(lens)) : "–"],
      ["Median streak", lens.length ? dur(median(lens)) : "–"],
      ["Shortest streak", lens.length ? dur(Math.min(...lens)) : "–"],
      ["Tracking for", dur(tracked)],
    ];
    for (const [label, value, sub, hi] of tileData) {
      const t = h("div", "tile" + (hi ? " hi" : ""));
      t.appendChild(h("span", "", label));
      t.appendChild(h("b", "", value));
      if (sub) t.appendChild(h("small", "", sub));
      tiles.appendChild(t);
    }

    // Charts (only once there is something to chart)
    const hasLosses = losses.length > 0;
    $("charts").hidden = !hasLosses;
    $("recent-sec").hidden = !hasLosses;
    $("empty").hidden = hasLosses;

    if (hasLosses) {
      const hist = [...streaks, current].slice(-30);
      chart(
        "c-streaks",
        hist.map((s) => ({
          v: s.len,
          label: "",
          hi: !!s.running,
          tip: s.running
            ? `${fmtDate(s.from)} → now: ${dur(s.len)} (running)`
            : `${fmtDate(s.from)} → ${fmtDate(s.to)}: ${dur(s.len)}`,
        })),
        "Last 30 streaks, oldest to newest. Tap a bar for details."
      );

      const byDay = new Array(7).fill(0);
      const byHour = new Array(24).fill(0);
      for (const e of losses) {
        const d = new Date(e.t);
        byDay[(d.getDay() + 6) % 7]++;
        byHour[d.getHours()]++;
      }
      countChart(
        "c-weekday", byDay, ["M", "T", "W", "T", "F", "S", "S"],
        (i, v) => `${WEEKDAYS[i]}: ${nLoss(v)}`,
        (i, v) => `Most losses on ${WEEKDAYS[i]} (${v}). Tap a bar for details.`, ""
      );
      countChart(
        "c-hour", byHour, byHour.map((_, i) => (i % 6 === 0 ? pad(i) : "")),
        (i, v) => `${pad(i)}:00–${pad(i)}:59: ${nLoss(v)}`,
        (i, v) => `Peak hour: ${pad(i)}:00 (${v}). Tap a bar for details.`, ""
      );

      const months = [];
      const base = new Date(now);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        months.push({ y: d.getFullYear(), m: d.getMonth(), n: 0 });
      }
      for (const e of losses) {
        const d = new Date(e.t);
        const slot = months.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
        if (slot) slot.n++;
      }
      const total = months.reduce((a, x) => a + x.n, 0);
      countChart(
        "c-month", months.map((x) => x.n), months.map((x) => MONTHS[x.m]),
        (i, v) => `${MONTHS[months[i].m]} ${months[i].y}: ${nLoss(v)}`,
        () => `${nLoss(total)} in the last 12 months. Tap a bar for details.`, ""
      );
    }

    // Lists
    const ranked = [...streaks, current].sort((a, b) => b.len - a.len).slice(0, 5);
    fillList(
      "top",
      ranked.map((s, i) => [
        `#${i + 1}  ${dur(s.len)}${s.running ? " (running)" : ""}`,
        `${fmtDate(s.from)} → ${s.running ? "now" : fmtDate(s.to)}`,
      ])
    );
    const lenByLoss = new Map(streaks.map((s) => [s.to, s.len]));
    fillList(
      "recent",
      losses.slice(-10).reverse().map((e) => [fmtDateTime(e.t), lenByLoss.has(e.t) ? "after " + dur(lenByLoss.get(e.t)) : ""])
    );
  }

  async function load() {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      render(data.events, data.now);
      $("err").hidden = true;
    } catch (e) {
      $("err").hidden = false;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });
  load();
})();
