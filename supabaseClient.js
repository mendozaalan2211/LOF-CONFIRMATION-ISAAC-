import { createClient } from "@supabase/supabase-js";

// ============================================================
//  CONEXION A SUPABASE
//  Pega aqui tus dos claves de Supabase (mira la GUIA paso 2).
//  Las encuentras en tu proyecto de Supabase:
//  Settings (engrane) -> API
// ============================================================

const SUPABASE_URL = "https://yjhessebmbiorkkbdeag.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqaGVzc2VibWJpb3Jra2JkZWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTIwODUsImV4cCI6MjEwMTY4ODA4NX0.7epxFjG5MILaF-oY2EYfbCwtNQ4cUEUQbQinhUs_af4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Aviso util si olvidaste pegar las claves
export const supabaseConfigured =
  SUPABASE_URL !== "PEGA_AQUI_TU_PROJECT_URL" &&
  SUPABASE_ANON_KEY !== "PEGA_AQUI_TU_ANON_KEY";
