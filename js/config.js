/**
 * Permanência RH — configuração pública do site.
 *
 * Este arquivo é PÚBLICO. Só coloque aqui valores feitos para ficar no navegador:
 *  - supabaseUrl e supabaseAnonKey (a "anon public key" é pública por design;
 *    a proteção dos dados vem das regras RLS do banco).
 * NUNCA coloque a "service_role key", senhas ou tokens aqui.
 */
window.PRH_CONFIG = {
  // Supabase > Project Settings > API (ou Data API) > Project URL
  supabaseUrl: "",          // ex.: "https://abcdefghijkl.supabase.co"

  // Supabase > Project Settings > API Keys > "anon" / "public"
  supabaseAnonKey: "",

  // Endereço da função que recebe o cadastro. Se ficar vazio, é montado a partir do supabaseUrl.
  cadastroEndpoint: "",

  maxUploadMB: 5,
  requestTimeoutMs: 25000,
  whatsapp: "5534992871582"
};

// Monta o endpoint automaticamente. Sem supabaseUrl, o formulário fica em modo demonstração.
(function (c) {
  if (!c.cadastroEndpoint && c.supabaseUrl) c.cadastroEndpoint = c.supabaseUrl.replace(/\/$/, "") + "/functions/v1/cadastro-candidato";
})(window.PRH_CONFIG);
