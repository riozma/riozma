const ARTWORKS_JSON = "/src/artworks.json";
const LOCAL_IMG_BASE = "/src/img/artManuel";
const ART_IMG_VERSION = "3";   // bei neu bearbeiteten Bildern erhöhen (Browser-Cache)


function localImageUrls(imgId) {
  return {
    image_url: `${LOCAL_IMG_BASE}/lowRes/${imgId}-min.jpg?v=${ART_IMG_VERSION}`,
    micro_url: `${LOCAL_IMG_BASE}/micro/${imgId}-min.jpg?v=${ART_IMG_VERSION}`,
    thumb_url: `${LOCAL_IMG_BASE}/thumb/${imgId}-min.jpg?v=${ART_IMG_VERSION}`,
    high_res_url: `${LOCAL_IMG_BASE}/highRes/${imgId}.jpg?v=${ART_IMG_VERSION}`,
  };
}

async function loadAllArtworks() {
  const local = await fetch(ARTWORKS_JSON)
    .then((r) => r.json())
    .catch(() => []);

  // Mehrere Fassungen eines Werks (z.B. übermalt): "versions": [{img, label}, ...] in artworks.json.
  // Das Werk erscheint nur einmal in der Galerie (Titelbild = erste Fassung), die Werkseite zeigt alle.
  const localVersions = new Map(local.filter((a) => Array.isArray(a.versions)).map((a) => [a.id, a.versions]));
  const withVersions = (a) => {
    const versions = (a.versions || localVersions.get(a.id) || []).map((v) => ({ label: v.label || "", ...localImageUrls(v.img) }));
    return versions.length ? { ...a, ...versions[0], versions } : a;
  };

  const localMapped = local.map((a) => withVersions({
    ...a,
    source: "local",
    available: a.available === "True" || a.available === true,
    ...localImageUrls(a.id),
  }));

  const client = getSupabase();
  if (!client) return localMapped;

  const { data, error } = await client.from("artworks").select("*").order("sort_order", { ascending: true });
  if (error || !data) return localMapped;

  const remote = data.map((a) => withVersions({
    id: a.id,
    title: a.title,
    year: a.year,
    size: a.size,
    medium: a.medium,
    available: a.available,
    source: a.source,
    image_path: a.image_path,
    thumb_path: a.thumb_path,
    micro_url: a.source === "local" ? `${LOCAL_IMG_BASE}/micro/${a.id}-min.jpg?v=${ART_IMG_VERSION}` : "",
    thumb_url: a.source === "local" ? `${LOCAL_IMG_BASE}/thumb/${a.id}-min.jpg?v=${ART_IMG_VERSION}` : "",
    image_url: a.source === "local"
      ? `${LOCAL_IMG_BASE}/lowRes/${a.id}-min.jpg?v=${ART_IMG_VERSION}`
      : storagePublicUrl("artworks", a.thumb_path || a.image_path),
    high_res_url: a.source === "local"
      ? `${LOCAL_IMG_BASE}/highRes/${a.id}.jpg?v=${ART_IMG_VERSION}`
      : storagePublicUrl("artworks", a.image_path),
  }));

  const remoteIds = new Set(remote.map((a) => a.id));
  return [...remote, ...localMapped.filter((a) => !remoteIds.has(a.id))];
}

function artworkPageUrl(id) {
  return `/kunst/werk.html?id=${encodeURIComponent(id)}`;
}

function isArtworkAvailable(a) {
  return a.available === true || a.available === "True";
}

// Progressives Laden: erst winziges Vorschaubild (wenige KB, unscharf), dann das eigentliche Bild.
// Markup: <img src="${micro}" data-full="${url}" class="img-progressive">
function hydrateProgressiveImages(root = document) {
  root.querySelectorAll("img[data-full]").forEach((img) => {
    const url = img.dataset.full;
    delete img.dataset.full;
    const full = new Image();
    full.decoding = "async";
    full.onload = () => {
      if (!img.dataset.current || img.dataset.current === url) img.src = url;   // nicht überschreiben, falls inzwischen andere Fassung gewählt
      img.classList.remove("img-progressive");
    };
    full.src = url;
  });
}
function progressiveImgHtml(micro, full, attrs = "", cls = "") {
  return micro
    ? `<img src="${micro}" data-full="${full}" class="${cls} img-progressive" decoding="async" ${attrs}>`
    : `<img src="${full}" class="${cls}" decoding="async" ${attrs}>`;
}
