import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/route": ["./data/**/*"],
  },
};

export default nextConfig;
