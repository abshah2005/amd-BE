import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

export { uploadOnS3 };
