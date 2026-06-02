// Type declaration for mammoth's browser build, which doesn't ship its own .d.ts.
// Only declares the surface we use — extractRawText accepts an ArrayBuffer.
declare module "mammoth/mammoth.browser" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value: string;
    messages: Array<{ type: string; message: string }>;
  }>;
}
