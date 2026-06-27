(function () {
  const MAIN_NAV = [
    { href: "/", label: "Home", prefix: "" },
    { href: "/kunst/", label: "Kunst", prefix: "/kunst" },
    { href: "/politik/", label: "Politik", prefix: "/politik" },
    { href: "/trouvo/", label: "Trouvo", prefix: "/trouvo" },
  ];

  const TROUVO_EXTRA = [
    { href: "/trouvo/", label: "Dashboard", prefix: "/trouvo", exact: true },
    { href: "/trouvo/edit.html", label: "Neu", prefix: "/trouvo/edit" },
  ];

  function isActive(prefix, exact) {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    const normalized = prefix.replace(/\/$/, "") || "/";
    if (exact) return path === normalized;
    if (normalized === "/") return path === "/";
    return path === normalized || path.startsWith(`${normalized}/`);
  }

  function navLink(item) {
    const active = isActive(item.prefix, item.exact) ? " active" : "";
    return `<li class="nav-item"><a class="nav-link${active}" href="${item.href}">${item.label}</a></li>`;
  }

  function renderHeader(el) {
    const context = el.dataset.headerContext || "main";
    const isTrouvo = context === "trouvo";
    const brandHref = isTrouvo ? "/trouvo/" : "/";
    const brandClass = isTrouvo ? "navbar-brand trouvo-brand" : "navbar-brand";
    const brandLabel = isTrouvo ? "Trouvo" : "Manuel Rio Zeltner";
    const items = isTrouvo ? [...MAIN_NAV, ...TROUVO_EXTRA] : MAIN_NAV;

    el.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-light navbar-bg">
        <a class="${brandClass}" href="${brandHref}">${brandLabel}</a>
        <button class="navbar-toggler" type="button" aria-controls="navbarNav" aria-expanded="false" aria-label="Navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-lg-auto">
            ${items.map(navLink).join("")}
          </ul>
        </div>
      </nav>`;
  }

  document.querySelectorAll("[data-site-header]").forEach(renderHeader);
})();
