-- Interne Event-Planung: Aufgaben & Material (nur für Veranstalter sichtbar)

CREATE TABLE IF NOT EXISTS public.event_planning_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  assignee text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_planning_todos_event_idx
  ON public.event_planning_todos (event_id, sort_order);

CREATE TABLE IF NOT EXISTS public.event_planning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  assignee text NOT NULL DEFAULT '',
  acquired boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_planning_materials_event_idx
  ON public.event_planning_materials (event_id, sort_order);

ALTER TABLE public.event_planning_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_planning_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_todos_select ON public.event_planning_todos;
CREATE POLICY planning_todos_select ON public.event_planning_todos
  FOR SELECT TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_todos_insert ON public.event_planning_todos;
CREATE POLICY planning_todos_insert ON public.event_planning_todos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_todos_update ON public.event_planning_todos;
CREATE POLICY planning_todos_update ON public.event_planning_todos
  FOR UPDATE TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_todos_delete ON public.event_planning_todos;
CREATE POLICY planning_todos_delete ON public.event_planning_todos
  FOR DELETE TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_materials_select ON public.event_planning_materials;
CREATE POLICY planning_materials_select ON public.event_planning_materials
  FOR SELECT TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_materials_insert ON public.event_planning_materials;
CREATE POLICY planning_materials_insert ON public.event_planning_materials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_materials_update ON public.event_planning_materials;
CREATE POLICY planning_materials_update ON public.event_planning_materials
  FOR UPDATE TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS planning_materials_delete ON public.event_planning_materials;
CREATE POLICY planning_materials_delete ON public.event_planning_materials
  FOR DELETE TO authenticated
  USING (public.is_event_organizer(event_id));
