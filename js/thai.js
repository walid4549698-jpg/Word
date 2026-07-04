// ระบบตัดคำภาษาไทย (Thai word segmentation utilities)
// ใช้ Intl.Segmenter เมื่อรองรับ (Chrome/Edge) เป็นตัวหลัก
// เสริมด้วยการแทรก <wbr> ที่ขอบเขตคำ เพื่อบังคับจุดตัดบรรทัดที่ถูกต้อง
// แม้ในเอนจินที่ตัดคำไทยได้ไม่ดีนัก หรือข้อความยาวไม่มีช่องว่างเลย

const Thai = (() => {
  const THAI_RE = /[฀-๿]/;

  let segmenter = null;
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    }
  } catch (e) {
    segmenter = null;
  }

  function isSupported() {
    return !!segmenter;
  }

  // คืนค่า array ของ { text, isWordLike }
  function segment(text) {
    if (!segmenter) return [{ text, isWordLike: true }];
    return Array.from(segmenter.segment(text)).map(s => ({
      text: s.segment,
      isWordLike: s.isWordLike
    }));
  }

  function containsThai(text) {
    return THAI_RE.test(text);
  }

  // นับคำแบบรองรับภาษาไทย (คำที่ไม่มีช่องว่างคั่น) และภาษาอื่นๆ ผสมกัน
  function countWords(text) {
    if (!text || !text.trim()) return 0;
    if (segmenter) {
      let n = 0;
      for (const s of segmenter.segment(text)) {
        if (s.isWordLike) n++;
      }
      return n;
    }
    // fallback: แยกด้วยช่องว่าง/เครื่องหมายวรรคตอนทั่วไป (นับคำไทยรวมกันเป็นก้อนได้ไม่แม่นยำ)
    return text.trim().split(/[\s​]+/).filter(Boolean).length;
  }

  function countChars(text) {
    return Array.from(text).length;
  }

  // แทรก <wbr> ระหว่างคำไทยที่ถูกตัดด้วย Intl.Segmenter ใน text node เดียว
  // คืนค่าเป็น DocumentFragment ใหม่ (ไม่แก้ node เดิม)
  function buildWrappedFragment(text) {
    const frag = document.createDocumentFragment();
    if (!segmenter || !containsThai(text)) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    const parts = Array.from(segmenter.segment(text));
    parts.forEach((p, i) => {
      frag.appendChild(document.createTextNode(p.segment));
      if (i < parts.length - 1) {
        frag.appendChild(document.createElement('wbr'));
      }
    });
    return frag;
  }

  // เดินลึกเข้าไปใน element ที่กำหนด แล้วแทรก <wbr> ในทุก text node ที่มีภาษาไทย
  // ข้าม node ที่อยู่ใน element ที่ contenteditable=false (เช่น ตัวคั่นหน้ากระดาษ)
  function rewrapElement(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !containsThai(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        let el = node.parentElement;
        while (el && el !== root) {
          if (el.tagName === 'WBR' || el.getAttribute('contenteditable') === 'false') return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    targets.forEach(node => {
      const frag = buildWrappedFragment(node.nodeValue);
      node.parentNode.replaceChild(frag, node);
    });
  }

  // ลบ <wbr> ทั้งหมดออกจาก element (ใช้ก่อน save/export เพื่อให้ HTML สะอาด)
  function stripWbr(root) {
    root.querySelectorAll('wbr').forEach(n => n.remove());
  }

  return { isSupported, segment, containsThai, countWords, countChars, rewrapElement, stripWbr };
})();
