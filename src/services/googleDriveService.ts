export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
}

export class GoogleDriveService {
  /**
   * Lista planilhas do usuário no Google Drive
   */
  static async listSpreadsheets(accessToken: string): Promise<DriveFileItem[]> {
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const fields = encodeURIComponent("files(id, name, mimeType, webViewLink, modifiedTime, createdTime)");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=30`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Erro ao listar planilhas no Google Drive");
    }

    const data = await res.json();
    return data.files || [];
  }

  /**
   * Localiza ou cria a pasta raiz do sistema no Drive (SCANLOTE_INVENTARIO)
   */
  static async findOrCreateFolder(
    accessToken: string,
    folderName: string = "SCANLOTE_INVENTARIO",
    parentId?: string
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    let q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    if (parentId) {
      q += ` and '${parentId}' in parents`;
    }
    const queryEncoded = encodeURIComponent(q);
    const fields = encodeURIComponent("files(id, name, webViewLink)");
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${queryEncoded}&fields=${fields}`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0];
      }
    }

    // Criar pasta se não existir
    const createBody: any = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
      createBody.parents = [parentId];
    }

    const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error?.message || "Erro ao criar pasta no Google Drive");
    }

    return await createRes.json();
  }

  /**
   * Faz upload de arquivo de foto diretamente para o Google Drive via Multipart
   */
  static async uploadPhoto(
    accessToken: string,
    blob: Blob,
    filename: string,
    folderId?: string
  ): Promise<DriveFileItem> {
    const metadata: any = {
      name: filename,
      mimeType: blob.type || "image/jpeg",
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelimiter = "\r\n--" + boundary + "--";

    // Converter blob para ArrayBuffer para enviar
    const fileBytes = await blob.arrayBuffer();

    const metadataPart =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${metadata.mimeType}\r\n` +
      "Content-Transfer-Encoding: base64\r\n\r\n";

    // Converter bytes para base64
    let binary = "";
    const bytes = new Uint8Array(fileBytes);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    const payload = metadataPart + base64Data + closeDelimiter;

    const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,thumbnailLink,size,createdTime";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Erro ao fazer upload da foto para o Google Drive");
    }

    const uploaded = await res.json();

    // Torna a foto legível com link para funcionar nas fórmulas da planilha
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      });
    } catch (e) {
      // Ignora erro se política corporativa proibir compartilhamento anyone
    }

    return uploaded;
  }

  /**
   * Lista arquivos dentro de uma pasta do Google Drive
   */
  static async listFilesInFolder(
    accessToken: string,
    folderId: string
  ): Promise<DriveFileItem[]> {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent(
      "files(id, name, mimeType, webViewLink, thumbnailLink, size, createdTime, modifiedTime)"
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime desc&pageSize=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Erro ao listar arquivos da pasta no Google Drive");
    }

    const data = await res.json();
    return data.files || [];
  }

  /**
   * Move arquivo para a lixeira do Drive (requer confirmação prévia no UI)
   */
  static async trashFile(accessToken: string, fileId: string): Promise<boolean> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trashed: true }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Erro ao mover arquivo para lixeira do Google Drive");
    }

    return true;
  }
}
