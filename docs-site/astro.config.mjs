// @ts-check
import { defineConfig } from 'astro/config';

const repoInfo = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const owner = repoInfo[0];
const repo = repoInfo[1];
const isCI = process.env.GITHUB_ACTIONS === 'true';
const site = owner && repo ? `https://${owner}.github.io/${repo}` : undefined;
const base = isCI && repo ? `/${repo}` : '/';

// https://astro.build/config
export default defineConfig({
  site,
  base,
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
