'use client';

import React from 'react';

/**
 * Tokenize and render inline markdown elements:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - ***bold italic***
 * - `inline code`
 * - ~~strikethrough~~
 * - [label](url)
 */
export function renderInlineMarkdown(text, isAda = false) {
  if (!text) return null;

  const tokens = [];
  let remaining = text;
  let key = 0;

  // Regex matching inline elements
  const regex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/;

  while (remaining) {
    const match = remaining.match(regex);
    if (!match) {
      tokens.push(remaining);
      break;
    }

    const matchIndex = match.index;
    if (matchIndex > 0) {
      tokens.push(remaining.substring(0, matchIndex));
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      const codeContent = matchedStr.slice(1, -1);
      tokens.push(
        <code
          key={`code-${key++}`}
          className="px-1.5 py-0.5 mx-0.5 chamfer-xs bg-[rgba(0,240,255,0.1)] border border-[rgba(0,240,255,0.25)] text-[#00F0FF] font-mono text-[10px]"
        >
          {codeContent}
        </code>
      );
    } else if (matchedStr.startsWith('***') && matchedStr.endsWith('***')) {
      tokens.push(
        <strong
          key={`bi-${key++}`}
          className={`font-bold italic ${isAda ? 'text-[#FF8095]' : 'text-[#80F7FF]'}`}
        >
          {matchedStr.slice(3, -3)}
        </strong>
      );
    } else if (
      (matchedStr.startsWith('**') && matchedStr.endsWith('**')) ||
      (matchedStr.startsWith('__') && matchedStr.endsWith('__'))
    ) {
      tokens.push(
        <strong
          key={`b-${key++}`}
          className={`font-bold ${isAda ? 'text-[#FF8095]' : 'text-[#80F7FF]'}`}
        >
          {matchedStr.slice(2, -2)}
        </strong>
      );
    } else if (
      (matchedStr.startsWith('*') && matchedStr.endsWith('*')) ||
      (matchedStr.startsWith('_') && matchedStr.endsWith('_'))
    ) {
      tokens.push(
        <em key={`i-${key++}`} className="italic text-[#E0E2EC]">
          {matchedStr.slice(1, -1)}
        </em>
      );
    } else if (matchedStr.startsWith('~~') && matchedStr.endsWith('~~')) {
      tokens.push(
        <del key={`del-${key++}`} className="line-through text-[#7E859E]">
          {matchedStr.slice(2, -2)}
        </del>
      );
    } else if (matchedStr.startsWith('[') && matchedStr.includes('](') && matchedStr.endsWith(')')) {
      const linkMatch = matchedStr.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        tokens.push(
          <a
            key={`a-${key++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00F0FF] underline hover:text-[#FF003C] transition-colors"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(matchedStr);
      }
    } else {
      tokens.push(matchedStr);
    }

    remaining = remaining.substring(matchIndex + matchedStr.length);
  }

  return tokens;
}

/**
 * MarkdownText — Lightweight, safe, high-performance Markdown renderer
 * tailored specifically for Project A.D.A Cyberpunk Comms Log feed.
 */
export function MarkdownText({ content, isAda = false }) {
  if (!content) return null;

  // Split code blocks first
  const parts = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIdx = 0;
  let codeMatch;

  while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
    if (codeMatch.index > lastIdx) {
      parts.push({
        type: 'markdown',
        text: content.substring(lastIdx, codeMatch.index),
      });
    }
    parts.push({
      type: 'codeblock',
      lang: codeMatch[1],
      code: codeMatch[2],
    });
    lastIdx = codeBlockRegex.lastIndex;
  }
  if (lastIdx < content.length) {
    parts.push({
      type: 'markdown',
      text: content.substring(lastIdx),
    });
  }

  return (
    <div className="space-y-1 text-[11px] leading-relaxed break-words">
      {parts.map((part, pIdx) => {
        if (part.type === 'codeblock') {
          return (
            <div
              key={`cb-${pIdx}`}
              className="my-1.5 chamfer-sm border border-[rgba(0,240,255,0.25)] bg-[rgba(5,5,8,0.92)] overflow-hidden font-mono"
            >
              {part.lang && (
                <div className="px-2 py-0.5 text-[9px] text-[#00F0FF] bg-[rgba(0,240,255,0.08)] border-b border-[rgba(0,240,255,0.15)] flex justify-between">
                  <span>{part.lang.toUpperCase()}</span>
                </div>
              )}
              <pre className="p-2 text-[10px] text-[#80F7FF] overflow-x-auto leading-normal">
                <code>{part.code.trim()}</code>
              </pre>
            </div>
          );
        }

        const lines = part.text.split('\n');
        const elements = [];
        let listItems = [];
        let listType = null; // 'ul' | 'ol'

        const flushList = () => {
          if (listItems.length > 0) {
            if (listType === 'ol') {
              elements.push(
                <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-0.5 my-1 pl-1 text-[11px]">
                  {listItems.map((item, i) => (
                    <li key={i}>{renderInlineMarkdown(item, isAda)}</li>
                  ))}
                </ol>
              );
            } else {
              elements.push(
                <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-0.5 my-1 pl-1 text-[11px]">
                  {listItems.map((item, i) => (
                    <li key={i}>{renderInlineMarkdown(item, isAda)}</li>
                  ))}
                </ul>
              );
            }
            listItems = [];
            listType = null;
          }
        };

        lines.forEach((line, lIdx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            flushList();
            return;
          }

          // Headers
          if (trimmed.startsWith('### ')) {
            flushList();
            elements.push(
              <h4 key={`h3-${lIdx}`} className="font-['Orbitron',sans-serif] font-bold text-xs text-[#00F0FF] my-1 tracking-wider">
                {renderInlineMarkdown(trimmed.substring(4), isAda)}
              </h4>
            );
            return;
          }
          if (trimmed.startsWith('## ')) {
            flushList();
            elements.push(
              <h3 key={`h2-${lIdx}`} className="font-['Orbitron',sans-serif] font-bold text-xs text-[#FF003C] my-1 tracking-wider">
                {renderInlineMarkdown(trimmed.substring(3), isAda)}
              </h3>
            );
            return;
          }
          if (trimmed.startsWith('# ')) {
            flushList();
            elements.push(
              <h2 key={`h1-${lIdx}`} className="font-['Orbitron',sans-serif] font-extrabold text-sm text-[#F0F2F8] my-1 tracking-wider">
                {renderInlineMarkdown(trimmed.substring(2), isAda)}
              </h2>
            );
            return;
          }

          // Blockquote
          if (trimmed.startsWith('> ')) {
            flushList();
            elements.push(
              <blockquote key={`bq-${lIdx}`} className="border-l-2 border-[#FF003C] pl-2 my-1 text-[#7E859E] italic">
                {renderInlineMarkdown(trimmed.substring(2), isAda)}
              </blockquote>
            );
            return;
          }

          // Unordered list
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (listType && listType !== 'ul') flushList();
            listType = 'ul';
            listItems.push(trimmed.substring(2));
            return;
          }

          // Ordered list
          const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
          if (olMatch) {
            if (listType && listType !== 'ol') flushList();
            listType = 'ol';
            listItems.push(olMatch[2]);
            return;
          }

          // Regular line
          flushList();
          elements.push(
            <p key={`p-${lIdx}`} className="my-0.5">
              {renderInlineMarkdown(line, isAda)}
            </p>
          );
        });

        flushList();
        return <div key={`pblock-${pIdx}`}>{elements}</div>;
      })}
    </div>
  );
}
