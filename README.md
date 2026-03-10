<div align="center">

# Sistema PCP — Planejamento e Controle da Produção

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Sistema web completo para gestão de Produção, Estoque, Pedidos e Fornecedores**

[Funcionalidades](#-funcionalidades) • [Tecnologias](#-tecnologias) • [Instalação](#-instalação) • [API](#-api-endpoints) • [Estrutura](#-estrutura-do-projeto)

</div>

---

## Sobre o Projeto

O **Sistema PCP** é uma aplicação web full-stack desenvolvida para gerenciar o ciclo completo de **Planejamento e Controle da Produção** em ambientes industriais/manufatureiros. Ele cobre desde a criação de Ordens de Produção (OP) até o acompanhamento de pedidos de clientes, saídas de estoque, gestão de fornecedores e geração de relatórios.

O projeto foi construído com foco em **usabilidade**, **rastreabilidade** (trilha de auditoria completa) e **segurança** (autenticação JWT + bcrypt).

---

## Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **Ordens de Produção (OP)** | Criação, edição e acompanhamento de OPs com numeração automática por ano |
| **Ficha Técnica (BOM)** | Bill of Materials por produto — calcula insumos automaticamente pela quantidade |
| **Controle de Pedidos** | Vincula pedidos de clientes às OPs e rastreia status de produção |
| **Gestão de Materiais** | Cadastro completo de produtos com custo, estoque e unidade de medida |
| **Saída de Estoque** | Registro de saídas com cálculo automático de custo total |
| **Prestadores de Serviço** | Cadastro de fornecedores e vinculação a OPs específicas |
| **Relatórios** | Relatórios de estoque, pedidos, OPs e desempenho com exportação para Excel |
| **Logs do Sistema** | Trilha de auditoria completa de todas as operações (quem fez, o quê e quando) |
| **Gestão de Usuários** | Controle de acesso com perfis: `admin`, `pcp`, `logística` |
| **Backup do Banco** | Geração de backup SQL diretamente pelo painel do sistema |

---

## Tecnologias

### Backend
- **[Node.js](https://nodejs.org/)** + **[Express 5](https://expressjs.com/)** — Servidor HTTP e roteamento
- **[MySQL 2](https://github.com/sidorares/node-mysql2)** — Driver de banco de dados com pool de conexões
- **[JWT](https://jwt.io/)** (`jsonwebtoken`) — Autenticação stateless via tokens
- **[bcrypt](https://github.com/kelektiv/node.bcrypt.js)** — Hash seguro de senhas
- **[ExcelJS](https://github.com/exceljs/exceljs)** — Exportação de relatórios para `.xlsx`
- **[Multer](https://github.com/expressjs/multer)** — Upload de arquivos
- **[CORS](https://github.com/expressjs/cors)** — Controle de origens cruzadas

### Frontend
- **HTML5** + **CSS3** + **JavaScript (ES6+)** — Sem frameworks, sem dependências externas
- **Design System próprio** com tema escuro, componentes reutilizáveis e layout responsivo
- Comunicação com a API via **Fetch API** com tratamento de erros e notificações toast

### Banco de Dados
- **MySQL 8+** — Banco relacional com pool de até 10 conexões simultâneas

---

## Estrutura do Projeto

```
sistema-pcp/
│
├── API/                            # Backend (Node.js / Express)
│   ├── server.js                   # Servidor principal e rotas centrais
│   ├── db.js                       # Pool de conexão com MySQL
│   ├── ficha-tecnica-routes.js     # Rotas de Ficha Técnica (BOM)
│   ├── prestadores-routes.js       # Rotas de Prestadores de Serviço
│   ├── relatorios-routes.js        # Rotas de Relatórios
│   ├── create-user.js              # Utilitário de criação de usuário via CLI
│   └── package.json                # Dependências Node
│
├── PCP/                            # Frontend (HTML estático)
│   ├── Index.html                  # Dashboard principal
│   ├── login.html                  # Autenticação
│   ├── gerar-op.html               # Criação de Ordem de Produção
│   ├── gerenciar-op.html           # Gerenciamento de OPs
│   ├── visualizar_op.html          # Detalhes de uma OP
│   ├── processos.html              # Acompanhamento de processos
│   ├── pedidos.html                # Controle de Pedidos
│   ├── produtos.html               # Cadastro de Materiais
│   ├── prestadores.html            # Cadastro de Fornecedores
│   ├── saida_estoque.html          # Saída de Estoque
│   ├── relatorios.html             # Relatórios e Analytics
│   ├── usuarios.html               # Gestão de Usuários
│   ├── sistema.html                # Painel do Sistema / Backup
│   └── logs.html                   # Logs de Auditoria
│
├── Scripts/                        # JavaScript do Frontend
│   ├── auth.js                     # Helpers de autenticação e requisições à API
│   ├── login-script.js             # Lógica da tela de login
│   ├── index-script.js             # Dashboard
│   ├── gerar-op-script.js          # Criação de OP
│   ├── gerenciar-op-script.js      # Gerenciamento de OP
│   ├── visualizar_op.js            # Visualização de OP
│   ├── processos-script.js         # Processos
│   ├── pedidos.js                  # Pedidos
│   ├── produtos-script.js          # Materiais + Ficha Técnica
│   ├── prestadores-script.js       # Fornecedores
│   ├── saida-estoque-script.js     # Saída de Estoque
│   ├── relatorios-script.js        # Relatórios
│   └── usuarios.js                 # Gestão de Usuários
│
├── Styles/                         # CSS
│   ├── shared-style.css            # Design system global (tema, variáveis, componentes)
│   └── [page]-style.css            # Estilos específicos por página
│
├── .gitignore
└── README.md
```

---

## Instalação

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18 ou superior
- [MySQL](https://www.mysql.com/) 8.0 ou superior

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/AndersonSturk/sistema-pcp.git
cd sistema-pcp
```

**2. Instale as dependências do backend**
```bash
cd API
npm install
```

**3. Configure as variáveis de ambiente**

Crie um arquivo `.env` dentro da pasta `API/`:
```env
DB_HOST=127.0.0.1
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=pcp
DB_PORT=3306
SERVER_PORT=3000
JWT_SECRET=seu_segredo_jwt_muito_seguro
NODE_ENV=development
```

> **Atenção:** nunca versione o arquivo `.env`. Ele já está no `.gitignore`.

**4. Configure o banco de dados**

Crie o banco e restaure a partir do backup:
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS pcp;"
mysql -u root -p pcp < API/backup_pcp_schema.sql
```

**5. Crie o primeiro usuário administrador**
```bash
cd API
node create-user.js
```

**6. Inicie o servidor**
```bash
npm start
```

**7. Acesse o sistema**

Abra no navegador: [http://localhost:3000/Index.html](http://localhost:3000/Index.html)

---

## API Endpoints

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/login` | Autenticar usuário — retorna JWT |

> Todas as demais rotas requerem o header: `Authorization: Bearer <token>`

### Ordens de Produção
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/ordens_producao` | Listar OPs (com filtros) |
| `GET` | `/ordens_producao/:id` | Detalhes de uma OP |
| `POST` | `/ordens_producao` | Criar nova OP |
| `PUT` | `/ordens_producao/:id` | Atualizar OP |
| `GET` | `/ordens_producao/:id/insumos` | Insumos da OP |

### Materiais
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/materiais` | Listar materiais (paginado, pesquisável) |
| `POST` | `/materiais` | Criar material |
| `PUT` | `/materiais/:id` | Atualizar material |
| `DELETE` | `/materiais/:id` | Remover material |

### Ficha Técnica (BOM)
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/ficha-tecnica/:material_id` | BOM do material |
| `POST` | `/ficha-tecnica/:material_id` | Salvar/atualizar BOM |
| `GET` | `/ficha-tecnica/:material_id/calcular?quantidade=X` | Calcular insumos por quantidade |

### Outros módulos
- **Pedidos:** `GET/POST/PUT/DELETE /controle_pedidos`
- **Fornecedores:** `GET/POST/PUT/DELETE /prestadores`
- **Saída de Estoque:** `GET/POST/PUT /saidas_estoque`
- **Relatórios:** `GET /relatorios/estoque|pedidos|ops|desempenho`
- **Usuários:** `GET/POST/PUT/DELETE /usuarios`
- **Logs:** `GET /logs`

---

## Perfis de Acesso

| Perfil | Permissões |
|--------|-----------|
| `admin` | Acesso total — incluindo gestão de usuários e configurações do sistema |
| `pcp` | Criação e gestão de OPs, pedidos, materiais e relatórios |
| `logistica` | Saídas de estoque e consulta de OPs |

---

## Arquitetura

```
[ Navegador ]
     │
     │  HTTP / REST JSON
     ▼
[ Express.js Server ]  ←── JWT Middleware (autenticação)
     │
     ├── /ordens_producao   (server.js)
     ├── /materiais         (server.js)
     ├── /ficha-tecnica     (ficha-tecnica-routes.js)
     ├── /prestadores       (prestadores-routes.js)
     ├── /relatorios        (relatorios-routes.js)
     └── ...
     │
     ▼
[ MySQL — Pool de Conexões ]
     │
     └── Database: pcp
```

---

## Destaques Técnicos

- **Sem frameworks de frontend** — HTML, CSS e JS puros com design system próprio e tema dark profissional
- **Trilha de auditoria completa** — cada operação é registrada com usuário, módulo, ação e timestamp
- **Numeração automática de OP** — sequencial por ano (ex: `OP-0001/2026`)
- **Cálculo dinâmico de BOM** — ao informar a quantidade, o sistema calcula automaticamente todos os insumos necessários
- **Exportação Excel** — relatórios exportados diretamente para `.xlsx` via ExcelJS
- **Soft delete** — registros nunca são deletados fisicamente, garantindo rastreabilidade

---

## Solução de Problemas

**Erro de conexão com MySQL**
```bash
# Verifique se o MySQL está rodando
mysql -u root -p -e "SELECT 1"
# Confirme as credenciais no arquivo .env
```

**Porta 3000 já em uso (Windows)**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Módulos não encontrados**
```bash
cd API
rm -rf node_modules
npm install
```

---

## Autor

Desenvolvido por **Anderson Sturk**

[![GitHub](https://img.shields.io/badge/GitHub-AndersonSturk-181717?style=flat&logo=github)](https://github.com/AndersonSturk)

---

<div align="center">
  <sub>Sistema PCP — 2026</sub>
</div>
