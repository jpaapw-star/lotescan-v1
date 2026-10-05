/**
 * Camada de Tradução de Erros da API (Mensagens Amigáveis em PT-BR)
 * Nenhuma mensagem técnica em inglês (ex: 'showGridLines', 'JSON payload', 'WebSocket closed', '401', etc.)
 * deve ser exibida ao usuário final.
 */
export function translateErrorMessage(err: unknown): string {
  if (!err) {
    return "Ocorreu uma instabilidade temporária. Tente novamente ou contate o suporte.";
  }

  const raw =
    typeof err === "string"
      ? err
      : (err as any)?.message || (err as any)?.error?.message || JSON.stringify(err);

  const lower = String(raw).toLowerCase();

  // Erros específicos de Pop-up e Autenticação Google / Firebase
  if (
    lower.includes("popup-blocked") ||
    lower.includes("popup_blocked") ||
    lower.includes("popup was blocked") ||
    lower.includes("pop-up") ||
    lower.includes("janela bloqueada")
  ) {
    return "A janela de login do Google foi bloqueada pelo navegador. Permita pop-ups para este site e tente novamente.";
  }

  if (
    lower.includes("popup-closed-by-user") ||
    lower.includes("cancelled-popup-request") ||
    lower.includes("closed-by-user") ||
    lower.includes("user-cancelled")
  ) {
    return "O login do Google foi cancelado antes da conclusão.";
  }

  if (
    lower.includes("pending promise was never set") ||
    lower.includes("internal assertion failed")
  ) {
    return "A janela de login anterior foi fechada. Clique em 'Conectar com o Google' novamente.";
  }

  if (lower.includes("unauthorized-domain") || lower.includes("domínio não autorizado")) {
    return "Domínio não autorizado para login Google nesta aplicação.";
  }

  // Erros de criação ou estrutura de planilha
  if (
    lower.includes("showgridlines") ||
    lower.includes("create") ||
    lower.includes("criar planilha") ||
    lower.includes("spreadsheet.sheets") ||
    lower.includes("invalid json payload") ||
    lower.includes("unknown name")
  ) {
    return "Não foi possível criar a nova planilha. Tente novamente ou contate o suporte.";
  }

  // Erros 401 / 403 (Autenticação, Permissão e Sessão Expirada)
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthenticated") ||
    lower.includes("permission_denied") ||
    lower.includes("invalid_grant") ||
    lower.includes("token expired") ||
    lower.includes("auth") ||
    lower.includes("credentials") ||
    lower.includes("sessão")
  ) {
    return "Sua sessão do Google expirou ou falta permissão. Faça login novamente.";
  }

  // Erro 429 (Cota / Rate Limit)
  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("exceeded")
  ) {
    return "Muitas requisições ao Google Sheets no momento. Aguarde alguns segundos.";
  }

  // Erros de Rede, Conexão e Timeout
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("websocket") ||
    lower.includes("econnrefused") ||
    lower.includes("offline") ||
    lower.includes("conexão") ||
    lower.includes("servidor") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    return "Sem conexão com a internet ou o servidor não respondeu.";
  }

  // Fallback padrão amigável em português
  return "Não foi possível concluir a operação no momento. Tente novamente ou contate o suporte.";
}
