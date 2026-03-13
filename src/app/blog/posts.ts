export interface BlogPost {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  content: string; // plain text paragraphs separated by \n\n
  tags?: string[];
}

export const POSTS: BlogPost[] = [
  // Add new posts at the top (newest first)
  // {
  //   slug: 'hello-world',
  //   title: 'Hello World',
  //   date: '2026-03-13',
  //   summary: 'Our first blog post.',
  //   content: 'Content here.\n\nSecond paragraph.',
  //   tags: ['announcement'],
  // },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
