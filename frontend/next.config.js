const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || '/api',
  },
  // Optimize module resolution for better tree-shaking
  modularizeImports: {
    // Tree-shake lucide-react to only import used icons
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },
  // Enable experimental features for better code splitting
  experimental: {
    // Optimize package imports for common heavy libraries
    optimizePackageImports: ['recharts', 'date-fns', 'lucide-react'],
  },
}

module.exports = withBundleAnalyzer(nextConfig)
