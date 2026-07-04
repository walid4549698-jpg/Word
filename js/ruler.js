// แถบไม้บรรทัดเหนือหน้ากระดาษ: ลากตัวชี้เพื่อกำหนดระยะเยื้องย่อหน้า (เหมือน Word)
const Ruler = (() => {
  const rulerBar = document.getElementById('rulerBar');
  const zoneLeft = document.getElementById('rulerMarginLeft');
  const zoneRight = document.getElementById('rulerMarginRight');
  const ticksContainer = document.getElementById('rulerTicks');
  const markerFirstLine = document.getElementById('markerFirstLine');
  const markerLeft = document.getElementById('markerLeftIndent');
  const markerRight = document.getElementById('markerRightIndent');

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
    markerFirstLine.style.left = firstX + 'px';
    markerRight.style.left = rightX + 'px';
  }

  function onChange(cb) { changeCallback = cb; }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function pxToMM(px) {
    const pxPer100mm = Paginate.mmToPx(100);
    return px / pxPer100mm * 100;
  }

  function positionMarkerLive(type, localPx) {
    const x = clamp(localPx, current.marginLeftPx, current.paperWpx - current.marginRightPx);
    if (type === 'left') markerLeft.style.left = x + 'px';
    else if (type === 'firstline') markerFirstLine.style.left = x + 'px';
    else if (type === 'right') markerRight.style.left = x + 'px';
  }

  function commitMarker(type, localPx) {
    const x = clamp(localPx, current.marginLeftPx, current.paperWpx - current.marginRightPx);
    let mmValue;
    if (type === 'left') {
      mmValue = pxToMM(x - current.marginLeftPx);
      changeCallback && changeCallback('left', mmValue);
    } else if (type === 'firstline') {
      const leftX = parseFloat(markerLeft.style.left) || current.marginLeftPx;
      mmValue = pxToMM(x - leftX);
      changeCallback && changeCallback('firstline', mmValue);
    } else if (type === 'right') {
      mmValue = pxToMM((current.paperWpx - current.marginRightPx) - x);
      changeCallback && changeCallback('right', mmValue);
    }
  }

  function setupDrag(markerEl, type) {
    markerEl.addEventListener('mousedown', e => {
      e.preventDefault();
      const rect = rulerBar.getBoundingClientRect();
      function toLocalPx(clientX) { return (clientX - rect.left) / current.zoom; }
      function onMove(ev) { positionMarkerLive(type, toLocalPx(ev.clientX)); }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        commitMarker(type, toLocalPx(ev.clientX));
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  setupDrag(markerLeft, 'left');
  setupDrag(markerFirstLine, 'firstline');
  setupDrag(markerRight, 'right');

  return { render, showForBlock, onChange };
})();
