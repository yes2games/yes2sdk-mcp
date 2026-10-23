/**
 * Root-absolute path detection, ported from the dashboard so validate_integration
 * reports what an upload would get. Sources (yes2dashboard, feat/js-engine-support):
 *   - api/src/utils/relative-paths-check.ts  (findRootAbsoluteRefs, the index.html scanner)
 *   - api/src/services/root-absolute-paths.ts (findRootAbsoluteJsLiterals, the message)
 *
 * The dashboard warns on these for every platform and blocks Jest bundles on the
 * index.html part. Keep this file in step with those two when they change.
 */

export interface RootAbsoluteRef {
  attr: string;
  value: string;
}

/** index.html larger than this is not scanned; the gate blocks it instead. */
export const MAX_INDEX_HTML_BYTES = 5 * 1024 * 1024;

/** Elements whose body is text, not markup: no tags inside are real. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);

/** Navigation links, not asset loads: a root-absolute href there is harmless. */
const NAVIGATION_ELEMENTS = new Set(['a', 'area']);

function isRootAbsolute(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

function isAsciiLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

/** Lowercase only ASCII letters, so the result never changes length. */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/**
 * Root-absolute `url(...)` values in a CSS fragment. Starts are found with a
 * fixed-string regex; each value is then read by hand and the search resumes
 * after it, so the scan never revisits text.
 */
function scanCssUrls(css: string, out: RootAbsoluteRef[]): void {
  const startRe = /url\(/gi;
  let m = startRe.exec(css);
  while (m !== null) {
    let i = m.index + 4;
    while (i < css.length && isSpace(css[i])) i++;
    let value: string;
    const q = css[i];
    if (q === '"' || q === "'") {
      const end = css.indexOf(q, i + 1);
      if (end === -1) return; // unterminated string: nothing after it is a valid url()
      value = css.slice(i + 1, end);
      i = end + 1;
    } else {
      const start = i;
      while (i < css.length && css[i] !== ')' && !isSpace(css[i])) i++;
      value = css.slice(start, i);
    }
    value = value.trim();
    if (isRootAbsolute(value)) out.push({ attr: 'url()', value });
    startRe.lastIndex = Math.max(i, m.index + 4);
    m = startRe.exec(css);
  }
}

/**
 * Root-absolute candidate URLs in a srcset value. A candidate URL is a run of
 * non-space characters (so a data URI's comma stays inside it), followed by
 * optional descriptors up to the next comma.
 */
function scanSrcset(value: string, out: RootAbsoluteRef[]): void {
  let i = 0;
  while (i < value.length) {
    while (i < value.length && (isSpace(value[i]) || value[i] === ',')) i++;
    const start = i;
    while (i < value.length && !isSpace(value[i])) i++;
    let url = value.slice(start, i);
    let trailingComma = false;
    while (url.endsWith(',')) {
      url = url.slice(0, -1);
      trailingComma = true;
    }
    if (url && isRootAbsolute(url)) out.push({ attr: 'srcset', value: url });
    if (!trailingComma) {
      const comma = value.indexOf(',', i);
      i = comma === -1 ? value.length : comma + 1;
    }
  }
}

function checkAttribute(tag: string, name: string, rawValue: string, out: RootAbsoluteRef[]): void {
  const value = rawValue.trim();
  if (name === 'src') {
    if (isRootAbsolute(value)) out.push({ attr: 'src', value });
  } else if (name === 'href') {
    if (!NAVIGATION_ELEMENTS.has(tag) && isRootAbsolute(value)) out.push({ attr: 'href', value });
  } else if (name === 'srcset') {
    scanSrcset(rawValue, out);
  } else if (name === 'style') {
    scanCssUrls(rawValue, out);
  }
}

/**
 * Parse one start tag beginning at `lt` (html[lt] === '<', html[lt + 1] is a
 * letter). Records flagged attributes and returns the tag name and the index
 * just past the closing '>' (or html.length when the tag never closes).
 */
function scanStartTag(html: string, lt: number, out: RootAbsoluteRef[]): { tag: string; next: number } {
  const n = html.length;
  let i = lt + 1;
  const nameStart = i;
  while (i < n && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>') i++;
  const tag = asciiLower(html.slice(nameStart, i));

  while (i < n) {
    while (i < n && (isSpace(html[i]) || html[i] === '/')) i++;
    if (i >= n) break;
    if (html[i] === '>') return { tag, next: i + 1 };

    // Attribute name. A leading '=' belongs to the name (HTML parsing rule),
    // which also guarantees progress.
    const attrStart = i;
    i++;
    while (i < n && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
    const name = asciiLower(html.slice(attrStart, i));

    let j = i;
    while (j < n && isSpace(html[j])) j++;
    if (html[j] !== '=') continue; // attribute without a value
    i = j + 1;
    while (i < n && isSpace(html[i])) i++;
    if (i >= n) break;

    let value: string;
    const q = html[i];
    if (q === '"' || q === "'") {
      const end = html.indexOf(q, i + 1);
      if (end === -1) {
        // Unterminated quote swallows the rest of the document.
        return { tag, next: n };
      }
      value = html.slice(i + 1, end);
      i = end + 1;
    } else {
      const start = i;
      while (i < n && !isSpace(html[i]) && html[i] !== '>') i++;
      value = html.slice(start, i);
    }
    checkAttribute(tag, name, value, out);
  }
  return { tag, next: n };
}

/** Index of the `</tag` that closes a raw-text element, or -1. */
function findRawTextEnd(html: string, from: number, tag: string): number {
  const re = new RegExp(`</${tag}`, 'gi');
  re.lastIndex = from;
  const m = re.exec(html);
  return m === null ? -1 : m.index;
}

export function findRootAbsoluteRefs(html: string): RootAbsoluteRef[] {
  const out: RootAbsoluteRef[] = [];
  const n = html.length;
  let i = 0;

  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) break; // unterminated comment runs to the end
      i = end + 3;
      continue;
    }
    if (html.startsWith('<![CDATA[', lt)) {
      const end = html.indexOf(']]>', lt + 9);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const next = html[lt + 1];
    if (next === '!' || next === '?' || next === '/') {
      // Doctype, bogus comment or end tag: nothing to check, skip to '>'.
      const end = html.indexOf('>', lt + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (next === undefined || !isAsciiLetter(next)) {
      i = lt + 1; // a stray '<' in text
      continue;
    }

    const { tag, next: afterTag } = scanStartTag(html, lt, out);
    i = afterTag;
    if (i >= n) break;

    if (RAW_TEXT_ELEMENTS.has(tag)) {
      const end = tag === 'plaintext' ? -1 : findRawTextEnd(html, i, tag);
      const bodyEnd = end === -1 ? n : end;
      // Inline <style> bodies load url()s; script and other raw text never do.
      if (tag === 'style') scanCssUrls(html.slice(i, bodyEnd), out);
      i = bodyEnd;
    }
  }

  return out;
}

// ── Emitted JS literals (port of services/root-absolute-paths.ts) ──────────

/** Enough refs to show the pattern; the scan stops there. */
export const MAX_JS_REFS = 20;

/** Points the developer at the fix for the usual cause. */
export const VITE_BASE_HINT = "If you build with Vite, set base: './' in vite.config so every emitted path is relative.";

/**
 * Quoted string literals that start with a single `/`. The body is bounded to
 * 256 chars of path characters, so a failed match costs at most that much per
 * start position on untrusted input.
 */
const ROOT_ABSOLUTE_LITERAL_RE = /(["'`])\/([A-Za-z0-9_@~][A-Za-z0-9_@~.\-/]{0,255})\1/g;

/**
 * Root-absolute string literals in `source` whose target (`/x/y` → `x/y`) is a
 * file in `buildFiles` (build-relative, `/`-separated). Html files are left
 * out: code that compares location.pathname to "/index.html" is not a load.
 */
export function findRootAbsoluteJsLiterals(source: string, buildFiles: ReadonlySet<string>, limit = MAX_JS_REFS): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(ROOT_ABSOLUTE_LITERAL_RE.source, "g");
  let m = re.exec(source);
  while (m !== null && found.length < limit) {
    const target = m[2] ?? "";
    const lower = target.toLowerCase();
    if (!seen.has(target) && !lower.endsWith(".html") && !lower.endsWith(".htm") && buildFiles.has(target)) {
      seen.add(target);
      found.push(`/${target}`);
    }
    m = re.exec(source);
  }
  return found;
}

/** Short list for a message: the first five, then a count. */
export function listed(values: string[]): string {
  const more = values.length > 5 ? ` (and ${values.length - 5} more)` : "";
  return `${values.slice(0, 5).join(", ")}${more}`;
}

/** The index.html part of a message, e.g. `src="/assets/index.js"`. */
export function describeHtmlRefs(refs: RootAbsoluteRef[]): string {
  return listed(refs.map((r) => `${r.attr}="${r.value}"`));
}
