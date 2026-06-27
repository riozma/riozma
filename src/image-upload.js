const STORAGE_FULL_MESSAGE = `Speicher voll! Bitte ${SITE_ADMIN_EMAIL} schreiben – Manuel soll sich gefälligst darum kümmern, den Speicher freizuräumen oder zu erweitern.`;

function isStorageFullError(error) {
  if (!error) return false;
  const msg = String(error.message || error.error || error).toLowerCase();
  const code = error.statusCode || error.status || error.error?.statusCode;
  return (
    code === 413
    || code === 507
    || msg.includes("quota")
    || msg.includes("storage limit")
    || msg.includes("limit exceeded")
    || msg.includes("insufficient storage")
    || msg.includes("storage full")
    || msg.includes("payload too large")
    || (msg.includes("exceeded") && msg.includes("storage"))
  );
}

function storageUploadError(error, fallback) {
  if (isStorageFullError(error)) return new Error(STORAGE_FULL_MESSAGE);
  return new Error(fallback || error?.message || "Upload fehlgeschlagen.");
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Komprimierung fehlgeschlagen."))),
      "image/jpeg",
      quality,
    );
  });
}

async function compressImageFile(file, { maxEdge = 2000, quality = 0.85 } = {}) {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, quality);
  return new File([blob], (file.name.replace(/\.[^.]+$/, "") || "bild") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function prepareArtworkImages(file) {
  const [full, thumb] = await Promise.all([
    compressImageFile(file, { maxEdge: 2000, quality: 0.85 }),
    compressImageFile(file, { maxEdge: 640, quality: 0.82 }),
  ]);
  return { full, thumb };
}

async function prepareBlogCover(file) {
  const cover = await compressImageFile(file, { maxEdge: 1600, quality: 0.85 });
  return cover;
}

async function prepareEventCover(file) {
  return prepareBlogCover(file);
}
