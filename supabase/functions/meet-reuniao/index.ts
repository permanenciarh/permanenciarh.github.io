// =============================================================================
// Permanência RH — Edge Function "meet-reuniao"
// Cria, atualiza e cancela o evento no Google Agenda do Álamo com link do Google Meet.
// Chamada pelo painel (admin.html) quando um compromisso Online é agendado.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   (OAuth do Google, ver guia)
//   GOOGLE_CALENDAR_ID   opcional, padrão "primary"
//   ALLOWED_ORIGINS      opcional, padrão "https://permanenciarh.com.br,https://permanenciarh.github.io"
// Configuração da função: "Verify JWT" LIGADO (só quem está logado no painel chama).
// Ações (body JSON): {acao:"status"} | {acao:"criar", ...} | {acao:"atualizar", evento_id, ...} | {acao:"cancelar", evento_id}
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://permanenciarh.com.br,https://permanenciarh.github.io")
  .split(",").map((o) => o.trim()).filter(Boolean);
const CAL = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[a-v0-9]{5,1024}$/; // ids de evento do Google (base32hex)

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function resp(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
const configurado = () => !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("GOOGLE_REFRESH_TOKEN"));

async function tokenGoogle(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!, grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("google_auth:" + (j.error ?? r.status));
  return j.access_token;
}

function corpo(d: Record<string, unknown>, criando: boolean) {
  const ev: Record<string, unknown> = {};
  if (typeof d.titulo === "string") ev.summary = d.titulo.slice(0, 200);
  if (typeof d.descricao === "string") ev.description = d.descricao.slice(0, 4000);
  const ini = new Date(String(d.inicio)), fim = new Date(String(d.fim));
  if (!isNaN(ini.getTime()) && !isNaN(fim.getTime()) && fim > ini) {
    ev.start = { dateTime: ini.toISOString(), timeZone: "America/Sao_Paulo" };
    ev.end = { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" };
  } else if (criando) throw new Error("datas_invalidas");
  const emails = (Array.isArray(d.convidados) ? d.convidados : []).map(String).filter((e) => EMAIL_RE.test(e)).slice(0, 10);
  if (emails.length) ev.attendees = emails.map((email) => ({ email }));
  if (criando) ev.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return ev;
}
function linkMeet(ev: any): string {
  return ev?.hangoutLink || ev?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return resp(req, 405, { erro: "metodo" });
  const origin = req.headers.get("origin");
  if (origin && !ORIGINS.includes(origin)) return resp(req, 403, { erro: "origem" });

  // quem chama precisa ser da equipe (admin ou recrutador)
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: papel, error: ePapel } = await sb.rpc("papel_atual");
  if (ePapel || !["admin", "recrutador"].includes(String(papel))) return resp(req, 403, { erro: "sem_permissao" });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return resp(req, 400, { erro: "json" }); }
  if (d.acao === "status") return resp(req, 200, { configurado: configurado() });
  if (!configurado()) return resp(req, 200, { configurado: false });

  try {
    const tk = await tokenGoogle();
    const H = { Authorization: "Bearer " + tk, "Content-Type": "application/json" };
    const base = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(CAL) + "/events";
    const envia = d.enviar_convite === true ? "all" : "none";

    if (d.acao === "criar") {
      const r = await fetch(base + "?conferenceDataVersion=1&sendUpdates=" + envia, { method: "POST", headers: H, body: JSON.stringify(corpo(d, true)) });
      const ev = await r.json();
      if (!r.ok) return resp(req, 200, { configurado: true, erro: "google:" + (ev?.error?.message ?? r.status) });
      return resp(req, 200, { configurado: true, evento_id: ev.id, link: linkMeet(ev), html: ev.htmlLink });
    }
    const id = String(d.evento_id ?? "");
    if (!ID_RE.test(id)) return resp(req, 400, { erro: "evento_id" });
    if (d.acao === "atualizar") {
      const r = await fetch(base + "/" + id + "?conferenceDataVersion=1&sendUpdates=" + envia, { method: "PATCH", headers: H, body: JSON.stringify(corpo(d, false)) });
      const ev = await r.json();
      if (!r.ok) return resp(req, 200, { configurado: true, erro: "google:" + (ev?.error?.message ?? r.status) });
      return resp(req, 200, { configurado: true, evento_id: ev.id, link: linkMeet(ev) });
    }
    if (d.acao === "cancelar") {
      const r = await fetch(base + "/" + id + "?sendUpdates=" + envia, { method: "DELETE", headers: H });
      if (!r.ok && r.status !== 410 && r.status !== 404) return resp(req, 200, { configurado: true, erro: "google:" + r.status });
      return resp(req, 200, { configurado: true, ok: true });
    }
    return resp(req, 400, { erro: "acao" });
  } catch (e) {
    return resp(req, 200, { configurado: true, erro: String((e as Error).message ?? e).slice(0, 200) });
  }
});
