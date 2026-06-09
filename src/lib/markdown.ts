// Markdown rendering with XSS guard (§8.2 T-11)
// - markdown-it(html:false) 第一道：禁 raw HTML
// - sanitize-html 第二道：filter javascript: / data: 等危險屬性
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

// 強制外連加 rel="noopener noreferrer" + target="_blank"
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const hrefIdx = token.attrIndex('href');
  if (hrefIdx >= 0) {
    const href = token.attrs![hrefIdx][1];
    if (/^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'a', 'b', 'i', 'em', 'strong', 's', 'del',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'kbd', 'samp',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'span', 'div',
];
const ALLOWED_ATTRS = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title'],
  code: ['class'],
  span: ['class'],
  div: ['class'],
};

export function renderMarkdown(input: string): string {
  const raw = md.render(input ?? '');
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto'],
    // 阻斷 javascript: / data: / vbscript: 對所有 tag
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        if (!/^(https?:|mailto:)/i.test(href)) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } };
      },
    },
  });
}

export const mdInstance = md;
