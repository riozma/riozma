const EVENT_TEMPLATES = {
  birthday: {
    label: "Kindergeburtstagsfest",
    event: {
      name: "Kindergeburtstagsfest",
      description: "Spiele, Kuchen und gute Stimmung — bitte Allergien bei der Anmeldung angeben.",
      start_time: "14:00",
      end_time: "17:00",
      open_end: false,
      bringItems: [
        { name: "Snacks fürs Buffet", quantity_mode: "per_guest", quantity_value: 1, visible_to_others: true },
        { name: "Getränke", quantity_mode: "fixed", quantity_value: 6, visible_to_others: true },
      ],
      fields: [
        { label: "Allergien / Unverträglichkeiten", field_type: "text", required: false, visible_to_others: false },
        { label: "Anzahl Kinder", field_type: "text", required: true, visible_to_others: false },
      ],
      timetableTracks: [
        {
          name: "Programm",
          items: [
            { start_time: "14:00", title: "Ankommen & Begrüssung", description: "" },
            { start_time: "14:30", title: "Spiele", description: "" },
            { start_time: "15:30", title: "Kuchen & Snacks", description: "" },
            { start_time: "16:30", title: "Abschluss", description: "" },
          ],
        },
      ],
    },
    planning: {
      todos: [
        { title: "Einladungen verschicken", assignee: "" },
        { title: "Location dekorieren", assignee: "" },
        { title: "Kuchen backen oder bestellen", assignee: "" },
        { title: "Spiele & Programm planen", assignee: "" },
        { title: "Auf- und Abbau koordinieren", assignee: "" },
      ],
      materials: [
        { name: "Teller, Becher, Besteck", quantity: "15", assignee: "" },
        { name: "Servietten", quantity: "20", assignee: "" },
        { name: "Kuchen", quantity: "1", assignee: "" },
        { name: "Snacks", quantity: "diverse", assignee: "" },
        { name: "Säfte & Getränke", quantity: "15 Pers.", assignee: "" },
        { name: "Deko (Ballons, Girlanden)", quantity: "1 Set", assignee: "" },
        { name: "Müllsäcke", quantity: "5", assignee: "" },
      ],
    },
  },
  grill: {
    label: "Grillen",
    event: {
      name: "Grillabend",
      description: "Gemütlicher Grillabend — wer mag, bringt Beilagen oder Getränke mit.",
      start_time: "18:00",
      end_time: "23:00",
      open_end: true,
      bringItems: [
        { name: "Salat / Beilage", quantity_mode: "per_guest", quantity_value: 1, visible_to_others: true },
        { name: "Getränke", quantity_mode: "per_guest", quantity_value: 1, visible_to_others: true },
        { name: "Dessert", quantity_mode: "fixed", quantity_value: 2, visible_to_others: true },
      ],
      fields: [
        { label: "Vegetarisch / Vegan", field_type: "checkbox", required: false, visible_to_others: true },
        { label: "Nachricht an Gastgeber", field_type: "textarea", required: false, visible_to_others: false },
      ],
      timetableTracks: [],
    },
    planning: {
      todos: [
        { title: "Gäste einladen", assignee: "" },
        { title: "Grill reinigen & vorbereiten", assignee: "" },
        { title: "Einkaufsliste finalisieren", assignee: "" },
        { title: "Sitzplätze & Tische aufbauen", assignee: "" },
        { title: "Wetter-Plan B klären", assignee: "" },
      ],
      materials: [
        { name: "Holzkohle / Grillgas", quantity: "2 Pack.", assignee: "" },
        { name: "Grillzange & Handschuhe", quantity: "1 Set", assignee: "" },
        { name: "Fleisch / Würste", quantity: "pro Person", assignee: "" },
        { name: "Grillgemüse", quantity: "diverse", assignee: "" },
        { name: "Brot / Brötchen", quantity: "1 pro Pers.", assignee: "" },
        { name: "Salate & Beilagen", quantity: "diverse", assignee: "" },
        { name: "Saucen & Gewürze", quantity: "1 Set", assignee: "" },
        { name: "Getränke", quantity: "pro Person", assignee: "" },
        { name: "Eiswürfel", quantity: "2 Beutel", assignee: "" },
      ],
    },
  },
  movie: {
    label: "Filmabend mit Freunden",
    event: {
      name: "Filmabend",
      description: "Gemeinsamer Filmabend — Snacks und Getränke gerne mitbringen.",
      start_time: "19:30",
      end_time: "22:30",
      open_end: false,
      bringItems: [
        { name: "Snacks", quantity_mode: "per_guest", quantity_value: 1, visible_to_others: true },
        { name: "Getränke", quantity_mode: "fixed", quantity_value: 4, visible_to_others: true },
      ],
      fields: [
        { label: "Filmwunsch", field_type: "text", required: false, visible_to_others: true },
      ],
      timetableTracks: [
        {
          name: "Abend",
          items: [
            { start_time: "19:30", title: "Ankommen", description: "" },
            { start_time: "20:00", title: "Filmstart", description: "" },
          ],
        },
      ],
    },
    planning: {
      todos: [
        { title: "Film auswählen", assignee: "" },
        { title: "Einladungen verschicken", assignee: "" },
        { title: "Wohnzimmer vorbereiten", assignee: "" },
        { title: "Technik testen (Beamer / Ton)", assignee: "" },
        { title: "Snacks & Getränke planen", assignee: "" },
      ],
      materials: [
        { name: "Popcorn", quantity: "3 Tüten", assignee: "" },
        { name: "Snacks (Chips, Nüsse)", quantity: "diverse", assignee: "" },
        { name: "Getränke", quantity: "pro Person", assignee: "" },
        { name: "Decken & Kissen", quantity: "ausreichend", assignee: "" },
        { name: "Müllbeutel", quantity: "3", assignee: "" },
      ],
    },
  },
};

const PLANNING_TEMPLATES = Object.fromEntries(
  Object.entries(EVENT_TEMPLATES).map(([key, tpl]) => [
    key,
    { label: tpl.label, todos: tpl.planning.todos, materials: tpl.planning.materials },
  ]),
);
