// change url when clicked on navlink, without page reloading and remove active class from all other navlinks and remove d-none class from the div with the same id as the navlink

let navLinks = document.querySelectorAll(".nav-link");
navLinks.forEach((navLink) => {
  navLink.addEventListener("click", function () {
    navLinks.forEach((navLink) => navLink.classList.remove("active"));
    navLink.classList.add("active");
    let id = navLink.getAttribute("data-category");
    if (id != "family") {
      let div = document.querySelector(`#${id}`);
      window.history.pushState("", "", `?category=${id}`);
      document.querySelectorAll(".category").forEach((div) => div.classList.add("d-none"));
      div.classList.remove("d-none");

      if (id == "kunst") {
        fetch("src/artworks.json")
          .then((response) => response.json())
          .then((data) => {
            loadArtworks(data);
            addArtCardEventListeners();
          });
      }
    }
  });
});

document.addEventListener("DOMContentLoaded", function () {
  let id = new URLSearchParams(window.location.search).get("category");
  if (id) {
    let div = document.querySelector(`#${id}`);
    document.querySelectorAll(".category").forEach((div) => div.classList.add("d-none"));
    if (id == "kunst") {
      fetch("src/artworks.json")
        .then((response) => response.json())
        .then((data) => {
          loadArtworks(data);
          addArtCardEventListeners();
        });

      div.classList.remove("d-none");
    } else {
      div.classList.remove("d-none");
    }
  }
});

$(document).ready(function () {
  $(".collapse-card").on("click", function () {
    $(this).find(".collapse-content").toggleClass("show");
  });
});

function addArtCardEventListeners() {
  document.querySelectorAll(".artCard").forEach((artCard) => {
    artCard.querySelector("img").src = `src/img/artManuel/lowRes/${artCard.id}-min.jpg`;
    artCard.addEventListener("click", function () {
      let dialog = document.getElementById("artwork-modal");
      ["title", "year", "size", "medium"].forEach(attr => {
        document.getElementById(`artwork-${attr}`).innerHTML = artCard.getAttribute(attr);
      });
      let highResPath = `src/img/artManuel/highRes/${artCard.id}.jpg`;
      dialog.querySelector("img").src = highResPath;
      document.getElementById("artwork-download").href = highResPath;
      document.getElementById("artwork-download").download = `${artCard.id}.jpg`;
      new Image().src = highResPath;
      dialog.showModal();
      document.getElementById("blackBox").style.display = "block";
    });
  });
}

function loadArtworks(data) {
  let container = document.getElementById("artwork-preview");
  if (!container) return console.error("Container with id 'artwork-preview' not found.");
  container.innerHTML = data.map(artwork => `
    <div class="col-md-4 col-sm-6 col-12" style="margin-bottom: 20px;">
      <div class="card artCard" id="${artwork.id}" year="${artwork.year}" title="${artwork.title}" size="${artwork.size}" medium="${artwork.medium}" available="${artwork.available}">
        <img class="card-img-top" src="src/img/artManuel/lowRes/${artwork.id}-min.jpg" alt="${artwork.title}">
        <div class="card-body">
          <h5 class="card-title">"${artwork.title}"${artwork.available == "True" ? "*" : ""}</h5>
          <p class="card-text">${artwork.year}</p>
          <p class="card-text">${artwork.size}</p>
          <p class="card-text">${artwork.medium}</p>
        </div>
      </div>
    </div>
  `).join("");
  addArtCardEventListeners();
}

function filterAvailableArtworks() {
  fetch("src/artworks.json")
    .then((response) => response.json())
    .then((data) => {
      data = data.filter((artwork) => artwork.available == "True");
      loadArtworks(data);
    });
  // change btn text to "Alle anzeigen"
  document.getElementById("filter-button").innerHTML = "Alle anzeigen";

  // add event listener to btn to show all artworks
  document.getElementById("filter-button").removeEventListener("click", filterAvailableArtworks);
  document.getElementById("filter-button").addEventListener("click", showAllArtworks);



}

function showAllArtworks() {
  fetch("src/artworks.json")
    .then((response) => response.json())
    .then((data) => {
      loadArtworks(data);
    });
  // change btn text to "Nur verfügbare anzeigen"
  document.getElementById("filter-button").innerHTML = "Nur verfügbare anzeigen";

  // add event listener to btn to show only available artworks
  document.getElementById("filter-button").removeEventListener("click", showAllArtworks);
  document.getElementById("filter-button").addEventListener("click", filterAvailableArtworks);
}

function closeModal() {
  document.getElementById("blackBox").style.display = "none";
  document.getElementById("artwork-modal").close();
}
