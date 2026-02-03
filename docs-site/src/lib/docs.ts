export type DocEntry = {
  slug: string;
  title: string;
  path: string;
  category: string;
};

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function slugFromPath(path: string): string {
  const marker = '/docs/';
  const index = path.lastIndexOf(marker);
  const relative = index >= 0 ? path.slice(index + marker.length) : path;
  return relative.replace(/\.md$/, '');
}

function categoryForSlug(slug: string): string {
  if (slug.includes('api-reference')) return 'Reference';
  if (slug.includes('configuration')) return 'Reference';
  if (slug.includes('cicd')) return 'Operations';
  if (slug.includes('self-hosting')) return 'Operations';
  return 'Guides';
}

export async function getDocEntries(): Promise<DocEntry[]> {
  const docs = import.meta.glob('../../../docs/**/*.md');
  const entries: DocEntry[] = [];

  for (const path of Object.keys(docs)) {
    const slug = slugFromPath(path);
    const title = toTitleCase(slug.split('/').pop() || slug);
    entries.push({
      slug,
      title,
      path,
      category: categoryForSlug(slug),
    });
  }

  const order = [
    'getting-started',
    'configuration',
    'self-hosting',
    'test-suites',
    'scorers',
    'api-reference',
    'cicd',
  ];

  return entries.sort((a, b) => {
    const aIndex = order.indexOf(a.slug);
    const bIndex = order.indexOf(b.slug);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.title.localeCompare(b.title);
  });
}

export async function getDocModule(path: string) {
  const docs = import.meta.glob('../../../docs/**/*.md');
  const loader = docs[path];
  if (!loader) return null;
  return loader();
}
