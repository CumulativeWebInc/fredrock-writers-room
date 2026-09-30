/* FredRock Writers Room — build-time config.
 * Leave empty to use the setup.html flow: the admin pastes the Supabase URL +
 * anon key once, stored in localStorage as fr_supabase_url / fr_supabase_anon_key.
 * db.js reads localStorage first, then these values. No secrets belong here.
 */
window.FR_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
