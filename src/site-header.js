(function () {
  function normalizePath(pathname) {
    return pathname.replace(/\/index\.html$/i, "").replace(/\/$/, "") || "/";
  }

  function pathWithSearch() {
    return normalizePath(window.location.pathname);
  }

  function hasEditEventId() {
    return !!new URLSearchParams(window.location.search).get("id");
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
      id: "trouvo-new",
      href: "/trouvo/edit.html",
      label: "Neu",
      activeWhen: (path) => path === "/trouvo/edit" && !hasEditEventId(),
    },
    {
      id: "trouvo-edit",
      href: "#",
      label: "Bearbeiten",
      activeWhen: (path) => path === "/trouvo/edit" && hasEditEventId(),
    },
    {
      id: "trouvo-manage",
      href: "/trouvo/manage.html",
      label: "Anmeldungen",
      activeWhen: (path) => path === "/trouvo/manage" || path.startsWith("/trouvo/manage/"),
    },
  ];

  function pickActive(items, path) {
    return items.find((item) => item.activeWhen(path))?.id || null;
  }

  function renderLink(item, activeId) {
    const active = item.id === activeId;
    const href = item.href === "#" ? undefined : item.href;
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
    const mainActiveId = pickActive(MAIN_ITEMS, path);
    const trouvoActiveId = isTrouvo ? pickActive(TROUVO_ITEMS, path) : null;

    const brandHref = isTrouvo ? "/trouvo/" : "/";
    const brandClass = isTrouvo ? "navbar-brand trouvo-brand" : "navbar-brand";
    const brandLabel = isTrouvo ? "Trouvo" : "Manuel Rio Zeltner";

    const trouvoBlock = isTrouvo
      ? `
        <li class="nav-item nav-divider" aria-hidden="true"></li>
        ${TROUVO_ITEMS.map((item) => renderLink(item, trouvoActiveId)).join("")}
      `
      : "";

    el.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-light navbar-bg">
        <a class="${brandClass}" href="${brandHref}">${brandLabel}</a>
        <button class="navbar-toggler" type="button" aria-controls="siteNavbar" aria-expanded="false" aria-label="Navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="siteNavbar">
          <ul class="navbar-nav ms-lg-auto nav-main${isTrouvo ? " nav-with-trouvo" : ""}">
            ${MAIN_ITEMS.map((item) => renderLink(item, mainActiveId)).join("")}
            ${trouvoBlock}
          </ul>
        </div>
      </nav>`;
  }

  document.querySelectorAll("[data-site-header]").forEach(renderHeader);
})();
