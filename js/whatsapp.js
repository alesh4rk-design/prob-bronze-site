// Pro'Bronze — Notificação por WhatsApp
// Sem integração paga de API — gera links wa.me com mensagem pronta,
// que a esteticista/recepcionista clica pra abrir o WhatsApp Web/app
// já com o texto preenchido, pronto pra enviar.

function limparNumero(numero) {
  return (numero || "").replace(/\D/g, "");
}

export function linkConfirmacaoAgendamento({ whatsapp, clienteNome, servicos, dataHoraTexto, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Olá, ${clienteNome}! Seu agendamento na ${nomeNegocio} está confirmado:\n${servicos} em ${dataHoraTexto}.\nAté breve! ☀️`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkLembreteIntervalo({ whatsapp, clienteNome, horasFaltando, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Olá, ${clienteNome}! Na ${nomeNegocio}, o intervalo mínimo de segurança entre sessões ainda não foi cumprido — faltam aproximadamente ${horasFaltando}h. Assim que puder, agende sua próxima sessão!`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkCobrancaPendente({ whatsapp, clienteNome, valor, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Olá, ${clienteNome}! Notamos um pagamento pendente de R$${Number(valor).toFixed(2)} na ${nomeNegocio}. Quando puder, regularize por aqui. Obrigada! 🙏`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkAtrasoAgendamento({ whatsapp, clienteNome, minutosAtraso, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Olá, ${clienteNome}! Seu horário na ${nomeNegocio} já começou há ${minutosAtraso} minutos. Você ainda vem? Nos avise, por favor! 🙏`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkClienteSumido({ whatsapp, clienteNome, dias, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Olá, ${clienteNome}! Notamos que faz ${dias} dias que você não vem na ${nomeNegocio}. Sentimos sua falta! Bora agendar sua próxima sessão? ☀️`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkMensagemLivre({ whatsapp }) {
  const numero = limparNumero(whatsapp);
  return `https://wa.me/55${numero}`;
}
