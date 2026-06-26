document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const closeNav = () => {
    const open = header.querySelector(".navbar-collapse.show");
    if (!open || !window.bootstrap?.Collapse) return;
    const instance = window.bootstrap.Collapse.getInstance(open);
    if (instance) instance.hide();
  };

  header.querySelectorAll(".nav-link, .navbar-brand").forEach((link) => {
    link.addEventListener("click", closeNav);
  });
});