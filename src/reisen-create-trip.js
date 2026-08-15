async function createTripWithSetup({ start_date, end_date, trip_type, start_location, end_location }) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase nicht konfiguriert.");

  const { user } = await ensureWriteSession(client);
  const creatorDisplayName = user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "");

  const payload = {
    start_date,
    end_date,
    trip_type: trip_type || "fahrradtour",
    start_location,
    end_location,
    creator_display_name: creatorDisplayName,
  };

  const { data, error } = await client.rpc("create_trip", { p_payload: payload }).single();
  if (error) throw new Error(formatDbError(error.message));
  return data.id;
}
