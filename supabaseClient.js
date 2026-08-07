import { createClient } from "@supabase/supabase-js";

// ============================================================
//  CONEXION A SUPABASE
//  Pega aqui tus dos claves de Supabase (mira la GUIA paso 2).
//  Las encuentras en tu proyecto de Supabase:
//  Settings (engrane) -> API
// ============================================================

const SUPABASE_URL = "PEGA_AQUI_TU_PROJECT_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Aviso util si olvidaste pegar las claves
export const supabaseConfigured =
  SUPABASE_URL !== "PEGA_AQUI_TU_PROJECT_URL" &&
  SUPABASE_ANON_KEY !== "PEGA_AQUI_TU_ANON_KEY";
