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

  Ruler.onChange((type, mmValue) => {
    const blocks = getSelectedBlocks();
    blocks.forEach(b => {
      if (!b) return;
      if (type === 'left') b.style.marginLeft = Math.max(0, mmValue) + 'mm';
      else if (type === 'firstline') b.style.textIndent = mmValue + 'mm';
      else if (type === 'right') b.style.marginRight = Math.max(0, mmValue) + 'mm';
    });
    scheduleRecompute(0);
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

  // ---------- font name ----------
  const fontNameSel = document.getElementById('fontName');
  fontNameSel.addEventListener('change', () => {
    restoreSelection();
    document.execCommand('fontName', false, fontNameSel.value);
    scheduleRecompute();
  });

  // ---------- font size (custom pt, via execCommand hack) ----------
  const fontSizeSel = document.getElementById('fontSize');
  fontSizeSel.addEventListener('change', () => {
    restoreSelection();
    const pt = fontSizeSel.value;
    document.execCommand('fontSize', false, '7');
    editorOverlay.querySelectorAll('font[size="7"]').forEach(f => {
      const span = document.createElement('span');
      span.style.fontSize = pt + 'pt';
      while (f.firstChild) span.appendChild(f.firstChild);
      f.parentNode.replaceChild(span, f);
    });
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

  // ---------- Tab: first-line indent / paragraph indent / literal tab ----------
  const TAB_STEP_MM = 12.7;
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
      const cur = parseFloat(block.style.textIndent) || 0;
      block.style.textIndent = Math.max(0, e.shiftKey ? cur - TAB_STEP_MM : cur + TAB_STEP_MM) + 'mm';
      updateRulerFromSelection();
    } else if (!e.shiftKey) {
      document.execCommand('insertText', false, '\t');
    }
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

  editorOverlay.addEventListener('blur', () => {
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
