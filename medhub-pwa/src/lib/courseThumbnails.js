// ===========================================================================
// Course thumbnail storage helpers (Supabase Storage bucket: course-thumbnails).
//
// Admin-only writes are enforced by storage.objects policies (see migration
// 0006); these helpers just do the client-side work: validate, optionally
// downscale, upload to a UNIQUE path, return the public URL, and clean up.
// ===========================================================================
import { supabase } from "./supabaseClient";

export const BUCKET = "course-thumbnails";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_WIDTH = 1280;

// Returns an error string, or null if the file is acceptable.
export function validateImage(file) {
  if (!file) return "No file selected.";
  if (!ALLOWED.includes(file.type)) return "Use a JPEG, PNG, or WebP image.";
  if (file.size > MAX_BYTES) return "Image must be under 2 MB.";
  return null;
}

function extFor(type) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

// Downscale to MAX_WIDTH (keeps aspect). Returns a Blob; falls back to the
// original file if anything goes wrong or it's already small enough.
async function downscale(file) {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bmp = await createImageBitmap(file);
    if (bmp.width <= MAX_WIDTH) { bmp.close?.(); return file; }
    const w = MAX_WIDTH;
    const h = Math.round((bmp.height * MAX_WIDTH) / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const type = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await new Promise((res) => canvas.toBlob(res, type, 0.85));
    return blob || file;
  } catch {
    return file;
  }
}

// Upload a validated image for a course. Returns { url, path } or { error }.
export async function uploadCourseThumbnail(courseId, file) {
  const err = validateImage(file);
  if (err) return { error: err };

  const blob = await downscale(file);
  const type = blob.type || file.type;
  const path = `${courseId}/${Date.now()}.${extFor(type)}`; // unique -> no cache/upsert clash

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (upErr) return { error: upErr.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Extract the in-bucket object path from a public URL (or null).
export function pathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length).split("?")[0] : null;
}

// Remove a single object by its in-bucket path (best-effort).
export async function removeObjectPath(path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ignore */ }
}

// Remove the object referenced by a public URL (used when replacing).
export async function removeByPublicUrl(url) {
  await removeObjectPath(pathFromPublicUrl(url));
}

// Remove ALL objects under a course's folder (used when a course is deleted).
export async function removeCourseThumbnails(courseId) {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(String(courseId), { limit: 100 });
    if (data?.length) {
      await supabase.storage.from(BUCKET).remove(data.map((o) => `${courseId}/${o.name}`));
    }
  } catch { /* ignore */ }
}
