/**
 * Demo mode keeps sample data in this browser. Live mode talks to the server and Supabase.
 * Live only when NEXT_PUBLIC_DATA_MODE is "live", so adding the Supabase keys alone never flips the app.
 */
export const IS_LIVE = process.env.NEXT_PUBLIC_DATA_MODE === 'live';
