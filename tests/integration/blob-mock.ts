// Fake @vercel/blob so the suite never talks to real blob storage. put()
// echoes the requested path back as the URL (mirroring addRandomSuffix-free
// behavior closely enough for assertions); get() streams recognizable bytes.

export function blobMock() {
  return {
    put: async (path: string) => ({ url: `https://blob.integration.test/${path}` }),
    get: async (url: string) => ({
      stream: new Blob([`blob-bytes:${url}`]).stream(),
      blob: { contentType: "application/pdf" },
    }),
  };
}
