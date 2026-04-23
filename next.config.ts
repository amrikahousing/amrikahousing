import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "plaid-merchant-logos.plaid.com",
        port: "",
        pathname: "/**",
        search: "",
      },
    ],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
