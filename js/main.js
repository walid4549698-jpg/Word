(() => {
  const editorOverlay = document.getElementById('editorOverlay');
  const paperOuter = document.getElementById('paperOuter');
  const pageBgStack = document.getElementById('pageBgStack');
  const printArea = document.getElementById('printArea');
  const printPageStyle = document.getElementById('printPageStyle');

  const state = {
    paperSize: 'A4',
    customW: 21, customH: 29.7,
    orientation: 'portrait',
    marginPreset: 'normal',
    customMargin: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
    thaiWrap: true,
    zoom: 1
  };

  function currentPaperMM() {
    let w, h;
    if (state.paperSize === 'Custom') {
      w = state.customW * 10; h = state.customH * 10;
    } else {
      const p = Paginate.PAPER_SIZES_MM[state.paperSize];
      w = p.w; h = p.h;
    }
    if (state.orientation === 'landscape') { const t = w; w = h; h = t; }
    return { w, h };
  }

  function currentMarginMM() {
    if (state.marginPreset === 'custom') {
      return {
        top: state.customMargin.top * 10, bottom: state.customMargin.bottom * 10,
        left: state.customMargin.left * 10, right: state.customMargin.right * 10
      };
    }
    const m = Paginate.MARGIN_PRESETS_MM[state.marginPreset];
    return { top: m.top, bottom: m.bottom, left: m.left, right: m.right };
  }

  function buildSettings() {
    const paper = currentPaperMM();
    const margin = currentMarginMM();
    return {
      paperW: paper.w, paperH: paper.h,
      marginTop: margin.top, marginBottom: margin.bottom,
      marginLeft: margin.left, marginRight: margin.right
    };
  }

  let recomputeTimer = null;
  function scheduleRecompute(delay = 180) {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(doRecompute, delay);
  }

  function doRecompute() {
    const s = buildSettings();
    Paginate.applySizing(paperOuter, pageBgStack, editorOverlay, s);
    const savedTransform = paperOuter.style.transform;
    paperOuter.style.transform = 'none';
    const pages = Paginate.recompute(editorOverlay, pageBgStack, s);
    paperOuter.style.transform = savedTransform;
    updateStatusBar(pages);
    saveAutosave();
    updateRuler(s);
  }

  function updateRuler(s) {
    Ruler.render({
      paperWpx: Paginate.mmToPx(s.paperW),
      marginLeftPx: Paginate.mmToPx(s.marginLeft),
      marginRightPx: Paginate.mmToPx(s.marginRight)
    }, state.zoom);
    updateRulerFromSelection();
  }

  function updateRulerFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorOverlay.contains(sel.anchorNode)) return;
    const block = findBlockAncestor(sel.getRangeAt(0).startContainer);
    Ruler.showForBlock(block);
  }

  // ล็อกย่อหน้าเป้าหมายไว้ตั้งแต่เริ่มลาก (ไม่ใช่ query selection ใหม่ทุกครั้งที่ขยับเมาส์)
  // เพื่อให้ข้อความขยับตามไม้บรรทัดแบบสดๆ ระหว่างลาก เหมือนโปรแกรมเวิร์ดทั่วไป
  // พร้อมจำค่าเดิมของทุกย่อหน้าไว้ เผื่อกด Esc ยกเลิกกลางคัน (เหมือน Word)
  let dragBlocks = null;
  let dragSavedStyles = null;
  let dragAnchorFirstAbsMM = 0;
  function applyIndentToDragBlocks(type, mmValue) {
    const blocks = dragBlocks || getSelectedBlocks();
    blocks.forEach(b => {
      if (!b) return;
      if (type === 'left') b.style.marginLeft = Math.max(0, mmValue) + 'mm';
      else if (type === 'firstline') b.style.textIndent = mmValue + 'mm';
      else if (type === 'right') b.style.marginRight = Math.max(0, mmValue) + 'mm';
      else if (type === 'hanging') {
        // Hanging Indent: ขยับเฉพาะบรรทัดที่ 2 เป็นต้นไป (marginLeft) โดยชดเชย textIndent
        // ให้บรรทัดแรกคงตำแหน่งสัมบูรณ์เดิมที่จำไว้ตอนเริ่มลาก — คำนวณจากค่าจริงของย่อหน้า
        // ไม่ใช่ย้อนจากพิกัด px ของตัวชี้ จึงไม่มีเศษทศนิยมสะสม
        const oldMargin = parseFloat(b.style.marginLeft) || 0;
        const ml = Math.max(0, mmValue);
        b.style.marginLeft = ml + 'mm';
        b.style.textIndent = (dragAnchorFirstAbsMM - ml) + 'mm';
        // จุดหยุดแท็บที่เคยเล็งไว้ที่ hanging indent เดิม (เช่น "เรียน" + Tab) ต้องขยับเป้าหมาย
        // ตามไปด้วย ไม่งั้นเนื้อหาหลังแท็บ (เช่น "รองผู้อำนวยการ") จะค้างที่เดิม ไม่ตามตัวชี้เลย
        b.querySelectorAll('.tab-stop[data-target-mm]').forEach(span => {
          if (Math.abs(parseFloat(span.dataset.targetMm) - oldMargin) < 0.5) {
            span.dataset.targetMm = ml.toFixed(2);
          }
        });
        recalcTabStops(b);
      }
    });
  }
  Ruler.onDragStart(() => {
    dragBlocks = getSelectedBlocks();
    dragSavedStyles = dragBlocks.map(b => ({
      marginLeft: b.style.marginLeft, textIndent: b.style.textIndent, marginRight: b.style.marginRight
    }));
    const b0 = dragBlocks[0];
    dragAnchorFirstAbsMM = b0 ? (parseFloat(b0.style.marginLeft) || 0) + (parseFloat(b0.style.textIndent) || 0) : 0;
  });
  Ruler.onLiveChange(applyIndentToDragBlocks);
  Ruler.onChange((type, mmValue) => {
    applyIndentToDragBlocks(type, mmValue);
    scheduleRecompute(0);
    dragBlocks = null;
    dragSavedStyles = null;
  });
  Ruler.onCancel(() => {
    if (dragBlocks && dragSavedStyles) {
      dragBlocks.forEach((b, i) => {
        if (!b) return;
        b.style.marginLeft = dragSavedStyles[i].marginLeft;
        b.style.textIndent = dragSavedStyles[i].textIndent;
        b.style.marginRight = dragSavedStyles[i].marginRight;
      });
    }
    scheduleRecompute(0);
    dragBlocks = null;
    dragSavedStyles = null;
  });

  function applyZoom() {
    paperOuter.style.transform = `scale(${state.zoom})`;
  }

  // ---------- selection preservation for select/color inputs ----------
  let savedRange = null;
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorOverlay.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    editorOverlay.focus();
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }
  editorOverlay.addEventListener('mouseup', saveSelection);
  editorOverlay.addEventListener('keyup', saveSelection);
  editorOverlay.addEventListener('focus', saveSelection);

  document.execCommand('defaultParagraphSeparator', false, 'p');

  // ---------- ribbon tabs ----------
  document.querySelectorAll('.ribbon-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.ribbon-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });

  // ---------- simple exec commands ----------
  document.querySelectorAll('#ribbon button[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      editorOverlay.focus();
      scheduleRecompute();
      updateWordCount();
    });
  });

  // ---------- justify: อังกฤษ (เว้นวรรค) vs ไทย (ช่องไฟ) ----------
  function applyJustify(mode) {
    const blocks = getSelectedBlocks();
    blocks.forEach(b => {
      b.style.textAlign = 'justify';
      b.style.textJustify = mode;
    });
    editorOverlay.focus();
    scheduleRecompute();
    updateWordCount();
  }
  [['btnJustifyEnglish', 'inter-word'], ['btnJustifyThai', 'inter-character']].forEach(([id, mode]) => {
    const btn = document.getElementById(id);
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => applyJustify(mode));
  });

  // ---------- font name ----------
  const fontNameSel = document.getElementById('fontName');
  fontNameSel.addEventListener('change', () => {
    restoreSelection();
    document.execCommand('fontName', false, fontNameSel.value);
    scheduleRecompute();
  });

  // ---------- font size (custom pt) ----------
  const fontSizeSel = document.getElementById('fontSize');

  // ล้างขนาดตัวอักษรเดิมที่ฝังอยู่ลึกกว่า (nested span/font ที่มี font-size ของตัวเอง)
  // ไม่งั้นขนาดใหม่ที่ตั้งบน element นอกจะถูกขนาดเดิมด้านในบดบัง (สาเหตุที่เลือก 12 แล้วยังโชว์ใหญ่)
  function clearNestedFontSize(root) {
    root.querySelectorAll('[style*="font-size"]').forEach(el => { el.style.fontSize = ''; });
    root.querySelectorAll('font[size]').forEach(el => el.removeAttribute('size'));
  }

  function styleNodeFontSize(node, pt) {
    if (node.nodeType === 3) {
      if (!node.nodeValue) return null;
      const span = document.createElement('span');
      span.style.fontSize = pt + 'pt';
      span.textContent = node.nodeValue;
      return span;
    }
    node.style.fontSize = pt + 'pt';
    clearNestedFontSize(node);
    return node;
  }

  fontSizeSel.addEventListener('change', () => {
    restoreSelection();
    const pt = fontSizeSel.value;
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && editorOverlay.contains(sel.anchorNode)) {
      // ใช้ Range API ตรงๆ แทน execCommand('fontSize') hack เพราะ execCommand
      // มักตัดตัวอักษรท้ายข้อความที่คลุมไว้หลุดออกไปเมื่อขอบเขต selection ตกกลาง node
      const range = sel.getRangeAt(0);
      const frag = range.extractContents();
      const newFrag = document.createDocumentFragment();
      const insertedNodes = [];
      Array.from(frag.childNodes).forEach(node => {
        const styled = styleNodeFontSize(node, pt);
        if (styled) { newFrag.appendChild(styled); insertedNodes.push(styled); }
      });
      range.insertNode(newFrag);
      if (insertedNodes.length) {
        const newRange = document.createRange();
        newRange.setStartBefore(insertedNodes[0]);
        newRange.setEndAfter(insertedNodes[insertedNodes.length - 1]);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    } else {
      // เคอร์เซอร์ไม่ได้คลุมข้อความ: ตั้งค่าขนาดสำหรับตัวอักษรที่จะพิมพ์ต่อไป
      document.execCommand('fontSize', false, '7');
      editorOverlay.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement('span');
        span.style.fontSize = pt + 'pt';
        while (f.firstChild) span.appendChild(f.firstChild);
        f.parentNode.replaceChild(span, f);
      });
    }
    scheduleRecompute();
  });

  // ---------- colors ----------
  const foreColor = document.getElementById('foreColor');
  foreColor.addEventListener('input', () => {
    restoreSelection();
    document.execCommand('foreColor', false, foreColor.value);
    document.getElementById('foreColorSwatch').style.borderBottomColor = foreColor.value;
  });
  const hiliteColor = document.getElementById('hiliteColor');
  hiliteColor.addEventListener('input', () => {
    restoreSelection();
    try {
      document.execCommand('hiliteColor', false, hiliteColor.value);
    } catch (e) {
      document.execCommand('backColor', false, hiliteColor.value);
    }
    document.getElementById('hiliteColorSwatch').style.borderBottomColor = hiliteColor.value;
  });

  // ---------- shared block-selection helpers ----------
  function findBlockAncestor(node) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el.parentElement !== editorOverlay) el = el.parentElement;
    return el;
  }

  function getSelectedBlocks() {
    const sel = window.getSelection();
    const blocks = new Set();
    if (!sel || sel.rangeCount === 0) return [];
    const range = sel.getRangeAt(0);
    const startBlock = findBlockAncestor(range.startContainer);
    const endBlock = findBlockAncestor(range.endContainer);
    if (startBlock === endBlock) {
      if (startBlock) blocks.add(startBlock);
    } else {
      let within = false;
      Array.from(editorOverlay.children).forEach(child => {
        if (child === startBlock) within = true;
        if (within && !child.classList.contains('page-spacer')) blocks.add(child);
        if (child === endBlock) within = false;
      });
    }
    return Array.from(blocks);
  }

  function closestAncestorTag(node, tagName) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== editorOverlay) {
      if (el.tagName === tagName) return el;
      el = el.parentElement;
    }
    return null;
  }

  function isAtBlockStart(range, block) {
    if (!block) return false;
    const pre = document.createRange();
    pre.setStart(block, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length === 0;
  }

  // ---------- line spacing ----------
  const lineSpacingSel = document.getElementById('lineSpacing');
  lineSpacingSel.addEventListener('change', () => {
    restoreSelection();
    getSelectedBlocks().forEach(b => { b.style.lineHeight = lineSpacingSel.value; });
    scheduleRecompute();
  });

  // ---------- Tab: first-line indent / paragraph indent / measured tab stop ----------
  const TAB_STEP_MM = 12.7;

  // แปลงพิกัดซ้ายที่ "เรนเดอร์แล้ว" (rendered client px, ผ่าน getBoundingClientRect) ให้เป็น
  // มม. เทียบกับขอบซ้ายของพื้นที่พิมพ์จริง (หลังหักระยะขอบหน้ากระดาษ + ชดเชยระดับซูมจอ)
  function renderedLeftToMM(renderedLeftPx) {
    const editorRect = editorOverlay.getBoundingClientRect();
    const paddingLeftPx = parseFloat(getComputedStyle(editorOverlay).paddingLeft) || 0;
    const contentLeftRendered = editorRect.left + paddingLeftPx * state.zoom;
    const offsetLogicalPx = (renderedLeftPx - contentLeftRendered) / state.zoom;
    return offsetLogicalPx / Paginate.mmToPx(1);
  }

  // วัดตำแหน่งเคอร์เซอร์ปัจจุบันเป็น มม. เทียบกับขอบซ้ายของพื้นที่พิมพ์ (หลังหักระยะขอบหน้ากระดาษ)
  // ไม่แก้ไข DOM เลย (เดิมเคยแทรก/ลบ marker ชั่วคราวแล้วเรียก normalize() เพื่อวัด แต่พบว่า
  // เสี่ยงทำตัวอักษรข้างเคียงเลื่อนตำแหน่งผิดในบางกรณี) — ใช้วิธีวัด range ตั้งแต่ต้นย่อหน้า
  // ถึงเคอร์เซอร์แทน (มีเนื้อหาจริงอยู่แล้วเสมอ จึงมี rect ให้วัดได้ชัดเจน ไม่ต้องพึ่งการแทรกโหนด)
  function caretMM(range) {
    const block = findBlockAncestor(range.startContainer);
    const measureRange = document.createRange();
    measureRange.setStart(block, 0);
    measureRange.setEnd(range.startContainer, range.startOffset);
    const rects = Array.from(measureRange.getClientRects()).filter(r => r.width > 0.5 || r.height > 0.5);

    let rightEdgePx;
    if (rects.length > 0) {
      // เอาบรรทัดล่างสุดในช่วงที่วัด (คือบรรทัดปัจจุบันที่เคอร์เซอร์อยู่จริง) แล้วดูขอบขวาสุดของบรรทัดนั้น
      const bottomMostTop = Math.max(...rects.map(r => r.top));
      const sameLineRects = rects.filter(r => Math.abs(r.top - bottomMostTop) < 2);
      rightEdgePx = Math.max(...sameLineRects.map(r => r.right));
    } else {
      rightEdgePx = block.getBoundingClientRect().left;
    }
    return renderedLeftToMM(rightEdgePx);
  }

  // คำนวณความกว้างของจุดหยุดแท็บ (.tab-stop) ทุกจุดในย่อหน้าใหม่ ให้ยังคงลงเอยที่ตำแหน่ง
  // เป้าหมาย (data-target-mm) เดิม แม้ข้อความก่อนหน้าจะขยับ (เช่น บรรทัดแรกถูกปรับ) — ทำให้
  // จุดหยุดแท็บทำงานเหมือนแท็บสต็อปจริงของ Word ที่ปรับตำแหน่งใหม่ได้ ไม่ใช่ช่องว่างตายตัว
  function recalcTabStops(block) {
    block.querySelectorAll('.tab-stop[data-target-mm]').forEach(span => {
      const targetMM = parseFloat(span.dataset.targetMm);
      const beforeMM = renderedLeftToMM(span.getBoundingClientRect().left);
      span.style.width = Math.max(2, targetMM - beforeMM).toFixed(2) + 'mm';
    });
  }

  // แทรก "จุดหยุดแท็บ" ที่วัดตำแหน่งจริงเป็น มม. (ไม่ใช่ทับด้วยความกว้างตัวอักษรคงที่แบบเดิม)
  // แล้วตั้งระยะเยื้องซ้าย (hanging indent) ของย่อหน้าให้ตรงกับตำแหน่งแท็บนั้น พร้อมชดเชย
  // textIndent ให้บรรทัดแรกอยู่ตำแหน่งเดิมไม่ขยับ ผลคือ:
  // 1) บรรทัดที่ตัดขึ้นบรรทัดใหม่ (ข้อความยาวล้น) จะเรียงตรงกับคอลัมน์ที่แท็บไว้โดยอัตโนมัติ
  // 2) ลากตัวชี้ hanging บนไม้บรรทัดปรับตำแหน่งคอลัมน์นี้ได้จริงเหมือน Word
  function insertAlignedTab(range, block) {
    const oldMargin = parseFloat(block.style.marginLeft) || 0;
    const oldIndent = parseFloat(block.style.textIndent) || 0;
    const firstLineAbsMM = oldMargin + oldIndent;

    const curMM = caretMM(range);
    // ใช้จุดหยุดแท็บมาตรฐานเป็นระยะเท่ากันเสมอ นับจากขอบกระดาษ (ตรงกับ Word จริง) โดยไม่สนใจ
    // ว่าย่อหน้าจะสืบทอด margin มาจากย่อหน้าก่อนหน้าเท่าไหร่ — ถ้ากระโดดไปตาม margin ที่สืบทอด
    // มา จะทำให้บรรทัดสั้นๆ (เช่น "เรื่อง"/"เรียน") ได้ตำแหน่งคอลัมน์ไม่ตรงกับความยาวจริงของ
    // ตัวเอง กลายเป็นเยื้องมั่วไม่สัมพันธ์กัน ผู้ใช้ต้องการคอลัมน์เดียวกันให้กด Tab ซ้ำได้เหมือน Word
    let targetMM = Math.ceil((curMM + 1) / TAB_STEP_MM) * TAB_STEP_MM;
    let gapMM = targetMM - curMM;
    if (gapMM < 2) { targetMM += TAB_STEP_MM; gapMM += TAB_STEP_MM; }

    // ต้องใส่เนื้อหา (เว้นวรรคกว้างศูนย์ &#8203;) ไว้ข้างใน span ห้ามปล่อยว่างเปล่าเด็ดขาด —
    // พบว่า execCommand('insertHTML') ของเบราว์เซอร์แทรก span ที่ contenteditable="false"
    // แบบไม่มีเนื้อหาเลย ณ ตำแหน่งใกล้จุดตัดขึ้นบรรทัดใหม่ (line-wrap) ผิดตำแหน่งไปหนึ่งตัวอักษร
    // (ทำให้ "เรียน" ถูกตัดเป็น "เรีย" + span + "น" อย่างมั่ว) การมีเนื้อหาแม้มองไม่เห็นก็ทำให้
    // เบราว์เซอร์หาจุดแทรกที่ถูกต้องได้เสมอ
    document.execCommand('insertHTML', false,
      `<span class="tab-stop" contenteditable="false" data-target-mm="${targetMM.toFixed(2)}" style="display:inline-block;width:${gapMM.toFixed(2)}mm">&#8203;</span>`);

    // execCommand มักทิ้ง <br> เกินไว้ข้างในแท็กจัดรูปแบบ (เช่น <b>) ตอนแยกแท็กออกจากกัน
    // เพื่อแทรก span ที่ไม่ได้จัดรูปแบบเดียวกันเข้าไปกลางข้อความที่มีอยู่แล้ว ทั้งที่ย่อหน้ามี
    // เนื้อหาจริงอยู่แล้วไม่ควรมี <br> ค้างอยู่ (ต่างจาก <br> ตัวเดียวของย่อหน้าว่างเปล่า)
    block.querySelectorAll('br').forEach(br => { if (br.previousSibling) br.remove(); });

    // พบเคสที่เบราว์เซอร์ดัน span ที่เพิ่งแทรก (พร้อมเนื้อหาหลัง) หลุดออกไปเป็นพี่น้องของย่อหน้า
    // แทนที่จะอยู่ข้างในย่อหน้าเดิม (เกิดเฉพาะตอนเคอร์เซอร์อยู่ท้ายย่อหน้าพอดี) ต้องตรวจแล้วย้าย
    // สิ่งที่หลุดออกมากลับเข้าไปในย่อหน้าเดิม ก่อนที่จะเจอย่อหน้า/บล็อกอื่นที่ไม่ใช่ของเรา
    {
      const escaped = [];
      let node = block.nextSibling;
      while (node && !(node.nodeType === 1 && (node.tagName === 'P' || node.classList.contains('page-spacer') || node.classList.contains('hard-page-break')))) {
        const next = node.nextSibling;
        escaped.push(node);
        node = next;
      }
      escaped.forEach(n => block.appendChild(n));
    }

    // เบราว์เซอร์บางครั้งวางเคอร์เซอร์ไว้ "ข้างใน" span ที่เพิ่งแทรก (ซึ่งเป็น
    // contenteditable="false" แก้ไขไม่ได้จริง ทำให้พิมพ์ต่อไม่ได้เลย) ต้องบังคับย้ายเคอร์เซอร์
    // ออกมาไว้ "หลัง" ตัว span เอง — ใช้ text node จริงเป็นจุดยึด (ไม่ใช่ตำแหน่งอิง index ของ
    // container ซึ่งเคยพบว่าทำให้ execCommand ถัดไปแทรกเนื้อหาหลุดออกไปนอกย่อหน้าได้)
    const selNow = window.getSelection();
    if (selNow.rangeCount) {
      const anchor = selNow.getRangeAt(0).startContainer;
      const anchorEl = anchor.nodeType === 3 ? anchor.parentElement : anchor;
      const insertedSpan = anchorEl && anchorEl.closest ? anchorEl.closest('.tab-stop') : null;
      if (insertedSpan) {
        let anchorText = insertedSpan.nextSibling;
        if (!anchorText || anchorText.nodeType !== 3) {
          anchorText = document.createTextNode('');
          insertedSpan.parentNode.insertBefore(anchorText, insertedSpan.nextSibling);
        }
        const fixedRange = document.createRange();
        fixedRange.setStart(anchorText, 0);
        fixedRange.collapse(true);
        selNow.removeAllRanges();
        selNow.addRange(fixedRange);
      }
    }

    block.style.marginLeft = targetMM + 'mm';
    block.style.textIndent = (firstLineAbsMM - targetMM) + 'mm';
  }
  editorOverlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    const li = closestAncestorTag(range.startContainer, 'LI');
    if (li) {
      document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
      scheduleRecompute();
      return;
    }

    if (!range.collapsed) {
      getSelectedBlocks().forEach(b => {
        const cur = parseFloat(b.style.marginLeft) || 0;
        const next = e.shiftKey ? Math.max(0, cur - TAB_STEP_MM) : cur + TAB_STEP_MM;
        b.style.marginLeft = next + 'mm';
      });
      updateRulerFromSelection();
      scheduleRecompute();
      return;
    }

    const block = findBlockAncestor(range.startContainer);
    if (isAtBlockStart(range, block)) {
      const curIndent = parseFloat(block.style.textIndent) || 0;
      const curMargin = parseFloat(block.style.marginLeft) || 0;
      // ย่อหน้าใหม่ที่เพิ่งขึ้นบรรทัด (กด Enter) มักสืบทอด marginLeft/textIndent ของย่อหน้า
      // ก่อนหน้ามาด้วย (เช่น ต่อจากบรรทัด "เรียน" ที่มี hanging indent จากปุ่ม Tab)
      // ถ้าเจอลักษณะ hanging indent ที่สืบทอดมา (marginLeft บวก + textIndent ติดลบ) ตอนกด Tab
      // เดินหน้าธรรมดา ให้เริ่มย่อหน้าใหม่แบบสะอาด (marginLeft กลับเป็น 0) แทนบวกทับค่าที่สืบทอด
      // มาซึ่งจะโดน clamp จนกลายเป็น 0 อย่างงงๆ (เคยเป็นบั๊ก: ย่อหน้าถัดไปเลื่อนตามหัวเรื่องทั้งดุ้น)
      if (!e.shiftKey && curMargin > 0 && curIndent < 0) {
        block.style.marginLeft = '0mm';
        block.style.textIndent = TAB_STEP_MM + 'mm';
      } else {
        block.style.textIndent = Math.max(0, e.shiftKey ? curIndent - TAB_STEP_MM : curIndent + TAB_STEP_MM) + 'mm';
      }
      updateRulerFromSelection();
    } else if (!e.shiftKey) {
      insertAlignedTab(range, block);
      updateRulerFromSelection();
    }
    scheduleRecompute();
  });

  // Backspace at the very start of an indented block removes the indent
  // added by Tab instead of merging with the previous paragraph.
  editorOverlay.addEventListener('keydown', e => {
    if (e.key !== 'Backspace') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (closestAncestorTag(range.startContainer, 'LI')) return;
    const block = findBlockAncestor(range.startContainer);
    if (!block || !isAtBlockStart(range, block)) return;

    const curIndent = parseFloat(block.style.textIndent) || 0;
    if (curIndent > 0) {
      e.preventDefault();
      const next = Math.max(0, curIndent - TAB_STEP_MM);
      block.style.textIndent = next ? next + 'mm' : '';
      updateRulerFromSelection();
      scheduleRecompute();
      return;
    }
    const curMargin = parseFloat(block.style.marginLeft) || 0;
    if (curMargin > 0) {
      e.preventDefault();
      const next = Math.max(0, curMargin - TAB_STEP_MM);
      block.style.marginLeft = next ? next + 'mm' : '';
      updateRulerFromSelection();
      scheduleRecompute();
    }
  });

  // Shift+Enter (ตัวแบ่งบรรทัดแบบอ่อน) จะฝังบรรทัดใหม่ไว้ในย่อหน้าเดิม ทำให้ทุกบรรทัด
  // ใช้ระยะเยื้อง/การจัดหน้าเดียวกันแยกกันไม่ได้ (เหมือนใน Word ที่ระยะเยื้องเป็นคุณสมบัติ
  // ระดับย่อหน้า) เอกสารราชการไทยมักต้องการให้แต่ละบรรทัด (วันที่/เรื่อง/เรียน) เป็นคนละย่อหน้า
  // จึงตั้งใจให้ Shift+Enter ทำงานเหมือน Enter ปกติ เพื่อไม่ให้ผู้ใช้พลาดโดยไม่รู้ตัว
  editorOverlay.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.shiftKey) return;
    e.preventDefault();
    document.execCommand('insertParagraph', false, null);
    scheduleRecompute();
  });

  // ---------- Thai wrap ----------
  const thaiWrapToggle = document.getElementById('thaiWrapToggle');
  thaiWrapToggle.addEventListener('change', () => { state.thaiWrap = thaiWrapToggle.checked; });

  document.getElementById('btnThaiRewrap').addEventListener('click', () => {
    Thai.stripWbr(editorOverlay);
    Thai.rewrapElement(editorOverlay);
    scheduleRecompute(0);
  });

  editorOverlay.addEventListener('blur', e => {
    // ถ้าโฟกัสย้ายไปแถบเครื่องมือ (เช่น เลือกฟอนต์/ขนาด/สี) อย่าเพิ่งตัดคำใหม่
    // เพราะการตัดคำจะสร้าง text node ชุดใหม่ทับของเดิม ทำให้ selection ที่จำไว้
    // เพื่อใช้กับคำสั่งจากแถบเครื่องมือ (เช่น เปลี่ยนขนาดฟอนต์) ชี้ไป node เก่าที่หลุดไปแล้ว
    // ผลคือตัวอักษรท้ายๆ ที่เพิ่งถูกตัดคำใหม่จะไม่ถูกจัดรูปแบบตามที่เลือกไว้
    if (e.relatedTarget && e.relatedTarget.closest('#ribbon')) return;
    if (state.thaiWrap) {
      Thai.stripWbr(editorOverlay);
      Thai.rewrapElement(editorOverlay);
    }
  });

  // ---------- word / char count ----------
  function updateWordCount() {
    const text = editorOverlay.innerText || '';
    const words = Thai.countWords(text);
    const chars = Thai.countChars(text.replace(/\n/g, ''));
    document.getElementById('wordCountLabel').textContent = `คำ: ${words}`;
    document.getElementById('charCountLabel').textContent = `ตัวอักษร: ${chars}`;
    document.getElementById('wordCountLabel2').textContent = `คำ: ${words}`;
  }

  function updateStatusBar(pageCountOverride) {
    const total = pageCountOverride ?? pageBgStack.children.length;
    const current = Paginate.getCurrentPageNumber(editorOverlay);
    document.getElementById('pageIndicator').textContent = `หน้า ${Math.min(current, total)} จาก ${total}`;
    updateWordCount();
  }

  // ---------- word count detail modal ----------
  const wordCountModalBackdrop = document.getElementById('wordCountModalBackdrop');
  function openWordCountModal() {
    const text = editorOverlay.innerText || '';
    const stats = Paginate.countStats(editorOverlay);
    document.getElementById('wcPages').textContent = pageBgStack.children.length;
    document.getElementById('wcWords').textContent = Thai.countWords(text);
    document.getElementById('wcCharsNoSpace').textContent = Thai.countChars(text.replace(/\s/g, ''));
    document.getElementById('wcCharsSpace').textContent = Thai.countChars(text.replace(/\n/g, ''));
    document.getElementById('wcParagraphs').textContent = stats.paragraphs;
    document.getElementById('wcLines').textContent = stats.lines;
    wordCountModalBackdrop.hidden = false;
  }
  document.getElementById('btnWordCountDetail').addEventListener('click', openWordCountModal);
  document.getElementById('wordCountLabel2').addEventListener('click', openWordCountModal);
  document.getElementById('btnCloseWordCount').addEventListener('click', () => { wordCountModalBackdrop.hidden = true; });
  wordCountModalBackdrop.addEventListener('click', e => { if (e.target === wordCountModalBackdrop) wordCountModalBackdrop.hidden = true; });

  // ---------- editing input handling ----------
  if (!editorOverlay.innerHTML.trim()) {
    editorOverlay.innerHTML = '<p><br></p>';
  }
  editorOverlay.addEventListener('input', () => {
    scheduleRecompute();
  });
  editorOverlay.addEventListener('keyup', () => { updateStatusBar(); updateRulerFromSelection(); });
  editorOverlay.addEventListener('mouseup', () => { updateStatusBar(); updateRulerFromSelection(); });

  editorOverlay.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    if (state.thaiWrap) {
      setTimeout(() => { Thai.rewrapElement(editorOverlay); scheduleRecompute(0); }, 0);
    } else {
      scheduleRecompute();
    }
  });

  // ---------- layout tab: paper size / orientation / margins / zoom ----------
  const paperSizeSel = document.getElementById('paperSize');
  const customSizeRow = document.getElementById('customSizeRow');
  paperSizeSel.addEventListener('change', () => {
    state.paperSize = paperSizeSel.value;
    customSizeRow.hidden = state.paperSize !== 'Custom';
    doRecompute();
  });
  document.getElementById('customW').addEventListener('input', e => { state.customW = parseFloat(e.target.value) || 21; if (state.paperSize === 'Custom') doRecompute(); });
  document.getElementById('customH').addEventListener('input', e => { state.customH = parseFloat(e.target.value) || 29.7; if (state.paperSize === 'Custom') doRecompute(); });

  document.querySelectorAll('.toggle-btn[data-orient]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn[data-orient]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.orientation = btn.dataset.orient;
      doRecompute();
    });
  });

  const marginPresetSel = document.getElementById('marginPreset');
  const customMarginRow = document.getElementById('customMarginRow');
  marginPresetSel.addEventListener('change', () => {
    state.marginPreset = marginPresetSel.value;
    customMarginRow.hidden = state.marginPreset !== 'custom';
    doRecompute();
  });
  ['mTop', 'mBottom', 'mLeft', 'mRight'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      const key = id.slice(1).toLowerCase();
      state.customMargin[key] = parseFloat(e.target.value) || 0;
      if (state.marginPreset === 'custom') doRecompute();
    });
  });

  document.getElementById('zoomLevel').addEventListener('change', e => {
    state.zoom = parseFloat(e.target.value);
    applyZoom();
    updateRuler(buildSettings());
  });

  // ---------- insert: table / hr / image / page break ----------
  document.getElementById('btnInsertTable').addEventListener('click', () => {
    const rows = parseInt(prompt('จำนวนแถว', '2'), 10) || 2;
    const cols = parseInt(prompt('จำนวนคอลัมน์', '2'), 10) || 2;
    let html = '<table>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
      html += '</tr>';
    }
    html += '</table><p><br></p>';
    editorOverlay.focus();
    document.execCommand('insertHTML', false, html);
    scheduleRecompute();
  });

  document.getElementById('btnInsertHr').addEventListener('click', () => {
    editorOverlay.focus();
    document.execCommand('insertHorizontalRule', false, null);
    scheduleRecompute();
  });

  document.getElementById('btnInsertImage').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        editorOverlay.focus();
        document.execCommand('insertImage', false, reader.result);
        scheduleRecompute();
      };
      reader.readAsDataURL(file);
    });
    input.click();
  });

  document.getElementById('btnInsertPageBreak').addEventListener('click', () => {
    editorOverlay.focus();
    document.execCommand('insertHTML', false, '<div class="hard-page-break" contenteditable="false"></div><p><br></p>');
    scheduleRecompute(0);
  });

  // ---------- import PDF (text-only, editable) ----------
  const pdfInput = document.getElementById('pdfInput');
  const pdfImportStatus = document.getElementById('pdfImportStatus');
  document.getElementById('btnImportPdf').addEventListener('click', () => {
    if (!confirm('นำเข้า PDF จะดึงเฉพาะข้อความมาแก้ไขได้ รูปภาพและเค้าโครงเดิมของ PDF จะไม่ถูกเก็บไว้ ต้องการดำเนินการต่อหรือไม่?')) return;
    pdfInput.click();
  });
  pdfInput.addEventListener('change', () => {
    const file = pdfInput.files[0];
    if (!file) return;
    pdfImportStatus.textContent = 'กำลังอ่าน PDF...';
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const html = await PdfImport.extractToHtml(reader.result, (pageNum, total) => {
          pdfImportStatus.textContent = `กำลังแปลงหน้า ${pageNum}/${total}...`;
        });
        editorOverlay.innerHTML = html || '<p><br></p>';
        if (state.thaiWrap) Thai.rewrapElement(editorOverlay);
        doRecompute();
        pdfImportStatus.textContent = 'นำเข้า PDF สำเร็จ';
      } catch (err) {
        pdfImportStatus.textContent = 'นำเข้า PDF ไม่สำเร็จ: ' + err.message;
      }
    };
    reader.readAsArrayBuffer(file);
    pdfInput.value = '';
  });

  // ---------- file: new / open / save / print ----------
  document.getElementById('btnNew').addEventListener('click', () => {
    if (!confirm('สร้างเอกสารใหม่? งานที่ยังไม่ได้บันทึกไฟล์จะหายไป')) return;
    editorOverlay.innerHTML = '<p><br></p>';
    document.getElementById('docTitle').value = 'เอกสารที่ไม่มีชื่อ';
    localStorage.removeItem('myword_autosave');
    doRecompute();
  });

  const fileInput = document.getElementById('fileInput');
  document.getElementById('btnOpen').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const doc = new DOMParser().parseFromString(reader.result, 'text/html');
      const content = doc.getElementById('docContent');
      const meta = doc.getElementById('__settings__');
      if (content) editorOverlay.innerHTML = content.innerHTML;
      if (meta) {
        try {
          const loaded = JSON.parse(meta.textContent);
          Object.assign(state, loaded.state);
          document.getElementById('docTitle').value = loaded.title || 'เอกสารที่ไม่มีชื่อ';
          syncControlsFromState();
        } catch (e) { /* ignore malformed meta */ }
      }
      doRecompute();
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  function syncControlsFromState() {
    paperSizeSel.value = state.paperSize;
    customSizeRow.hidden = state.paperSize !== 'Custom';
    document.getElementById('customW').value = state.customW;
    document.getElementById('customH').value = state.customH;
    document.querySelectorAll('.toggle-btn[data-orient]').forEach(b => b.classList.toggle('active', b.dataset.orient === state.orientation));
    marginPresetSel.value = state.marginPreset;
    customMarginRow.hidden = state.marginPreset !== 'custom';
    document.getElementById('mTop').value = state.customMargin.top;
    document.getElementById('mBottom').value = state.customMargin.bottom;
    document.getElementById('mLeft').value = state.customMargin.left;
    document.getElementById('mRight').value = state.customMargin.right;
  }

  function serializeDocument() {
    const clone = editorOverlay.cloneNode(true);
    clone.querySelectorAll('.page-spacer').forEach(n => n.remove());
    const title = document.getElementById('docTitle').value;
    const meta = { title, state };
    return `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:'TH Sarabun New','Sarabun','Leelawadee UI',sans-serif;font-size:16pt;padding:20px;}
table{border-collapse:collapse;}table td{border:1px solid #999;padding:4px 8px;}
p{margin:0 0 8px 0;}
</style></head>
<body>
<div id="docContent" lang="th">${clone.innerHTML}</div>
<script type="application/json" id="__settings__">${JSON.stringify(meta)}<\/script>
</body></html>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  document.getElementById('btnSaveHtml').addEventListener('click', () => {
    const html = serializeDocument();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const title = document.getElementById('docTitle').value.trim() || 'document';
    a.download = title + '.html';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btnPrint').addEventListener('click', () => {
    const clone = editorOverlay.cloneNode(true);
    clone.querySelectorAll('.page-spacer').forEach(n => n.remove());
    clone.querySelectorAll('.hard-page-break').forEach(n => n.classList.add('hard-page-break-print'));
    printArea.innerHTML = clone.innerHTML;
    const s = buildSettings();
    printPageStyle.textContent = `@page { size: ${s.paperW}mm ${s.paperH}mm; margin: ${s.marginTop}mm ${s.marginRight}mm ${s.marginBottom}mm ${s.marginLeft}mm; }`;
    window.print();
  });

  // ---------- left icon rail ----------
  document.getElementById('railNew').addEventListener('click', () => document.getElementById('btnNew').click());
  document.getElementById('railWordCount').addEventListener('click', openWordCountModal);

  const rulerBar = document.getElementById('rulerBar');
  const railRulerToggle = document.getElementById('railRulerToggle');
  railRulerToggle.addEventListener('click', () => {
    const hidden = rulerBar.style.display === 'none';
    rulerBar.style.display = hidden ? '' : 'none';
    railRulerToggle.classList.toggle('active', hidden);
  });

  // ---------- find in document ----------
  const findBar = document.getElementById('findBar');
  const findInput = document.getElementById('findInput');
  const findCount = document.getElementById('findCount');
  let findMatches = [];
  let findIndex = -1;

  function clearFindHighlights() {
    editorOverlay.querySelectorAll('span.find-highlight').forEach(span => {
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    editorOverlay.normalize();
    findMatches = [];
    findIndex = -1;
  }

  function runFind(term) {
    clearFindHighlights();
    if (!term) { findCount.textContent = ''; return; }
    const walker = document.createTreeWalker(editorOverlay, NodeFilter.SHOW_TEXT, null);
    const lowerTerm = term.toLowerCase();
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach(textNode => {
      const text = textNode.nodeValue;
      const lowerText = text.toLowerCase();
      let start = 0;
      let idx;
      const pieces = [];
      let lastEnd = 0;
      while ((idx = lowerText.indexOf(lowerTerm, start)) !== -1) {
        pieces.push({ idx, end: idx + term.length });
        start = idx + term.length;
      }
      if (!pieces.length) return;
      const frag = document.createDocumentFragment();
      pieces.forEach(p => {
        if (p.idx > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, p.idx)));
        const mark = document.createElement('span');
        mark.className = 'find-highlight';
        mark.textContent = text.slice(p.idx, p.end);
        frag.appendChild(mark);
        findMatches.push(mark);
        lastEnd = p.end;
      });
      if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
    findCount.textContent = findMatches.length ? `1/${findMatches.length}` : 'ไม่พบ';
    if (findMatches.length) goToFindMatch(0);
  }

  function goToFindMatch(i) {
    if (!findMatches.length) return;
    if (findIndex >= 0) findMatches[findIndex].classList.remove('current');
    findIndex = (i + findMatches.length) % findMatches.length;
    const mark = findMatches[findIndex];
    mark.classList.add('current');
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
  }

  document.getElementById('railSearch').addEventListener('click', () => {
    findBar.hidden = !findBar.hidden;
    if (!findBar.hidden) { findInput.focus(); findInput.select(); }
    else clearFindHighlights();
  });
  document.getElementById('findClose').addEventListener('click', () => {
    findBar.hidden = true;
    clearFindHighlights();
  });
  findInput.addEventListener('input', () => runFind(findInput.value.trim()));
  findInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') goToFindMatch(findIndex + (e.shiftKey ? -1 : 1));
    if (e.key === 'Escape') { findBar.hidden = true; clearFindHighlights(); }
  });
  document.getElementById('findNext').addEventListener('click', () => goToFindMatch(findIndex + 1));
  document.getElementById('findPrev').addEventListener('click', () => goToFindMatch(findIndex - 1));

  // ---------- autosave ----------
  function saveAutosave() {
    try {
      const title = document.getElementById('docTitle').value;
      localStorage.setItem('myword_autosave', JSON.stringify({
        title, state, html: (() => {
          const clone = editorOverlay.cloneNode(true);
          clone.querySelectorAll('.page-spacer').forEach(n => n.remove());
          return clone.innerHTML;
        })()
      }));
      document.getElementById('saveStatus').textContent = 'บันทึกอัตโนมัติแล้ว';
    } catch (e) { /* storage full / unavailable, ignore */ }
  }

  function loadAutosave() {
    try {
      const raw = localStorage.getItem('myword_autosave');
      if (!raw) return false;
      const data = JSON.parse(raw);
      Object.assign(state, data.state);
      document.getElementById('docTitle').value = data.title || 'เอกสารที่ไม่มีชื่อ';
      editorOverlay.innerHTML = data.html || '<p><br></p>';
      syncControlsFromState();
      return true;
    } catch (e) { return false; }
  }

  document.getElementById('docTitle').addEventListener('input', () => saveAutosave());

  // ---------- init ----------
  if (!loadAutosave()) {
    editorOverlay.innerHTML = '<p>ยินดีต้อนรับสู่เวิร์ดของฉัน เริ่มพิมพ์ข้อความภาษาไทยได้เลย ระบบจะตัดคำและจัดหน้ากระดาษให้อัตโนมัติ</p>';
  }
  applyZoom();
  doRecompute();
  window.addEventListener('resize', () => scheduleRecompute(200));
})();
