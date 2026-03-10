import { getUser, getToken, logout } from "./auth.js";

const user = getUser();
const token = getToken();

if (!user || !token) {
  window.location.href = "login.html";
}

const userInfo = document.getElementById("userInfo");
if (userInfo) userInfo.innerText = `Olá, ${user.nome}`;

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", logout);
}
