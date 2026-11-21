import JSZip from 'jszip';
import type {
  ImportMetadataResult,
  ParsedChapter,
  ParsedReflowableBook,
  ParsedTocItem,
} from '../../types/library';
import {computeSha256Hex} from '../db';
import {compressCoverDataUrl} from '../formatters';

function cleanBaseName(fileName: string): string {
  return (
    fileName
      .replace(/\.epub$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Untitled Book'
  );
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  const cleanRel = relativePath.split('#')[0].split('?')[0];
  if (!baseDir) return cleanRel.replace(/^\/+/, '');
  const stack = baseDir.split('/').filter(Boolean);
  for (const part of cleanRel.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function findZipFile(zip: JSZip, targetPath: string): JSZip.JSZipObject | null {
  const exact = zip.file(targetPath);
  if (exact) return exact;
  const decoded = decodeURIComponent(targetPath);
  const decExact = zip.file(decoded);
  if (decExact) return decExact;
  const lower = decoded.toLowerCase();
  const key = Object.keys(zip.files).find((k) => k.toLowerCase() === lower);
  return key ? zip.file(key) : null;
}

interface ParsedEpubInternal {
  title: string;
  subtitle: string;
  author: string;
  description: string;
  publisher: string;
  language: string;
  year: string;
  coverDataUrl: string | null;
  chapters: ParsedChapter[];
  toc: ParsedTocItem[];
  cleanupUrls: string[];
}

async function parseEpubCore(
  data: ArrayBuffer,
  fallbackFileName: string,
  includeFullChapters: boolean
): Promise<ParsedEpubInternal> {
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();

  let opfPath = '';
  const containerXml = await findZipFile(zip, 'META-INF/container.xml')?.async('string');
  if (containerXml) {
    const cDoc = parser.parseFromString(containerXml, 'application/xml');
    opfPath = cDoc.querySelector('rootfile')?.getAttribute('full-path') || '';
  }
  if (!opfPath) {
    opfPath = Object.keys(zip.files).find((k) => k.toLowerCase().endsWith('.opf')) || '';
  }
  if (!opfPath) {
    throw new Error('Could not locate OPF package manifest in this EPUB archive.');
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const opfXml = await findZipFile(zip, opfPath)?.async('string');
  if (!opfXml) {
    throw new Error('EPUB manifest file is missing.');
  }

  const opfDoc = parser.parseFromString(opfXml, 'application/xml');
  const allOpfNodes = Array.from(opfDoc.getElementsByTagName('*'));

  const getMetaText = (localName: string): string => {
    const found = allOpfNodes.find(
      (n) => n.localName === localName && n.textContent && n.textContent.trim().length > 0
    );
    return found?.textContent?.trim() || '';
  };

  const title = getMetaText('title') || cleanBaseName(fallbackFileName);
  const author = getMetaText('creator') || 'Unknown Author';
  const description = getMetaText('description');
  const publisher = getMetaText('publisher');
  const language = getMetaText('language') || 'en';
  const rawDate = getMetaText('date');
  const yearMatch = rawDate.match(/(18|19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : '';

  const manifestById = new Map<string, {href: string; mediaType: string; properties: string}>();
  for (const el of allOpfNodes) {
    if (el.localName !== 'item') continue;
    const id = el.getAttribute('id') || '';
    const href = el.getAttribute('href') || '';
    if (!id || !href) continue;
    manifestById.set(id, {
      href: decodeURIComponent(href),
      mediaType: el.getAttribute('media-type') || '',
      properties: el.getAttribute('properties') || '',
    });
  }

  // Extract cover image as Data URL for offline persistence in BookRecord
  let coverHref: string | null = null;
  for (const m of manifestById.values()) {
    if (m.properties.includes('cover-image')) {
      coverHref = m.href;
      break;
    }
  }
  if (!coverHref) {
    const coverMeta = allOpfNodes.find(
      (el) => el.localName === 'meta' && el.getAttribute('name') === 'cover'
    );
    const coverId = coverMeta?.getAttribute('content');
    if (coverId && manifestById.has(coverId)) {
      coverHref = manifestById.get(coverId)!.href;
    }
  }
  if (!coverHref) {
    for (const [id, m] of manifestById.entries()) {
      if (
        m.mediaType.startsWith('image/') &&
        (id.toLowerCase().includes('cover') || m.href.toLowerCase().includes('cover'))
      ) {
        coverHref = m.href;
        break;
      }
    }
  }

  let coverDataUrl: string | null = null;
  if (!includeFullChapters && coverHref) {
    const fullCoverPath = resolveRelativePath(opfDir, coverHref);
    const coverFile = findZipFile(zip, fullCoverPath);
    if (coverFile) {
      const b64 = await coverFile.async('base64');
      const rawDataUrl = `data:${guessMime(fullCoverPath)};base64,${b64}`;
      coverDataUrl = await compressCoverDataUrl(rawDataUrl);
    }
  }

  const spineRefs = allOpfNodes
    .filter((el) => el.localName === 'itemref')
    .map((el) => el.getAttribute('idref') || '')
    .filter(Boolean);

  if (!includeFullChapters) {
    return {
      title,
      subtitle: '',
      author,
      description,
      publisher,
      language,
      year,
      coverDataUrl,
      chapters: spineRefs.map((id, index) => ({
        index,
        id,
        href: manifestById.get(id)?.href || '',
        title: `Section ${index + 1}`,
        html: '',
      })),
      toc: [],
      cleanupUrls: [],
    };
  }

  // First pass: map spine hrefs to chapter indices so internal links & footnotes rewrite accurately
  const spineEntries: Array<{id: string; fullPath: string; relHref: string}> = [];
  const hrefToChapterIdx = new Map<string, number>();

  for (const idref of spineRefs) {
    const item = manifestById.get(idref);
    if (!item) continue;
    const fullPath = resolveRelativePath(opfDir, item.href);
    const file = findZipFile(zip, fullPath);
    if (!file) continue;
    const chIdx = spineEntries.length;
    spineEntries.push({id: idref, fullPath, relHref: item.href});
    hrefToChapterIdx.set(fullPath, chIdx);
    hrefToChapterIdx.set(fullPath.toLowerCase(), chIdx);
    hrefToChapterIdx.set(item.href, chIdx);
    hrefToChapterIdx.set(item.href.toLowerCase(), chIdx);
  }

  const cleanupUrls: string[] = [];
  const blobUrlCache = new Map<string, string>();
  const chapters: ParsedChapter[] = [];

  const expandXhtmlSelfClosingTags = (xhtml: string): string => {
    const cleaned = xhtml.replace(/<\?xml[\s\S]*?\?>/gi, '');
    return cleaned.replace(
      /<(a|abbr|b|blockquote|cite|code|dd|del|div|dt|em|figcaption|figure|h[1-6]|i|ins|kbd|label|li|mark|ol|p|pre|q|s|samp|section|small|span|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul|var)(\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/>/gi,
      (_full, tagName: string, attrs = '') => `<${tagName}${attrs}></${tagName}>`
    );
  };

  for (let chIdx = 0; chIdx < spineEntries.length; chIdx++) {
    const entry = spineEntries[chIdx];
    const file = findZipFile(zip, entry.fullPath);
    if (!file) continue;
    const rawHtml = await file.async('string');
    const htmlDoc = parser.parseFromString(expandXhtmlSelfClosingTags(rawHtml), 'text/html');

    // Remove unsafe or conflicting tags
    htmlDoc.querySelectorAll('script, style, link, iframe, object, embed').forEach((el) => el.remove());

    // Strip inline font/color/underline declarations from publisher HTML so Kanso themes & typography win cleanly
    htmlDoc.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      el.style.removeProperty('color');
      el.style.removeProperty('background-color');
      el.style.removeProperty('font-family');
      el.style.removeProperty('text-decoration');
      el.style.removeProperty('text-decoration-line');
      if (!el.getAttribute('style')?.trim()) {
        el.removeAttribute('style');
      }
    });

    // Scope element IDs so multiple chapters in Continuous Scroll never collide
    htmlDoc.querySelectorAll('[id]').forEach((el) => {
      const origId = el.getAttribute('id');
      if (!origId) return;
      el.setAttribute('data-folio-target-id', origId);
      el.setAttribute('id', `folio-ch-${chIdx}-${origId}`);
    });

    // Convert non-href <a> anchor targets (<a id="p12"/> or <a name="sec"/>) into harmless <span>s
    // so they never inherit link colors/underlines or wrap text as hyperlinks.
    htmlDoc.querySelectorAll('a').forEach((a) => {
      const href = (a.getAttribute('href') || '').trim();
      if (href) return;
      const span = htmlDoc.createElement('span');
      for (const attr of Array.from(a.attributes)) {
        if (attr.name !== 'name') {
          span.setAttribute(attr.name, attr.value);
        }
      }
      while (a.firstChild) {
        span.appendChild(a.firstChild);
      }
      a.parentNode?.replaceChild(span, a);
    });

    const chapterDir = entry.fullPath.includes('/')
      ? entry.fullPath.slice(0, entry.fullPath.lastIndexOf('/'))
      : '';

    // Rewrite internal links & footnotes to data-folio-chapter / data-folio-anchor
    htmlDoc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!href || /^(https?:|mailto:|tel:|javascript:)/i.test(href)) {
        if (/^https?:/i.test(href)) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
        return;
      }

      const [filePart, hashPart] = href.split('#');
      let targetIdx: number | undefined;
      if (!filePart) {
        targetIdx = chIdx;
      } else {
        const resolved = resolveRelativePath(chapterDir, decodeURIComponent(filePart));
        targetIdx =
          hrefToChapterIdx.get(resolved) ??
          hrefToChapterIdx.get(resolved.toLowerCase()) ??
          hrefToChapterIdx.get(filePart) ??
          hrefToChapterIdx.get(filePart.toLowerCase());
      }

      if (targetIdx !== undefined) {
        a.setAttribute('data-folio-chapter', String(targetIdx));
        if (hashPart) {
          a.setAttribute('data-folio-anchor', decodeURIComponent(hashPart));
        }
        // Detect footnote links (epub:type="noteref", doc-noteref, or superscript number)
        const epubType = a.getAttribute('epub:type') || a.getAttribute('role') || '';
        const text = (a.textContent || '').trim();
        if (
          epubType.includes('noteref') ||
          a.closest('sup') ||
          /^\[?\d{1,3}\]?$/.test(text) ||
          /^\*+$/.test(text)
        ) {
          a.setAttribute('data-folio-footnote-ref', 'true');
        }
      }
    });

    // Inline local images as Blob URLs for fast rendering + lightbox zoom
    const imgs = Array.from(htmlDoc.querySelectorAll('img, image'));
    for (const img of imgs) {
      const attrName = img.hasAttribute('src')
        ? 'src'
        : img.hasAttribute('xlink:href')
          ? 'xlink:href'
          : 'href';
      const src = img.getAttribute(attrName);
      if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
        continue;
      }
      const imgPath = resolveRelativePath(chapterDir, decodeURIComponent(src));
      let blobUrl = blobUrlCache.get(imgPath);
      if (!blobUrl) {
        const imgFile = findZipFile(zip, imgPath);
        if (imgFile) {
          const bytes = await imgFile.async('arraybuffer');
          const blob = new Blob([bytes], {type: guessMime(imgPath)});
          blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(imgPath, blobUrl);
          cleanupUrls.push(blobUrl);
        }
      }
      if (blobUrl) {
        img.setAttribute(attrName, blobUrl);
      }
    }

    const headingEl = htmlDoc.querySelector('h1, h2, h3, title');
    const chapterTitle =
      headingEl?.textContent?.replace(/\s+/g, ' ').trim() || `Section ${chIdx + 1}`;
    const bodyHtml = htmlDoc.body?.innerHTML?.trim() || rawHtml;

    chapters.push({
      index: chIdx,
      id: entry.id,
      href: entry.fullPath,
      title: chapterTitle,
      html: bodyHtml,
    });
  }

  // Extract TOC from EPUB 3 nav or EPUB 2 NCX
  const toc: ParsedTocItem[] = [];
  let navHref: string | null = null;
  let ncxHref: string | null = null;

  for (const m of manifestById.values()) {
    if (m.properties.includes('nav')) navHref = m.href;
    if (m.mediaType === 'application/x-dtbncx+xml' || m.href.toLowerCase().endsWith('.ncx')) {
      ncxHref = m.href;
    }
  }

  let tocCounter = 0;
  if (navHref) {
    const navPath = resolveRelativePath(opfDir, navHref);
    const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/')) : '';
    const navStr = await findZipFile(zip, navPath)?.async('string');
    if (navStr) {
      const navDoc = parser.parseFromString(navStr, 'text/html');
      const tocNav =
        navDoc.querySelector('nav[epub\\:type="toc"], nav[role="doc-toc"], nav') || navDoc.body;
      const walkOl = (parent: Element, depth: number) => {
        const lis = Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === 'li');
        for (const li of lis) {
          const a = li.querySelector(':scope > a[href], :scope > span > a[href]');
          if (a) {
            const label = a.textContent?.replace(/\s+/g, ' ').trim();
            const href = a.getAttribute('href') || '';
            const [filePart, hashPart] = href.split('#');
            const resolved = resolveRelativePath(navDir, decodeURIComponent(filePart));
            const idx =
              hrefToChapterIdx.get(resolved) ??
              hrefToChapterIdx.get(resolved.toLowerCase()) ??
              hrefToChapterIdx.get(filePart);
            if (label && idx !== undefined) {
              toc.push({
                id: `epub-toc-${tocCounter++}`,
                title: label,
                unitIndex: idx,
                anchorId: hashPart ? decodeURIComponent(hashPart) : undefined,
                depth,
              });
            }
          }
          const nestedOl = li.querySelector(':scope > ol, :scope > ul');
          if (nestedOl && depth < 3) walkOl(nestedOl, depth + 1);
        }
      };
      const rootOl = tocNav.querySelector('ol, ul');
      if (rootOl) walkOl(rootOl, 0);
    }
  } else if (ncxHref) {
    const ncxPath = resolveRelativePath(opfDir, ncxHref);
    const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/')) : '';
    const ncxStr = await findZipFile(zip, ncxPath)?.async('string');
    if (ncxStr) {
      const ncxDoc = parser.parseFromString(ncxStr, 'application/xml');
      const walkNavPoints = (parent: Element, depth: number) => {
        const navPoints = Array.from(parent.children).filter((el) => el.localName === 'navPoint');
        for (const np of navPoints) {
          const textNode = Array.from(np.getElementsByTagName('*')).find(
            (el) => el.localName === 'text'
          );
          const contentNode = Array.from(np.getElementsByTagName('*')).find(
            (el) => el.localName === 'content'
          );
          const label = textNode?.textContent?.replace(/\s+/g, ' ').trim();
          const src = contentNode?.getAttribute('src') || '';
          const [filePart, hashPart] = src.split('#');
          const resolved = resolveRelativePath(ncxDir, decodeURIComponent(filePart));
          const idx =
            hrefToChapterIdx.get(resolved) ?? hrefToChapterIdx.get(resolved.toLowerCase());
          if (label && idx !== undefined) {
            toc.push({
              id: `epub-ncx-${tocCounter++}`,
              title: label,
              unitIndex: idx,
              anchorId: hashPart ? decodeURIComponent(hashPart) : undefined,
              depth,
            });
          }
          if (depth < 3) walkNavPoints(np, depth + 1);
        }
      };
      const navMap = Array.from(ncxDoc.getElementsByTagName('*')).find(
        (el) => el.localName === 'navMap'
      );
      if (navMap) walkNavPoints(navMap, 0);
    }
  }

  if (toc.length === 0) {
    chapters.forEach((ch) => {
      toc.push({
        id: `epub-ch-${ch.index}`,
        title: ch.title,
        unitIndex: ch.index,
        depth: 0,
      });
    });
  }

  // Update chapter titles from TOC when TOC gives cleaner chapter names
  for (const item of toc) {
    if (item.depth === 0 && chapters[item.unitIndex] && chapters[item.unitIndex].title.startsWith('Section ')) {
      chapters[item.unitIndex].title = item.title;
    }
  }

  return {
    title,
    subtitle: '',
    author,
    description,
    publisher,
    language,
    year,
    coverDataUrl,
    chapters,
    toc,
    cleanupUrls,
  };
}

export async function parseEpubForReading(data: ArrayBuffer): Promise<ParsedReflowableBook> {
  const parsed = await parseEpubCore(data, 'Book.epub', true);
  return {
    title: parsed.title,
    author: parsed.author,
    chapters: parsed.chapters,
    toc: parsed.toc,
    cleanupUrls: parsed.cleanupUrls,
  };
}

export async function extractEpubImportMetadata(
  data: ArrayBuffer,
  fileName: string
): Promise<ImportMetadataResult> {
  const [fileHash, parsed] = await Promise.all([
    computeSha256Hex(data),
    parseEpubCore(data, fileName, false),
  ]);
  return {
    format: 'epub',
    fileName,
    fileSize: data.byteLength,
    fileHash,
    title: parsed.title,
    subtitle: parsed.subtitle,
    author: parsed.author,
    description: parsed.description,
    publisher: parsed.publisher,
    language: parsed.language,
    year: parsed.year,
    totalUnits: Math.max(1, parsed.chapters.length),
    coverDataUrl: parsed.coverDataUrl,
  };
}
