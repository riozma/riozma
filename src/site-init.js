(function () {
  var PRODUCTION_HOSTS = { "riozma.ch": true, "www.riozma.ch": true };
  var CANONICAL_HOST = "riozma.ch";

  function readReturnCookie() {
    var match = document.cookie.match(/(?:^|; )riozma_auth_return=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  if (PRODUCTION_HOSTS[location.hostname]) {
    if (location.hostname !== CANONICAL_HOST) {
      location.replace(
        "https://" + CANONICAL_HOST + location.pathname + location.search + location.hash,
      );
      return;
    }
    if (location.protocol !== "https:") {
      location.replace(
        "https://" + location.host + location.pathname + location.search + location.hash,
      );
      return;
    }
  }

  if (location.pathname === "/auth/callback.html") return;

  var search = location.search;
  if (!search || (!search.includes("code=") && !search.includes("error="))) return;

  var returnTo = sessionStorage.getItem("auth_return_to") || readReturnCookie() || "/trouvo/";
  if (!returnTo) {
    location.replace("/auth/callback.html" + search);
    return;
  }

  var returnPath = returnTo.split("?")[0];
  var onReturnPage =
    location.pathname === returnPath ||
    location.pathname + "/" === returnPath ||
    location.pathname === returnPath.replace(/\/$/, "");
  if (onReturnPage) return;

  var joiner = returnTo.indexOf("?") >= 0 ? "&" : "?";
  location.replace(returnTo + joiner + search.slice(1));
})();