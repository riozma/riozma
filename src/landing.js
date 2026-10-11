document.addEventListener("DOMContentLoaded", () => {
  setupBurger();
  setupCarousel();
  loadPolitikCards();
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

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function setupCarousel() {
  const track = document.getElementById("home-carousel-track");
  const caption = document.getElementById("carousel-caption");
  const carousel = document.getElementById("home-carousel");
  const works = shuffled(await loadAllArtworks());
  if (!works.length) {
    carousel.classList.add("d-none");
    return;
  }

  track.innerHTML = works.map((w, i) => `
    <a class="home-slide${i === 0 ? " is-active" : ""}" href="${artworkPageUrl(w.id)}" data-index="${i}" aria-label="${escapeHtml(w.title || "Kunstwerk")}">
      <img alt="${escapeHtml(w.title || "")}" ${i === 0 ? `src="${escapeHtml(w.high_res_url)}"` : `data-src="${escapeHtml(w.high_res_url)}"`}>
    </a>`).join("");
  const slides = Array.from(track.children);

  let current = 0;
  let timer = null;

  function load(i) {
    const img = slides[i % slides.length].querySelector("img");
    if (img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
  }

  function show(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, idx) => s.classList.toggle("is-active", idx === current));
    load(current);
    load(current + 1);
    const w = works[current];
    caption.textContent = `„${w.title || ""}“${w.year ? ` · ${w.year}` : ""}`;
  }

  function restart() {
    clearInterval(timer);
    if (slides.length > 1) timer = setInterval(() => show(current + 1), 5500);
  }

  document.getElementById("carousel-prev").addEventListener("click", () => { show(current - 1); restart(); });
  document.getElementById("carousel-next").addEventListener("click", () => { show(current + 1); restart(); });
  carousel.addEventListener("mouseenter", () => clearInterval(timer));
  carousel.addEventListener("mouseleave", restart);

  let touchX = null;
  carousel.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) {
      show(current + (dx < 0 ? 1 : -1));
      restart();
    }
  }, { passive: true });

  show(0);
  restart();
}

const EXTERNAL_POLITIK_CARDS = [
  {
    title: "Porträt in der Solothurner Zeitung",
    text: "Hier geht es zum Porträt in der Solothurner Zeitung.",
    href: "https://www.solothurnerzeitung.ch/solothurn/kanton-solothurn/manuel-zeltner-im-kandidatenportraet-fuer-die-wahlen-2023-ld.2499016",
    img: "https://img.chmedia.ch/2023/08/14/c8a77f82-c062-4ef8-b92e-75bf72cedd5f.jpeg?width=480&height=270&fit=bounds&quality=75&auto=webp&crop=1600,900,x0,y0",
    external: false,
  },
  {
    title: "Podcast „Es schloht öufi“",
    text: "Höre die neuesten Folgen Sebastians und meines Podcasts.",
    href: "https://esschlohtoeufi.ch",
    img: "https://ugc.production.linktr.ee/MGE0RlQYQxa7xFpQg0ks_5A5I3Eqv1lqMOLYi",
    external: true,
  },
  {
    title: "Porträt auf der JGLP-Website",
    text: "Erfahre mehr über meine Positionen im Porträt auf der JGLP-Website.",
    href: "https://solothurn.jungegrunliberale.ch/portfolio-posts/manuel-zeltner/",
    img: "https://apidata.so.jglp.ch/uploads/medium_Solothurn_logo_jglp_60f0bbd7be.png",
    external: false,
  },
];

function politikCardHtml({ title, text, href, img, external }) {
  return `
    <article class="article-card">
      <div class="article-card-image">${img ? `<img src="${escapeHtml(img)}" alt="">` : ""}</div>
      <div class="article-card-body">
        <h3><a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${escapeHtml(title)}</a></h3>
        <p>${escapeHtml(text)}</p>
      </div>
    </article>`;
}

async function loadPolitikCards() {
  const container = document.getElementById("home-politik-cards");
  let posts = [];
  const client = getSupabase();
  if (client) {
    const { data } = await client
      .from("blog_posts")
      .select("slug,title,excerpt,cover_image_path")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(3);
    posts = (data || []).map((p) => ({
      title: p.title,
      text: p.excerpt || "Beitrag lesen",
      href: `/politik/artikel.html?slug=${encodeURIComponent(p.slug)}`,
      img: p.cover_image_path ? storagePublicUrl("blog-images", p.cover_image_path) : "",
      external: false,
    }));
  }
  container.innerHTML = [...posts, ...EXTERNAL_POLITIK_CARDS].slice(0, 3).map(politikCardHtml).join("");
}
