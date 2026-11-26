
/* Theme: runs before anything is drawn so the page never flashes the wrong colours. "auto" follows the device. */
(() => {
  const KEY = 'floorplan-theme', root = document.documentElement, mq = matchMedia('(prefers-color-scheme: light)');
  let mem = 'auto';
  const valid = (v) => v === 'auto' || v === 'light' || v === 'dark';
  const get = () => { try { const v = localStorage.getItem(KEY); if (valid(v)) return v; } catch (e) {} return mem; };
  const apply = () => {
    const c = get();
    root.setAttribute('data-theme', c === 'auto' ? (mq.matches ? 'light' : 'dark') : c);
    window.dispatchEvent(new Event('floorplan-theme-change'));
  };
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply);
  addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) apply(); }); // changed in another tab
  window.floorplanTheme = { get, set: (c) => {
    if (!valid(c)) return;
    mem = c; try { localStorage.setItem(KEY, c); } catch (e) {}
    root.classList.add('theme-switching'); apply();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  } };
})();
