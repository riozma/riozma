// change url when clicked on navlink, without page reloading and remove active class from all other navlinks and remove d-none class from the div with the same id as the navlink

let navLinks = document.querySelectorAll(".nav-link");
navLinks.forEach((navLink) => {
  navLink.addEventListener("click", function () {
    navLinks.forEach((navLink) => {
      navLink.classList.remove("active");
    });
    navLink.classList.add("active");
    let id = navLink.getAttribute("data-category");
    if (id != "family") {
      let div = document.querySelector(`#${id}`);
      // add id to the url without reloading the page
      window.history.pushState("", "", `?category=${id}`);
      let divs = document.querySelectorAll(".category");
      divs.forEach((div) => {
        div.classList.add("d-none");
      });
      div.classList.remove("d-none");
    }
  });
});

// macht das richtige div sichtbar wenn seite geladen wird
document.addEventListener("DOMContentLoaded", function () {
  let url = window.location.href;
  let id = url.split("=")[1];
  if (id != undefined) {
    let div = document.querySelector(`#${id}`);
    let divs = document.querySelectorAll(".category");
    divs.forEach((div) => {
      div.classList.add("d-none");
    });
    div.classList.remove("d-none");
  }
});

$(document).ready(function () {
  $(".collapse-card").on("click", function () {
    $(this).find(".collapse-content").toggleClass("show");
  });
});

// füge passende Bilder zu karte hinzu und eventlistener, welcher dialogfenster mit besserer Qualität ladet
let artCards = document.querySelectorAll(".artCard");



artCards.forEach((artCard) => {
  console.log(artCard.id);
  artCard.querySelector("img").src =
    "src/img/artManuel/lowRes/" + artCard.id + "-min.jpg";


  // get the year, title, size and medium of the artwork
  let year = artCard.getAttribute("year");
  let title = artCard.getAttribute("title");
  let size = artCard.getAttribute("size");
  let medium = artCard.getAttribute("medium");
  let availability = artCard.getAttribute("available"); // boolean

  // set the text of the dialog
  document.getElementById("artwork-title").innerHTML = '"' + title + '"';
  document.getElementById("artwork-year").innerHTML = year;
  document.getElementById("artwork-size").innerHTML = size;
  document.getElementById("artwork-medium").innerHTML = medium;

  // get the div with class card-body in the corresponding card
  let cardBody = artCard.querySelector(".card-body");

  let htmlCard = "";

  // create the html
  if (availability) {
    htmlCard += `
         <h5 class="card-title"> "${title}"* </h5>
         <p class="card-text"> ${year} </p>
         <p class="card-text"> ${size} </p>
         <p class="card-text"> ${medium} </p>
       `
  } else {
    htmlCard += `
         <h5 class="card-title"> "${title}" </h5>
         <p class="card-text"> ${year} </p>
         <p class="card-text"> ${size} </p>
         <p class="card-text"> ${medium} </p>
       `
  }

  console.log(htmlCard);

  // set the innerHTML of the dialog
  cardBody.innerHTML = htmlCard;

  artCard.addEventListener("click", function () {
    let dialog = document.getElementById("artwork-modal");

    // get the year, title, size and medium of the artwork
    let year = artCard.getAttribute("year");
    let title = artCard.getAttribute("title");
    let size = artCard.getAttribute("size");
    let medium = artCard.getAttribute("medium");
    let availability = artCard.getAttribute("available"); // boolean

    // set the text of the dialog
    document.getElementById("artwork-title").innerHTML = '"' + title + '"';
    document.getElementById("artwork-year").innerHTML = year;
    document.getElementById("artwork-size").innerHTML = size;
    document.getElementById("artwork-medium").innerHTML = medium;

    console.log(year);
    var highResPath = "src/img/artManuel/highRes/" + artCard.id + ".jpg";
    dialog.querySelector("img").src = highResPath;

    // add download
    document.getElementById("artwork-download").href = highResPath;
    document.getElementById("artwork-download").download = artCard.id + ".jpg";

    // Calculate the width of the loaded image
    let loadedImage = new Image();
    loadedImage.src = dialog.querySelector("img").src;
    loadedImage.onload = function () {
      dialog.showModal();
      // show remove display none from blackbox
      document.getElementById("blackBox").style.display = "block";
    };
  });
});

function loadArtworks(data) {

  // get the container of the artworks
  let container = document.getElementById("artwork-preview");
  if (container) {
    container.innerHTML = ""; // clear the container
  } else {
    console.error("Container with id 'artwork-preview' not found.");
  }

  // create the html for the artworks
  data.forEach((artwork) => {

    let html = "";

    if (artwork.available) {
      html = `
    <div class="col-md-4 col-sm-6 col-12" style="margin-bottom: 20px;">
      <div class="card artCard" id="${artwork.id}" year="${artwork.year}" title="${artwork.title}" size="${artwork.size}" medium="${artwork.medium}" available="${artwork.available}">
        <img class="card-img-top" src="src/img/artManuel/lowRes/${artwork.id}-min.jpg" alt="${artwork.title}">
        <div class="card-body">
          <h5 class="card-title">"${artwork.title}"*</h5>
          <p class="card-text">${artwork.year}</p>
          <p class="card-text">${artwork.size}</p>
          <p class="card-text">${artwork.medium}</p>
        </div>
      </div>
    </div>
    `;
    } else {
      html = `
      <div class="col-md-4 col-sm-6 col-12" style="margin-bottom: 20px;">
        <div class="card artCard" id="${artwork.id}" year="${artwork.year}" title="${artwork.title}" size="${artwork.size}" medium="${artwork.medium}" available="${artwork.available}">
          <img class="card-img-top" src="src/img/artManuel/lowRes/${artwork.id}-min.jpg" alt="${artwork.title}">
          <div class="card-body">
            <h5 class="card-title">"${artwork.title}"</h5>
            <p class="card-text">${artwork.year}</p>
            <p class="card-text">${artwork.size}</p>
            <p class="card-text">${artwork.medium}</p>
          </div>
        </div>
      </div>
      `;
    }

    container.innerHTML += html;
  })

  // add event listener to the new cards
  let artCards = document.querySelectorAll(".artCard");

  artCards.forEach((artCard) => {
    artCard.addEventListener("click", function () {
      let dialog = document.getElementById("artwork-modal");

      // get the year, title, size and medium of the artwork
      let year = artCard.getAttribute("year");
      let title = artCard.getAttribute("title");
      let size = artCard.getAttribute("size");
      let medium = artCard.getAttribute("medium");
      let availability = artCard.getAttribute("available"); // boolean

      // set the text of the dialog
      document.getElementById("artwork-title").innerHTML = '"' + title + '"';
      document.getElementById("artwork-year").innerHTML = year;
      document.getElementById("artwork-size").innerHTML = size;
      document.getElementById("artwork-medium").innerHTML = medium;

      var highResPath = "src/img/artManuel/highRes/" + artCard.id + ".jpg";
      dialog.querySelector("img").src = highResPath;

      // add download
      document.getElementById("artwork-download").href = highResPath;
      document.getElementById("artwork-download").download = artCard.id + ".jpg";

      // Calculate the width of the loaded image
      let loadedImage = new Image();
      loadedImage.src = dialog.querySelector("img").src;
      loadedImage.onload = function () {
        dialog.showModal();
        // show remove display none from blackbox
        document.getElementById("blackBox").style.display = "block";
      };
    });
  }
  );
}

function sortArtworksByYear() {
  // get the artworks.json file
  fetch("src/artworks.json")
    .then((response) => response.json())
    .then((data) => {
      // sort the artworks by year
      data.sort((a, b) => {
        return b.year - a.year;
      });
      loadArtworks(data);
    });

  // add event listener to the new cards
  let artCards = document.querySelectorAll(".artCard");
  artCards.forEach((artCard) => {
    artCard.addEventListener("click", function () {
      let dialog = document.getElementById("artwork-modal");

      // get the year, title, size and medium of the artwork
      let year = artCard.getAttribute("year");
      let title = artCard.getAttribute("title");
      let size = artCard.getAttribute("size");
      let medium = artCard.getAttribute("medium");
      let availability = artCard.getAttribute("available"); // boolean

      // set the text of the dialog
      document.getElementById("artwork-title").innerHTML = '"' + title + '"';
      document.getElementById("artwork-year").innerHTML = year;
      document.getElementById("artwork-size").innerHTML = size;
      document.getElementById("artwork-medium").innerHTML = medium;

      var highResPath = "src/img/artManuel/highRes/" + artCard.id + ".jpg";
      dialog.querySelector("img").src;
    });
  });


  document.getElementById("sort-button").classList.add("btn-outline-success");
  document.getElementById("filter-button").classList.remove("btn-outline-success");
}

function filterAvailableArtworks() {
  // get the artworks.json file
  fetch("src/artworks.json")
    .then((response) => response.json())
    .then((data) => {
      // filter the artworks by availability
      data = data.filter((artwork) => {
        return artwork.available;
      });
      loadArtworks(data);
    });

  // add event listener to the new cards
  let artCards = document.querySelectorAll(".artCard");
  artCards.forEach((artCard) => {
    artCard.addEventListener("click", function () {
      let dialog = document.getElementById("artwork-modal");

      // get the year, title, size and medium of the artwork
      let year = artCard.getAttribute("year");
      let title = artCard.getAttribute("title");
      let size = artCard.getAttribute("size");
      let medium = artCard.getAttribute("medium");
      let availability = artCard.getAttribute("available"); // boolean

      // set the text of the dialog
      document.getElementById("artwork-title").innerHTML = '"' + title + '"';
      document.getElementById("artwork-year").innerHTML = year;
      document.getElementById("artwork-size").innerHTML = size;
      document.getElementById("artwork-medium").innerHTML = medium;

      var highResPath = "src/img/artManuel/highRes/" + artCard.id + ".jpg";
      dialog.querySelector("img").src;
    });
  });

  // change sort by year btn text to show all
  document.getElementById("sort-button").innerHTML = "aui azeige";

  // change the appearance of the button
  document.getElementById("filter-button").classList.add("btn-outline-success");
  document.getElementById("sort-button").classList.remove("btn-outline-success");
}

//close dialog
function closeModal() {
  document.getElementById("blackBox").style.display = "none";
  let dialog = document.getElementById("artwork-modal")
  dialog.close()
}