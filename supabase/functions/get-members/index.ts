// Supabase Edge Function example for /api/members
// Deploy with: supabase functions deploy get-members

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";

serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration in environment variables." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase
    .from("membership")
    .select("id, full_name, membership_id, plan_type, expiry_date, email, phone, status, discount_rate")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ members: data ?? [] }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

