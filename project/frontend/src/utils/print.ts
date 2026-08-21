/**
 * Print a single element (the report card) as a clean page, so "Download PDF"
 * uses the browser's built-in print-to-PDF without dragging in a PDF library.
 *
 * It renders the node into a hidden same-origin iframe and copies the app's
 * stylesheets in, so the card looks identical to what's on screen. The browser
 * print dialog's "Save as PDF" then produces the file.
 */
export function printElement(el: HTMLElement, title = 'Report') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body></body></html>`);
  doc.close();

  // Copy the app's styles (inline <style> and linked stylesheets) so Tailwind
  // classes render. Linked sheets load async, so count them and print once ready.
  const styleNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
  let pendingLinks = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    const win = iframe.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  styleNodes.forEach((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    if (clone.tagName === 'LINK') {
      pendingLinks += 1;
      clone.addEventListener('load', () => {
        pendingLinks -= 1;
        if (pendingLinks === 0) finish();
      });
      clone.addEventListener('error', () => {
        pendingLinks -= 1;
        if (pendingLinks === 0) finish();
      });
    }
    doc.head.appendChild(clone);
  });

  doc.body.style.background = 'white';
  doc.body.appendChild(el.cloneNode(true));

  // If there were no linked stylesheets, give inline styles a beat then print.
  if (pendingLinks === 0) setTimeout(finish, 200);
  // Safety net: never leave the dialog un-triggered.
  setTimeout(finish, 2000);
}
