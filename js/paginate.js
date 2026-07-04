// เอนจินจัดหน้ากระดาษ: จำลองการแบ่งหน้าแบบ Word ภายใน contenteditable เดียว
// โดยแทรก "ตัวคั่นหน้า" (spacer) ที่มองไม่เห็น ณ จุดที่เนื้อหาล้นขอบล่างของหน้า

const Paginate = (() => {
  const PAPER_SIZES_MM = {
    A4: { w: 210, h: 297 },
    A5: { w: 148, h: 210 },
    B5: { w: 176, h: 250 },
    Letter: { w: 215.9, h: 279.4 },
    Legal: { w: 215.9, h: 355.6 }
  };

  const MARGIN_PRESETS_MM = {
    normal: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    narrow: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
    moderate: { top: 25.4, bottom: 25.4, left: 19.05, right: 19.05 },
    wide: { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 },
    thaigov: { top: 30, bottom: 20, left: 30, right: 20 }
  };

  const GAP_MM = 12;

  let probeEl = null;
  function mmToPx(mm) {
    if (!probeEl) {
      probeEl = document.createElement('div');
      probeEl.style.position = 'absolute';
      probeEl.style.visibility = 'hidden';
      probeEl.style.pointerEvents = 'none';
      probeEl.style.height = '0mm';
      probeEl.style.width = '0mm';
      document.body.appendChild(probeEl);
    }
    probeEl.style.height = mm + 'mm';
    return probeEl.offsetHeight;
  }

  function applySizing(paperOuterEl, pageBgStackEl, editorOverlayEl, s) {
    paperOuterEl.style.width = s.paperW + 'mm';
    pageBgStackEl.style.setProperty('--page-gap', GAP_MM + 'mm');
    editorOverlayEl.style.width = s.paperW + 'mm';
    editorOverlayEl.style.paddingTop = s.marginTop + 'mm';
    editorOverlayEl.style.paddingRight = s.marginRight + 'mm';
    editorOverlayEl.style.paddingLeft = s.marginLeft + 'mm';
    editorOverlayEl.style.paddingBottom = '0px';
  }

  function clearSpacers(editorOverlayEl) {
    editorOverlayEl.querySelectorAll('.page-spacer').forEach(n => n.remove());
  }

  function makeSpacer(heightPx) {
    const spacer = document.createElement('div');
    spacer.className = 'page-spacer';
    spacer.setAttribute('contenteditable', 'false');
    spacer.style.height = heightPx + 'px';
    return spacer;
  }

  // ---------- mid-paragraph splitting (so one long paragraph can span pages) ----------
  function getTextNodesIn(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const arr = [];
    let n;
    while ((n = walker.nextNode())) arr.push(n);
    return arr;
  }

  function rectsForRange(range) {
    return Array.from(range.getClientRects()).filter(r => r.height > 0.5);
  }

  function findSplitOffset(block, allowedPx) {
    const nodes = getTextNodesIn(block);
    if (nodes.length === 0) return null;
    const totalLen = nodes.reduce((a, n) => a + n.nodeValue.length, 0);
    if (totalLen === 0) return null;

    const fullRange = document.createRange();
    fullRange.setStart(nodes[0], 0);
    fullRange.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].nodeValue.length);
    const lineRects = rectsForRange(fullRange).sort((a, b) => a.top - b.top);
    if (lineRects.length === 0) return null;
    const baseTop = lineRects[0].top;

    let targetLineTop = null;
    for (const r of lineRects) {
      const relBottom = (r.top - baseTop) + r.height;
      if (relBottom > allowedPx + 0.5) { targetLineTop = r.top; break; }
    }
    if (targetLineTop === null) return null;
    if (Math.abs(targetLineTop - baseTop) < 0.5) return null;

    function locate(globalOffset) {
      let remaining = globalOffset;
      for (const node of nodes) {
        const len = node.nodeValue.length;
        if (remaining <= len) return { node, offset: remaining };
        remaining -= len;
      }
      const last = nodes[nodes.length - 1];
      return { node: last, offset: last.nodeValue.length };
    }

    function lineTopAt(globalOffset) {
      const { node, offset } = locate(globalOffset);
      const r = document.createRange();
      r.setStart(nodes[0], 0);
      r.setEnd(node, offset);
      const rects = rectsForRange(r);
      if (rects.length === 0) return baseTop;
      return rects[rects.length - 1].top;
    }

    let lo = 0, hi = totalLen;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const top = lineTopAt(mid);
      if (top >= targetLineTop - 0.5) hi = mid; else lo = mid + 1;
    }
    let splitOffset = lo;
    while (splitOffset > 0 && Math.abs(lineTopAt(splitOffset - 1) - targetLineTop) < 0.5) {
      splitOffset--;
    }
    if (splitOffset <= 0 || splitOffset >= totalLen) return null;
    return splitOffset;
  }

  function trySplitBlock(block, allowedPx) {
    if (block.tagName !== 'P' && block.tagName !== 'DIV') return null;
    const splitOffset = findSplitOffset(block, allowedPx);
    if (splitOffset === null) return null;

    const nodesOrig = getTextNodesIn(block);
    let remaining = splitOffset;
    let node = nodesOrig[nodesOrig.length - 1];
    let offset = node.nodeValue.length;
    for (const n of nodesOrig) {
      const len = n.nodeValue.length;
      if (remaining <= len) { node = n; offset = remaining; break; }
      remaining -= len;
    }
    const nodeIndex = nodesOrig.indexOf(node);

    const newBlock = block.cloneNode(true);

    const tailRange = document.createRange();
    tailRange.setStart(node, offset);
    tailRange.setEnd(block, block.childNodes.length);
    tailRange.deleteContents();

    const nodesClone = getTextNodesIn(newBlock);
    const cloneNode = nodesClone[nodeIndex];
    const headRange = document.createRange();
    headRange.setStart(newBlock, 0);
    headRange.setEnd(cloneNode, offset);
    headRange.deleteContents();

    newBlock.classList.add('split-continuation');
    block.parentNode.insertBefore(newBlock, block.nextSibling);
    return newBlock;
  }

  // ต่อชิ้นส่วนย่อหน้าที่ถูกตัดแบ่งหน้าไว้ก่อนหน้านี้กลับเป็นย่อหน้าเดียว
  // ก่อนคำนวณแบ่งหน้าใหม่ทุกครั้ง เพื่อไม่ให้ย่อหน้ากระจัดกระจายสะสมเมื่อตั้งค่าเปลี่ยนซ้ำๆ
  function mergeSplitContinuations(editorOverlayEl) {
    let child = editorOverlayEl.firstElementChild;
    while (child) {
      const next = child.nextElementSibling;
      if (next && next.classList.contains('split-continuation') && !child.classList.contains('page-spacer')) {
        while (next.firstChild) child.appendChild(next.firstChild);
        next.remove();
        continue;
      }
      child = next;
    }
  }

  function recompute(editorOverlayEl, pageBgStackEl, s) {
    clearSpacers(editorOverlayEl);
    mergeSplitContinuations(editorOverlayEl);

    const paperHpx = mmToPx(s.paperH);
    const marginTopPx = mmToPx(s.marginTop);
    const marginBottomPx = mmToPx(s.marginBottom);
    const gapPx = mmToPx(GAP_MM);
    const pageContentHeightPx = paperHpx - marginTopPx - marginBottomPx;

    const queue = Array.from(editorOverlayEl.children);
    let cumulative = 0;
    let pagesCount = 1;
    let i = 0;

    function measure(child) {
      const cs = getComputedStyle(child);
      const mTop = parseFloat(cs.marginTop) || 0;
      const mBottom = parseFloat(cs.marginBottom) || 0;
      return child.offsetHeight + mTop + mBottom;
    }

    while (i < queue.length) {
      const child = queue[i];
      if (child.classList.contains('page-spacer')) { i++; continue; }

      const isHardBreak = child.classList.contains('hard-page-break');
      if (isHardBreak && cumulative > 0) {
        const spacerHeightPx = (pageContentHeightPx - cumulative) + marginBottomPx + gapPx + marginTopPx;
        editorOverlayEl.insertBefore(makeSpacer(spacerHeightPx), child);
        pagesCount++;
        cumulative = 0;
        continue;
      }

      const allowed = pageContentHeightPx - cumulative;
      const totalHeight = measure(child);

      if (totalHeight <= allowed || isHardBreak) {
        cumulative += totalHeight;
        i++;
        continue;
      }

      const newBlock = trySplitBlock(child, allowed);
      if (newBlock) {
        queue.splice(i + 1, 0, newBlock);
        const newChildHeight = measure(child);
        const spacerHeightPx = (pageContentHeightPx - (cumulative + newChildHeight)) + marginBottomPx + gapPx + marginTopPx;
        editorOverlayEl.insertBefore(makeSpacer(spacerHeightPx), newBlock);
        pagesCount++;
        cumulative = 0;
        i++;
        continue;
      }

      if (cumulative > 0) {
        const spacerHeightPx = (pageContentHeightPx - cumulative) + marginBottomPx + gapPx + marginTopPx;
        editorOverlayEl.insertBefore(makeSpacer(spacerHeightPx), child);
        pagesCount++;
        cumulative = totalHeight;
      } else {
        cumulative += totalHeight;
      }
      i++;
    }

    pageBgStackEl.innerHTML = '';
    for (let p = 0; p < pagesCount; p++) {
      const pg = document.createElement('div');
      pg.className = 'page-bg';
      pg.style.width = s.paperW + 'mm';
      pg.style.height = s.paperH + 'mm';
      pageBgStackEl.appendChild(pg);
    }

    return pagesCount;
  }

  function getCurrentPageNumber(editorOverlayEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 1;
    let node = sel.getRangeAt(0).startContainer;
    let anchorEl = node.nodeType === 3 ? node.parentElement : node;
    while (anchorEl && anchorEl.parentElement !== editorOverlayEl && anchorEl !== editorOverlayEl) {
      anchorEl = anchorEl.parentElement;
    }
    if (!anchorEl || anchorEl === editorOverlayEl) return 1;
    let page = 1;
    let el = editorOverlayEl.firstElementChild;
    while (el) {
      if (el.classList.contains('page-spacer')) page++;
      if (el === anchorEl) break;
      el = el.nextElementSibling;
    }
    return page;
  }

  function countLinesInBlock(block) {
    const nodes = getTextNodesIn(block);
    const totalLen = nodes.reduce((a, n) => a + n.nodeValue.length, 0);
    if (nodes.length === 0 || totalLen === 0) return 1;
    const r = document.createRange();
    r.setStart(nodes[0], 0);
    r.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].nodeValue.length);
    // getClientRects() ให้หนึ่ง rect ต่อหนึ่ง "ช่วงการจัดรูปแบบ" ในแต่ละบรรทัด ไม่ใช่หนึ่ง rect ต่อบรรทัดเสมอไป
    // (เช่น ข้อความที่มี <b> หรือ <wbr> คั่นอยู่ในบรรทัดเดียวกันจะได้หลาย rect) จึงต้องรวม rect ที่ตำแหน่งบนใกล้กันเป็นบรรทัดเดียว
    const rects = rectsForRange(r).sort((a, b) => a.top - b.top);
    let count = 0;
    let lastTop = null;
    rects.forEach(rect => {
      if (lastTop === null || rect.top - lastTop > 1) { count++; lastTop = rect.top; }
    });
    return Math.max(1, count);
  }

  function countStats(editorOverlayEl) {
    const children = Array.from(editorOverlayEl.children);
    let paragraphs = 0;
    let lines = 0;
    let i = 0;
    while (i < children.length) {
      const el = children[i];
      if (el.classList.contains('page-spacer') || el.classList.contains('split-continuation')) { i++; continue; }
      paragraphs++;
      let j = i + 1;
      lines += countLinesInBlock(el);
      while (j < children.length && children[j].classList.contains('split-continuation')) {
        lines += countLinesInBlock(children[j]);
        j++;
      }
      i = j;
    }
    return { paragraphs, lines };
  }

  return {
    PAPER_SIZES_MM, MARGIN_PRESETS_MM, GAP_MM, mmToPx, applySizing, recompute,
    getCurrentPageNumber, countStats
  };
})();
