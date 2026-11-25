/* Aparência personalizada (nome, logo, cores, fundo do login). Usado pelo login e pela dashboard. */
(() => {
  const KEY = "hm.brand";
  const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c || "");
  function apply(b) {
    if (!b) return;
    window.BRAND = b;
    const root = document.documentElement;
    if (!localStorage.getItem("hm.theme") && b.default_theme && b.default_theme !== "system") root.dataset.theme = b.default_theme;
    let st = document.getElementById("brand-style");
    if (!st) { st = document.createElement("style"); st.id = "brand-style"; document.head.append(st); }
    const a = hexOk(b.accent) ? b.accent : "#116a67";
    const ad = hexOk(b.accent_dark) ? b.accent_dark : `color-mix(in srgb, ${a} 62%, #ffffff)`;
    const darkVars = `--accent: ${ad}; --accent-soft: color-mix(in srgb, ${ad} 18%, #171d1a); --s1: ${ad};`;
    st.textContent = `:root { --accent: ${a}; --accent-soft: color-mix(in srgb, ${a} 15%, #ffffff); --s1: ${a}; }
      @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${darkVars} } }
      :root[data-theme="dark"] { ${darkVars} }`;
    document.title = document.body?.classList.contains("login-body") ? `${b.login_title || "Entrar"} · ${b.app_name}` : b.app_name;
    if (b.logo) {
      let ic = document.querySelector('link[rel="icon"]');
      if (!ic) { ic = document.createElement("link"); ic.rel = "icon"; document.head.append(ic); }
      ic.href = b.logo;
    }
    document.querySelectorAll("[data-brand-name]").forEach((el) => (el.textContent = b.app_name));
    document.querySelectorAll("[data-brand-logo]").forEach((el) => {
      if (b.logo) {
        el.innerHTML = `<img src="${b.logo}" alt="" class="brand-img ${b.logo_round ? "round" : ""}">`;
      } else if (el.dataset.orig) el.innerHTML = el.dataset.orig;
    });
    const login = document.querySelector(".login-body");
    if (login) {
      const msg = document.querySelector("[data-brand-msg]");
      if (msg && !document.getElementById("intro")?.offsetParent) msg.textContent = b.login_message || "";
      const t = document.getElementById("title");
      if (t && !t.dataset.locked) t.textContent = b.login_title || "Entrar";
      login.style.background = b.login_bg === "color" && hexOk(b.bg_color) ? b.bg_color
        : b.login_bg === "gradient" ? `linear-gradient(135deg, ${b.bg_color}, ${b.bg_color2})`
        : b.login_bg === "image" && b.bg_image ? `center / cover no-repeat url("${b.bg_image}"), ${b.bg_color}` : "";
      const rack = document.querySelector(".login-rack");
      if (rack) rack.hidden = b.show_rack === false;
      document.querySelector(".login-card")?.classList.toggle("no-rack", b.show_rack === false);
    }
  }
  document.querySelectorAll("[data-brand-logo]").forEach((el) => (el.dataset.orig = el.innerHTML));
  try { apply(JSON.parse(localStorage.getItem(KEY))); } catch { /* sem cache */ }
  window.applyBrand = (b) => { localStorage.setItem(KEY, JSON.stringify(b)); apply(b); };
  fetch("/api/branding", { cache: "no-store" }).then((r) => r.ok && r.json()).then((b) => b && window.applyBrand(b)).catch(() => {});
})();
