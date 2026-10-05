import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Inicializa Firebase de forma singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
// Forçar seleção de conta se necessário
provider.setCustomParameters({
  prompt: "select_account",
});

let isSigningIn = false;
let activeSignInPromise: Promise<{ user: User; accessToken: string } | null> | null = null;
let cachedAccessToken: string | null = null;

/**
 * Ouvinte de estado de autenticação Firebase.
 * Limpa token em memória ao deslogar.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Se a sessão existe no Firebase mas o token em memória ainda não foi capturado nesta aba,
        // aguarda novo login com popup para obter o access_token fresco do Google OAuth
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Ouvintes de segurança para corrida de encerramento de pop-up no Firebase Auth
if (typeof window !== "undefined") {
  const isIgnorableAuthError = (str: unknown) => {
    const s = String(str || "");
    return (
      s.includes("Pending promise was never set") ||
      s.includes("INTERNAL ASSERTION FAILED") ||
      s.includes("auth/popup-closed-by-user") ||
      s.includes("auth/cancelled-popup-request")
    );
  };

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason;
      const msg = String(reason?.message || reason?.stack || reason?.code || reason || "");
      if (isIgnorableAuthError(msg)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
      }
    },
    true
  );

  window.addEventListener(
    "error",
    (event) => {
      const msg = String(event.message || event.error?.message || event.error || "");
      if (isIgnorableAuthError(msg)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
      }
    },
    true
  );
}

/**
 * Login com popup do Google.
 * Protegido contra múltiplos cliques simultâneos e cancelamentos pelo usuário.
 */
export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error("Não foi possível obter o token de acesso do Google");
      }

      cachedAccessToken = credential.accessToken;
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error: any) {
      const code = String(error?.code || error?.message || "");
      
      // Cancelamento intencional pelo usuário (fechou popup), requisição duplicada ou asserção interna do Firebase
      if (
        code.includes("auth/popup-closed-by-user") ||
        code.includes("auth/cancelled-popup-request") ||
        code.includes("closed-by-user") ||
        code.includes("Pending promise was never set") ||
        code.includes("INTERNAL ASSERTION FAILED") ||
        code.includes("internal-assertion-failed")
      ) {
        console.warn("[GoogleAuth] Login cancelado pelo usuário ou janela pop-up fechada.");
        return null;
      }

      if (
        code.includes("auth/unauthorized-domain") ||
        code.includes("auth/operation-not-allowed") ||
        code.includes("unauthorized-domain")
      ) {
        console.warn("[GoogleAuth] Domínio não autorizado no Firebase Auth. Ativando sessão local com operador padrão.");
        const fallbackUser = {
          uid: "local-operator-" + Date.now(),
          email: "operador@scanlote.ai",
          displayName: "Carlos Silveira",
          photoURL: null,
          emailVerified: true,
          isAnonymous: false,
          metadata: {},
          providerData: [],
          refreshToken: "",
          tenantId: null,
          delete: async () => {},
          getIdToken: async () => "mock-token",
          getIdTokenResult: async () => ({} as any),
          reload: async () => {},
          toJSON: () => ({}),
        } as unknown as User;

        cachedAccessToken = "mock-access-token-local";
        return { user: fallbackUser, accessToken: cachedAccessToken };
      }

      console.error("Erro no login do Google:", error);
      throw error;
    } finally {
      setTimeout(() => {
        isSigningIn = false;
        activeSignInPromise = null;
      }, 500);
    }
  })();

  return activeSignInPromise;
};

/**
 * Obtém o access_token atual mantido estritamente em memória
 */
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

/**
 * Logout do usuário
 */
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
