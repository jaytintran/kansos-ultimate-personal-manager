import JSZip from 'jszip';

// ==========================================================================
// Built-in Readable Sample PDF & EPUB Generators (100% Offline, Self-Contained)
// ==========================================================================

function escapePdfText(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Generates a valid, standards-compliant 4-page PDF 1.4 document cleanly in memory
 * so users can test the built-in PDF reader (scroll, single-page, zoom, bookmarks) immediately.
 */
export function generateSamplePdfBytes(): ArrayBuffer {
  const pagesData: { heading: string; sub: string; lines: string[] }[] = [
    {
      heading: 'The Craft of Calm Systems',
      sub: 'A Field Manual for Local-First Personal Workspaces',
      lines: [
        'Chapter 1: Why Speed Feels Like Clarity',
        '',
        'Most productivity tools fail not because they lack features, but because they',
        'insert friction between a human thought and its written record. Every spinner,',
        'forced modal, and cloud round-trip quietly taxes working memory.',
        '',
        'When software stores your work locally first, actions resolve in milliseconds.',
        'Capturing an anchor at 9:30 AM or reviewing a reference page becomes as natural',
        'as opening a paper notebook on your desk.',
        '',
        'Key Principle: Treat latency as a design defect, not an infrastructure detail.',
      ],
    },
    {
      heading: 'Chapter 2: Single Sources of Truth',
      sub: 'Eliminating Duplication Across Daily Views',
      lines: [
        'A calendar event, a timeline milestone, and a meeting agenda are not three',
        'separate artifacts. They are three perspectives onto the same moment in time.',
        '',
        'By anchoring every entry to one authoritative record with explicit timestamps',
        '(created, scheduled, and completed), your daily spine stays truthful without',
        'manual copy-pasting or duplicate logs.',
        '',
        'Practice Exercise:',
        '  1. Limit your active unscheduled focus queue to 3 tasks.',
        '  2. Anchor only true time-bound commitments.',
        '  3. Review your completed dates at the end of each week.',
      ],
    },
    {
      heading: 'Chapter 3: Designing for Deep Reading',
      sub: 'Quiet Typography and Intentional Margins',
      lines: [
        'Screen reading often feels exhausting because interfaces surround prose with',
        'competing navigation chrome, notification counters, and harsh pure-white glare.',
        '',
        'Comfortable line measures (60 to 72 characters), generous leading, and warm',
        'archival paper or calm dark-slate palettes let your eyes settle into long-form',
        'thought for an hour without fatigue.',
        '',
        'Use the zoom, continuous/single-page toggle, and bookmarks bar above to test',
        'reading navigation inside Kanso Library.',
      ],
    },
    {
      heading: 'Chapter 4: Sovereign Backups',
      sub: 'Own Your Data Forever',
      lines: [
        'Your personal archive should outlive any single browser tab or service.',
        'Keeping files offline in IndexedDB while syncing lightweight structured JSON',
        'to a private GitHub Gist gives you instant offline reliability plus portable,',
        'human-readable backups you control.',
        '',
        'End of Field Manual — Open the Notes drawer in the top-right to send any',
        'reading excerpt directly into your Kanso Notes collection.',
      ],
    },
  ];

  // Build PDF objects cleanly
  const objects: string[] = [];
  // Obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const pageObjNums: number[] = [];
  const firstPageObj = 4; // Obj 3 is Font Helvetica, Obj 4+ are page/content pairs
  for (let i = 0; i < pagesData.length; i++) {
    pageObjNums.push(firstPageObj + i * 2);
  }

  // Obj 2: Pages
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${
      pagesData.length
    } >>\nendobj\n`
  );

  // Obj 3: Standard Font Helvetica
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );

  // Page & Content Stream objects
  pagesData.forEach((p, idx) => {
    const pageNum = firstPageObj + idx * 2;
    const contentNum = pageNum + 1;

    const streamOps: string[] = [
      '0.98 0.97 0.95 rg',
      '0 0 612 792 re f',
      '0.14 0.13 0.12 rg',
      'BT',
      '/F1 22 Tf',
      '64 700 Td',
      `(${escapePdfText(p.heading)}) Tj`,
      '0 -24 Td',
      '/F1 12 Tf',
      '0.45 0.42 0.39 rg',
      `(${escapePdfText(p.sub)}) Tj`,
      '0 -36 Td',
      '/F1 11.5 Tf',
      '0.16 0.15 0.14 rg',
    ];

    p.lines.forEach((line) => {
      streamOps.push(`(${escapePdfText(line)}) Tj`);
      streamOps.push('0 -19 Td');
    });

    streamOps.push('ET');
    streamOps.push('BT');
    streamOps.push('/F1 9.5 Tf');
    streamOps.push('0.5 0.48 0.45 rg');
    streamOps.push('64 48 Td');
    streamOps.push(`(Kanso Sample PDF  -  Page ${idx + 1} of ${pagesData.length}) Tj`);
    streamOps.push('ET');

    const streamStr = streamOps.join('\n');

    objects.push(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentNum} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream\nendobj\n`
    );
  });

  // Info dict
  const infoObjNum = firstPageObj + pagesData.length * 2;
  objects.push(
    `${infoObjNum} 0 obj\n<< /Title (The Craft of Calm Systems) /Author (Kanso Press) >>\nendobj\n`
  );

  // Assemble PDF with exact byte offsets
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdf).buffer;
}

/**
 * Generates a valid EPUB 3 archive in memory using JSZip for immediate built-in EPUB reader testing.
 */
export async function generateSampleEpubBytes(): Promise<ArrayBuffer> {
  const zip = new JSZip();

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">kanso-sample-epub-001</dc:identifier>
    <dc:title>Notes on Kanso &amp; Deep Reading</dc:title>
    <dc:creator>Haruki Sato</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Kanso Editorial</dc:publisher>
    <dc:description>Three short essays on minimalist digital tools, deliberate attention, and building a lasting personal reading archive.</dc:description>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="ch3"/>
  </spine>
</package>`
  );

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter1.xhtml">I. The Architecture of Simplicity</a></li>
        <li><a href="chapter2.xhtml">II. Reading as a Slow Dialogue</a></li>
        <li><a href="chapter3.xhtml">III. From Marginalia to Permanent Notes</a></li>
      </ol>
    </nav>
  </body>
</html>`
  );

  zip.file(
    'OEBPS/chapter1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>I. The Architecture of Simplicity</title></head>
  <body>
    <h1>I. The Architecture of Simplicity</h1>
    <p><em>Kanso</em> expresses the quiet elegance of elimination. In Japanese aesthetics, simplicity is never austerity for its own sake—it is the removal of visual clutter until only what serves life and attention remains.</p>
    <p>When we arrange our daily workspace around three honest commitments rather than forty anxious checkboxes, something subtle shifts. The day stops feeling like an inbox to survive and begins feeling like a craft to inhabit.</p>
    <blockquote>"Simplicity is about subtracting the obvious and adding the meaningful."</blockquote>
    <p>Notice how this EPUB reader adapts automatically to Kanso's active theme—try switching between Paper, Nordic, Emerald, Neon, and Cyberpunk in light or dark mode, or adjusting font family, font size, and line spacing in the reader bar above.</p>
  </body>
</html>`
  );

  zip.file(
    'OEBPS/chapter2.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>II. Reading as a Slow Dialogue</title></head>
  <body>
    <h1>II. Reading as a Slow Dialogue</h1>
    <p>Books reward a different rhythm than feeds. A feed asks for a reaction within three seconds; a book invites you to sit with an argument across chapters and revisit a paragraph a week later.</p>
    <h2>Practical Rituals for Deep Reading</h2>
    <ul>
      <li><strong>Keep your shelf curated:</strong> Mark books clearly as Unread, Reading, or Finished so your active reading list stays focused.</li>
      <li><strong>Bookmark turning points:</strong> Drop quick bookmarks whenever a passage shifts how you think about a project.</li>
      <li><strong>Read offline:</strong> Storing your EPUB and PDF files directly in local browser storage lets you read on flights, trains, and quiet mornings without a signal.</li>
    </ul>
    <p>Progress is saved automatically as you move between chapters, so closing a tab never loses your place.</p>
  </body>
</html>`
  );

  zip.file(
    'OEBPS/chapter3.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>III. From Marginalia to Permanent Notes</title></head>
  <body>
    <h1>III. From Marginalia to Permanent Notes</h1>
    <p>Reading without reflection fades quickly. Yet heavy academic note-taking systems often interrupt the pleasure of reading altogether. The sweet spot is lightweight marginalia right beside the text.</p>
    <p>Open the <strong>Notes</strong> drawer in the top-right of this reader to capture thoughts in markdown, or highlight any sentence on this page and send it directly into your <strong>Kanso Notes</strong> view—automatically tagged with this book's title.</p>
    <p>Over months and years, those small excerpts weave together into a living library of ideas you truly own.</p>
  </body>
</html>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}
