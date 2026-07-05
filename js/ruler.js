// แถบไม้บรรทัดเหนือหน้ากระดาษ: ลากตัวชี้เพื่อกำหนดระยะเยื้องย่อหน้า (เหมือน Word)
const Ruler = (() => {
  const rulerBar = document.getElementById('rulerBar');
  const zoneLeft = document.getElementById('rulerMarginLeft');
  const zoneRight = document.getElementById('rulerMarginRight');
  const ticksContainer = document.getElementById('rulerTicks');
  const markerFirstLine = document.getElementById('markerFirstLine');
  const markerLeft = document.getElementById('markerLeftIndent'); // สามเหลี่ยม = Hanging Indent (บรรทัดที่ 2 เป็นต้นไป)
  const markerLeftBox = document.getElementById('markerLeftBox'); // สี่เหลี่ยมเล็ก = Left Indent (ทั้งย่อหน้า)
  const markerRight = document.getElementById('markerRightIndent');
  const guideLine = document.getElementById('rulerGuideLine');

  let current = { paperWpx: 794, marginLeftPx: 96, marginRightPx: 96, zoom: 1 };
  let changeCallback = null;

  function render(pxSettings, zoom) {
    current.paperWpx = pxSettings.paperWpx;
    current.marginLeftPx = pxSettings.marginLeftPx;
    current.marginRightPx = pxSettings.marginRightPx;
    current.zoom = zoom;

    rulerBar.style.width = pxSettings.paperWpx + 'px';
    rulerBar.style.transform = `scale(${zoom})`;
    rulerBar.style.transformOrigin = 'top center';

    zoneLeft.style.left = '0px';
    zoneLeft.style.width = pxSettings.marginLeftPx + 'px';
    zoneRight.style.left = (pxSettings.paperWpx - pxSettings.marginRightPx) + 'px';
    zoneRight.style.width = pxSettings.marginRightPx + 'px';

    buildTicks(pxSettings);
  }

  function buildTicks(pxSettings) {
    ticksContainer.innerHTML = '';
    const cmPx = Paginate.mmToPx(10);
    const contentStart = pxSettings.marginLeftPx;
    const contentEnd = pxSettings.paperWpx - pxSettings.marginRightPx;
    let cm = 0;
    for (let x = contentStart; x <= contentEnd + 0.5; x += cmPx) {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick major';
      tick.style.left = x + 'px';
      ticksContainer.appendChild(tick);
      if (cm > 0) {
        const num = document.createElement('div');
        num.className = 'ruler-num';
        num.style.left = x + 'px';
        num.textContent = cm;
        ticksContainer.appendChild(num);
      }
      if (x + cmPx / 2 <= contentEnd) {
        const half = document.createElement('div');
        half.className = 'ruler-tick minor';
        half.style.left = (x + cmPx / 2) + 'px';
        ticksContainer.appendChild(half);
      }
      cm++;
    }
  }

  function showForBlock(block) {
    if (!block) return;
    const leftIndentMM = parseFloat(block.style.marginLeft) || 0;
    const firstLineMM = parseFloat(block.style.textIndent) || 0;
    const rightIndentMM = parseFloat(block.style.marginRight) || 0;
    const leftIndentPx = Paginate.mmToPx(leftIndentMM);
    const firstLinePx = Paginate.mmToPx(firstLineMM);
    const rightIndentPx = Paginate.mmToPx(rightIndentMM);

    const leftX = current.marginLeftPx + leftIndentPx;
    const firstX = leftX + firstLinePx;
    const rightX = current.paperWpx - current.marginRightPx - rightIndentPx;

    markerLeft.style.left = leftX + 'px';
    markerLeftBox.style.left = leftX + 'px';
    markerFirstLine.style.left = firstX + 'px';
    markerRight.style.left = rightX + 'px';
  }

  function onChange(cb) { changeCallback = cb; }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function pxToMM(px) {
    const pxPer100mm = Paginate.mmToPx(100);
    return px / pxPer100mm * 100;
  }

  let liveCallback = null;
  let dragStartCallback = null;
  let cancelCallback = null;
  function onLiveChange(cb) { liveCallback = cb; }
  function onDragStart(cb) { dragStartCallback = cb; }
  function onCancel(cb) { cancelCallback = cb; }

  // ล็อคตำแหน่งลากไว้ทุกๆ 0.5 ซม. ให้ตรงกับขีดย่อยที่มองเห็นบนไม้บรรทัด (เหมือน Word
  // ที่ค่าเริ่มต้นจะสะดุด/ล็อคเป็นช่วงๆ ไม่ใช่ลอยอิสระ) กด Alt ค้างเพื่อลากละเอียดแบบ
  // ไม่ล็อคขีด (ตรงกับ Word ที่ Alt = ปลดล็อคกริด)
  const SNAP_MM = 5;
  // ระยะกันชนขั้นต่ำระหว่างชุดตัวชี้ซ้ายกับตัวชี้ขวา (Word ไม่ยอมให้ลากทะลุกัน)
  const MIN_GAP_MM = 10;
  function snapMM(mm, snap) {
    if (!snap) return Math.round(mm * 100) / 100;
    return Math.round(mm / SNAP_MM) * SNAP_MM;
  }

  function markerX(el, fallback) {
    const v = parseFloat(el.style.left);
    return isNaN(v) ? fallback : v;
  }

  // ป้ายบอกระยะเป็น ซม. ระหว่างลาก (ช่วยกะตำแหน่งแม่นๆ)
  let dragTip = null;
  function showTip(xPx, mm) {
    if (!dragTip) {
      dragTip = document.createElement('div');
      dragTip.className = 'ruler-drag-tip';
      rulerBar.appendChild(dragTip);
    }
    dragTip.style.left = xPx + 'px';
    dragTip.textContent = (mm / 10).toFixed(2) + ' ซม.';
    dragTip.hidden = false;
  }
  function hideTip() { if (dragTip) dragTip.hidden = true; }

  // เส้นไกด์แนวตั้งลงมาตลอดหน้ากระดาษระหว่างลาก ใช้พิกัด local px เดียวกับตัวชี้ (ก่อนสเกลซูม)
  // เพราะ #paperOuter มี transform scale ของตัวเองอยู่แล้วเหมือน #rulerBar ทั้งสองกว้างเท่ากัน
  // และจัดกึ่งกลางด้วยกัน จึงใช้พิกัด x เดียวกันได้ตรงเป๊ะโดยไม่ต้องแปลงซ้ำ
  function showGuideLine(xPx) {
    guideLine.style.left = xPx + 'px';
    guideLine.classList.add('visible');
  }
  function hideGuideLine() { guideLine.classList.remove('visible'); }

  // ย้ายตัวชี้ + คำนวณค่า mm ของตำแหน่งปัจจุบัน (ใช้ทั้งตอนลากสด และตอนปล่อยเมาส์)
  //
  // ตรงตามพฤติกรรมจริงของ Word ที่มี 3 ตัวชี้ฝั่งซ้ายแยกกัน:
  // - 'firstline' (สามเหลี่ยมบน): ขยับเฉพาะบรรทัดแรก ไม่กระทบตำแหน่งบรรทัดอื่น
  // - 'hanging'   (สามเหลี่ยมล่าง): ขยับเฉพาะบรรทัดที่ 2 เป็นต้นไป บรรทัดแรกคงที่
  //   (ruler ส่งเฉพาะค่า marginLeft ใหม่กลับไป ให้ main.js ชดเชย textIndent จากค่าจริง
  //   ของย่อหน้า — ไม่คำนวณย้อนจากพิกัด px ของตัวชี้ ซึ่งเคยทำให้ค่าเพี้ยนเป็นทศนิยมยาว)
  // - 'left'      (สี่เหลี่ยมเล็ก): ขยับทั้งย่อหน้า ตัวชี้บนล่างเลื่อนไปด้วยกัน
  function positionMarker(type, localPx, snap) {
    const contentEnd = current.paperWpx - current.marginRightPx;
    const gapPx = Paginate.mmToPx(MIN_GAP_MM);
    const rightX = markerX(markerRight, contentEnd);
    // ตัวชี้ฝั่งซ้าย (บรรทัดแรก/hanging/left) ต้องลากเข้าไปในโซนระยะขอบซ้ายได้ (ค่าเยื้องติดลบ)
    // เหมือน Word จริง — ขอบเขตจึงเป็นขอบกระดาษจริง (0) ไม่ใช่ขอบเขตพื้นที่พิมพ์ (marginLeftPx)
    // ส่วนตัวชี้ขวาก็ลากเข้าโซนระยะขอบขวาได้เช่นกัน ขอบเขตคือขอบกระดาษ (paperWpx)
    const isLeftFamily = type !== 'right';
    const x = clamp(localPx, isLeftFamily ? 0 : current.marginLeftPx, isLeftFamily ? contentEnd : current.paperWpx);
    let mmValue, snappedX;

    if (type === 'left') {
      const oldLeftX = markerX(markerLeft, current.marginLeftPx);
      const oldFirstX = markerX(markerFirstLine, current.marginLeftPx);
      const firstOffsetPx = oldFirstX - oldLeftX;
      mmValue = snapMM(pxToMM(x - current.marginLeftPx), snap);
      snappedX = current.marginLeftPx + Paginate.mmToPx(mmValue);
      // ห้ามดันตัวชี้ตัวใดตัวหนึ่งในชุดซ้ายทะลุตัวชี้ขวา (เหมือน Word)
      const maxX = rightX - gapPx - Math.max(0, firstOffsetPx);
      if (snappedX > maxX) {
        snappedX = maxX;
        mmValue = pxToMM(snappedX - current.marginLeftPx);
      }
      markerLeft.style.left = snappedX + 'px';
      markerLeftBox.style.left = snappedX + 'px';
      markerFirstLine.style.left = (snappedX + firstOffsetPx) + 'px';
    } else if (type === 'hanging') {
      mmValue = snapMM(pxToMM(x - current.marginLeftPx), snap);
      snappedX = current.marginLeftPx + Paginate.mmToPx(mmValue);
      if (snappedX > rightX - gapPx) {
        snappedX = rightX - gapPx;
        mmValue = pxToMM(snappedX - current.marginLeftPx);
      }
      markerLeft.style.left = snappedX + 'px';
      markerLeftBox.style.left = snappedX + 'px';
      // markerFirstLine ไม่ขยับ เพราะ hanging indent ต้องไม่กระทบตำแหน่งบรรทัดแรก
    } else if (type === 'firstline') {
      const leftX = markerX(markerLeft, current.marginLeftPx);
      mmValue = snapMM(pxToMM(x - leftX), snap);
      snappedX = leftX + Paginate.mmToPx(mmValue);
      if (snappedX > rightX - gapPx) {
        snappedX = rightX - gapPx;
        mmValue = pxToMM(snappedX - leftX);
      }
      // อนุญาตให้เยื้องบรรทัดแรกติดลบจนถึงขอบกระดาษจริงได้ (ไม่ใช่แค่ถึงขอบพื้นที่พิมพ์)
      // เพื่อให้ลากมาไว้หน้าตัวชี้ hanging indent ได้ตามที่ควรทำได้แบบ Word
      if (snappedX < 0) {
        snappedX = 0;
        mmValue = pxToMM(snappedX - leftX);
      }
      markerFirstLine.style.left = snappedX + 'px';
    } else if (type === 'right') {
      mmValue = snapMM(pxToMM(contentEnd - x), snap);
      snappedX = contentEnd - Paginate.mmToPx(mmValue);
      const leftFamilyMaxX = Math.max(markerX(markerLeft, current.marginLeftPx), markerX(markerFirstLine, current.marginLeftPx));
      if (snappedX < leftFamilyMaxX + gapPx) {
        snappedX = leftFamilyMaxX + gapPx;
        mmValue = pxToMM(contentEnd - snappedX);
      }
      markerRight.style.left = snappedX + 'px';
    }
    showTip(snappedX, type === 'right' ? mmValue : pxToMM(snappedX - current.marginLeftPx));
    showGuideLine(snappedX);
    return mmValue;
  }

  function setupDrag(markerEl, type) {
    markerEl.addEventListener('mousedown', e => {
      e.preventDefault();
      dragStartCallback && dragStartCallback();
      // กัน "การเลื่อนตัวอักษร/ข้อความ" ในเอกสารระหว่างลากไม้บรรทัดโดยเด็ดขาด
      // (ไม่พึ่ง preventDefault ของ mousedown อย่างเดียว เพราะบางเบราว์เซอร์ยังลาก selection ต่อได้)
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const rect = rulerBar.getBoundingClientRect();
      // จำตำแหน่งตัวชี้ทุกตัวไว้ เผื่อผู้ใช้กด Esc ยกเลิกกลางคัน (เหมือน Word)
      const initialLefts = [markerFirstLine, markerLeft, markerLeftBox, markerRight].map(m => m.style.left);
      function toLocalPx(clientX) { return (clientX - rect.left) / current.zoom; }
      function cleanup() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('keydown', onKey);
        document.body.style.userSelect = prevUserSelect;
        hideTip();
        hideGuideLine();
      }
      function onMove(ev) {
        const mmValue = positionMarker(type, toLocalPx(ev.clientX), !ev.altKey);
        liveCallback && liveCallback(type, mmValue);
      }
      function onUp(ev) {
        const mmValue = positionMarker(type, toLocalPx(ev.clientX), !ev.altKey);
        cleanup();
        changeCallback && changeCallback(type, mmValue);
      }
      function onKey(ev) {
        if (ev.key !== 'Escape') return;
        [markerFirstLine, markerLeft, markerLeftBox, markerRight].forEach((m, i) => { m.style.left = initialLefts[i]; });
        cleanup();
        cancelCallback && cancelCallback();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('keydown', onKey);
    });
  }

  setupDrag(markerLeft, 'hanging');
  setupDrag(markerLeftBox, 'left');
  setupDrag(markerFirstLine, 'firstline');
  setupDrag(markerRight, 'right');

  return { render, showForBlock, onChange, onLiveChange, onDragStart, onCancel };
})();
