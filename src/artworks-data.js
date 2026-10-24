const ARTWORKS_JSON = "/src/artworks.json";
const LOCAL_IMG_BASE = "/src/img/artManuel";
const ART_IMG_VERSION = "2";   // bei neu bearbeiteten Bildern erhöhen (Browser-Cache)


async function loadAllArtworks() {
  const local = await fetch(ARTWORKS_JSON)
    .then((r) => r.json())
    .catch(() => []);

  const localMapped = local.map((a) => ({
    ...a,
    source: "local",
    available: a.available === "True" || a.available === true,
    image_url: `${LOCAL_IMG_BASE}/lowRes/${a.id}-min.jpg?v=${ART_IMG_VERSION}`,
    thumb_url: `${LOCAL_IMG_BASE}/thumb/${a.id}-min.jpg?v=${ART_IMG_VERSION}`,
    high_res_url: `${LOCAL_IMG_BASE}/highRes/${a.id}.jpg?v=${ART_IMG_VERSION}`,
  }));

  const client = getSupabase();
  if (!client) return localMapped;

  const { data, error } = await client.from("artworks").select("*").order("sort_order", { ascending: true });
  if (error || !data) return localMapped;

  const remote = data.map((a) => ({
    id: a.id,
    title: a.title,
    year: a.year,
    size: a.size,
    medium: a.medium,
    available: a.available,
    source: a.source,
    image_path: a.image_path,
    thumb_path: a.thumb_path,
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
