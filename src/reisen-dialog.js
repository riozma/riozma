async function showNewTripDialog() {
  const result = await showTrouvoDialog({
    title: "Neue Reise",
    body: "Zeitraum, Typ und Start-/Zielort festlegen. Alles Weitere trägst du danach im Reiseplan ein.",
    fields: [
      { id: "start_date", label: "Von", type: "date", required: true },
      { id: "end_date", label: "Bis", type: "date", required: true },
      {
        id: "trip_type",
        label: "Typ",
        type: "select",
        value: "fahrradtour",
        options: [{ value: "fahrradtour", label: "Fahrradtour" }],
      },
      { id: "start_location", label: "Startort", type: "text", required: true, placeholder: "z.B. Triest" },
      { id: "end_location", label: "Zielort", type: "text", required: true, placeholder: "z.B. Ljubljana" },
    ],
    buttons: [
      { id: "cancel", label: "Abbrechen", align: "start" },
      { id: "create", label: "Reise erstellen", primary: true, align: "end" },
    ],
    actionsClass: "trouvo-dialog-actions-split",
  });

  if (result === "cancel" || typeof result !== "object" || result.action !== "create") {
    return null;
  }
  return result.values;
}
