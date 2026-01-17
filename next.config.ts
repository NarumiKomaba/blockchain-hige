import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    SYMBOL_SDK_NO_WASM: "true",
  },
  webpack: (config, { isServer }) => {
    // Use alias to ignore the WASM module.
    config.resolve.alias = {
      ...config.resolve.alias,
      "symbol-crypto-wasm-node": false,
    };

    if (!isServer) {
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
