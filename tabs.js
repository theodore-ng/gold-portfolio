// Tab chính theo hash (#portfolio, #market, #strategy, #execution, #account): nút Back và link chia sẻ vẫn hoạt động.
// Mỗi tab có mục con (.subnav button[data-sub] ↔ .subpage[data-sub]); mục con đang mở được nhớ theo từng tab.
(() => {
  const SUB_KEY = "quyvang_sub";
  const panels = [...document.querySelectorAll(".panel[data-tab]")];
  const ids = panels.map((p) => p.dataset.tab);
  const panelOf = (id) => panels.find((p) => p.dataset.tab === id);
  // Hash của bố cục cũ (trước 11/2026) → tab mới, để link/bookmark cũ vẫn mở đúng chỗ
  const OLD = { info: "market", assets: "portfolio", me: "portfolio", about: "account" };
  let subs = {};
  try { subs = JSON.parse(localStorage.getItem(SUB_KEY)) || {}; } catch { /* bỏ qua */ }

  function showSub(panel, name) {
    const secs = [...panel.querySelectorAll(":scope > .subpage[data-sub]")];
    if (!secs.length) return;
    if (!secs.some((s) => s.dataset.sub === name)) name = secs[0].dataset.sub;
    secs.forEach((s) => (s.hidden = s.dataset.sub !== name));
    panel.querySelectorAll(":scope > .subnav button").forEach((b) => b.classList.toggle("on", b.dataset.sub === name));
    subs[panel.dataset.tab] = name;
    try { localStorage.setItem(SUB_KEY, JSON.stringify(subs)); } catch { /* bỏ qua */ }
  }

  function show(id) {
    if (OLD[id]) { id = OLD[id]; history.replaceState(null, "", "#" + id); }
    if (!ids.includes(id)) id = ids[0];
    panels.forEach((p) => (p.hidden = p.dataset.tab !== id));
    document.querySelectorAll("#tabbar a").forEach((a) => a.classList.toggle("on", a.hash === "#" + id));
    showSub(panelOf(id), subs[id]);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".subnav button[data-sub]");
    if (b) { showSub(b.closest(".panel"), b.dataset.sub); scrollTo(0, 0); return; }

    const a = e.target.closest('a[href^="#"]');
    if (!a || !ids.includes(a.hash.slice(1))) return;
    e.preventDefault();
    if (a.hash !== location.hash) history.pushState(null, "", a.hash);
    show(a.hash.slice(1));
    // Link nhanh (data-focus): mở đúng mục con chứa phần tử, cuộn tới và đặt con trỏ vào ô đầu.
    const f = a.dataset.focus && document.getElementById(a.dataset.focus);
    const sec = f?.closest(".subpage[data-sub]");
    if (sec) showSub(sec.closest(".panel"), sec.dataset.sub);
    if (f) {
      for (let d = f.closest("details"); d; d = d.parentElement.closest("details")) d.open = true;
      f.scrollIntoView({ behavior: "smooth", block: "start" });
      f.querySelector("input:not([type=date]), select")?.focus({ preventScroll: true });
    } else scrollTo(0, 0);
  });
  addEventListener("popstate", () => show(location.hash.slice(1)));
  show(location.hash.slice(1));

  // Khối thu gọn (details[data-k]): nhớ đóng/mở trên máy; mở ra thì vẽ lại biểu đồ bên trong cho đúng kích thước.
  const OPEN_KEY = "quyvang_open";
  let opened = {};
  try { opened = JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { /* bỏ qua */ }
  document.querySelectorAll("details[data-k]").forEach((d) => {
    const k = d.dataset.k;
    if (k in opened) d.open = !!opened[k];
    d.addEventListener("toggle", () => {
      opened[k] = d.open;
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(opened)); } catch { /* bỏ qua */ }
      if (d.open) d.querySelectorAll("canvas").forEach((c) => window.Chart?.getChart(c)?.resize());
    });
  });

  // Phiên bản = tham số ?v= của style.css (tăng mỗi lần deploy).
  const v = document.querySelector('link[href*="style.css"]')?.getAttribute("href").match(/v=([\w.-]+)/);
  if (v) document.getElementById("appVer").textContent = v[1];
})();
