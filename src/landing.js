document.addEventListener("DOMContentLoaded", () => {
  setupBurger();
  setupHeaderOnScroll();
  setupArtStrip();
  setupHeroSlider();
});

function setupBurger() {
  const burger = document.getElementById("landing-burger");
  const menu = document.getElementById("landing-menu");
  const setOpen = (open) => {
    menu.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  };
  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!menu.classList.contains("is-open"));
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

function setupHeaderOnScroll() {
  const header = document.querySelector(".landing-header");
  const update = () => header.classList.toggle("is-visible", window.scrollY > 160);
  window.addEventListener("scroll", update, { passive: true });
  update();
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function setupArtStrip() {
  const strip = document.getElementById("art-strip");
  const works = shuffled(await loadAllArtworks());
  if (!works.length) {
    strip.closest(".home-art-section").classList.add("d-none");
    return;
  }

  const tile = (w, eager) => `
    <a href="${artworkPageUrl(w.id)}" aria-label="${escapeHtml(w.title || "Kunstwerk")}">
      <img src="${escapeHtml(w.thumb_url || w.image_url)}" alt="${escapeHtml(w.title || "")}" ${eager ? "" : 'loading="lazy" '}decoding="async">
    </a>`;
  const FIRST = 6;
  strip.innerHTML = works.slice(0, FIRST).map((w) => tile(w, true)).join("");
  const appendRest = () => strip.insertAdjacentHTML("beforeend", works.slice(FIRST).map((w) => tile(w, false)).join(""));
  const firstImgs = Array.from(strip.querySelectorAll("img"));
  Promise.all(firstImgs.map((im) => im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; })))
    .then(() => (window.requestIdleCallback ? requestIdleCallback(appendRest, { timeout: 1500 }) : setTimeout(appendRest, 300)));

  const step = () => {
    const first = strip.firstElementChild;
    return first ? first.getBoundingClientRect().width + 16 : 300;
  };
  const scrollByItems = (dir) => {
    const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
    if (dir > 0 && atEnd) strip.scrollTo({ left: 0, behavior: "smooth" });
    else strip.scrollBy({ left: dir * step() * 2, behavior: "smooth" });
  };

  let timer = null;
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => scrollByItems(1), 4500);
  };

  document.getElementById("strip-prev").addEventListener("click", () => { scrollByItems(-1); restart(); });
  document.getElementById("strip-next").addEventListener("click", () => { scrollByItems(1); restart(); });
  strip.addEventListener("mouseenter", () => clearInterval(timer));
  strip.addEventListener("mouseleave", restart);
  strip.addEventListener("touchstart", () => clearInterval(timer), { passive: true });
  restart();
}

async function setupHeroSlider() {
  const root = document.getElementById("hero-slider");
  let posts = [];
  const client = getSupabase();
  if (client) {
    const { data } = await client
      .from("blog_posts")
      .select("slug,title,excerpt,subtitle,cover_image_path")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(6);
    posts = data || [];
  }

  const slides = posts.length
    ? posts.map((p) => ({
      title: p.title,
      text: p.excerpt || p.subtitle || "",
      href: `/politik/artikel.html?slug=${encodeURIComponent(p.slug)}`,
      cta: "Weiterlesen",
      img: p.cover_image_path ? storagePublicUrl("blog-images", p.cover_image_path) : "",
    }))
    : [{ title: "Beiträge & Gedanken", text: "Hier erscheinen meine neuesten Beiträge.", href: "/politik/", cta: "Zur Politik", img: "" }];

  root.innerHTML = `
    <div class="hero-track">
      ${slides.map((sl, i) => `
        <div class="hero-slide${i === 0 ? " is-active" : ""}" style="${sl.img ? `background-image:url('${escapeHtml(sl.img)}')` : ""}">
          <div class="hero-slide-overlay"></div>
          <div class="hero-slide-content">
            <h3>${escapeHtml(sl.title)}</h3>
            ${sl.text ? `<p>${escapeHtml(sl.text)}</p>` : ""}
            <a href="${escapeHtml(sl.href)}" class="hero-slide-btn">${escapeHtml(sl.cta)}</a>
          </div>
        </div>`).join("")}
    </div>
    ${slides.length > 1 ? `
      <button type="button" class="hero-btn hero-prev" aria-label="Zurück">‹</button>
      <button type="button" class="hero-btn hero-next" aria-label="Weiter">›</button>
      <div class="hero-dots">${slides.map((_, i) => `<span class="${i === 0 ? "is-active" : ""}"></span>`).join("")}</div>` : ""}`;

  if (slides.length < 2) return;
  const els = Array.from(root.querySelectorAll(".hero-slide"));
  const dots = Array.from(root.querySelectorAll(".hero-dots span"));
  let cur = 0;
  let timer = null;
  const show = (i) => {
    cur = (i + els.length) % els.length;
    els.forEach((e, idx) => e.classList.toggle("is-active", idx === cur));
    dots.forEach((d, idx) => d.classList.toggle("is-active", idx === cur));
  };
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => show(cur + 1), 6500);
  };
  root.querySelector(".hero-prev").addEventListener("click", () => { show(cur - 1); restart(); });
  root.querySelector(".hero-next").addEventListener("click", () => { show(cur + 1); restart(); });
  dots.forEach((d, idx) => d.addEventListener("click", () => { show(idx); restart(); }));
  root.addEventListener("mouseenter", () => clearInterval(timer));
  root.addEventListener("mouseleave", restart);
  restart();
}
