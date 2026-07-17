// Export the passport as a downloadable PNG or PDF. html2canvas + jsPDF are
// dynamically imported so they never weigh down the initial bundle — they only
// load the first time someone actually exports.
//
// The export sheet renders as real passport pages (88mm × 125mm, marked with
// data-export-page). PNG rasterises the whole sheet; PDF makes one life-size
// PDF page per passport page; Booklet imposes pages two-up on A4 landscape in
// saddle-stitch order, ready to print double-sided, fold and staple.

const PAGE_MM = { w: 88, h: 125 };

async function loadHtml2canvas() {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas;
}

async function renderNode(node, scale = 2) {
  const html2canvas = await loadHtml2canvas();
  return html2canvas(node, {
    scale,
    backgroundColor: '#ece3cf',
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

// Rasterise the passport pages. scale 3 over an ~333px-wide page gives
// ~290dpi at the printed 88mm — crisp enough for real-size printing.
//
// IMPORTANT: this renders the whole sheet in ONE html2canvas pass and slices
// the pages out of the big canvas. Every html2canvas call clones the entire
// document (including the Google Maps DOM, thousands of nodes), so rendering
// each page separately made a 10-page export take minutes.
//
// Pages go into the PDF as JPEG: PNG data-URLs at this resolution balloon the
// file to ~4MB per page, JPEG at q0.92 is visually identical on paper.
async function renderPages(node, scale = 3) {
  const pages = [...node.querySelectorAll('[data-export-page]')];
  if (!pages.length) return null;
  // Very stamp-heavy passports get a slightly lower dpi so the intermediate
  // canvas stays comfortably under browser canvas limits.
  const effScale = pages.length > 24 ? 2 : scale;
  const sheet = await renderNode(node, effScale);
  const origin = node.getBoundingClientRect();
  return pages.map((page) => {
    const r = page.getBoundingClientRect();
    const c = document.createElement('canvas');
    c.width = Math.round(r.width * effScale);
    c.height = Math.round(r.height * effScale);
    c.getContext('2d').drawImage(
      sheet,
      Math.round((r.left - origin.left) * effScale),
      Math.round((r.top - origin.top) * effScale),
      c.width, c.height,
      0, 0, c.width, c.height,
    );
    return c.toDataURL('image/jpeg', 0.92);
  });
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// PNG lays the pages out as close to a square as possible (cols = ceil √n) so
// the sheet browses like a contact sheet instead of a long skinny strip. The
// grid override is temporary — applied for the render, then restored.
export async function exportPng(node, filename = 'cohear-passport.png') {
  const pages = node.querySelectorAll('[data-export-page]').length;
  const cols = Math.max(2, Math.ceil(Math.sqrt(pages || 4)));
  const prev = { grid: node.style.gridTemplateColumns, width: node.style.width };
  node.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
  node.style.width = 'max-content';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const canvas = await renderNode(node);
    triggerDownload(canvas.toDataURL('image/png'), filename);
  } finally {
    node.style.gridTemplateColumns = prev.grid;
    node.style.width = prev.width;
  }
}

// One life-size (88×125mm) PDF page per passport page — print at 100% scale
// for a true-to-size mini passport. Falls back to the old single-image PDF if
// the sheet has no page markers.
export async function exportPdf(node, filename = 'cohear-passport.pdf') {
  const pages = await renderPages(node);
  const { jsPDF } = await import('jspdf');
  if (!pages) {
    const canvas = await renderNode(node);
    const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
    return;
  }
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_MM.w, PAGE_MM.h] });
  pages.forEach((url, i) => {
    if (i) pdf.addPage([PAGE_MM.w, PAGE_MM.h], 'portrait');
    pdf.addImage(url, 'JPEG', 0, 0, PAGE_MM.w, PAGE_MM.h);
  });
  pdf.save(filename);
}

// Saddle-stitch imposition: pages two-up on A4 landscape so that printing
// double-sided (flip on SHORT edge), folding the stack down the middle and
// stapling the spine yields a life-size passport booklet in reading order.
// Page count pads to a multiple of 4 with blank leaves (that's how real
// booklets work — every sheet carries 4 pages).
export async function exportBookletPdf(node, filename = 'cohear-passport-booklet.pdf') {
  const urls = await renderPages(node);
  if (!urls) throw new Error('export sheet has no pages');
  while (urls.length % 4) urls.push(null); // blank filler leaves
  const n = urls.length;

  const { jsPDF } = await import('jspdf');
  const A4 = { w: 297, h: 210 };
  const x0 = (A4.w - 2 * PAGE_MM.w) / 2;
  const y0 = (A4.h - PAGE_MM.h) / 2;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let first = true;
  for (let s = 0; s < n / 4; s += 1) {
    const front = [n - 2 * s, 1 + 2 * s]; // [left, right], 1-based page numbers
    const back = [2 + 2 * s, n - 1 - 2 * s];
    for (const face of [front, back]) {
      if (!first) pdf.addPage('a4', 'landscape');
      first = false;
      face.forEach((pageNo, k) => {
        const url = urls[pageNo - 1];
        if (url) pdf.addImage(url, 'JPEG', x0 + k * PAGE_MM.w, y0, PAGE_MM.w, PAGE_MM.h);
      });
      // Fold guide down the spine + trim marks around the pair.
      pdf.setDrawColor(150);
      pdf.setLineDashPattern?.([1.5, 1.5], 0);
      pdf.line(A4.w / 2, y0 - 5, A4.w / 2, y0 + PAGE_MM.h + 5);
      pdf.setLineDashPattern?.([], 0);
      pdf.rect(x0, y0, 2 * PAGE_MM.w, PAGE_MM.h);
    }
  }
  pdf.save(filename);
}
