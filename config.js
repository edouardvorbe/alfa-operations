// Configuration de l'application — à adapter avant la mise en ligne.
window.APP_CONFIG = {
  appName: "Alfa Operations",
  company: "Alfa Bandari Haïti",
  // "supabase" en production ; "mock" = données d'essai locales (sans serveur)
  mode: "supabase",
  supabaseUrl: "https://svddbvfzipicnffceqeu.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2ZGRidmZ6aXBpY25mZmNlcWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MTk1ODEsImV4cCI6MjExMTE5NTU4MX0.Lcpn0k0OxXyhz-0fLlZwkyzaec2dQEoMq95Nk6Ia_2U",
  // Compagnies de remodelage proposées dans les listes
  companies: ["Neon Nieto", "AI", "TAIR", "RS Construction", "HSL", "AIM"],
  depts: ["NORD","NORD EST","NORD OUEST","ARTIBONITE","CENTRE","OUEST","NIPPES","SUD","SUD EST","GRAND ANSE"],
  deptColors: {"NORD":"#2b6cb0","NORD EST":"#1f8f9c","NORD OUEST":"#5b8def","ARTIBONITE":"#4f9a3a","CENTRE":"#8a6d3b","OUEST":"#e8590c","NIPPES":"#c9a227","SUD":"#c62828","SUD EST":"#7b4fbf","GRAND ANSE":"#3a7a6a"},
  levels: ["L1","L2","L3","—"],
  surveyCodes: {"NN":"Réalisé par Neon Nieto","AI":"Réalisé par AI","TD":"À faire","RD":"À confirmer / à refaire","INT":"Réalisé — fiche interne"}
};
