async function insertPlanningRows(client, targetEventId, planning, todoStart = 0, matStart = 0) {
  const todoRows = (planning.todos || [])
    .filter((t) => t.title || t.assignee)
    .map((t, i) => ({
      event_id: targetEventId,
      title: t.title || "",
      assignee: t.assignee || "",
      done: !!t.done,
      sort_order: todoStart + i,
    }));
  const materialRows = (planning.materials || [])
    .filter((m) => m.name || m.quantity || m.assignee)
    .map((m, i) => ({
      event_id: targetEventId,
      name: m.name || "",
      quantity: m.quantity || "",
      assignee: m.assignee || "",
      acquired: !!m.acquired,
      sort_order: matStart + i,
    }));

  if (todoRows.length) {
    const { error } = await client.from("event_planning_todos").insert(todoRows);
    if (error) throw new Error(formatDbError(error.message));
  }
  if (materialRows.length) {
    const { error } = await client.from("event_planning_materials").insert(materialRows);
    if (error) throw new Error(formatDbError(error.message));
  }
}

async function applyTemplateDataToEvent(client, eventId, template) {
  const ev = template.event;
  if (!ev) return;

  for (let ti = 0; ti < (ev.timetableTracks || []).length; ti++) {
    const track = ev.timetableTracks[ti];
    const hasItems = (track.items || []).some((item) => item.title);
    if (!track.name?.trim() && !hasItems) continue;

    const { data: trackRow, error: trackErr } = await client
      .from("event_timetable_tracks")
      .insert({ event_id: eventId, name: (track.name || "").trim(), sort_order: ti })
      .select("id")
      .single();
    if (trackErr) throw new Error(formatDbError(trackErr.message));

    const ttRows = (track.items || [])
      .filter((item) => item.title)
      .map((item, ii) => ({
        event_id: eventId,
        track_id: trackRow.id,
        item_date: null,
        start_time: (item.start_time || "19:00").slice(0, 5),
        title: item.title,
        description: item.description || "",
        sort_order: ii,
      }));
    if (ttRows.length) {
      const { error } = await client.from("event_timetable_items").insert(ttRows);
      if (error) throw new Error(formatDbError(error.message));
    }
  }

  const fieldRows = (ev.fields || [])
    .filter((f) => f.label)
    .map((f, i) => ({
      event_id: eventId,
      label: f.label,
      field_type: f.field_type,
      required: !!f.required,
      visible_to_others: !!f.visible_to_others,
      sort_order: i,
    }));
  if (fieldRows.length) {
    const { error } = await client.from("event_registration_fields").insert(fieldRows);
    if (error) throw new Error(formatDbError(error.message));
  }

  const bringRows = (ev.bringItems || [])
    .filter((b) => b.name)
    .map((b, i) => ({
      event_id: eventId,
      name: b.name,
      quantity_mode: b.quantity_mode,
      quantity_value: Number(b.quantity_value) || 1,
      visible_to_others: !!b.visible_to_others,
      sort_order: i,
    }));
  if (bringRows.length) {
    const { error } = await client.from("event_bring_items").insert(bringRows);
    if (error) throw new Error(formatDbError(error.message));
  }

  if (template.planning) {
    await insertPlanningRows(client, eventId, template.planning);
  }
}

async function createEventWithSetup({ name, date, template }) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase nicht konfiguriert.");

  await ensureWriteSession(client);

  const templateData = template ? EVENT_TEMPLATES[template] : null;
  const ev = templateData?.event || {};
  const startTime = (ev.start_time || "19:00").slice(0, 5);

  const rpcPayload = {
    slug: slugify(name),
    name,
    description: ev.description || "",
    location: "",
    organizer_phone: "",
    event_date: date,
    end_date: "",
    start_time: startTime,
    end_time: ev.end_time ? String(ev.end_time).slice(0, 5) : "",
    open_end: !!ev.open_end,
    attendee_visibility: "count",
    show_attendee_list: false,
    photos_show_preview: false,
    photos_preview_text: "",
    photos_upload_enabled: false,
    photos_upload_url: "",
    photos_gallery_url: "",
    photos_closes_at: "",
    is_published: false,
  };

  const { data, error } = await client.rpc("create_trouvo_event", { p_payload: rpcPayload }).single();
  if (error) throw new Error(formatDbError(error.message));

  if (templateData) {
    await applyTemplateDataToEvent(client, data.id, templateData);
  }

  return data.id;
}
