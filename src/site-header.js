(function () {
  function normalizePath(pathname) {
    return pathname
      .replace(/\/index\.html$/i, "")
      .replace(/\.html$/i, "")
      .replace(/\/$/, "") || "/";
  }

  function pathWithSearch() {
    return normalizePath(window.location.pathname);
  }

  function eventIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id");
  }

  const MAIN_ITEMS = [
    {
      id: "home",
      href: "/",
      label: "Home",
      activeWhen: (path) => path === "/",
    },
    {
      id: "kunst",
      href: "/kunst/",
      label: "Kunst",
      activeWhen: (path) => path === "/kunst" || path.startsWith("/kunst/"),
    },
    {
      id: "politik",
      href: "/politik/",
      label: "Politik",
      activeWhen: (path) => path === "/politik" || path.startsWith("/politik/"),
    },
    {
      id: "trouvo",
      href: "/trouvo/",
      label: "Trouvo",
      activeWhen: (path) => {
        if (!path.startsWith("/trouvo")) return false;
        if (path.startsWith("/trouvo/e")) return true;
        return false;
      },
    },
  ];

  const TROUVO_ITEMS = [
    {
      id: "trouvo-dashboard",
      href: "/trouvo/",
      label: "Dashboard",
      activeWhen: (path) => path === "/trouvo",
    },
    {
      id: "trouvo-edit",
      href: "/trouvo/edit.html",
      label: "Info",
      activeWhen: (path) => path === "/trouvo/edit" && !!eventIdFromUrl(),
      needsEventId: true,
    },
    {
      id: "trouvo-planning",
      href: "/trouvo/planning.html",
      label: "Planung",
      activeWhen: (path) => path === "/trouvo/planning" || path.startsWith("/trouvo/planning/"),
      needsEventId: true,
    },
    {
      id: "trouvo-manage",
      href: "/trouvo/manage.html",
      label: "Anmeldungen",
      activeWhen: (path) => path === "/trouvo/manage" || path.startsWith("/trouvo/manage/"),
      needsEventId: true,
    },
  ];

  function pickActive(items, path) {
    return items.find((item) => item.activeWhen(path))?.id || null;
  }

  function trouvoItemHref(item) {
    const id = eventIdFromUrl();
    if (!id) return item.href;
    if (item.id === "trouvo-edit") return `/trouvo/edit.html?id=${encodeURIComponent(id)}`;
    if (item.id === "trouvo-planning") return `/trouvo/planning.html?id=${encodeURIComponent(id)}`;
    if (item.id === "trouvo-manage") return `/trouvo/manage.html?id=${encodeURIComponent(id)}`;
    return item.href;
  }

  function visibleTrouvoItems() {
    const hasEvent = !!eventIdFromUrl();
    return TROUVO_ITEMS.filter((item) => !item.needsEventId || hasEvent);
  }

  function renderLink(item, activeId) {
    const active = item.id === activeId;
    const href = trouvoItemHref(item);
    const attrs = [
      `class="nav-link${active ? " active" : ""}"`,
      href ? `href="${href}"` : "",
      active ? 'aria-current="page"' : "",
      `data-nav-id="${item.id}"`,
    ].filter(Boolean).join(" ");
    return `<li class="nav-item"><a ${attrs}>${item.label}</a></li>`;
  }

  function renderHeader(el) {
    const context = el.dataset.headerContext || "main";
    const isTrouvo = context === "trouvo";
    const path = pathWithSearch();
    const mainActiveId = isTrouvo ? null : pickActive(MAIN_ITEMS, path);
    const trouvoActiveId = isTrouvo ? pickActive(TROUVO_ITEMS, path) : null;
    const eventTitle = el.dataset.trouvoEventTitle || "";

    const brandHref = isTrouvo ? "/trouvo/" : "/";
    const brandClass = isTrouvo ? "navbar-brand trouvo-brand" : "navbar-brand";
    const brandLabel = isTrouvo ? "Trouvo" : "Manuel Rio Zeltner";

    const navItems = isTrouvo
      ? visibleTrouvoItems()
      : MAIN_ITEMS;

    const navActiveId = isTrouvo ? trouvoActiveId : mainActiveId;
    const dashboardActive = isTrouvo && path === "/trouvo";

    el.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-light navbar-bg trouvo-navbar">
        <a class="${brandClass}${dashboardActive ? " trouvo-brand-active" : ""}" href="${brandHref}">${brandLabel}</a>
        ${isTrouvo && eventTitle ? `<div class="trouvo-event-title-bar d-none d-lg-block">${escapeHeaderText(eventTitle)}</div>` : ""}
        <button class="navbar-toggler" type="button" aria-controls="siteNavbar" aria-expanded="false" aria-label="Navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="siteNavbar">
          <ul class="navbar-nav ms-lg-auto nav-main${isTrouvo ? " nav-trouvo-only" : ""}">
            ${navItems.map((item) => renderLink(item, navActiveId)).join("")}
          </ul>
        </div>
      </nav>
      ${isTrouvo && eventTitle ? `<div class="trouvo-event-title-bar trouvo-event-title-bar-mobile d-lg-none">${escapeHeaderText(eventTitle)}</div>` : ""}`;
  }

  function escapeHeaderText(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.setTrouvoEventTitle = function (name) {
    document.querySelectorAll("[data-site-header]").forEach((el) => {
      el.dataset.trouvoEventTitle = name || "";
      renderHeader(el);
    });
  };

  document.querySelectorAll("[data-site-header]").forEach(renderHeader);
})();
