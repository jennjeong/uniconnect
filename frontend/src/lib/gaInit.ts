// Google 태그 설정 파일(/ga-init.js)의 내용이다. 서버의 CSP가 인라인 스크립트를 막아 따로 둔다.
//
// 체크인, 공유 리포트, 공개 장부, 초대 주소에는 코드나 토큰이 들어 있다. 이 주소로 바로 들어오면
// 태그를 아예 싣지 않아, 주소가 밖으로 나가지 않고 참여 코드와 쿠키 식별자가 한 브라우저에 함께
// 있지 않게 한다. 다른 화면에서 앱 안으로 옮겨 올 때는 GA가 보내기 전에 전송을 끈다
// (`ga-disable-<id>`는 GA가 보낼 때마다 확인한다). 다른 화면도 주소의 쿼리는 보내지 않고,
// 이전 주소는 바깥 사이트의 도메인만 남긴다.
export function gaInitScript(id: string) {
  const name = JSON.stringify(`ga-disable-${id}`)
  const loader = JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${id}`)
  return `(function () {
  var hidden = /^\\/(check-in|ledger|report|invite)(\\/|$)/;
  function pathOf(address) { return new URL(address, location.href).pathname; }
  function isHidden(address) {
    try { return hidden.test(pathOf(address)); } catch (error) { return true; }
  }
  if (isHidden(location.href)) {
    window[${name}] = true;
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  function guard(address) {
    var leaving = window[${name}] && !isHidden(address);
    window[${name}] = isHidden(address);
    if (window[${name}]) return;
    window.gtag('set', 'page_location', location.origin + pathOf(address));
    if (leaving) window.gtag('set', 'page_referrer', location.origin + '/');
  }
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function (state, title, address) {
      if (address !== undefined && address !== null) guard(String(address));
      return original.apply(this, arguments);
    };
  });
  window.addEventListener('popstate', function () { guard(location.href); });
  window.gtag('js', new Date());
  var cameFrom = '';
  try {
    var referrer = new URL(document.referrer);
    if (referrer.origin !== location.origin) cameFrom = referrer.origin;
  } catch (error) {}
  window.gtag('config', ${JSON.stringify(id)}, { page_location: location.origin + location.pathname, page_referrer: cameFrom });
  var tag = document.createElement('script');
  tag.async = true;
  tag.src = ${loader};
  document.head.appendChild(tag);
})();
`
}
