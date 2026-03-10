import { API_URL, showToast } from "./auth.js";

const form = document.getElementById("loginForm");
const btnSubmit = form.querySelector("button[type=submit]");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value;

  if (!email || !senha) {
    showToast("Preencha todos os campos.", "warning");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Entrando...";

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showToast(data.message || "E-mail ou senha incorretos.", "error");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    showToast("Não foi possível conectar ao servidor.", "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Entrar";
  }
});
