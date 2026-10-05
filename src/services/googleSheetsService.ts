import { ProductItem, Batch, ResumoCaixa, ManifestoDoc, ManifestoItem, AuditLog, StoredPhoto } from "../types";

export interface SheetMetadata {
  id: string;
  title: string;
  sheets: { id: number; title: string }[];
  spreadsheetUrl: string;
}

export class GoogleSheetsService {
  /**
   * Obtém detalhes e abas da planilha
   */
  static async getSpreadsheetInfo(
    accessToken: string,
    spreadsheetId: string
  ): Promise<SheetMetadata> {
    if (!accessToken || accessToken.startsWith("mock-")) {
      return {
        id: spreadsheetId,
        title: "Planilha Local (Mock)",
        sheets: [
          { id: 0, title: "RESUMO_CAIXAS" },
          { id: 1, title: "MANIFESTO" },
          { id: 2, title: "INVENTARIO" },
          { id: 3, title: "LOTES" },
        ],
        spreadsheetUrl: "#",
      };
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Não foi possível carregar a planilha");
    }

    const data = await res.json();
    return {
      id: data.spreadsheetId,
      title: data.properties.title,
      sheets: (data.sheets || []).map((s: any) => ({
        id: s.properties.sheetId,
        title: s.properties.title,
      })),
      spreadsheetUrl: data.spreadsheetUrl,
    };
  }

  /**
   * Valida se a planilha existe e se a aplicação tem permissão de acesso
   */
  static async validateSpreadsheetAccess(
    accessToken: string,
    spreadsheetId: string
  ): Promise<{ isValid: boolean; meta?: SheetMetadata; error?: string }> {
    if (!spreadsheetId || !accessToken) {
      return { isValid: false, error: "Planilha não informada ou acesso expirado." };
    }
    try {
      const meta = await this.getSpreadsheetInfo(accessToken, spreadsheetId);
      return { isValid: true, meta };
    } catch (err: any) {
      return { isValid: false, error: err.message || "Sem permissão ou planilha inexistente." };
    }
  }

  /**
   * Cria uma nova planilha no Google Sheets com:
   * 1. 'RESUMO_CAIXAS' (Dashboard com cabeçalho azul escuro #1F4E79, sem linhas de grade, formatação condicional)
   * 2. 'MANIFESTO' (Itens da NF importada)
   * 3. 'INVENTARIO' (Colunas A-I)
   * 4. 'LOTES', 'PRODUTOS'
   * 5. Oculta abas técnicas 'HISTORICO' e 'JOBS'
   */
  static async createInventorySpreadsheet(
    accessToken: string,
    title: string = "ScanLote AI - Gestão de Caixas e Inventário",
    parentFolderId?: string
  ): Promise<SheetMetadata> {
    const payload = {
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: "RESUMO_CAIXAS",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: "MANIFESTO",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: "INVENTARIO",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: "LOTES",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: "FOTOS",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: "HISTORICO",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    };

    const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Erro ao criar planilha no Google Sheets");
    }

    const created = await res.json();
    const spreadsheetId = created.spreadsheetId;
    const resumoSheetId = created.sheets[0].properties.sheetId;

    // Se houver pasta do Drive, move a planilha para a pasta
    if (parentFolderId) {
      try {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (e) {
        console.warn("Não foi possível mover planilha para a pasta do Drive:", e);
      }
    }

    // Cabeçalhos especificados no prompt:
    // [A: CAIXA] | [B: DATA_CRIACAO] | [C: LOTE_ID] | [D: QTD_LIDA] | [E: QTD_MANIFESTO] | [F: STATUS] | [G: DIVERGENCIA_AUDITORIA] | [H: REVISAO_MANUAL] | [I: AVARIAS_DETECTADAS] | [J: OPERADOR_RESPONSAVEL]
    const headersResumo = [
      "CAIXA",
      "DATA_CRIACAO",
      "LOTE_ID",
      "QTD_LIDA",
      "QTD_MANIFESTO",
      "STATUS",
      "DIVERGENCIA_AUDITORIA",
      "OPERADOR_RESPONSAVEL",
    ];

    const headersManifesto = [
      "NFE",
      "FORNECEDOR",
      "DATA_EMISSAO",
      "CODIGO_ITEM",
      "DESCRICAO",
      "EAN",
      "QUANTIDADE",
      "CAIXA_SUGERIDA",
    ];

    const headersInventario = [
      "MODELO",
      "SERIAL / IMEI",
      "EAN",
      "QTDE",
      "DATA",
      "QTD/CAIXA",
      "CAIXA",
      "NFE",
      "LINK FOTO",
      "_PRODUCT_ID",
      "_LOTE_ID",
      "_BOX_ID",
      "_VERSION",
      "_UPDATED_AT",
      "_CONTENT_HASH",
    ];

    const headersLotes = [
      "LOTE_ID",
      "OPERADOR",
      "DATA",
      "HORA",
      "CAIXA",
      "QTD_ITENS",
      "QR_CODE",
    ];

    const headersFotos = [
      "FOTO_ID",
      "FILENAME",
      "ORIGINAL_NAME",
      "MIME_TYPE",
      "SIZE",
      "URL",
      "LOTE_ID",
      "DEVICE_ID",
      "CAIXA",
      "ASSOCIATED_PRODUCT_ID",
      "UPLOADED_AT",
      "STATUS",
      "DRIVE_URL",
    ];

    const headersHistorico = [
      "LOG_ID",
      "TIMESTAMP",
      "DEVICE_ID",
      "LOTE_ID",
      "TIPO",
      "DETALHES",
      "PRODUCT_ID",
      "PHOTO_ID",
    ];

    // Inserir valores dos cabeçalhos em batch
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: [
            { range: "RESUMO_CAIXAS!A1:H1", values: [headersResumo] },
            { range: "MANIFESTO!A1:H1", values: [headersManifesto] },
            { range: "INVENTARIO!A1:O1", values: [headersInventario] },
            { range: "LOTES!A1:G1", values: [headersLotes] },
            { range: "FOTOS!A1:M1", values: [headersFotos] },
            { range: "HISTORICO!A1:H1", values: [headersHistorico] },
          ],
        }),
      }
    );

    // Formatação visual profissional:
    // Cabeçalhos de TODAS as abas com fundo PRETO, texto em negrito na cor BRANCA, centralizado
    try {
      const formatRequests: any[] = [];
      const sheetsList = created.sheets || [];

      for (const sh of sheetsList) {
        const sId = sh.properties.sheetId;
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: sId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0, green: 0, blue: 0 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 10,
                  fontFamily: "Arial",
                },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
          },
        });
      }

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requests: formatRequests }),
        }
      );
    } catch (e) {
      console.warn("Erro ao estilizar cabeçalhos em preto:", e);
    }

    return {
      id: spreadsheetId,
      title,
      sheets: (created.sheets || []).map((s: any) => ({
        id: s.properties.sheetId,
        title: s.properties.title,
      })),
      spreadsheetUrl: created.spreadsheetUrl,
    };
  }

  /**
   * Sincroniza o Dashboard Principal 'RESUMO_CAIXAS'
   */
  static async syncResumoCaixas(
    accessToken: string,
    spreadsheetId: string,
    resumos: ResumoCaixa[]
  ): Promise<void> {
    if (!resumos || resumos.length === 0) return;

    const rows = resumos.map((r) => [
      r.caixa,
      r.dataCriacao,
      r.loteId,
      r.qtdLida,
      r.qtdManifesto,
      r.status,
      r.divergenciaAuditoria,
      r.revisaoManual,
      r.avariasDetectadas,
      r.operadorResponsavel,
    ]);

    // Atualiza da linha 2 em diante
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/RESUMO_CAIXAS!A2:J${rows.length + 1}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: rows }),
      }
    );
  }

  /**
   * Sincroniza a aba 'MANIFESTO' com os dados extraídos de NF-e / Manifesto em PDF
   */
  static async syncManifestos(
    accessToken: string,
    spreadsheetId: string,
    manifestos: ManifestoDoc[]
  ): Promise<void> {
    if (!manifestos || manifestos.length === 0) return;

    const rows: any[][] = [];
    manifestos.forEach((m) => {
      m.itens.forEach((item) => {
        rows.push([
          item.nfe,
          item.fornecedor,
          item.dataEmissao,
          item.codigoItem || "",
          item.descricao,
          item.ean || "",
          item.quantidade,
          item.valorUnitario || 0,
          item.caixaSugerida || 1,
          item.status,
        ]);
      });
    });

    if (rows.length === 0) return;

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/MANIFESTO!A2:J${rows.length + 1}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: rows }),
      }
    );
  }

  /**
   * Sincroniza produtos do aplicativo com o Google Sheets na aba INVENTARIO
   */
  static async syncProducts(
    accessToken: string,
    spreadsheetId: string,
    products: ProductItem[],
    driveLinksByPhotoId: Record<string, string> = {},
    sheetName: string = "INVENTARIO"
  ): Promise<{ added: number; updated: number; total: number }> {
    let targetSheet = sheetName;

    // Assegura que a aba existe na planilha conectada
    try {
      const info = await this.getSpreadsheetInfo(accessToken, spreadsheetId);
      const hasSheet = info.sheets.some((s) => s.title === sheetName);
      if (!hasSheet) {
        try {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requests: [{ addSheet: { properties: { title: sheetName } } }],
            }),
          });
          const headersInventario = [
            "MODELO",
            "SERIAL / IMEI",
            "EAN",
            "QTDE",
            "DATA",
            "QTD/CAIXA",
            "CAIXA",
            "NFE",
            "LINK FOTO",
            "_PRODUCT_ID",
            "_LOTE_ID",
            "_BOX_ID",
            "_VERSION",
            "_UPDATED_AT",
            "_CONTENT_HASH",
          ];
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:O1?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: [headersInventario] }),
            }
          );
        } catch {
          if (info.sheets.length > 0) {
            targetSheet = info.sheets[0].title;
          }
        }
      }
    } catch {}

    // Lê linhas existentes (Colunas A a O)
    let existingRows: string[][] = [];
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        targetSheet
      )}!A2:O`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const d = await res.json();
        existingRows = d.values || [];
      }
    } catch {}

    const existingRowMap = new Map<string, number>();
    existingRows.forEach((row, idx) => {
      const productId = String(row[9] || "").trim(); // Coluna J: _PRODUCT_ID
      const serialImei = String(row[1] || "").trim().toUpperCase();
      if (productId) {
        existingRowMap.set(`ID:${productId}`, idx + 2);
      }
      if (serialImei && serialImei !== "NÃO IDENTIFICADO" && serialImei !== "SEM SERIAL") {
        existingRowMap.set(`SN:${serialImei}`, idx + 2);
      }
    });

    const updateRequests: { range: string; values: any[][] }[] = [];
    const rowsToAppend: any[][] = [];
    let addedCount = 0;
    let updatedCount = 0;

    for (const p of products) {
      const serialImeiNorm = (p.serialImei || p.serial || "").trim().toUpperCase();
      const existingRowNumber =
        (p.id && existingRowMap.get(`ID:${p.id}`)) ||
        (serialImeiNorm && existingRowMap.get(`SN:${serialImeiNorm}`));

      let rawUrl = "";
      if (p.photoIds && p.photoIds.length > 0) {
        for (const pid of p.photoIds) {
          if (driveLinksByPhotoId[pid]) {
            rawUrl = driveLinksByPhotoId[pid];
            break;
          }
        }
      }

      if (!rawUrl && p.linkFoto && p.linkFoto.startsWith("http")) {
        rawUrl = p.linkFoto;
      }

      // Sanitização estrita de fórmula para evitar #ERROR! no Google Sheets
      let photoLink = "SEM FOTO";
      if (rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
        const cleanUrl = rawUrl.replace(/"/g, '""').trim();
        photoLink = `=HYPERLINK("${cleanUrl}", "VER FOTO")`;
      } else if (p.photoIds && p.photoIds.length > 0) {
        photoLink = "FOTO LOCAL";
      }

      const qtdNaCaixa = products.filter((item) => item.caixa === p.caixa).reduce((sum, item) => sum + (item.qtde || 1), 0);
      const version = p.version || 1;
      const updatedAt = p.atualizadoEm || new Date().toISOString();
      const contentHash = p.contentHash || `${p.modelo}:${p.serialImei}:${p.ean}:${p.qtde}`;

      // 15 Colunas Oficiais A a O:
      // A: MODELO | B: SERIAL/IMEI | C: EAN | D: QTDE | E: DATA | F: QTD/CAIXA | G: CAIXA | H: NFE | I: LINK FOTO
      // J: _PRODUCT_ID | K: _LOTE_ID | L: _BOX_ID | M: _VERSION | N: _UPDATED_AT | O: _CONTENT_HASH
      const rowValues = [
        p.modelo,
        p.serialImei || p.serial || "",
        p.ean || "",
        p.qtde || 1,
        p.data,
        qtdNaCaixa,
        p.caixa,
        p.nfe || "",
        photoLink,
        p.id,
        p.loteId || "",
        p.caixa,
        version,
        updatedAt,
        contentHash,
      ];

      if (existingRowNumber) {
        updateRequests.push({
          range: `${targetSheet}!A${existingRowNumber}:O${existingRowNumber}`,
          values: [rowValues],
        });
        updatedCount++;
      } else {
        rowsToAppend.push(rowValues);
        addedCount++;
        if (p.id) {
          existingRowMap.set(`ID:${p.id}`, existingRows.length + rowsToAppend.length + 1);
        }
      }
    }

    if (updateRequests.length > 0) {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            valueInputOption: "USER_ENTERED",
            data: updateRequests,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || "Erro ao atualizar itens na planilha");
      }
    }

    if (rowsToAppend.length > 0) {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          targetSheet
        )}!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: rowsToAppend }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || "Erro ao gravar novos itens na planilha");
      }
    }

    return {
      added: addedCount,
      updated: updatedCount,
      total: products.length,
    };
  }

  /**
   * Sincronização completa de todas as camadas:
   * RESUMO_CAIXAS + MANIFESTO + INVENTARIO + LOTES + FOTOS + HISTORICO
   */
  static async syncAll(
    accessToken: string,
    spreadsheetId: string,
    data: {
      resumos: ResumoCaixa[];
      manifestos: ManifestoDoc[];
      products: ProductItem[];
      batches?: Batch[];
      photos?: StoredPhoto[];
      logs?: AuditLog[];
      drivePhotoMap?: Record<string, string>;
    }
  ): Promise<void> {
    await Promise.all([
      this.syncResumoCaixas(accessToken, spreadsheetId, data.resumos).catch(console.warn),
      this.syncManifestos(accessToken, spreadsheetId, data.manifestos).catch(console.warn),
      this.syncProducts(accessToken, spreadsheetId, data.products, data.drivePhotoMap || {}).catch(console.warn),
      data.batches ? this.syncLotes(accessToken, spreadsheetId, data.batches, data.products).catch(console.warn) : Promise.resolve(),
      data.photos ? this.syncPhotos(accessToken, spreadsheetId, data.photos).catch(console.warn) : Promise.resolve(),
      data.logs ? this.syncLogs(accessToken, spreadsheetId, data.logs).catch(console.warn) : Promise.resolve(),
    ]);
  }

  /**
   * Sincroniza aba FOTOS
   */
  static async syncPhotos(
    accessToken: string,
    spreadsheetId: string,
    photos: StoredPhoto[]
  ): Promise<void> {
    if (!photos || photos.length === 0) return;
    const rows = photos.map((p) => [
      p.id,
      p.filename,
      p.originalName,
      p.mimeType,
      p.size,
      p.url,
      p.loteId,
      p.deviceId || "Carlos Silveira",
      p.caixa || 1,
      p.associatedProductId || "",
      p.uploadedAt,
      p.status,
      p.driveUrl || "",
    ]);

    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'FOTOS'!A2:M${rows.length + 1}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: rows }),
        }
      );
    } catch (e) {
      console.warn("Erro ao sincronizar FOTOS:", e);
    }
  }

  /**
   * Sincroniza aba HISTORICO
   */
  static async syncLogs(
    accessToken: string,
    spreadsheetId: string,
    logs: AuditLog[]
  ): Promise<void> {
    if (!logs || logs.length === 0) return;
    const rows = logs.map((l) => [
      l.id,
      l.timestamp,
      l.deviceId,
      l.loteId,
      l.tipo,
      l.detalhes,
      l.productId || "",
      l.photoId || "",
    ]);

    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/HISTORICO!A2:H${rows.length + 1}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: rows }),
        }
      );
    } catch (e) {
      console.warn("Erro ao sincronizar HISTORICO:", e);
    }
  }

  /**
   * Sincroniza aba LOTES
   */
  static async syncLotes(
    accessToken: string,
    spreadsheetId: string,
    batches: Batch[],
    products: ProductItem[]
  ): Promise<void> {
    if (!batches || batches.length === 0) return;
    const rows = batches.map((b) => {
      const createdDate = b.createdAt ? b.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const createdTime = b.createdAt ? new Date(b.createdAt).toLocaleTimeString("pt-BR") : "--:--";
      const totalItensNaCaixa = products.filter((p) => p.loteId === b.id && p.caixa === b.caixa).length;
      const qrCodeVal = b.qrCode || `CX-${b.caixa}-${b.id}`;

      return [
        b.id,
        b.deviceId || "Carlos Silveira",
        createdDate,
        createdTime,
        b.caixa,
        totalItensNaCaixa,
        qrCodeVal,
      ];
    });

    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/LOTES!A2:G${rows.length + 1}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: rows }),
        }
      );
    } catch (e) {
      console.warn("Erro ao sincronizar LOTES:", e);
    }
  }

  /**
   * Atualiza uma única célula na planilha (ex: NFE)
   */
  static async updateNfeCell(
    accessToken: string,
    spreadsheetId: string,
    serialImei: string,
    newNfe: string,
    sheetName: string = "INVENTARIO"
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          sheetName
        )}!A2:J`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return false;
      const data = await res.json();
      const rows: string[][] = data.values || [];
      const targetSerial = serialImei.trim().toUpperCase();

      for (let i = 0; i < rows.length; i++) {
        const rowSerial = String(rows[i][1] || "").trim().toUpperCase();
        if (rowSerial === targetSerial || rowSerial.includes(targetSerial)) {
          const rowNumber = i + 2;
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
              sheetName
            )}!H${rowNumber}?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: [[newNfe]] }),
            }
          );
          return true;
        }
      }
    } catch (e) {
      console.warn("Erro ao atualizar NFE no Google Sheet:", e);
    }
    return false;
  }

  /**
   * Lê todas as linhas de produtos gravadas na planilha existente
   */
  static async fetchProductsFromSheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<any[]> {
    try {
      let url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'INVENTARIO'!A2:J`;
      let res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:J`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      }
      if (!res.ok) return [];

      const data = await res.json();
      const rows = data.values || [];
      const parsedProducts = rows
        .map((row: any[], index: number) => {
          const modelo = String(row[0] || "").trim();
          const serialImei = String(row[1] || "").trim();
          const ean = String(row[2] || "").trim();
          const qtde = Number(row[3]) || 1;
          const dataStr = String(row[4] || new Date().toISOString().slice(0, 10)).trim();
          const qtdDia = Number(row[5]) || index + 1;
          const caixa = Number(row[6]) || 1;
          const nfe = String(row[7] || "").trim();
          const linkFoto = String(row[8] || "LINK").trim();
          const estadoFisico = String(row[9] || "NOVO_LACRADO").trim();

          if (!modelo && !serialImei) return null;

          return {
            id: `SHEET-${Date.now().toString(36)}-${index}`,
            modelo: modelo || "Produto Importado",
            serialImei: serialImei || "—",
            ean,
            qtde,
            data: dataStr,
            qtdDia,
            caixa,
            nfe,
            linkFoto,
            photoIds: [],
            deviceId: "Carlos Silveira",
            loteId: `LOTE-CX-${caixa}`,
            status: "IDENTIFICADO",
            confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
            estadoFisico,
          };
        })
        .filter(Boolean);

      return parsedProducts;
    } catch (e) {
      console.warn("Erro ao carregar produtos da planilha existente:", e);
      return [];
    }
  }

  /**
   * Limpa dados da planilha
   */
  static async clearInventoryData(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string = "INVENTARIO"
  ): Promise<boolean> {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        sheetName
      )}!A2:J:clear`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return res.ok;
  }

  /**
   * Lê resumos gravados em RESUMO_CAIXAS
   */
  static async fetchResumosFromSheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<ResumoCaixa[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/RESUMO_CAIXAS!A2:J`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return [];

      const data = await res.json();
      const rows = data.values || [];
      return rows.map((row: any[]) => ({
        caixa: Number(row[0]) || 1,
        dataCriacao: String(row[1] || "").trim(),
        loteId: String(row[2] || "").trim(),
        qtdLida: Number(row[3]) || 0,
        qtdManifesto: Number(row[4]) || 0,
        status: (row[5] || "RECEBIDO") as any,
        divergenciaAuditoria: String(row[6] || "").trim(),
        revisaoManual: Number(row[7]) || 0,
        avariasDetectadas: Number(row[8]) || 0,
        operadorResponsavel: String(row[9] || "").trim(),
        qrCode: `CX-${String(row[0] || 1).padStart(3, "0")}-${String(row[2] || "")}`,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Lê lotes gravados em LOTES
   */
  static async fetchLotesFromSheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<Batch[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/LOTES!A2:G`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return [];

      const data = await res.json();
      const rows = data.values || [];
      return rows.map((row: any[]) => {
        const id = String(row[0] || "").trim();
        const deviceId = String(row[1] || "Carlos Silveira").trim();
        const dateStr = String(row[2] || "").trim();
        const timeStr = String(row[3] || "00:00:00").trim();
        const caixa = Number(row[4]) || 1;
        const qrCode = String(row[6] || `CX-${caixa}-${id}`).trim();

        return {
          id,
          deviceId,
          caixa,
          status: "ABERTO" as const,
          createdAt: dateStr && timeStr ? `${dateStr}T${timeStr}.000Z` : new Date().toISOString(),
          totalPhotos: 0,
          processedPhotos: 0,
          pendingPhotos: 0,
          errorPhotos: 0,
          qrCode,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Lê manifestos gravados em MANIFESTO
   */
  static async fetchManifestosFromSheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<ManifestoDoc[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/MANIFESTO!A2:J`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return [];

      const data = await res.json();
      const rows = data.values || [];
      const manifestMap = new Map<string, ManifestoDoc>();

      rows.forEach((row: any[]) => {
        const nfe = String(row[0] || "").trim();
        if (!nfe) return;

        const item: ManifestoItem = {
          id: `MITEM-${Math.random().toString(36).slice(2, 8)}`,
          nfe,
          fornecedor: String(row[1] || "").trim(),
          dataEmissao: String(row[2] || "").trim(),
          codigoItem: String(row[3] || "").trim(),
          descricao: String(row[4] || "").trim(),
          ean: String(row[5] || "").trim(),
          quantidade: Number(row[6]) || 1,
          valorUnitario: Number(row[7]) || 0,
          caixaSugerida: Number(row[8]) || 1,
          qtdConferida: 0,
          status: (row[9] || "PENDENTE") as any,
        };

        if (!manifestMap.has(nfe)) {
          manifestMap.set(nfe, {
            id: `MANIF-${nfe}`,
            nfe,
            fornecedor: item.fornecedor,
            dataEmissao: item.dataEmissao,
            totalItens: 0,
            totalUnidades: 0,
            importadoEm: new Date().toISOString(),
            arquivoNome: `manifesto_${nfe}.pdf`,
            itens: [],
          });
        }

        const doc = manifestMap.get(nfe)!;
        doc.itens.push(item);
        doc.totalItens++;
        doc.totalUnidades += item.quantidade;
      });

      return Array.from(manifestMap.values());
    } catch {
      return [];
    }
  }

  /**
   * Lê fotos gravadas em FOTOS
   */
  static async fetchPhotosFromSheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<StoredPhoto[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'FOTOS'!A2:M`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return [];

      const data = await res.json();
      const rows = data.values || [];
      return rows.map((row: any[]) => ({
        id: String(row[0] || "").trim(),
        filename: String(row[1] || "").trim(),
        originalName: String(row[2] || "").trim(),
        mimeType: String(row[3] || "image/jpeg").trim(),
        size: Number(row[4]) || 0,
        url: String(row[5] || "").trim(),
        loteId: String(row[6] || "").trim(),
        deviceId: String(row[7] || "Carlos Silveira").trim(),
        caixa: Number(row[8]) || 1,
        associatedProductId: String(row[9] || "").trim() || null,
        uploadedAt: String(row[10] || "").trim(),
        status: (row[11] || "RECEBIDO") as any,
        driveUrl: String(row[12] || "").trim() || undefined,
        isOrphan: !row[9],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Lê histórico/logs gravados em HISTORICO
   */
  static async fetchLogsFromSheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<AuditLog[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/HISTORICO!A2:H`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return [];

      const data = await res.json();
      const rows = data.values || [];
      return rows.map((row: any[]) => ({
        id: String(row[0] || "").trim(),
        timestamp: String(row[1] || "").trim(),
        deviceId: String(row[2] || "Carlos Silveira").trim(),
        loteId: String(row[3] || "").trim(),
        tipo: (row[4] || "ENTRADA") as any,
        detalhes: String(row[5] || "").trim(),
        productId: String(row[6] || "").trim() || undefined,
        photoId: String(row[7] || "").trim() || undefined,
      }));
    } catch {
      return [];
    }
  }
}
