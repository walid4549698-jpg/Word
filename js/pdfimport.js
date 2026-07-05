// นำเข้า PDF เป็นข้อความที่แก้ไขได้ (ดึงเฉพาะข้อความ ไม่รักษาเค้าโครง/รูปภาพเดิมของ PDF)
// ใช้ pdf.js (โหลดจาก CDN ใน index.html) เพื่ออ่านเนื้อหาข้อความของแต่ละหน้า
// แล้วประกอบกลับเป็นย่อหน้า HTML คั่นด้วยตัวแบ่งหน้าเดิมของ PDF

const PdfImport = (() => {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const PARAGRAPH_GAP_PT = 8; // ช่องว่างแนวตั้งที่มากกว่านี้ถือว่าขึ้นย่อหน้าใหม่

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function joinFragment(prevText, nextText) {
    const prevChar = prevText.slice(-1);
    const nextChar = nextText.slice(0, 1);
    if (Thai.containsThai(prevChar) || Thai.containsThai(nextChar)) return '';
    return ' ';
  }

  function groupIntoLines(items) {
    const sorted = items.slice().sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 2) return dy;
      return a.transform[4] - b.transform[4];
    });
    const lines = [];
    let current = null;
    sorted.forEach(item => {
      const y = item.transform[5];
      if (current && Math.abs(current.y - y) <= 2) {
        current.text += item.str;
      } else {
        current = { y, text: item.str };
        lines.push(current);
      }
    });
    return lines;
  }

  function linesToParagraphs(lines) {
    const paragraphs = [];
    let prevY = null;
    lines.forEach(line => {
      const text = line.text.trim();
      if (!text) return;
      const gap = prevY === null ? Infinity : prevY - line.y;
      if (gap > PARAGRAPH_GAP_PT || paragraphs.length === 0) {
        paragraphs.push(text);
      } else {
        const last = paragraphs.length - 1;
        paragraphs[last] += joinFragment(paragraphs[last], text) + text;
      }
      prevY = line.y;
    });
    return paragraphs;
  }

  async function pageToHtml(page) {
    const textContent = await page.getTextContent();
    const paragraphs = linesToParagraphs(groupIntoLines(textContent.items));
    if (!paragraphs.length) return '<p><br></p>';
    return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
  }

  // onProgress(pageNum, totalPages) เรียกก่อนประมวลผลแต่ละหน้า
  async function extractToHtml(arrayBuffer, onProgress) {
    if (!window.pdfjsLib) throw new Error('ไม่พบไลบรารีอ่าน PDF (pdf.js โหลดไม่สำเร็จ)');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageHtmls = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (onProgress) onProgress(pageNum, pdf.numPages);
      const page = await pdf.getPage(pageNum);
      pageHtmls.push(await pageToHtml(page));
    }
    return pageHtmls.join('<div class="hard-page-break" contenteditable="false"></div>');
  }

  return { extractToHtml };
})();
