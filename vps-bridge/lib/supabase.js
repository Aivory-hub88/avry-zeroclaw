/**
 * VPS Bridge - Supabase Database Client
 * Uses @supabase/supabase-js for user entitlements and Stripe audit trail
 */

const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

// Load env (server.js already loads dotenv, but safe to try)
try { require("dotenv").config(); } catch (e) {}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY — DB features disabled");
}

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
      realtime: { transport: WebSocket },
    })
  : null;

// ── ENTITLEMENTS ──────────────────────────────────────────────────────────────

async function getUserEntitlements(userId) {
  if (!supabase) return { tier: "free", features: {} };
  const { data, error } = await supabase
    .from("user_tiers")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return { tier: "free", features: {} };
    throw error;
  }
  return data;
}

async function upsertEntitlement({ userId, tier, features, expiresAt }) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("user_tiers")
    .upsert(
      { user_id: userId, tier: tier || "free", features: features || {}, expires_at: expiresAt || null },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── STRIPE EVENTS ─────────────────────────────────────────────────────────────

async function recordStripeEvent({ eventId, eventType, userId, sessionId, amount, currency }) {
  if (!supabase) return;
  const { error } = await supabase.from("stripe_events").insert({
    event_id: eventId,
    event_type: eventType,
    user_id: userId,
    session_id: sessionId,
    amount: amount || 0,
    currency: currency || "usd",
  });
  if (error) console.error("[supabase recordStripeEvent]", error.message);
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = { supabase, getUserEntitlements, upsertEntitlement, recordStripeEvent };
