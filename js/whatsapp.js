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

export function linkLembreteVespera({ whatsapp, clienteNome, servicos, dataHoraTexto, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Passando pra lembrar do seu horário amanhã na ${nomeNegocio}:\n${servicos} em ${dataHoraTexto}.\nAté lá! ☀️`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkSuaVezChegando({ whatsapp, clienteNome, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Já é praticamente sua vez na ${nomeNegocio} — pode vir se aproximando que já vamos te chamar! 😊`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkPromocao({ whatsapp, clienteNome, textoPromocao, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Tem novidade na ${nomeNegocio}: ${textoPromocao} Bora aproveitar? ☀️🎁`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkAniversario({ whatsapp, clienteNome, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Feliz aniversário, ${clienteNome}! 🎉 A equipe da ${nomeNegocio} deseja um dia lindo pra você. Como presente, fala com a gente que preparamos algo especial!`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkSessaoPacoteAtendida({ whatsapp, clienteNome, sessoesRestantes, totalSessoes, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Confirmamos sua sessão de hoje na ${nomeNegocio} ☀️ Restam ${sessoesRestantes} de ${totalSessoes} sessões do seu pacote. Até a próxima!`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkPacoteParado({ whatsapp, clienteNome, dias, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Notamos que faz ${dias} dias que você não usa as sessões do seu pacote na ${nomeNegocio}. Ainda tem sessões esperando por você — bora agendar? ☀️`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkPacoteAcabando({ whatsapp, clienteNome, sessoesRestantes, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Seu pacote de sessões na ${nomeNegocio} está quase no fim — ${sessoesRestantes === 0 ? 'já acabou' : `restam só ${sessoesRestantes}`}. Bora renovar pra não perder o ritmo? ☀️`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkAgradecimento({ whatsapp, clienteNome, nomeNegocio }) {
  const numero = limparNumero(whatsapp);
  const texto = `Oi, ${clienteNome}! Muito obrigada por ter vindo na ${nomeNegocio} hoje. Foi um prazer te atender — até a próxima! ☀️`;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
}
