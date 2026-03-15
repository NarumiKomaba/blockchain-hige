import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["symbol-sdk", "symbol-crypto-wasm-node"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side only: disable WASM and Node.js modules
      config.resolve.alias = {
        ...config.resolve.alias,
        "symbol-crypto-wasm-node": false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "symbol-crypto-wasm-node": false,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
