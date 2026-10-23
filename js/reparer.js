(function () {
  var s = document.getElementById('st');
  document.getElementById('go').onclick = function () {
    s.textContent = 'Réparation en cours…';
    var tasks = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(
            rs.map(function (r) {
              return r.unregister();
            })
          );
        })
      );
    if (window.caches)
      tasks.push(
        caches.keys().then(function (ks) {
          return Promise.all(
            ks.map(function (k) {
              return caches.delete(k);
            })
          );
        })
      );
    Promise.all(tasks)
      .then(function () {
        s.textContent = "Réparation terminée. Ouverture de l'application…";
      })
      .catch(function () {
        s.textContent = "Réparation partielle. Ouverture de l'application…";
      })
      .then(function () {
        setTimeout(function () {
          location.href = './';
        }, 900);
      });
  };
})();
