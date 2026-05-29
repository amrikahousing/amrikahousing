export function getBlobToken() {
  return process.env.VERCEL_ENV === "production"
    ? process.env.BLOB_READ_WRITE_TOKEN
    : process.env.VERCEL_ENV === "preview"
      ? process.env.TEST_BLOB_READ_WRITE_TOKEN
      : process.env.DEV_BLOB_READ_WRITE_TOKEN;
}
