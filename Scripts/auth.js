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

export async function apiRequest(path, options = {}) {
  const token = getToken();

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
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw new Error("Falha na conexão com o servidor. Verifique se ele está rodando.");
  }

  if (res.status === 401 || res.status === 403) {
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

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
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
