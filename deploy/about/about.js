// About page: language toggle (English by default; ES by the button or #lang=es), same convention as the app.
(function () {
  var lang = location.hash.indexOf('lang=es') >= 0 ? 'es' : 'en';
  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-en]').forEach(function (e) { e.textContent = e.getAttribute('data-' + lang); });
    var b = document.getElementById('lang');
    b.textContent = lang === 'en' ? 'ES' : 'EN';
    b.setAttribute('aria-label', lang === 'en' ? 'Cambiar a español' : 'Switch to English');
    document.getElementById('back').setAttribute('href', lang === 'es' ? '../#lang=es' : '../');
  }
  document.getElementById('lang').addEventListener('click', function () { lang = lang === 'en' ? 'es' : 'en'; history.replaceState(null, '', lang === 'es' ? '#lang=es' : location.pathname); apply(); });
  apply();
})();
