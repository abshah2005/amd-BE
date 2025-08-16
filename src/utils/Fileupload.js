import { S3Client, PutObjectCommand,DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Image } from "../models/Image.model.js";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadOnS3 = async (file) => {
  if (!file) return null;

  const fileName = `${Date.now()}_${file.originalname}`;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: "public-read",
  };

  try {
    await s3.send(new PutObjectCommand(params));
    const url = `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    return {
      url,
      key: fileName,
      bucket: params.Bucket,
    };
  } catch (error) {
    console.error("S3 upload error:", error);
    return null;
  }
};

const deleteFromS3 = async (bucket, key) => {
  if (!bucket || !key) return false;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error("S3 delete error:", err);
    throw err;
  }
};

const deleteImageAndObject = async (imageId) => {
  if (!imageId) return { success: false };
  const img = await Image.findById(imageId);
  if (!img) return { success: false };
  try {
    await deleteFromS3(img.bucket, img.key);
  } catch (err) {
    console.warn("Failed to delete object from S3, will still remove DB record:", err.message || err);
  }
  await Image.deleteOne({ _id: img._id });
  return { success: true, removedImage: img.toObject() };
};

export { uploadOnS3,deleteFromS3, deleteImageAndObject };
