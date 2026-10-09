(function () {
  'use strict';

  // ---------- Config (mirrors the original Swiper + axios setup) ----------
  // On HTTPS (e.g. Vercel) a direct call to the HTTP API is blocked as mixed content,
  // so go through the same-origin /webapi rewrite defined in vercel.json.
  var API_URL = location.protocol === 'https:' ? '/webapi' : 'http://3.109.123.68:8090/webapi';
  var AUTOPLAY_DELAY = 5000;   // autoplay: { delay: 5000, disableOnInteraction: false }
  var REQUEST_TIMEOUT = 10000;
  var SWIPE_THRESHOLD = 50;    // px of drag needed to change slide

  // Slides 4–7: same TANK_IMAGE.jpg, one per zone. `screen` is the key in the API response.
  // Zone 1's level is "water_leve" (sic) in the API, so water_level is kept as a fallback.
  var TANKS = [
    { zone: 'ZONE 1', name: 'ಕೇರಿ ಓಣಿ  OVER HEAD TANK', screen: 'screen_2', level: 'water_leve|water_level', pressure: 'line_pressure_zone_1_pmp_1' },
    { zone: 'ZONE 2', name: 'ಬಸವೇಶ್ವರ ನಗರ OVER HEAD TANK', screen: 'screen_3', level: 'water_level', pressure: 'line_pressure_zone_2_pmp_1' },
    { zone: 'ZONE 3', name: 'WTP OVER HEAD TANK', screen: 'screen_4', level: 'water_level', pressure: 'line_pressure_zone_3_pmp_1' },
    { zone: 'ZONE 4', name: 'ಕೆ.ಎಚ್ .ಬಿ OVER HEAD TANK', screen: 'screen_5', level: 'water_level', pressure: 'line_pressure_zone_4_pmp_1' }
  ];

  var slider = document.getElementById('slider');
  var wrapper = document.getElementById('sliderWrapper');
  var pagination = document.getElementById('pagination');
  var statusEl = document.getElementById('apiStatus');

  // ---------- Build tank slides from the template ----------
  function buildTankSlides() {
    var template = document.getElementById('tankTemplate');
    var anchor = wrapper.querySelector('.slide-table');
    TANKS.forEach(function (tank) {
      var slide = template.content.firstElementChild.cloneNode(true);
      slide.querySelector('.zone').textContent = tank.zone;
      slide.querySelector('.name').textContent = tank.name;
      var keys = { level: tank.level, pressure: tank.pressure, inlet: 'inlet_flow_rate', outlet: 'outlet_flow_rate' };
      Object.keys(keys).forEach(function (k) {
        var paths = keys[k].split('|').map(function (key) { return tank.screen + '.' + key; });
        slide.querySelector('[data-key="' + k + '"]').setAttribute('data-field', paths.join('|'));
      });
      wrapper.insertBefore(slide, anchor);
    });
    template.remove();
  }

  // ---------- Slider (infinite loop via cloned edge slides) ----------
  var slides, count, index = 1, bullets = [], timer = null, animating = false;

  function initSlider() {
    slides = Array.prototype.slice.call(wrapper.querySelectorAll('.slide'));
    count = slides.length;
    slides.forEach(function (s, i) { s.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + count); });

    var firstClone = slides[0].cloneNode(true);
    var lastClone = slides[count - 1].cloneNode(true);
    [firstClone, lastClone].forEach(function (c) { c.setAttribute('aria-hidden', 'true'); c.classList.add('clone'); });
    wrapper.appendChild(firstClone);
    wrapper.insertBefore(lastClone, slides[0]);

    for (var i = 0; i < count; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bullet';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      b.addEventListener('click', goTo.bind(null, i + 1));
      pagination.appendChild(b);
      bullets.push(b);
    }

    setPosition(false);
    wrapper.addEventListener('transitionend', onTransitionEnd);
    document.getElementById('prevBtn').addEventListener('click', function () { goTo(index - 1); });
    document.getElementById('nextBtn').addEventListener('click', function () { goTo(index + 1); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === 'ArrowRight') goTo(index + 1);
    });
    initDrag();
    startAutoplay();
  }

  function realIndex() { return ((index - 1) % count + count) % count; }

  function setPosition(animate, dragPx) {
    wrapper.classList.toggle('no-transition', !animate);
    var px = dragPx ? ' + ' + dragPx + 'px' : '';
    wrapper.style.transform = 'translate3d(calc(' + (-index) + ' * (100% + 50px)' + px + '), 0, 0)';
    var active = realIndex();
    bullets.forEach(function (b, i) {
      b.classList.toggle('active', i === active);
      b.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
  }

  function goTo(target) {
    if (animating || target === index) return;
    index = Math.max(0, Math.min(count + 1, target));
    animating = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPosition(true);
    if (!animating) onTransitionEnd();
    startAutoplay();   // restart the delay after any change (disableOnInteraction: false)
    fetchData();       // the original re-fetches on every slide change
  }

  function onTransitionEnd(e) {
    if (e && e.target !== wrapper) return;
    animating = false;
    // Jump from a clone back to the real slide without animation
    if (index === 0) { index = count; setPosition(false); }
    else if (index === count + 1) { index = 1; setPosition(false); }
  }

  function startAutoplay() {
    clearTimeout(timer);
    timer = setTimeout(function () { goTo(index + 1); }, AUTOPLAY_DELAY);
  }

  function initDrag() {
    var startX = null, startY = 0, delta = 0, horizontal = null;

    slider.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || animating || e.target.closest('button')) return;
      startX = e.clientX; startY = e.clientY; delta = 0; horizontal = null;
    });
    window.addEventListener('pointermove', function (e) {
      if (startX === null) return;
      delta = e.clientX - startX;
      if (horizontal === null && (Math.abs(delta) > 6 || Math.abs(e.clientY - startY) > 6)) {
        horizontal = Math.abs(delta) > Math.abs(e.clientY - startY);
      }
      if (horizontal) { clearTimeout(timer); setPosition(false, delta); }
    });
    function end() {
      if (startX === null) return;
      startX = null;
      if (!horizontal) return;
      if (delta <= -SWIPE_THRESHOLD) goTo(index + 1);
      else if (delta >= SWIPE_THRESHOLD) goTo(index - 1);
      else { setPosition(true); startAutoplay(); }
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    slider.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  // ---------- API ----------
  var inFlight = false, hasData = false;

  function showStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('visible', !!text);
    statusEl.classList.toggle('error', !!isError);
  }

  function lookup(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return o != null && typeof o === 'object' ? o[k] : undefined;
    }, obj);
  }

  function formatValue(v) {
    if (typeof v === 'number' && isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    return '--';
  }

  function render(record) {
    // Updates every overlay value, including those inside the loop clones
    document.querySelectorAll('[data-field]').forEach(function (el) {
      var value;
      el.getAttribute('data-field').split('|').some(function (path) {
        value = lookup(record, path);
        return value !== undefined && value !== null;
      });
      el.textContent = formatValue(value);
      el.classList.remove('stale');
    });
  }

  function markStale() {
    document.querySelectorAll('[data-field]').forEach(function (el) { el.classList.add('stale'); });
  }

  function fetchData() {
    if (inFlight) return;
    inFlight = true;
    if (!hasData) showStatus('Loading live data…');

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT);

    fetch(API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var record = Array.isArray(data) ? data[0] : data;
        if (!record || typeof record !== 'object') throw new Error('Unexpected response format');
        render(record);
        hasData = true;
        showStatus('');
      })
      .catch(function (err) {
        var reason = err && err.name === 'AbortError' ? 'request timed out' : (err && err.message) || 'network error';
        if (location.protocol === 'https:' && API_URL.indexOf('http:') === 0) {
          reason = 'blocked as mixed content (page is HTTPS, API is HTTP)';
        }
        console.warn('[anndisplay] API request failed:', reason, err);
        if (hasData) markStale();
        showStatus(hasData ? 'Live data unavailable – showing last values' : 'Live data unavailable', true);
      })
      .then(function () {
        clearTimeout(timeout);
        inFlight = false;
      });
  }

  buildTankSlides();
  initSlider();
  fetchData();
})();
