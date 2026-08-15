document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".site-header").forEach(wireHeader);
});

function wireHeader(header) {
  function setOpen(open) {
    const collapse = header.querySelector(".navbar-collapse");
    const toggler = header.querySelector(".navbar-toggler");
    if (!collapse || !toggler) return;
    collapse.classList.toggle("show", open);
    toggler.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // Delegated on the header itself (stable across setTripTitle/setTrouvoEventTitle
  // re-renders, which replace the toggler/collapse nodes via innerHTML).
  header.addEventListener("click", (event) => {
    if (event.target.closest(".navbar-toggler")) {
      event.preventDefault();
      event.stopPropagation();
      const collapse = header.querySelector(".navbar-collapse");
      setOpen(!collapse?.classList.contains("show"));
      return;
    }
    if (event.target.closest(".nav-link, .navbar-brand")) setOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}
