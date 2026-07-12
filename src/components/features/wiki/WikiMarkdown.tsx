'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

const INLINE = /\[\[(\d+)\|([^\]]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of Array.from(text.matchAll(INLINE))) {
    if (m.index! > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1] !== undefined) {
      nodes.push(
        <Link key={key} href={`/studio/wiki/${m[1]}`} className="text-[#7869c4] hover:underline decoration-dotted underline-offset-2">
          <span className="opacity-50">[[</span>{m[2]}<span className="opacity-50">]]</span>
        </Link>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <a key={key} href={m[4]} target="_blank" rel="noopener noreferrer" className="text-[#7869c4] hover:underline underline-offset-2">
          {m[3]}
        </a>,
      );
    } else if (m[5] !== undefined) {
      nodes.push(<strong key={key} className="text-foreground">{m[5]}</strong>);
    } else if (m[6] !== undefined) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 text-[0.85em] bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-sm break-all">
          {m[6]}
        </code>,
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown;
  const end = markdown.indexOf('\n---', 4);
  return end === -1 ? markdown : markdown.slice(end + 4).replace(/^\n+/, '');
}

export function WikiMarkdown({ markdown }: { markdown: string }) {
  const body = stripFrontmatter(markdown);
  const lines = body.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let k = 0;

  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`ul-${k++}`} className="space-y-1.5 pl-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-muted-foreground">
            <span className="text-[#7869c4] shrink-0 select-none">▸</span>
            <span className={/^\s{2,}/.test(item) ? 'pl-4' : ''}>{renderInline(item.trim(), `li-${k}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      list.push(line.replace(/^(\s*)- /, '$1'));
      continue;
    }
    flushList();
    if (!trimmed) continue;
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${k++}`} className="text-xs uppercase tracking-widest text-[#7869c4] pt-2">
          {renderInline(trimmed.slice(4), `h3-${k}`)}
        </h3>,
      );
    } else if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${k++}`} className="text-base text-foreground pt-4 pb-1 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
          <span className="text-[#7869c4] text-xs select-none">##</span>
          {renderInline(trimmed.slice(3), `h2-${k}`)}
        </h2>,
      );
    } else if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${k++}`} className="text-2xl sm:text-3xl text-foreground">
          {renderInline(trimmed.slice(2), `h1-${k}`)}
        </h1>,
      );
    } else if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote key={`bq-${k++}`} className="border-l-2 border-[#7869c4] pl-3 text-muted-foreground italic">
          {renderInline(trimmed.slice(2), `bq-${k}`)}
        </blockquote>,
      );
    } else if (trimmed === '---') {
      blocks.push(<hr key={`hr-${k++}`} className="border-neutral-200 dark:border-neutral-800" />);
    } else if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      blocks.push(
        <p key={`em-${k++}`} className="text-muted-foreground/70 italic text-[13px]">
          {renderInline(trimmed.slice(1, -1), `em-${k}`)}
        </p>,
      );
    } else {
      blocks.push(
        <p key={`p-${k++}`} className="text-muted-foreground leading-relaxed">
          {renderInline(trimmed, `p-${k}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div className="space-y-3 text-sm">{blocks}</div>;
}
