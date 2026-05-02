import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH ?? "";

// output: "export" is only used for production static builds (GitHub Pages etc.).
// During dev (`next dev`) it causes SSR pre-rendering that breaks localStorage.
const isStaticBuild = process.env.NEXT_STATIC_EXPORT === "true" && process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStaticBuild ? { output: "export" } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
};

export default nextConfig;
