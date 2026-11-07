// Google 태그 설정 파일(/ga-init.js)의 내용이다. 서버의 CSP가 인라인 스크립트를 막아 따로 둔다.
//
// 공유 리포트, 공개 장부, 초대 주소에는 그것만 있으면 열리는 토큰이 들어 있다. 이 주소들에서는
// 전송을 끄고(`ga-disable-<id>`는 GA가 보낼 때마다 확인한다), 다음 페이지의 유입 주소에도
// 남지 않게 가린다. 앱 안에서 주소가 바뀔 때는 GA가 보내기 전에 끈다.
export function gaInitScript(id: string) {
  const name = JSON.stringify(`ga-disable-${id}`)
  return `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function () {
  var hidden = /^\\/(report|ledger|invite)(\\/|$)/;
  function isHidden(address) {
    try { return hidden.test(new URL(address, location.href).pathname); } catch (error) { return true; }
  }
  function guard(address) {
    var leaving = window[${name}] && !isHidden(address);
    window[${name}] = isHidden(address);
    if (leaving) gtag('set', 'page_referrer', location.origin + '/');
  }
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function (state, title, address) {
      if (address !== undefined && address !== null) guard(String(address));
      return original.apply(this, arguments);
    };
  });
  window.addEventListener('popstate', function () { guard(location.href); });
  guard(location.href);
  gtag('js', new Date());
  var options = {};
  if (document.referrer && isHidden(document.referrer) && new URL(document.referrer).origin === location.origin) {
    options.page_referrer = location.origin + '/';
  }
  gtag('config', ${JSON.stringify(id)}, options);
})();
`
}
