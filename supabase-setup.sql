-- ============================================================
--  CONFIGURACION DE SUPABASE PARA LOF PANEL
--  Copia TODO este texto y pegalo en el SQL Editor de Supabase,
--  luego dale "Run". Esto crea la tabla donde se guardan tus datos.
--  (Mira la GUIA, paso 1)
-- ============================================================

-- 1) Crear la tabla que guarda todo el estado de la app
create table if not exists app_state (
  id integer primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- 2) Permitir lectura y escritura publica (los coaches usan la app sin login)
alter table app_state enable row level security;

drop policy if exists "lectura publica" on app_state;
create policy "lectura publica" on app_state
  for select using (true);

drop policy if exists "escritura publica" on app_state;
create policy "escritura publica" on app_state
  for insert with check (true);

drop policy if exists "actualizacion publica" on app_state;
create policy "actualizacion publica" on app_state
  for update using (true) with check (true);

-- 3) Activar tiempo real (para que todos vean los cambios al instante)
alter publication supabase_realtime add table app_state;
