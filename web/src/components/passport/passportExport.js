// Export the passport as a downloadable PNG or PDF. html2canvas + jsPDF are
// dynamically imported so they never weigh down the initial bundle — they only
// load the first time someone actually exports.

async function renderNode(node, scale = 2) {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas(node, {
    scale,
    backgroundColor: '#ece3cf',
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
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

export async function exportPng(node, filename = 'cohear-passport.png') {
  const canvas = await renderNode(node);
  triggerDownload(canvas.toDataURL('image/png'), filename);
}

export async function exportPdf(node, filename = 'cohear-passport.pdf') {
  const canvas = await renderNode(node);
  const { jsPDF } = await import('jspdf');
  const w = canvas.width;
  const h = canvas.height;
  const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
  pdf.save(filename);
}
