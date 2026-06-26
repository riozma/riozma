document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const toggler = header.querySelector(".navbar-toggler");
  const collapse = header.querySelector(".navbar-collapse");
  if (!toggler || !collapse) return;

  toggler.removeAttribute("data-bs-toggle");
  toggler.removeAttribute("data-bs-target");

  const setOpen = (open) => {
    collapse.classList.toggle("show", open);
    toggler.setAttribute("aria-expanded", open ? "true" : "false");
  };

  toggler.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!collapse.classList.contains("show"));
  });

  header.querySelectorAll(".nav-link, .navbar-brand").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
});
