import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Handle server-side modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        perf_hooks: false,
        stream: false,
        util: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }

    // Exclude server-only packages from client bundle
    config.externals = config.externals || [];
    if (!isServer) {
      config.externals.push({
        'postgres': 'postgres',
        'better-sqlite3': 'better-sqlite3',
        'pg': 'pg',
      });
    }

    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['postgres', 'better-sqlite3', 'pg'],
  },
};

export default nextConfig;
