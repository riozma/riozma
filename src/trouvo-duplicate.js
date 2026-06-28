/** Dupliziert ein bestehendes Event als neues (nicht «Vorlage laden» in dasselbe Event). */
async function duplicateEventFromSource(sourceEventId) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase nicht konfiguriert.");
  await ensureWriteSession(client);

  const { data: source, error: srcErr } = await client.from("events").select("*").eq("id", sourceEventId).single();
  if (srcErr || !source) throw new Error("Event nicht gefunden.");

  const [tracks, tt, fields, bring, todos, materials] = await Promise.all([
    client.from("event_timetable_tracks").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_timetable_items").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_registration_fields").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_bring_items").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_planning_todos").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_planning_materials").select("*").eq("event_id", sourceEventId).order("sort_order"),
  ]);

  const copyName = `${source.name} (Kopie)`;
  const rpcPayload = {
    slug: slugify(copyName),
    name: copyName,
    description: source.description || "",
    location: source.location || "",
    organizer_phone: source.organizer_phone || "",
    event_date: source.event_date,
    end_date: source.end_date || "",
    start_time: source.start_time,
    end_time: source.end_time || "",
    open_end: !!source.open_end,
    attendee_visibility: source.attendee_visibility || "count",
    show_attendee_list: !!source.show_attendee_list,
    photos_show_preview: false,
    photos_preview_text: "",
    photos_upload_enabled: !!source.photos_upload_enabled,
    photos_upload_url: source.photos_upload_url || "",
    photos_gallery_url: source.photos_gallery_url || "",
    photos_closes_at: "",
    is_published: false,
  };

  const { data: created, error: createErr } = await client.rpc("create_trouvo_event", { p_payload: rpcPayload }).single();
  if (createErr) throw new Error(formatDbError(createErr.message));

  const newId = created.id;
  const { error: extraErr } = await client.from("events").update({
    max_registrations: source.max_registrations,
    allow_plus_one: !!source.allow_plus_one,
    guest_email_required: !!source.guest_email_required,
    send_registration_email: false,
    registration_closes_at: source.registration_closes_at,
    feedback_mode_enabled: false,
    feedback_notes: {},
  }).eq("id", newId);
  if (extraErr && !isMissingColumnError(extraErr.message)) {
    throw new Error(formatDbError(extraErr.message));
  }

  const trackIdMap = {};
  for (const track of tracks.data || []) {
    const { data: row, error } = await client
      .from("event_timetable_tracks")
      .insert({ event_id: newId, name: track.name, sort_order: track.sort_order })
      .select("id")
      .single();
    if (error) throw new Error(formatDbError(error.message));
    trackIdMap[track.id] = row.id;
  }

  const ttRows = (tt.data || [])
    .filter((item) => item.title)
    .map((item) => ({
      event_id: newId,
      track_id: item.track_id ? trackIdMap[item.track_id] || null : null,
      item_date: item.item_date,
      start_time: item.start_time,
      title: item.title,
      description: item.description || "",
      sort_order: item.sort_order,
    }));
  if (ttRows.length) {
    const { error } = await client.from("event_timetable_items").insert(ttRows);
    if (error) throw new Error(formatDbError(error.message));
  }

  const fieldRows = (fields.data || []).map((f) => ({
    event_id: newId,
    label: f.label,
    field_type: f.field_type,
    required: !!f.required,
    visible_to_others: !!f.visible_to_others,
    sort_order: f.sort_order,
  }));
  if (fieldRows.length) {
    const { error } = await client.from("event_registration_fields").insert(fieldRows);
    if (error) throw new Error(formatDbError(error.message));
  }

  const bringRows = (bring.data || []).map((b) => ({
    event_id: newId,
    name: b.name,
    quantity_mode: b.quantity_mode,
    quantity_value: b.quantity_value,
    visible_to_others: !!b.visible_to_others,
    sort_order: b.sort_order,
  }));
  if (bringRows.length) {
    const { error } = await client.from("event_bring_items").insert(bringRows);
    if (error) throw new Error(formatDbError(error.message));
  }

  await insertPlanningRows(client, newId, {
    todos: (todos.data || []).map((t) => ({ title: t.title, assignee: t.assignee, done: false })),
    materials: (materials.data || []).map((m) => ({
      name: m.name,
      quantity: m.quantity,
      assignee: m.assignee,
      acquired: false,
    })),
  });

  return newId;
}
