// @ts-check
import { defineConfig } from 'astro/config';

const repoInfo = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const owner = repoInfo[0];
const repo = repoInfo[1];
const site = owner && repo ? `https://${owner}.github.io/${repo}` : undefined;
const base = repo ? `/${repo}/` : '/';

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
