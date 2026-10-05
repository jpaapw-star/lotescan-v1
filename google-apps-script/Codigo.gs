/**
 * =========================================================================================
 * SCANLOTE AI - INVENTÁRIO INTELIGENTE POR VISÃO COMPUTACIONAL
 * GOOGLE APPS SCRIPT (Código.gs) - VERSÃO UNIFICADA, APERFEIÇOADA E ROBUSTA
 * =========================================================================================
 * 
 * MODELO DE IA: Gemini 3.5 Flash Lite (com fallback de segurança para gemini-2.5-flash-lite)
 * ARQUITETURA:
 *   - IA = Interpretação
 *   - BACKEND (Apps Script) = Decisão, Deduplicação e Regras de Negócio
 *   - DRIVE / SHEETS = Persistência
 *   - WEB APP / SIDEBAR = Operação Ágil (Fotografar -> Enviar -> Continuar Trabalhando)
 */

const CONFIG = Object.freeze({
  APP_NAME: 'ScanLote AI - Recebimento e Conferência de Lotes',
  GEMINI_MODEL_PRIMARY: 'gemini-3.8-flash',
  GEMINI_MODEL_FALLBACK: 'gemini-flash-latest',
  GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models/',
  TEMPERATURE: 0.1,
  MAX_OUTPUT_TOKENS: 4096,
  MAX_RETRIES: 3,
  RETRY_BASE_MS: 4000,
  JOB_STALE_MS: 10 * 60 * 1000,
  MAX_IMAGES_PER_LOT: 35,
  ROOT_FOLDER_NAME: 'SCANLOTE_INVENTARIO',
  SHEETS: {
    RESUMO_CAIXAS: 'RESUMO_CAIXAS', // Aba Principal (Dashboard Colunas A-J)
    MANIFESTO: 'MANIFESTO',         // Importação de NF/Manifesto em PDF
    INVENTARIO: 'INVENTARIO',       // Planilha Operacional de Itens
    LOTES: 'LOTES',
    FOTOS: 'FOTOS',
    PRODUTOS: 'PRODUTOS',           // Camada técnica de produtos
    HISTORICO: 'HISTORICO',         // Camada de auditoria (oculta)
    JOBS: 'JOBS'                    // Fila assíncrona (oculta)
  }
});

const HEADERS = {
  RESUMO_CAIXAS: ['CAIXA', 'DATA_CRIACAO', 'LOTE_ID', 'QTD_LIDA', 'QTD_MANIFESTO', 'STATUS', 'DIVERGENCIA_AUDITORIA', 'REVISAO_MANUAL', 'AVARIAS_DETECTADAS', 'OPERADOR_RESPONSAVEL'],
  MANIFESTO: ['NFE', 'FORNECEDOR', 'DATA_EMISSAO', 'CODIGO_ITEM', 'DESCRICAO', 'EAN', 'QUANTIDADE', 'VALOR_UNIT', 'CAIXA_SUGERIDA', 'STATUS_CONFERENCIA'],
  INVENTARIO: ['MODELO', 'SERIAL / IMEI', 'EAN', 'QTDE', 'DATA', 'QTD/DIA', 'CAIXA', 'NFE', 'LINK FOTO', 'ESTADO_FISICO'],
  LOTES: ['LOTE_ID', 'DEVICE_ID', 'DATA', 'CAIXA', 'STATUS', 'QR_CODE', 'CRIADO_EM', 'FINALIZADO_EM'],
  FOTOS: ['PHOTO_ID', 'LOTE_ID', 'CAIXA', 'NOME', 'FILE_ID', 'URL', 'STATUS', 'PRODUCT_ID', 'CRIADO_EM'],
  PRODUTOS: ['PRODUCT_ID', 'LOTE_PRIMEIRO', 'DEVICE_ID', 'MODELO', 'MARCA', 'SERIAL', 'IMEI', 'EAN', 'QTDE', 'DATA', 'QTD_DIA', 'CAIXA', 'NFE', 'STATUS', 'ESTADO_FISICO', 'DESCRICAO_AVARIA', 'CATEGORIA', 'CONFIANCAS_JSON', 'EVIDENCIAS_JSON', 'PHOTO_IDS_JSON', 'ATUALIZADO_EM'],
  HISTORICO: ['TIMESTAMP', 'TIPO', 'DEVICE_ID', 'LOTE_ID', 'PRODUCT_ID', 'PHOTO_IDS', 'DETALHES_JSON'],
  JOBS: ['JOB_ID', 'LOTE_ID', 'STATUS', 'TENTATIVAS', 'PROXIMA_TENTATIVA', 'ULTIMO_ERRO', 'CRIADO_EM', 'ATUALIZADO_EM']
};

// =========================================================================
// 1. PONTOS DE ENTRADA (WEB APP E MENU DA PLANILHA)
// =========================================================================

function doGet(e) {
  garantirEstrutura_();
  const t = HtmlService.createTemplateFromFile('Index');
  t.produtoInicial = e && e.parameter ? (e.parameter.produto || '') : '';
  return t.evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('📦 ScanLote AI')
      .addItem('🚀 Abrir Painel de Captura (Sidebar)', 'abrirSidebar')
      .addItem('🌐 Abrir Sistema Web (Janela)', 'abrirWebDialog')
      .addSeparator()
      .addItem('🔒 Iniciar Novo Lote (Congelar Próxima Caixa)', 'menuNovoLote')
      .addItem('🔑 Configurar Chave Gemini API', 'menuConfigurarApiKey')
      .addItem('⚡ Executar Fila de IA Agora', 'processarFila')
      .addItem('📊 Formatar Cabeçalhos (Colunas A-I)', 'formatarCabecalhos')
      .addItem('🔄 Re-sincronizar Banco para o Inventário', 'ressincronizarInventario')
      .addItem('🗑️ Resetar Tudo (Limpar Dados para Novos Testes)', 'resetarTodosDadosParaTeste')
      .addItem('🧹 Limpar Órfãos Validados', 'limparOrfaosValidados')
      .addToUi();
  } catch (err) {}
}

function abrirSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.APP_NAME)
    .setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}

function abrirWebDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(1100)
    .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, CONFIG.APP_NAME);
}

function menuConfigurarApiKey() {
  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt(
    'Configurar Chave Gemini API',
    'Cole sua chave do Google AI Studio (GEMINI_API_KEY):',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() === ui.Button.OK) {
    const key = prompt.getResponseText().trim();
    if (key) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
      ui.alert('✅ Chave GEMINI_API_KEY salva com sucesso!');
    }
  }
}

// =========================================================================
// 2. COMUNICAÇÃO COM O FRONTEND (API DO CLIENTE)
// =========================================================================

function getAppState(deviceId, lotId) {
  deviceId = deviceId || 'DEV-A1';

  let lote = lotId ? obterLote_(lotId) : obterUltimoLoteDevice_(deviceId);
  if (!lote) {
    garantirEstrutura_();
    lote = criarNovoLote(deviceId);
  }

  // AUTO-RECUPERAÇÃO: Se a aba INVENTARIO estiver vazia mas existirem produtos no banco técnico, restaura na hora!
  try {
    const invSheet = getSheet_(CONFIG.SHEETS.INVENTARIO);
    if (invSheet.getLastRow() < 2) {
      const produtosTecnicos = lerProdutos_();
      if (produtosTecnicos.length > 0) {
        produtosTecnicos.forEach(p => inserirLinhaInventarioPrincipal_(p));
      }
    }
  } catch (e) {}

  const produtos = listarProdutosDoLote_(lote.id, deviceId);
  const fotos = listarFotosDoLote_(lote.id);
  const job = obterJobDoLote_(lote.id);

  const fotosProcessadas = fotos.filter(f => ['ASSOCIADA', 'PROCESSADA'].includes(f.status)).length;
  const fotosPendentes = fotos.filter(f => !['ASSOCIADA', 'PROCESSADA', 'ORPHAN'].includes(f.status)).length;
  const fotosErros = job && ['FAILED', 'ERRO_REPROCESSAVEL'].includes(job.status) ? 1 : 0;

  return {
    lote: lote,
    job: job,
    contadores: {
      fotosRecebidas: fotos.length,
      fotosProcessadas: fotosProcessadas,
      pendentes: fotosPendentes,
      erros: fotosErros
    },
    produtos: produtos,
    apiKeyConfigurada: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'),
    modeloIA: CONFIG.GEMINI_MODEL_PRIMARY
  };
}

function criarNovoLote(deviceId, caixaDesejada) {
  garantirEstrutura_();
  deviceId = deviceId || 'DEV-A1';

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const agora = new Date();
    const dataStr = formatDate_(agora);

    // SEQUÊNCIA GLOBAL DO DIA: Todos os dispositivos compartilham a numeração contínua (001, 002, 003...)
    const todosLotesHoje = lerLotes_().filter(l => l.data === dataStr);
    let maxSeq = 0;
    todosLotesHoje.forEach(l => {
      const parts = l.id.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    });
    const seqStr = Utilities.formatString('%03d', maxSeq + 1);
    const loteId = 'LOTE-' + dataStr + '-' + seqStr;

    // CAIXA GLOBAL: Nunca repete a mesma caixa entre estações diferentes
    const caixa = caixaDesejada ? Number(caixaDesejada) : proximaCaixa_();

    const sh = getSheet_(CONFIG.SHEETS.LOTES);
    sh.appendRow([loteId, deviceId, dataStr, caixa, 'RECEBIDO', agora, '']);
    
    PropertiesService.getScriptProperties().setProperty('FROZEN_BOX_' + loteId, String(caixa));

    criarPastaLote_(loteId);
    registrarHistorico_('LOTE_CRIADO', deviceId, loteId, '', [], { caixa: caixa, data: dataStr });

    return { id: loteId, deviceId: deviceId, data: dataStr, caixa: caixa, status: 'RECEBIDO' };
  } finally {
    lock.releaseLock();
  }
}

function uploadFotos(deviceId, loteId, arquivos) {
  garantirEstrutura_();
  if (!deviceId || !loteId) throw new Error('DEVICE_ID e LOTE_ID são obrigatórios.');
  if (!Array.isArray(arquivos) || !arquivos.length) throw new Error('Nenhuma foto enviada.');

  const lote = obterLote_(loteId);
  if (!lote) throw new Error('Lote ' + loteId + ' não encontrado.');
  if (lote.deviceId !== deviceId) throw new Error('Lote pertence a outra estação/dispositivo.');

  const folder = criarPastaLote_(loteId);
  const sh = getSheet_(CONFIG.SHEETS.FOTOS);
  const agora = new Date();
  const fotosCriadas = [];

  for (let i = 0; i < arquivos.length; i++) {
    const a = arquivos[i];
    let base64Data = a.base64;
    let mime = a.mimeType || 'image/jpeg';

    if (base64Data.indexOf(';base64,') > -1) {
      const parts = base64Data.split(';base64,');
      mime = parts[0].replace('data:', '');
      base64Data = parts[1];
    }

    const bytes = Utilities.base64Decode(base64Data);
    const nomeSeguro = sanitizarNome_(a.name || ('foto_' + Date.now() + '_' + (i + 1) + '.jpg'));
    const blob = Utilities.newBlob(bytes, mime, nomeSeguro);
    const file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}

    const photoId = gerarId_('PHOTO');
    sh.appendRow([photoId, loteId, nomeSeguro, file.getId(), file.getUrl(), 'PENDENTE', '', agora]);
    fotosCriadas.push({ photoId: photoId, nome: nomeSeguro, fileId: file.getId(), url: file.getUrl() });
  }

  atualizarStatusLote_(loteId, 'PROCESSANDO');
  let processouImediato = false;
  let msgResultado = '';

  try {
    // Tenta processamento DIRETO E IMEDIATO (super rápido com Gemini Flash)
    executarProcessamentoDoLote_(loteId);
    atualizarStatusLote_(loteId, 'FINALIZADO');
    processouImediato = true;
    msgResultado = '✅ ' + fotosCriadas.length + ' foto(s) analisada(s) com sucesso pelo Gemini Flash! Linhas criadas na Planilha.';
  } catch (err) {
    Logger.log('Processamento imediato falhou, enviando para contingência: ' + err);
    enfileirarLote_(loteId, true);
    msgResultado = '⏳ Fotos salvas no Drive. A IA está processando em segundo plano...';
  }

  return {
    ok: true,
    total: fotosCriadas.length,
    imediato: processouImediato,
    mensagem: msgResultado
  };
}

function atualizarNfe(productId, nfe) {
  const produto = obterProduto_(productId);
  if (!produto) throw new Error('Produto não encontrado.');

  const nfeLimpo = String(nfe || '').trim();
  const sh = getSheet_(CONFIG.SHEETS.PRODUTOS);
  sh.getRange(produto.row, 13).setValue(nfeLimpo);

  const invRow = localizarInventarioPorProductId_(productId);
  if (invRow) {
    getSheet_(CONFIG.SHEETS.INVENTARIO).getRange(invRow, 8).setValue(nfeLimpo);
  }

  registrarHistorico_('NFE_ATUALIZADA', produto.deviceId, produto.lotePrimeiro, productId, [], { nfe: nfeLimpo });
  return { ok: true, nfe: nfeLimpo };
}

function reprocessarLote(loteId) {
  const job = obterJobDoLote_(loteId);
  if (!job) {
    criarJob_(loteId);
  } else {
    marcarJob_(job.row, 'PENDING', 0, '', new Date());
  }
  agendarProcessamento_(1000);
  return { ok: true, mensagem: 'Lote ' + loteId + ' reenfileirado para análise da IA.' };
}

// =========================================================================
// 3. MOTOR DA IA (EXCLUSIVO: GEMINI 3.5 FLASH LITE)
// =========================================================================

function chamarGeminiFlashLite(fotos) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Chave GEMINI_API_KEY não configurada no Script Properties. Acesse o menu ScanLote AI -> Configurar Chave Gemini API.');
  }

  // Tenta prioritariamente gemini-3.5-flash-lite, com fallback para gemini-2.5-flash-lite se o alias ainda não estiver ativo na região
  const modelsToTry = [
    CONFIG.GEMINI_MODEL_PRIMARY,
    CONFIG.GEMINI_MODEL_FALLBACK,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];
  let lastError = null;

  for (let m = 0; m < modelsToTry.length; m++) {
    const model = modelsToTry[m];
    try {
      return executarChamadaGemini_(fotos, model, apiKey);
    } catch (err) {
      lastError = err;
      const msg = String(err.message || err);
      // Se for erro de modelo inexistente (404), tenta o próximo
      if (msg.indexOf('404') > -1 || msg.indexOf('not found') > -1) {
        Logger.log('Modelo ' + model + ' indisponível, tentando modelo compatível...');
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Falha ao comunicar com Gemini 3.5 Flash Lite.');
}

function executarChamadaGemini_(fotos, modelName, apiKey) {
  const parts = [];

  parts.push({
    text: [
      "VOCÊ É UM MOTOR INDUSTRIAL DE VISÃO COMPUTACIONAL E OCR DE ALTA PRECISÃO PARA RECEBIMENTO DE ESTOQUE.",
      "MODELO DESIGNADO: " + modelName,
      "TOTAL DE FOTOS RECEBIDAS: " + fotos.length,
      "",
      "INSTRUÇÕES OBRIGATÓRIAS (ANTI-ALUCINAÇÃO):",
      "1. Analise TODAS as imagens deste lote em conjunto.",
      "2. CRUZAMENTO DE FOTOS: Aparelho + Etiqueta de Serial + Caixa com código de barras pertencentes ao mesmo item DEVEM ser unificados em UM ÚNICO PRODUTO.",
      "3. EXTRAÇÃO DE DADOS:",
      "   - 'modelo': Modelo COMPLETO incluindo Marca, Família, Variante e Capacidade (ex: 'Samsung Galaxy S24 Ultra 256GB Titânio', 'Apple iPhone 15 Pro 128GB').",
      "   - 'marca': Fabricante.",
      "   - 'serial': Número de Série se explicitamente legível.",
      "   - 'imei': IMEI legível (geralmente 15 dígitos).",
      "   - 'ean': Código de barras EAN-13 ou UPC legível. REGRA DE OURO: NÃO INVENTE EAN! Se duvidoso ou não visível, deixe vazio \"\".",
      "4. QUANTIDADE: QTDE deve ser SEMPRE 1 por produto físico identificado (não multiplique pela quantidade de fotografias).",
      "5. Retorne EXCLUSIVAMENTE um JSON válido com esta estrutura:",
      "{",
      "  \"produtos\": [",
      "    {",
      "      \"marca\": \"...\",",
      "      \"modelo\": \"...\",",
      "      \"serial\": \"...\",",
      "      \"imei\": \"...\",",
      "      \"ean\": \"...\",",
      "      \"qtde\": 1,",
      "      \"indicesFotos\": [1, 2],",
      "      \"confianca\": { \"modelo\": 0.95, \"serial\": 0.98, \"imei\": 0.99, \"ean\": 0.90 }",
      "    }",
      "  ],",
      "  \"indicesOrfaos\": []",
      "}"
    ].join("\n")
  });

  fotos.forEach((foto, idx) => {
    const file = DriveApp.getFileById(foto.fileId);
    const blob = file.getBlob();
    parts.push({
      text: "--- FOTO ÍNDICE " + (idx + 1) + " (Nome: " + foto.nome + ") ---"
    });
    parts.push({
      inlineData: {
        mimeType: blob.getContentType() || 'image/jpeg',
        data: Utilities.base64Encode(blob.getBytes())
      }
    });
  });

  const url = CONFIG.GEMINI_API_BASE + encodeURIComponent(modelName) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const payload = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      temperature: CONFIG.TEMPERATURE,
      maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json'
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Gemini API HTTP ' + code + ': ' + body.slice(0, 800));
  }

  const parsed = JSON.parse(body);
  const candidates = parsed.candidates || [];
  if (!candidates.length) throw new Error('Gemini não retornou candidatos.');
  const textParts = candidates[0].content && candidates[0].content.parts ? candidates[0].content.parts : [];
  const text = textParts.map(p => p.text || '').join('');

  return JSON.parse(limparJson_(text));
}

// =========================================================================
// 4. PROCESSADOR ASSÍNCRONO DA FILA (COM CONTROLE SEGURO DE TRIGGERS)
// =========================================================================

function processarFila() {
  garantirEstrutura_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: false, mensagem: 'Fila já em execução.' };

  try {
    limparJobsTravados_();
    const agora = new Date();
    const jobs = lerJobs_();
    const elegiveis = jobs
      .filter(j => ['PENDING', 'RETRY'].includes(j.status))
      .filter(j => !j.proxima || new Date(j.proxima) <= agora)
      .sort((a, b) => new Date(a.criado) - new Date(b.criado));

    if (!elegiveis.length) {
      limparTodosTriggersFila_();
      return { ok: true, processados: 0 };
    }

    const job = elegiveis[0];
    marcarJob_(job.row, 'PROCESSING', job.tentativas, '', new Date());
    atualizarStatusLote_(job.loteId, 'PROCESSANDO');

    try {
      executarProcessamentoDoLote_(job.loteId);
      marcarJob_(job.row, 'COMPLETED', job.tentativas, '', new Date());
      atualizarStatusLote_(job.loteId, 'FINALIZADO');
    } catch (err) {
      const tentativas = job.tentativas + 1;
      const msgErro = String(err && err.message ? err.message : err);
      if (tentativas < CONFIG.MAX_RETRIES) {
        const proxima = new Date(Date.now() + CONFIG.RETRY_BASE_MS * Math.pow(2, tentativas - 1));
        marcarJob_(job.row, 'RETRY', tentativas, msgErro, proxima);
        atualizarStatusLote_(job.loteId, 'PENDENTE');
      } else {
        marcarJob_(job.row, 'ERRO_REPROCESSAVEL', tentativas, msgErro, new Date());
        atualizarStatusLote_(job.loteId, 'ERRO');
      }
    }

    // Se houver mais jobs, agenda a próxima iteração com segurança
    const aindaRestam = lerJobs_().some(j => ['PENDING', 'RETRY'].includes(j.status));
    if (aindaRestam) {
      agendarProcessamento_(4000);
    } else {
      limparTodosTriggersFila_();
    }

    return { ok: true, processados: 1, loteId: job.loteId };
  } finally {
    lock.releaseLock();
  }
}

function executarProcessamentoDoLote_(loteId) {
  const lote = obterLote_(loteId);
  if (!lote) throw new Error('Lote ' + loteId + ' não encontrado.');

  const fotos = listarFotosDoLote_(loteId).filter(f => f.status !== 'ORPHAN');
  if (!fotos.length) return;

  // Chama Gemini 3.5 Flash Lite
  const iaRaw = chamarGeminiFlashLite(fotos);
  const resultado = normalizarResultadoIA_(iaRaw, fotos.length);

  const fotosAssociadasIds = new Set();

  resultado.produtos.forEach(prod => {
    // Mapeia índices (1-based) para photoIds reais
    const pIds = (prod.indicesFotos || []).map(idx => fotos[idx - 1] ? fotos[idx - 1].photoId : '').filter(Boolean);
    pIds.forEach(id => fotosAssociadasIds.add(id));

    // Upsert com deduplicação rigorosa
    const productId = upsertProdutoComDeduplicacao_(lote, prod, pIds);

    // Atualiza status das fotos
    fotos.forEach(f => {
      if (pIds.includes(f.photoId)) {
        atualizarFoto_(f.row, 'ASSOCIADA', productId);
      }
    });
  });

  // Fotos não associadas são preservadas para revisão (princípio: preservar primeiro, limpar depois)
  fotos.forEach(f => {
    if (!fotosAssociadasIds.has(f.photoId)) {
      atualizarFoto_(f.row, 'PENDENTE_REVISAO', '');
    }
  });

  registrarHistorico_('LOTE_PROCESSADO', lote.deviceId, loteId, '', Array.from(fotosAssociadasIds), {
    produtosIdentificados: resultado.produtos.length
  });
}

function normalizarResultadoIA_(raw, totalFotos) {
  const list = raw && Array.isArray(raw.produtos) ? raw.produtos : [];
  return {
    produtos: list.map(p => ({
      modelo: String(p.modelo || '').trim(),
      marca: String(p.marca || '').trim(),
      serial: String(p.serial || '').trim().replace(/\s+/g, '').toUpperCase(),
      imei: String(p.imei || '').trim().replace(/\D/g, ''),
      ean: String(p.ean || '').trim().replace(/\D/g, ''),
      qtde: 1, // Não multiplica por fotos!
      indicesFotos: Array.isArray(p.indicesFotos) ? p.indicesFotos.map(Number).filter(n => n >= 1 && n <= totalFotos) : [1],
      confianca: p.confianca || { modelo: 0.9, serial: 0.9, imei: 0.9, ean: 0.9 }
    })).filter(p => p.modelo || p.serial || p.imei || p.ean)
  };
}

// =========================================================================
// 5. DEDUPLICAÇÃO CONSERVADORA & PLANILHA PRINCIPAL (A–I)
// =========================================================================

function upsertProdutoComDeduplicacao_(lote, prod, photoIds) {
  const serialImei = prod.serial || prod.imei || 'NÃO IDENTIFICADO';
  const existente = encontrarProdutoDuplicado_(prod, lote.deviceId);

  if (existente) {
    // ATUALIZAÇÃO CONSERVADORA: Linha única preservada, nunca cria linha duplicada
    const fotosExistentes = new Set(parseJsonSeguro_(existente.photoIdsJson, []));
    photoIds.forEach(id => fotosExistentes.add(id));
    existente.photoIdsJson = JSON.stringify(Array.from(fotosExistentes));

    if (prod.ean && !existente.ean) existente.ean = prod.ean;
    if (prod.modelo && existente.modelo === 'Produto Não Identificado') existente.modelo = prod.modelo;

    salvarProdutoTecnico_(existente);
    atualizarLinhaInventarioPrincipal_(existente);

    registrarHistorico_('PRODUTO_ATUALIZADO', lote.deviceId, lote.id, existente.productId, photoIds, {
      motivo: 'Deduplicação: Produto já registrado com Serial/IMEI ' + serialImei
    });
    return existente.productId;
  }

  // NOVO PRODUTO
  const productId = gerarId_('PROD');
  const qtdDia = calcularQtdDia_(lote.data, lote.caixa, lote.deviceId) + 1;

  const novoProduto = {
    row: null,
    productId: productId,
    lotePrimeiro: lote.id,
    deviceId: lote.deviceId,
    modelo: prod.modelo || 'Produto Não Identificado',
    marca: prod.marca || '',
    serial: prod.serial || '',
    imei: prod.imei || '',
    serialImei: serialImei,
    ean: prod.ean || '',
    qtde: 1, // QTDE = 1 por produto!
    data: lote.data,
    qtdDia: qtdDia,
    caixa: lote.caixa, // Caixa congelada
    nfe: '',
    status: (prod.serial || prod.imei) ? 'VALIDADO' : 'IDENTIFICADO',
    confiancasJson: JSON.stringify(prod.confianca || {}),
    evidenciasJson: JSON.stringify([]),
    photoIdsJson: JSON.stringify(photoIds),
    atualizadoEm: new Date()
  };

  salvarProdutoTecnico_(novoProduto);
  inserirLinhaInventarioPrincipal_(novoProduto);

  registrarHistorico_('PRODUTO_REGISTRADO', lote.deviceId, lote.id, productId, photoIds, {
    modelo: novoProduto.modelo,
    serialImei: serialImei,
    caixa: novoProduto.caixa
  });

  return productId;
}

function encontrarProdutoDuplicado_(prod, deviceId) {
  const produtos = lerProdutos_();
  const serial = (prod.serial || '').toUpperCase().trim();
  const imei = (prod.imei || '').trim();

  // 1. Prioridade máxima: SERIAL
  if (serial && serial.length >= 4) {
    const hit = produtos.find(p => p.deviceId === deviceId && (p.serial.toUpperCase() === serial || p.serialImei.toUpperCase().indexOf(serial) > -1));
    if (hit) return hit;
  }

  // 2. Prioridade: IMEI
  if (imei && imei.length >= 6) {
    const hit = produtos.find(p => p.deviceId === deviceId && (p.imei === imei || p.serialImei.indexOf(imei) > -1));
    if (hit) return hit;
  }

  // 3. EAN + Modelo
  if (prod.ean && prod.modelo && prod.ean.length >= 8) {
    const hit = produtos.find(p => p.deviceId === deviceId && p.ean === prod.ean && p.modelo.toLowerCase().trim() === prod.modelo.toLowerCase().trim());
    if (hit) return hit;
  }

  return null;
}

function inserirLinhaInventarioPrincipal_(p) {
  const sh = getSheet_(CONFIG.SHEETS.INVENTARIO);
  const linkFormula = criarFormulaLinkFoto_(p);
  const serialImei = [p.serial, p.imei].filter(Boolean).join(' / ') || p.serialImei;

  const linha = [
    p.modelo,     // A: MODELO
    serialImei,   // B: SERIAL / IMEI
    p.ean,        // C: EAN
    p.qtde,       // D: QTDE (1)
    p.data,       // E: DATA
    p.qtdDia,     // F: QTD/DIA
    p.caixa,      // G: CAIXA (Congelada)
    p.nfe || '',  // H: NFE
    linkFormula   // I: LINK FOTO
  ];

  sh.appendRow(linha);
  const lastRow = sh.getLastRow();
  formatarLinhaEstilo_(sh, lastRow);
}

function atualizarLinhaInventarioPrincipal_(p) {
  const sh = getSheet_(CONFIG.SHEETS.INVENTARIO);
  const row = localizarLinhaInventario_(p.productId, p.serialImei);
  if (!row) {
    // Se a linha não existe no INVENTARIO (ex: usuário limpou para testar), insere imediatamente!
    inserirLinhaInventarioPrincipal_(p);
    return;
  }

  const linkFormula = criarFormulaLinkFoto_(p);
  if (p.ean) sh.getRange(row, 3).setValue(p.ean);
  if (p.nfe) sh.getRange(row, 8).setValue(p.nfe);
  sh.getRange(row, 9).setFormula(linkFormula);
}

function criarFormulaLinkFoto_(produto) {
  const photoIds = parseJsonSeguro_(produto.photoIdsJson, []);
  if (!photoIds.length) return 'LINK';

  const foto = obterFoto_(photoIds[0]);
  if (foto && foto.url) {
    return '=HYPERLINK("' + foto.url.replace(/"/g, '""') + '"; "LINK")';
  }
  return 'LINK';
}

function formatarCabecalhos() {
  const ss = getSpreadsheet_();

  // 1. Formatar Aba Principal: RESUMO_CAIXAS (Cabeçalho Azul Escuro #1F4E79, Sem Linhas de Grade)
  const resumoSheet = ss.getSheetByName(CONFIG.SHEETS.RESUMO_CAIXAS);
  if (resumoSheet) {
    resumoSheet.setHiddenGridlines(true); // Ocultar linhas de grade conforme especificação #6
    resumoSheet.getRange(1, 1, 1, HEADERS.RESUMO_CAIXAS.length).setValues([HEADERS.RESUMO_CAIXAS]);
    
    const headerRange = resumoSheet.getRange(1, 1, 1, HEADERS.RESUMO_CAIXAS.length);
    headerRange.setBackground('#1F4E79') // Azul escuro #1F4E79
               .setFontColor('#ffffff')
               .setFontFamily('Arial')
               .setFontWeight('bold')
               .setFontSize(10)
               .setHorizontalAlignment('center');

    resumoSheet.setColumnWidth(1, 90);   // A: CAIXA
    resumoSheet.setColumnWidth(2, 120);  // B: DATA_CRIACAO
    resumoSheet.setColumnWidth(3, 160);  // C: LOTE_ID
    resumoSheet.setColumnWidth(4, 110);  // D: QTD_LIDA
    resumoSheet.setColumnWidth(5, 130);  // E: QTD_MANIFESTO
    resumoSheet.setColumnWidth(6, 140);  // F: STATUS
    resumoSheet.setColumnWidth(7, 200);  // G: DIVERGENCIA_AUDITORIA
    resumoSheet.setColumnWidth(8, 140);  // H: REVISAO_MANUAL
    resumoSheet.setColumnWidth(9, 150);  // I: AVARIAS_DETECTADAS
    resumoSheet.setColumnWidth(10, 160); // J: OPERADOR_RESPONSAVEL
  }

  // 2. Formatar Aba MANIFESTO
  const manifestoSheet = ss.getSheetByName(CONFIG.SHEETS.MANIFESTO);
  if (manifestoSheet) {
    manifestoSheet.getRange(1, 1, 1, HEADERS.MANIFESTO.length).setValues([HEADERS.MANIFESTO]);
    manifestoSheet.getRange(1, 1, 1, HEADERS.MANIFESTO.length)
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }

  // 3. Formatar Aba INVENTARIO
  const invSheet = ss.getSheetByName(CONFIG.SHEETS.INVENTARIO);
  if (invSheet) {
    invSheet.getRange(1, 1, 1, HEADERS.INVENTARIO.length).setValues([HEADERS.INVENTARIO]);
    invSheet.getRange(1, 1, 1, HEADERS.INVENTARIO.length)
      .setBackground('#09090b')
      .setFontColor('#ffffff')
      .setFontFamily('Consolas')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }

  // 4. Ocultar Abas Técnicas (HISTORICO e JOBS) conforme especificação #6
  try {
    const histSheet = ss.getSheetByName(CONFIG.SHEETS.HISTORICO);
    if (histSheet) histSheet.hideSheet();
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    if (jobsSheet) jobsSheet.hideSheet();
  } catch (e) {}
}

function formatarLinhaEstilo_(sh, row) {
  sh.getRange(row, 1, 1, 9).setFontFamily('Consolas').setFontSize(10);
  sh.getRange(row, 4, 1, 4).setHorizontalAlignment('center'); // QTDE, DATA, QTD/DIA, CAIXA
  sh.getRange(row, 9).setHorizontalAlignment('center');       // LINK FOTO
}

// =========================================================================
// 6. GESTÃO SEGURA DE TRIGGERS E AGENDAMENTO (EVITA O LIMITE DE 20 TRIGGERS)
// =========================================================================

function enfileirarLote_(loteId, imediato) {
  const job = obterJobDoLote_(loteId);
  if (!job) {
    criarJob_(loteId);
  } else if (job.status === 'COMPLETED') {
    marcarJob_(job.row, 'PENDING', 0, '', new Date());
  }
  agendarProcessamento_(imediato ? 2000 : 5000);
}

function criarJob_(loteId) {
  const sh = getSheet_(CONFIG.SHEETS.JOBS);
  const agora = new Date();
  sh.appendRow([gerarId_('JOB'), loteId, 'PENDING', 0, agora, '', agora, agora]);
}

function agendarProcessamento_(ms) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;

  try {
    limparTodosTriggersFila_();
    ScriptApp.newTrigger('processarFila')
      .timeBased()
      .after(Math.max(1000, ms))
      .create();
  } finally {
    lock.releaseLock();
  }
}

function limparTodosTriggersFila_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'processarFila') {
      try {
        ScriptApp.deleteTrigger(t);
      } catch (e) {}
    }
  });
}

function limparJobsTravados_() {
  const jobs = lerJobs_();
  const agora = Date.now();
  jobs.forEach(j => {
    if (j.status === 'PROCESSING' && j.atualizado && (agora - new Date(j.atualizado).getTime()) > CONFIG.JOB_STALE_MS) {
      marcarJob_(j.row, 'RETRY', j.tentativas, 'Recuperado após tempo limite excedido.', new Date());
    }
  });
}

function marcarJob_(row, status, tentativas, erro, proxima) {
  const sh = getSheet_(CONFIG.SHEETS.JOBS);
  const agora = new Date();
  sh.getRange(row, 3, 1, 6).setValues([[status, tentativas || 0, proxima || '', erro || '', agora, agora]]);
}

// =========================================================================
// 7. ARMAZENAMENTO E UTILITÁRIOS
// =========================================================================

function garantirEstrutura_() {
  const ss = getSpreadsheet_();
  let precisaFormatar = false;
  Object.keys(CONFIG.SHEETS).forEach(key => {
    const name = CONFIG.SHEETS[key];
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      precisaFormatar = true;
    }
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[key].length).setValues([HEADERS[key]]);
      precisaFormatar = true;
    }
    sh.setFrozenRows(1);
  });
  if (precisaFormatar) {
    formatarCabecalhos();
  }
  return ss;
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }
  const ss = SpreadsheetApp.create(CONFIG.APP_NAME);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
}

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  const folders = DriveApp.getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function criarPastaLote_(loteId) {
  const root = getRootFolder_();
  const nome = 'LOTE_' + sanitizarNome_(loteId);
  const folders = root.getFoldersByName(nome);
  return folders.hasNext() ? folders.next() : root.createFolder(nome);
}

function lerLotes_() {
  const rows = getSheet_(CONFIG.SHEETS.LOTES).getDataRange().getValues();
  return rows.slice(1).map((r, i) => ({
    row: i + 2, id: String(r[0]), deviceId: String(r[1]), data: String(r[2]),
    caixa: Number(r[3]), status: String(r[4]), criado: r[5], finalizado: r[6]
  })).filter(x => x.id);
}

function lerProdutos_() {
  const rows = getSheet_(CONFIG.SHEETS.PRODUTOS).getDataRange().getValues();
  return rows.slice(1).map((r, i) => ({
    row: i + 2, productId: String(r[0]), lotePrimeiro: String(r[1]), deviceId: String(r[2]),
    modelo: String(r[3]), marca: String(r[4]), serial: String(r[5]), imei: String(r[6]),
    ean: String(r[7]), qtde: Number(r[8]) || 1, data: String(r[9]), qtdDia: Number(r[10]) || 0,
    caixa: Number(r[11]) || 0, nfe: String(r[12]), status: String(r[13]),
    confiancasJson: String(r[14] || '{}'), evidenciasJson: String(r[15] || '[]'),
    photoIdsJson: String(r[16] || '[]'), atualizadoEm: r[17],
    serialImei: [String(r[5]), String(r[6])].filter(Boolean).join(' / ') || 'NÃO IDENTIFICADO'
  })).filter(x => x.productId);
}

function lerFotos_() {
  const rows = getSheet_(CONFIG.SHEETS.FOTOS).getDataRange().getValues();
  return rows.slice(1).map((r, i) => ({
    row: i + 2, photoId: String(r[0]), loteId: String(r[1]), nome: String(r[2]),
    fileId: String(r[3]), url: String(r[4]), status: String(r[5]), productId: String(r[6]), criado: r[7]
  })).filter(x => x.photoId);
}

function lerJobs_() {
  const rows = getSheet_(CONFIG.SHEETS.JOBS).getDataRange().getValues();
  return rows.slice(1).map((r, i) => ({
    row: i + 2, jobId: String(r[0]), loteId: String(r[1]), status: String(r[2]),
    tentativas: Number(r[3]) || 0, proxima: r[4], erro: String(r[5]), criado: r[6], atualizado: r[7]
  })).filter(x => x.jobId);
}

function obterLote_(id) { return lerLotes_().find(x => x.id === id) || null; }
function obterProduto_(id) { return lerProdutos_().find(x => x.productId === id) || null; }
function obterFoto_(id) { return lerFotos_().find(x => x.photoId === id) || null; }
function obterJobDoLote_(loteId) { return lerJobs_().filter(j => j.loteId === loteId).pop() || null; }

function obterUltimoLoteDevice_(deviceId) {
  return lerLotes_().filter(x => x.deviceId === deviceId).pop() || null;
}

function listarFotosDoLote_(loteId) { return lerFotos_().filter(x => x.loteId === loteId); }

function listarProdutosDoLote_(loteId, deviceId) {
  const fotos = listarFotosDoLote_(loteId);
  const photoIdSet = new Set(fotos.map(f => f.photoId));
  return lerProdutos_().filter(p => {
    if (loteId && p.lotePrimeiro === loteId) return true;
    const ids = parseJsonSeguro_(p.photoIdsJson, []);
    if (ids.some(id => photoIdSet.has(id))) return true;
    if (deviceId && p.deviceId === deviceId) return true;
    return false;
  });
}

function proximaCaixa_() {
  const lotes = lerLotes_();
  if (!lotes.length) return 1;
  const max = lotes.reduce((m, l) => Math.max(m, Number(l.caixa) || 0), 0);
  return max + 1;
}

function calcularQtdDia_(dataStr, caixa, deviceId) {
  const produtos = lerProdutos_();
  return produtos.filter(p => p.deviceId === deviceId && p.data === dataStr && Number(p.caixa) === Number(caixa)).length;
}

function salvarProdutoTecnico_(p) {
  const sh = getSheet_(CONFIG.SHEETS.PRODUTOS);
  const valores = [
    p.productId, p.lotePrimeiro, p.deviceId, p.modelo, p.marca, p.serial, p.imei, p.ean,
    p.qtde, p.data, p.qtdDia, p.caixa, p.nfe, p.status, p.confiancasJson, p.evidenciasJson, p.photoIdsJson, new Date()
  ];
  if (!p.row) {
    sh.appendRow(valores);
    p.row = sh.getLastRow();
  } else {
    sh.getRange(p.row, 1, 1, valores.length).setValues([valores]);
  }
}

function atualizarStatusLote_(loteId, status) {
  const lote = obterLote_(loteId);
  if (!lote) return;
  const sh = getSheet_(CONFIG.SHEETS.LOTES);
  sh.getRange(lote.row, 5).setValue(status);
  if (status === 'FINALIZADO') sh.getRange(lote.row, 7).setValue(new Date());
}

function atualizarFoto_(row, status, productId) {
  const sh = getSheet_(CONFIG.SHEETS.FOTOS);
  sh.getRange(row, 6).setValue(status);
  sh.getRange(row, 7).setValue(productId || '');
}

function localizarLinhaInventario_(productId, serialImei) {
  const sh = getSheet_(CONFIG.SHEETS.INVENTARIO);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  const vals = sh.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const val = String(vals[i][0]);
    if (val && serialImei && (val === serialImei || val.indexOf(serialImei) > -1)) {
      return i + 2;
    }
  }
  return null;
}

function registrarHistorico_(tipo, deviceId, loteId, productId, photoIds, detalhes) {
  try {
    getSheet_(CONFIG.SHEETS.HISTORICO).appendRow([
      new Date(), tipo, deviceId || '', loteId || '', productId || '', (photoIds || []).join(','), JSON.stringify(detalhes || {})
    ]);
  } catch (e) {}
}

function limparOrfaosValidados() {
  const sh = getSheet_(CONFIG.SHEETS.FOTOS);
  const rows = sh.getDataRange().getValues();
  let removidos = 0;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][5]) === 'ORPHAN') {
      try {
        if (rows[i][3]) DriveApp.getFileById(rows[i][3]).setTrashed(true);
      } catch (e) {}
      sh.deleteRow(i + 1);
      removidos++;
    }
  }
  return { ok: true, removidos: removidos };
}

function gerarId_(prefixo) {
  return prefixo + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}
function sanitizarNome_(nome) { return String(nome).replace(/[\\/:*?"<>|#%{}~&]/g, '_').slice(0, 100); }
function formatDate_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyy-MM-dd'); }
function parseJsonSeguro_(v, fallback) { try { return JSON.parse(v); } catch (e) { return fallback; } }
function limparJson_(s) { return String(s).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim(); }
function getSpreadsheetUrl() { return getSpreadsheet_().getUrl(); }
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    return '';
  }
}

function ressincronizarInventario() {
  const produtos = lerProdutos_();
  let inseridos = 0;
  produtos.forEach(p => {
    const row = localizarLinhaInventario_(p.productId, p.serialImei);
    if (!row) {
      inserirLinhaInventarioPrincipal_(p);
      inseridos++;
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ ' + inseridos + ' produto(s) recuperado(s) para o Inventário!', 'Sucesso', 4);
  return { ok: true, inseridos: inseridos };
}

function resetarTodosDadosParaTeste() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('Resetar Tudo', 'ATENÇÃO: Isso limpará os dados de teste das abas INVENTARIO, LOTES, FOTOS, PRODUTOS, HISTORICO e JOBS para você começar do zero. Confirmar?', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  const ss = getSpreadsheet_();
  ['INVENTARIO', 'LOTES', 'FOTOS', 'PRODUTOS', 'HISTORICO', 'JOBS'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    }
  });
  formatarCabecalhos();
  ui.alert('✅ Dados zerados com sucesso! Você pode realizar novos testes limpos.');
}
