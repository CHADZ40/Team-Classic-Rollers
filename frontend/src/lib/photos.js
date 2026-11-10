// Phone photos are far bigger than a proof needs. Shrinking them keeps uploads quick on
// mobile data and under the website's 4 MB limit for one request.
const MAX_SIDE = 1600;

export async function shrinkPhoto(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, "image/jpeg", 0.82); });
  return blob ? new File([blob], "proof.jpg", { type: "image/jpeg" }) : file;
}
