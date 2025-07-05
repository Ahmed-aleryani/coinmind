"use client";

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';

interface MarkdownProps {
  content: string;
  className?: string;
}

// Configure marked options
marked.setOptions({
  breaks: true, // Enable line breaks
  gfm: true, // Enable GitHub Flavored Markdown
});

export function Markdown({ content, className }: MarkdownProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState('');

  useEffect(() => {
    const parseMarkdown = async () => {
      try {
        // Parse markdown to HTML
        const html = await marked.parse(content);
        
        // Sanitize the HTML to prevent XSS attacks
        const cleanHtml = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 'del', 'code', 'pre',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li',
            'blockquote',
            'a', 'img',
            'table', 'thead', 'tbody', 'tr', 'th', 'td'
          ],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class']
        });
        
        setSanitizedHtml(cleanHtml);
      } catch (error) {
        console.error('Error parsing markdown:', error);
        // Fallback to plain text if markdown parsing fails
        setSanitizedHtml(DOMPurify.sanitize(content));
      }
    };

    parseMarkdown();
  }, [content]);

  return (
    <div 
      className={`markdown-content ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      style={{
        fontSize: '14px',
        lineHeight: '1.6',
        color: 'inherit'
      }}
    />
  );
} 