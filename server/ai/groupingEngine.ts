import { ExtractedPhotoEvidence, PhysicalProductInstance } from "./types.js";
import { IdentityEngine } from "./identityEngine.js";
import { FusionEngine } from "./fusionEngine.js";

export class GroupingEngine {
  /**
   * Processa o conjunto de fotos e gera as instâncias físicas individuais de produto.
   * Garante estritamente que múltiplos produtos de mesmo modelo permaneçam separados caso tenham seriais distintos.
   */
  static async processBatch(
    evidences: ExtractedPhotoEvidence[],
    context: { loteId: string; caixa: number; spreadsheetId?: string }
  ): Promise<{
    instances: PhysicalProductInstance[];
    orphanPhotos: string[];
    illegiblePhotos: string[];
  }> {
    // 1. Identificar fotos comprovadamente ilegíveis
    const illegiblePhotos: string[] = [];
    const validEvidences: ExtractedPhotoEvidence[] = [];

    for (const ev of evidences) {
      if (ev.isIllegible) {
        illegiblePhotos.push(ev.photoId);
      } else {
        validEvidences.push(ev);
      }
    }

    // 2. Correlacionar evidências em instâncias físicas (IdentityEngine)
    const { instances: rawInstances, unassociatedPhotoIds } = IdentityEngine.correlateEvidence(
      validEvidences,
      context
    );

    // 3. Fusão e validação independente de cada entidade (FusionEngine)
    const finalizedInstances: PhysicalProductInstance[] = [];
    for (const rawInst of rawInstances) {
      const fused = await FusionEngine.fuseAndValidate(rawInst, context.spreadsheetId);
      finalizedInstances.push(fused);
    }

    return {
      instances: finalizedInstances,
      orphanPhotos: unassociatedPhotoIds,
      illegiblePhotos,
    };
  }
}
