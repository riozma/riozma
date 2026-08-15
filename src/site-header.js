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

  function idFromUrl() {
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
    {
      id: "reisen",
      href: "/reisen/",
      label: "Reisen",
      activeWhen: (path) => {
        if (!path.startsWith("/reisen")) return false;
        if (path.startsWith("/reisen/einladung")) return true;
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
      activeWhen: (path) => path === "/trouvo/edit" && !!idFromUrl(),
      needsId: true,
    },
    {
      id: "trouvo-planning",
      href: "/trouvo/planning.html",
      label: "Planung",
      activeWhen: (path) => path === "/trouvo/planning" || path.startsWith("/trouvo/planning/"),
      needsId: true,
    },
    {
      id: "trouvo-manage",
      href: "/trouvo/manage.html",
      label: "Anmeldungen",
      activeWhen: (path) => path === "/trouvo/manage" || path.startsWith("/trouvo/manage/"),
      needsId: true,
    },
  ];

  const REISEN_ITEMS = [
    {
      id: "reisen-dashboard",
      href: "/reisen/",
      label: "Dashboard",
      activeWhen: (path) => path === "/reisen",
    },
    {
      id: "reisen-plan",
      href: "/reisen/plan.html",
      label: "Plan",
      activeWhen: (path) => path === "/reisen/plan" && !!idFromUrl(),
      needsId: true,
    },
    {
      id: "reisen-finanzen",
      href: "/reisen/finanzen.html",
      label: "Finanzen",
      activeWhen: (path) => path === "/reisen/finanzen" && !!idFromUrl(),
      needsId: true,
    },
    {
      id: "reisen-mitreisende",
      href: "/reisen/mitreisende.html",
      label: "Mitreisende",
      activeWhen: (path) => path === "/reisen/mitreisende" && !!idFromUrl(),
      needsId: true,
    },
    {
      id: "reisen-packliste",
      href: "/reisen/packliste.html",
      label: "Packliste",
      activeWhen: (path) => path === "/reisen/packliste" && !!idFromUrl(),
      needsId: true,
    },
    {
      id: "reisen-todos",
      href: "/reisen/todos.html",
      label: "To-Dos",
      activeWhen: (path) => path === "/reisen/todos" && !!idFromUrl(),
      needsId: true,
    },
  ];

  function pickActive(items, path) {
    return items.find((item) => item.activeWhen(path))?.id || null;
  }

  function subNavItemHref(item) {
    const id = idFromUrl();
    if (!id) return item.href;
    if (item.id === "trouvo-edit") return `/trouvo/edit.html?id=${encodeURIComponent(id)}`;
    if (item.id === "trouvo-planning") return `/trouvo/planning.html?id=${encodeURIComponent(id)}`;
    if (item.id === "trouvo-manage") return `/trouvo/manage.html?id=${encodeURIComponent(id)}`;
    if (item.id === "reisen-plan") return `/reisen/plan.html?id=${encodeURIComponent(id)}`;
    if (item.id === "reisen-finanzen") return `/reisen/finanzen.html?id=${encodeURIComponent(id)}`;
    if (item.id === "reisen-mitreisende") return `/reisen/mitreisende.html?id=${encodeURIComponent(id)}`;
    if (item.id === "reisen-packliste") return `/reisen/packliste.html?id=${encodeURIComponent(id)}`;
    if (item.id === "reisen-todos") return `/reisen/todos.html?id=${encodeURIComponent(id)}`;
    return item.href;
  }

  function visibleTrouvoItems() {
    const hasId = !!idFromUrl();
    return TROUVO_ITEMS.filter((item) => !item.needsId || hasId);
  }

  function visibleReisenItems() {
    const hasId = !!idFromUrl();
    return REISEN_ITEMS.filter((item) => !item.needsId || hasId);
  }

  function renderLink(item, activeId) {
    const active = item.id === activeId;
    const href = subNavItemHref(item);
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
    const isReisen = context === "reisen";
    const isSubApp = isTrouvo || isReisen;
    const path = pathWithSearch();
    const mainActiveId = isSubApp ? null : pickActive(MAIN_ITEMS, path);
    const trouvoActiveId = isTrouvo ? pickActive(TROUVO_ITEMS, path) : null;
    const reisenActiveId = isReisen ? pickActive(REISEN_ITEMS, path) : null;
    const subTitle = isTrouvo
      ? (el.dataset.trouvoEventTitle || "")
      : isReisen
        ? (el.dataset.reisenTripTitle || "")
        : "";

    const brandHref = isTrouvo ? "/trouvo/" : isReisen ? "/reisen/" : "/";
    const brandClass = isSubApp ? "navbar-brand trouvo-brand" : "navbar-brand";
    const brandLabel = isTrouvo ? "Trouvo" : isReisen ? "Reisen" : "Manuel Rio Zeltner";

    const navItems = isTrouvo
      ? visibleTrouvoItems()
      : isReisen
        ? visibleReisenItems()
        : MAIN_ITEMS;

    const navActiveId = isTrouvo ? trouvoActiveId : isReisen ? reisenActiveId : mainActiveId;
    const dashboardActive = (isTrouvo && path === "/trouvo") || (isReisen && path === "/reisen");

    el.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-light navbar-bg trouvo-navbar">
        <a class="${brandClass}${dashboardActive ? " trouvo-brand-active" : ""}" href="${brandHref}">${brandLabel}</a>
        ${isSubApp && subTitle ? `<div class="trouvo-event-title-bar d-none d-lg-block">${escapeHeaderText(subTitle)}</div>` : ""}
        <button class="navbar-toggler" type="button" aria-controls="siteNavbar" aria-expanded="false" aria-label="Navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="siteNavbar">
          <ul class="navbar-nav ms-lg-auto nav-main${isSubApp ? " nav-trouvo-only" : ""}">
            ${navItems.map((item) => renderLink(item, navActiveId)).join("")}
          </ul>
        </div>
      </nav>
      ${isSubApp && subTitle ? `<div class="trouvo-event-title-bar trouvo-event-title-bar-mobile d-lg-none">${escapeHeaderText(subTitle)}</div>` : ""}`;
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

  window.setTripTitle = function (name) {
    document.querySelectorAll("[data-site-header]").forEach((el) => {
      el.dataset.reisenTripTitle = name || "";
      renderHeader(el);
    });
  };

  document.querySelectorAll("[data-site-header]").forEach(renderHeader);
})();
