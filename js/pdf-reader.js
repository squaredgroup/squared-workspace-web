// Loaded only when a PDF attachment becomes visible or a reader is opened.
let pdfjsPromise;
async function pdfjs() {
  pdfjsPromise ||= import("/assets/pdfjs/pdf.mjs").then(module => {
    module.GlobalWorkerOptions.workerSrc = "/assets/pdfjs/pdf.worker.mjs";
    return module;
  });
  return pdfjsPromise;
}

export async function openPDF(blob) {
  const module = await pdfjs();
  const task = module.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
  try {
    return { document: await task.promise, destroy: () => task.destroy() };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}

export async function drawPDFPage(document, pageNumber, canvas, width, signal) {
  if (signal?.aborted) return;
  const page = await document.getPage(pageNumber);
  if (signal?.aborted) return;
  const base = page.getViewport({ scale: 1 });
  const cssWidth = Math.max(1, Math.min(base.width, width));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: cssWidth / base.width * pixelRatio });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.ceil(viewport.height / pixelRatio)}px`;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Le lecteur PDF n’est pas disponible dans ce navigateur.");
  const render = page.render({ canvasContext: context, canvas, viewport });
  const cancel = () => render.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try { await render.promise; }
  finally { signal?.removeEventListener("abort", cancel); page.cleanup(); }
}
