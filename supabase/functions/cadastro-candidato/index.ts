// =============================================================================
// Permanência RH — Edge Function "cadastro-candidato"
// Recebe o formulário do Banco de Talentos, valida no servidor e salva:
//   candidato + autorizações (consentimentos) + currículo PDF em bucket privado.
//
// Variáveis (Supabase > Edge Functions > Secrets):
//   ALLOWED_ORIGINS  ex.: "https://permanenciarh.github.io"  (separe várias por vírgula)
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.
// Configuração da função: "Verify JWT" DESLIGADO (o formulário é público).
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://permanenciarh.github.io")
  .split(",").map((o) => o.trim()).filter(Boolean);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ENVIOS_POR_JANELA = 5;      // por IP
const JANELA_MINUTOS = 10;
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const MODALIDADES = new Set(["presencial", "hibrido", "remoto", "todas"]);
const TIPOS = new Set(["clt", "estagio", "aprendizagem", "temporario", "pj", "freelancer"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]{2,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Diversidade (dado sensível): valores aceitos — qualquer outro vira null
const DIV: Record<string, Set<string>> = {
  genero: new Set(["mulher", "homem", "nao_binaria", "outro"]),
  pessoa_trans: new Set(["sim", "nao"]),
  raca_cor: new Set(["branca", "preta", "parda", "amarela", "indigena"]),
  pcd: new Set(["sim", "nao"]),
  pcd_tipo: new Set(["fisica", "auditiva", "visual", "intelectual", "psicossocial", "multipla", "tea"]),
  lgbtqia: new Set(["sim", "nao"]),
  pessoa_50_mais: new Set(["sim", "nao"]),
};

function headers(origin: string | null): HeadersInit {
  const allowed = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
const reply = (h: HeadersInit, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: h });
const txt = (v: FormDataEntryValue | null, max: number) =>
  (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const longTxt = (v: FormDataEntryValue | null, max: number) =>
  (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = headers(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return reply(h, 405, { ok: false });
  if (!origin || !ORIGINS.includes(origin)) return reply(h, 403, { ok: false });

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BYTES + 200_000) return reply(h, 413, { ok: false });

  let fd: FormData;
  try { fd = await req.formData(); } catch { return reply(h, 400, { ok: false }); }

  // Honeypot: campo invisível para pessoas; robôs costumam preencher.
  if (txt(fd.get("website"), 200)) return reply(h, 200, { ok: true });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Limite de envios por IP (o IP é guardado apenas como hash)
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const ipHash = await sha256(ip + (Deno.env.get("SUPABASE_URL") ?? ""));
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();
  const { count } = await sb.from("limite_envios").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("criado_em", desde);
  if ((count ?? 0) >= MAX_ENVIOS_POR_JANELA) return reply(h, 429, { ok: false });
  await sb.from("limite_envios").insert({ ip_hash: ipHash });

  const d = {
    nome: txt(fd.get("nome"), 120),
    email: txt(fd.get("email"), 160).toLowerCase(),
    telefone: txt(fd.get("telefone"), 20) || null,
    cidade: txt(fd.get("cidade"), 80),
    uf: txt(fd.get("estado"), 2).toUpperCase(),
    linkedin_url: txt(fd.get("linkedin"), 200) || null,
    area: txt(fd.get("area"), 60),
    cargo_desejado: txt(fd.get("cargo"), 100),
    resumo: longTxt(fd.get("resumo"), 1200),
    experiencia: txt(fd.get("experiencia"), 40),
    escolaridade: txt(fd.get("escolaridade"), 60),
    competencias: txt(fd.get("competencias"), 300),
    idiomas: txt(fd.get("idiomas"), 150) || null,
    modalidade: txt(fd.get("modalidade"), 12),
    tipos_oportunidade: [...new Set(fd.getAll("tipo").map(String).filter((t) => TIPOS.has(t)))],
    disponibilidade: txt(fd.get("disponibilidade"), 40),
    pretensao_faixa: txt(fd.get("pretensao"), 40) || null,
    curriculo_link: txt(fd.get("curriculo_link"), 300) || null,
  };
  // Perfil comportamental: só com autorização própria. A pontuação é calculada aqui no servidor.
  const respostas = txt(fd.get("perfil_respostas"), 25).toUpperCase();
  const incluirPerfil = fd.get("incluir_perfil") === "true" && /^[ICOA]{25}$/.test(respostas);
  const perfil: Record<string, unknown> = {};
  if (incluirPerfil) {
    const pct = (l: string) => respostas.split("").filter((x) => x === l).length * 4;
    const notas: Record<string, number> = { aguia: pct("I"), gato: pct("C"), lobo: pct("O"), tubarao: pct("A") };
    const ordem = ["aguia", "gato", "lobo", "tubarao"];
    const predominante = ordem.reduce((m, k) => (notas[k] > notas[m] ? k : m), ordem[0]);
    Object.assign(perfil, {
      perfil_respostas: respostas, perfil_aguia: notas.aguia, perfil_gato: notas.gato, perfil_lobo: notas.lobo,
      perfil_tubarao: notas.tubarao, perfil_predominante: predominante, perfil_respondido_em: new Date().toISOString(),
    });
  }

  // Diversidade: só com autorização específica e destacada (LGPD art. 11, I)
  const divConsent = fd.get("div_consent") === "true";
  const div: Record<string, string | null> = {};
  for (const k of Object.keys(DIV)) {
    const v = txt(fd.get("div_" + k), 20);
    div[k] = DIV[k].has(v) ? v : null;
  }
  if (div.pcd !== "sim") div.pcd_tipo = null;
  const adapt = longTxt(fd.get("div_pcd_adaptacoes"), 500);
  const temDiv = divConsent && (Object.values(div).some(Boolean) || !!adapt);

  // Vaga (opcional): só aceita vaga aberta
  const vagaRaw = txt(fd.get("vaga_id"), 40);
  let vagaId: string | null = null;
  if (UUID_RE.test(vagaRaw)) {
    const { data: vaga } = await sb.from("vagas").select("id").eq("id", vagaRaw).eq("status", "aberta").maybeSingle();
    if (vaga) vagaId = vaga.id;
  }

  const tel = (d.telefone ?? "").replace(/\D/g, "");
  const valido =
    d.nome.length >= 5 && EMAIL_RE.test(d.email) && d.cidade.length > 0 && UFS.has(d.uf) &&
    d.area && d.cargo_desejado && d.resumo.length >= 50 && d.experiencia && d.escolaridade &&
    d.competencias && MODALIDADES.has(d.modalidade) && d.tipos_oportunidade.length > 0 && d.disponibilidade &&
    fd.get("ciencia") === "true" &&
    (!d.telefone || (tel.length >= 10 && tel.length <= 13)) &&
    (!d.linkedin_url || URL_RE.test(d.linkedin_url)) &&
    (!d.curriculo_link || URL_RE.test(d.curriculo_link));
  if (!valido) return reply(h, 400, { ok: false });

  // Currículo: tamanho, tipo e assinatura real de PDF
  const arq = fd.get("curriculo_arquivo");
  let pdf: Uint8Array | null = null;
  if (arq instanceof File && arq.size > 0) {
    if (arq.size > MAX_BYTES) return reply(h, 413, { ok: false });
    pdf = new Uint8Array(await arq.arrayBuffer());
    const assinatura = new TextDecoder().decode(pdf.slice(0, 5));
    if (assinatura !== "%PDF-") return reply(h, 400, { ok: false });
  }

  const { data: cand, error } = await sb.from("candidatos").insert({ ...d, ...perfil }).select("id").single();
  if (error) {
    // E-mail já cadastrado: resposta neutra, sem revelar se o e-mail existe.
    // Se veio de uma vaga, a candidatura é registrada no cadastro existente.
    if (error.code === "23505") {
      if (vagaId) {
        const { data: existente } = await sb.from("candidatos").select("id").eq("email", d.email).is("excluido_em", null).maybeSingle();
        if (existente) await sb.from("candidaturas").upsert({ vaga_id: vagaId, candidato_id: existente.id }, { onConflict: "vaga_id,candidato_id", ignoreDuplicates: true });
      }
      return reply(h, 200, { ok: true });
    }
    console.error("insert_candidato", error.code);   // nunca registrar dados pessoais
    return reply(h, 500, { ok: false });
  }

  if (pdf) {
    const path = `${cand.id}/${crypto.randomUUID()}.pdf`;
    const up = await sb.storage.from("curriculos").upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (up.error) console.error("upload_curriculo", up.error.message);
    else await sb.from("candidatos").update({ curriculo_path: path }).eq("id", cand.id);
  }

  const versao = txt(fd.get("versao_aviso_privacidade"), 10) || "1.0";
  const { error: errCons } = await sb.from("consentimentos").insert([
    { candidato_id: cand.id, finalidade: "ciencia_aviso", concedido: true, versao_aviso: versao },
    { candidato_id: cand.id, finalidade: "compartilhar_empresas", concedido: fd.get("compartilhar") === "true", versao_aviso: versao },
    { candidato_id: cand.id, finalidade: "receber_conteudos", concedido: fd.get("novidades") === "true", versao_aviso: versao },
    { candidato_id: cand.id, finalidade: "perfil_comportamental", concedido: incluirPerfil, versao_aviso: versao },
    { candidato_id: cand.id, finalidade: "dados_diversidade", concedido: temDiv, versao_aviso: versao },
  ]);
  if (errCons) console.error("insert_consentimentos", errCons.code);

  if (temDiv) {
    const { error: errDiv } = await sb.from("diversidade").insert({ candidato_id: cand.id, ...div, pcd_adaptacoes: adapt || null });
    if (errDiv) console.error("insert_diversidade", errDiv.code);
  }
  if (vagaId) {
    const { error: errVaga } = await sb.from("candidaturas").insert({ vaga_id: vagaId, candidato_id: cand.id });
    if (errVaga) console.error("insert_candidatura", errVaga.code);
  }

  return reply(h, 200, { ok: true });
});
