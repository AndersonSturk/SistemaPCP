export const API_URL = "http://192.168.1.190:8080";

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem("token");
}

export function getCSRFToken() {
  return localStorage.getItem("csrfToken");
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const csrfToken = getCSRFToken();

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "X-CSRF-Token": csrfToken || "",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw new Error("Falha na conexão com o servidor. Verifique se ele está rodando.");
  }

  if (res.status === 401 || res.status === 403) {
    // Se for CSRF inválido, tenta renovar o token automaticamente
    const body = await res.json().catch(() => ({}));
    if (body.message && body.message.includes("CSRF")) {
      await renovarCSRFToken();
      // Retenta a requisição com o novo token
      return apiRequest(path, options);
    }
    showToast("Sessão expirada. Faça login novamente.", "error");
    localStorage.clear();
    setTimeout(() => (window.location.href = "login.html"), 1500);
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ${res.status} na requisição`);
  }

  return res.json();
}

// Renova o token CSRF automaticamente
async function renovarCSRFToken() {
  try {
    const res = await fetch(`${API_URL}/csrf-token`);
    const data = await res.json();
    if (data.csrfToken) localStorage.setItem("csrfToken", data.csrfToken);
  } catch { /* silencia */ }
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("csrfToken");
  window.location.href = "login.html";
}

// ── Header dinâmico por perfil ──────────────────────────
// Troca o texto "PCP" no logo e o subtítulo conforme o perfil do usuário
const PERFIL_HEADER = {
  producao: { logo: "PROD", titulo: "Produção" },
  ped:      { logo: "P&D",  titulo: "P&D" },
};

export function aplicarHeaderPerfil() {
  const user = getUser();
  if (!user) return;
  const config = PERFIL_HEADER[user.perfil];
  if (!config) return; // admin, pcp, logistica, vendas mantêm "PCP"

  // Atualiza logo (class="logo" ou class="logo-badge")
  const logos = document.querySelectorAll(".logo, .logo-badge");
  logos.forEach(el => { el.textContent = config.logo; });

  // Atualiza título do header se existir
  const headerTexts = document.querySelectorAll(".header-text, .header-title");
  headerTexts.forEach(el => {
    el.textContent = el.textContent.replace(/PCP/g, config.titulo);
  });
}

// Auto-aplica ao carregar em qualquer página que importe auth.js
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplicarHeaderPerfil);
  } else {
    aplicarHeaderPerfil();
  }
}

// ─── Toast global (injetado dinamicamente) ───────────────────────────────────
export function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    Object.assign(container.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    });
    document.body.appendChild(container);
  }

  const colors = {
    success: "#22c55e",
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
  };

  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    background: colors[type] || colors.info,
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    fontSize: "14px",
    fontFamily: "sans-serif",
    opacity: "0",
    transform: "translateX(40px)",
    transition: "all 0.3s ease",
    maxWidth: "320px",
    wordBreak: "break-word",
  });

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
