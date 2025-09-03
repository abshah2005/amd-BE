import { uploadOnS3 } from "../utils/Fileupload.js";

// export async function handleAttachments(files) {
//   const urls = [];
//   for (const file of files || []) {
//     // Only allow images, max size 5MB
//     if (!file.mimetype.startsWith("image/")) continue;
//     if (file.size > 5 * 1024 * 1024) continue;
//     const uploaded = await uploadOnS3(file);
//     if (uploaded && uploaded.bucket && uploaded.key) {
//       const url = `https://${uploaded.bucket}.s3.amazonaws.com/${uploaded.key}`;
//       urls.push(url);
//     }
//     if (urls.length >= 5) break;
//   }
//   return urls;
// }

export async function handleAttachments(files) {
  const urls = [];
  const fileArray = Array.isArray(files) ? files : [files]; // ✅ force array

  for (const file of fileArray) {
    if (!file?.mimetype?.startsWith("image/")) continue;
    if (file.size > 5 * 1024 * 1024) continue;

    const uploaded = await uploadOnS3(file);
    if (uploaded?.bucket && uploaded?.key) {
      urls.push(`https://${uploaded.bucket}.s3.amazonaws.com/${uploaded.key}`);
    }

    if (urls.length >= 5) break;
  }

  return urls;
}
