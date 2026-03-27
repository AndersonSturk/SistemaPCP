<div align="center">

# Sistema PCP — Planejamento e Controle da Produção

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![CSRF](https://img.shields.io/badge/CSRF-Protected-22c55e?style=for-the-badge&logo=shield&logoColor=white)](#protecao-contra-ataques)
[![RBAC](https://img.shields.io/badge/RBAC-6_Perfis-3b82f6?style=for-the-badge&logo=users&logoColor=white)](#controle-de-acesso-rbac)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Sistema web completo para gestão de Produção, Estoque, Notas Fiscais, Pedidos e Fornecedores**
**com múltiplas camadas de segurança e auditoria completa**

[Funcionalidades](#-funcionalidades) • [Segurança](#-segurança) • [Tecnologias](#-tecnologias) • [Instalação](#-instalação) • [API](#-api-endpoints) • [Estrutura](#-estrutura-do-projeto)

</div>

---

## Sobre o Projeto

O **Sistema PCP** é uma aplicação web full-stack desenvolvida para gerenciar o ciclo completo de **Planejamento e Controle da Produção** em ambientes industriais/manufatureiros. Ele cobre desde a criação de Ordens de Produção (OP) até o acompanhamento de pedidos, importação de notas fiscais (NF-e), controle de saídas de estoque, gestão de prestadores de serviço e geração de relatórios analíticos com dashboard interativo.

O projeto foi construído com foco em **segurança em múltiplas camadas** (JWT + CSRF + bcrypt + Rate Limiting + RBAC), **rastreabilidade** (trilha de auditoria completa) e **usabilidade** (interface dark profissional, responsiva e com impressão otimizada).

---

## Funcionalidades

### Produção
| Módulo | Descrição |
|--------|-----------|
| **Gerar OP** | Criação de Ordens de Produção com seleção de produto, cálculo automático de consumo de materiais (BOM) e custos unitários/totais |
| **Gerenciar OP** | Acompanhamento completo do ciclo de vida (Aberta → Em Produção → Concluída), edição inline, registro de perdas de material, vínculo com prestadores de serviço |
| **Visualizar OP** | Visualização detalhada com exportação para PDF e impressão otimizada em formato A4 |
| **Processos** | Gerenciamento de processos produtivos com stepper visual de 3 etapas |

### Estoque e Notas Fiscais
| Módulo | Descrição |
|--------|-----------|
| **Entrada de Notas Fiscais** | Importação de NF-e via **XML e PDF (DANFE)** com parsing automático, vinculação de itens a materiais cadastrados via busca por similaridade ou cadastro rápido on-the-fly |
| **Saída de Estoque** | Controle de saída com verificação de disponibilidade em tempo real (status por cores), vinculação a pedidos com baixa parcial e geração de comprovante |
| **Consulta de Estoque** | Visualização completa com indicadores visuais (verde/amarelo/vermelho) |
| **Espelho de NF** | Geração de espelhos de nota fiscal com mapeamento automático de CFOP |

### Cadastros
| Módulo | Descrição |
|--------|-----------|
| **Produtos e Materiais** | CRUD completo com ficha técnica (BOM), fator de conversão, unidades de medida e custos |
| **Prestadores de Serviço** | Cadastro com vinculação a OPs, valor de serviço e prazo de entrega |
| **Pedidos** | Gestão de pedidos de compra e venda com rastreamento de status |

### Sistema e Analytics
| Módulo | Descrição |
|--------|-----------|
| **Dashboard Interativo** | Painel com gráficos em tempo real (Chart.js) — timeline de produção, distribuição por status/UF, movimentação de estoque mensal, tendência de 6 meses |
| **Logs de Auditoria** | Registro de todas as ações com filtros por módulo, usuário, data e texto livre, estatísticas em tempo real, paginação e badges coloridos por tipo de ação |
| **Gestão de Usuários** | Cadastro com **6 perfis de acesso**, política de senha forte e verificação de usuário ativo |
| **Relatórios** | Geração de relatórios operacionais com exportação para Excel |
| **Backup** | Geração de backup SQL diretamente pelo painel do sistema |

---

## Segurança

O sistema implementa **múltiplas camadas de segurança** seguindo boas práticas de desenvolvimento seguro:

### Autenticação e Sessão
- **JWT (JSON Web Tokens)** com tokens Bearer e expiração de 8 horas
- **Hashing de senhas com bcrypt** utilizando salt rounds de 12
- **Política de senha forte** obrigatória: mínimo 8 caracteres, letra maiúscula, número e caractere especial
- **Proteção contra enumeração de usuários**: mensagens de erro genéricas que não revelam se o e-mail existe
- **Limpeza automática de sessão**: logout completo com remoção de todos os dados de autenticação
- **Verificação de usuário ativo**: contas desabilitadas não podem autenticar
- **Proteção contra double-submit**: botão de login desabilitado durante processamento

### Proteção contra Ataques
- **CSRF (Cross-Site Request Forgery)**: tokens criptográficos gerados com `crypto.randomBytes(32)`, validados em toda requisição POST/PUT/DELETE, com renovação automática e expiração de 8 horas
- **Rate Limiting contra brute force**: limite de 10 tentativas de login por IP a cada 15 minutos; 200 requisições/minuto para rotas de API
- **SQL Injection**: todas as queries utilizam **prepared statements** com parâmetros vinculados (placeholders `?`)
- **Validação server-side**: validação de campos obrigatórios, tipos de dados, trimming de strings e sanitização de inputs em todas as rotas
- **Proteção de duplicidade**: verificação de e-mail único com tratamento de `ER_DUP_ENTRY`

### Controle de Acesso (RBAC)
O sistema implementa **Role-Based Access Control** com 6 perfis de usuário:

| Perfil | Permissões |
|--------|-----------|
| `admin` | Acesso total — gestão de usuários, logs, configurações do sistema e backup |
| `pcp` | Planejamento de produção, criação/gestão de OPs, pedidos, materiais e relatórios |
| `producao` | Execução de OPs, consulta de materiais e acompanhamento de processos |
| `logistica` | Controle de estoque (entrada/saída), notas fiscais e expedição |
| `vendas` | Gestão de pedidos de venda |
| `ped` | Pesquisa e Desenvolvimento com acesso a fichas técnicas e processos |

- **Middleware de autorização** em cada endpoint: `authMiddleware` + `roleMiddleware([perfis])`
- **Visibilidade de módulos por perfil**: o hub principal exibe apenas os módulos que o usuário tem permissão para acessar
- **Header dinâmico por perfil**: identificação visual do perfil logado (PROD, P&D, etc.)
- **Proteção contra auto-exclusão**: usuários não podem excluir a própria conta

### Auditoria e Rastreabilidade
- **Log completo de ações**: registro automático de login, criação, edição, exclusão, início e conclusão em todos os módulos
- **Módulos rastreados**: OP, MATERIAL, ESTOQUE (entrada/saída), PEDIDO, USUARIO, PRESTADOR, SISTEMA
- **Metadados de auditoria**: ID do usuário, nome, módulo, ação, descrição, referência e timestamp automático
- **Acesso restrito aos logs**: apenas perfis `admin` e `pcp`
- **Tabela dedicada** com índices otimizados para consultas rápidas

### Configuração Segura
- **Variáveis de ambiente** via `.env` (credenciais nunca hardcoded no código)
- **Alerta de configuração**: warning no console quando `JWT_SECRET` não está definido
- **Suporte a HTTPS/TLS**: configuração automática via certificados SSL (SSL_KEY/SSL_CERT) com fallback para HTTP
- **CORS configurado** com controle de origens e suporte a credenciais
- **Connection pooling** MySQL com limite de 10 conexões simultâneas

---

## Tecnologias

### Backend
- **[Node.js](https://nodejs.org/)** + **[Express 5](https://expressjs.com/)** — Servidor HTTP e API REST
- **[MySQL 2](https://github.com/sidorares/node-mysql2)** — Driver de banco de dados com connection pooling
- **[JWT](https://jwt.io/)** (`jsonwebtoken`) — Autenticação stateless via tokens
- **[bcrypt](https://github.com/kelektiv/node.bcrypt.js)** — Hash seguro de senhas (salt rounds: 12)
- **[express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)** — Proteção contra brute force e DDoS
- **[crypto](https://nodejs.org/api/crypto.html)** — Geração de tokens CSRF criptograficamente seguros
- **[Multer](https://github.com/expressjs/multer)** — Upload de arquivos (XML/PDF de NF-e)
- **[CORS](https://github.com/expressjs/cors)** — Controle de origens cruzadas
- **[dotenv](https://github.com/motdotla/dotenv)** — Gerenciamento seguro de variáveis de ambiente

### Frontend
- **HTML5** + **CSS3** + **JavaScript (ES6+)** — Sem frameworks, sem dependências externas
- **[Chart.js](https://www.chartjs.org/)** — Gráficos interativos no dashboard (line, bar, doughnut)
- **Design System próprio** com tema dark profissional, glassmorphism e componentes reutilizáveis
- **Layout responsivo** com 3 breakpoints (desktop, tablet, mobile)
- **Impressão otimizada** com estilos dedicados para geração de PDF/A4
- Comunicação com a API via **Fetch API** com tratamento de erros, renovação de CSRF e notificações toast

### Banco de Dados
- **MySQL 8+** — Banco relacional com pool de até 10 conexões simultâneas e auto-migration de tabelas

---

## Estrutura do Projeto

```
SistemaPCP/
│
├── API/                              # Backend (Node.js / Express)
│   ├── server.js                     # Servidor principal, rotas, middlewares de segurança
│   ├── ficha-tecnica-routes.js       # Rotas de Ficha Técnica (BOM)
│   ├── package.json                  # Dependências Node
│   └── node_modules/                 # (ignorado no git)
│
├── PCP/                              # Frontend (HTML)
│   ├── Index.html                    # Hub principal com navegação por categorias e controle de perfil
│   ├── login.html                    # Autenticação
│   ├── dashboard.html                # Dashboard com gráficos e métricas em tempo real
│   ├── gerar-op.html                 # Criação de Ordem de Produção
│   ├── gerenciar-op.html             # Gestão detalhada de OPs (insumos, prestadores, perdas)
│   ├── visualizar_op.html            # Visualização/impressão de OPs em A4
│   ├── processos.html                # Acompanhamento de processos com stepper visual
│   ├── entrada-notas.html            # Importação de NF-e via XML/PDF com vinculação de itens
│   ├── saida_estoque.html            # Saída de estoque com vinculação a pedidos
│   ├── estoque.html                  # Consulta de estoque
│   ├── espelho-nf.html               # Espelho de nota fiscal
│   ├── espelhos-nf.html              # Listagem de espelhos
│   ├── produtos.html                 # Cadastro de materiais/produtos
│   ├── prestadores.html              # Cadastro de prestadores de serviço
│   ├── pedidos.html                  # Controle de pedidos
│   ├── usuarios.html                 # Gestão de usuários (admin)
│   ├── logs.html                     # Logs de auditoria com filtros e estatísticas
│   ├── Relatorios.html               # Relatórios
│   └── sistema.html                  # Configurações e backup
│
├── Scripts/                          # JavaScript do Frontend
│   ├── auth.js                       # Autenticação JWT, gestão de CSRF e controle de sessão
│   ├── login-script.js               # Lógica de login com proteção contra double-submit
│   ├── entrada-notas-script.js       # Parsing de XML/PDF, vinculação de materiais, cadastro rápido
│   ├── saida-estoque-script.js       # Saída com verificação de disponibilidade e comprovante
│   ├── gerar-op-script.js            # Cálculo de BOM e custos na criação de OP
│   ├── gerenciar-op-script.js        # Gestão de ciclo de vida da OP
│   ├── visualizar_op.js              # Visualização e exportação PDF
│   ├── processos-script.js           # Processos produtivos
│   ├── produtos-script.js            # CRUD de materiais com ficha técnica
│   └── espelho-nf-script.js          # Espelho de NF com CFOP automático
│
├── Styles/                           # CSS
│   ├── shared-style.css              # Design system: tema dark, variáveis CSS, componentes base
│   ├── login-style.css               # Login com gradiente e animações
│   ├── index-style.css               # Hub com cards por categoria
│   └── [pagina]-style.css            # Estilos específicos por página (responsivos + print)
│
├── assets/                           # Recursos visuais
│   ├── Logo Lucabe.png               # Logo da empresa
│   └── logo-lucabe.svg               # Logo vetorial
│
├── .gitignore                        # Arquivos ignorados (env, node_modules, backups SQL)
└── README.md                         # Documentação do projeto
```

---

## Instalação

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18 ou superior
- [MySQL](https://www.mysql.com/) 8.0 ou superior

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/AndersonSturk/SistemaPCP.git
cd SistemaPCP
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
SERVER_PORT=8080
JWT_SECRET=seu_segredo_jwt_muito_seguro

# Opcional — HTTPS
SSL_KEY=/caminho/para/chave.key
SSL_CERT=/caminho/para/certificado.crt
```

> **Atenção:** nunca versione o arquivo `.env`. Ele já está no `.gitignore`.

**4. Configure o banco de dados**

Crie o banco de dados MySQL. As tabelas são criadas automaticamente pelo servidor na primeira execução (auto-migration):
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS pcp;"
```

**5. Inicie o servidor**
```bash
node server.js
```

**6. Acesse o sistema**

Abra no navegador: [http://localhost:8080](http://localhost:8080)

> Na primeira execução, crie um usuário administrador pelo endpoint ou utilitário CLI disponível.

---

## API Endpoints

### Autenticação e Segurança
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/login` | Autenticar usuário — retorna JWT + CSRF token |
| `GET` | `/csrf-token` | Obter token CSRF para requisições protegidas |

> Todas as demais rotas requerem: `Authorization: Bearer <token>` e `X-CSRF-Token: <csrf_token>` (para POST/PUT/DELETE)

### Ordens de Produção
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/ordens_producao` | Listar OPs (com filtros e paginação) |
| `GET` | `/ordens_producao/:id` | Detalhes de uma OP |
| `POST` | `/ordens_producao` | Criar nova OP |
| `PUT` | `/ordens_producao/:id` | Atualizar OP |
| `GET` | `/ordens_producao/:id/insumos` | Insumos calculados da OP |

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

### Outros Módulos
- **Pedidos:** `GET/POST/PUT/DELETE /controle_pedidos`
- **Prestadores:** `GET/POST/PUT/DELETE /prestadores`
- **Saída de Estoque:** `GET/POST/PUT /saidas_estoque`
- **Entrada de Notas:** `POST /entrada-notas` (upload XML/PDF)
- **Espelho NF:** `GET/POST /espelho-nf`
- **Relatórios:** `GET /relatorios/estoque|pedidos|ops|desempenho`
- **Usuários:** `GET/POST/PUT/DELETE /usuarios` (admin only)
- **Logs:** `GET /logs` (admin/pcp only)

---

## Arquitetura de Segurança

```
[ Navegador ]
     │
     │  HTTPS (recomendado) / HTTP
     ▼
[ Express.js Server ]
     │
     ├── Rate Limiter ──────────── Limite de requisições por IP
     ├── CORS Middleware ────────── Controle de origens
     ├── CSRF Middleware ────────── Validação de token em POST/PUT/DELETE
     ├── Auth Middleware (JWT) ──── Verificação de token Bearer
     ├── Role Middleware (RBAC) ─── Verificação de perfil do usuário
     │
     ├── /login ────────── bcrypt.compare + JWT sign
     ├── /csrf-token ───── crypto.randomBytes(32)
     ├── /ordens_producao ─ authMiddleware + roleMiddleware
     ├── /materiais ─────── authMiddleware + roleMiddleware
     ├── /usuarios ──────── authMiddleware + roleMiddleware(['admin'])
     ├── /logs ──────────── authMiddleware + roleMiddleware(['admin','pcp'])
     └── ...
     │
     ▼
[ MySQL — Pool de Conexões (max: 10) ]
     │
     └── Prepared Statements (proteção contra SQL Injection)
     └── Tabela logs_sistema (auditoria completa)
```

---

## Interface e Design

- **Tema Dark profissional** com paleta blue-slate e variáveis CSS customizáveis
- **Glassmorphism** com efeitos de backdrop-blur nos headers sticky
- **Layout responsivo** com 3 breakpoints (desktop, tablet ≤768px, mobile ≤480px)
- **Badges coloridos** para identificação visual de status e módulos
- **Animações suaves** com transições cubic-bezier e efeitos de hover
- **Impressão otimizada** com estilos dedicados para A4/PDF (`@media print`)
- **Avatares** com iniciais do usuário e gradiente
- **Toast notifications** para feedback de ações sem expor dados sensíveis
- **Stepper visual** para acompanhamento de progresso de OPs
- **Drag & Drop** para importação de arquivos XML/PDF de NF-e

---

## Destaques Técnicos

- **Sem frameworks de frontend** — HTML, CSS e JS puros com design system próprio
- **Segurança em camadas** — JWT + CSRF + bcrypt + Rate Limiting + RBAC + Prepared Statements
- **6 perfis de acesso** com controle granular por endpoint e visibilidade de módulos
- **Trilha de auditoria completa** — cada operação registrada com usuário, módulo, ação e timestamp
- **Numeração automática de OP** — sequencial por ano (ex: `OP-0001/2026`)
- **Cálculo dinâmico de BOM** — calcula automaticamente todos os insumos e custos por quantidade
- **Importação inteligente de NF-e** — parsing de XML e PDF com vinculação por similaridade
- **Auto-migration** — tabelas criadas e atualizadas automaticamente na inicialização do servidor
- **Suporte a HTTPS** — certificados SSL configuráveis via variáveis de ambiente

---

## Solução de Problemas

**Erro de conexão com MySQL**
```bash
# Verifique se o MySQL está rodando
mysql -u root -p -e "SELECT 1"
# Confirme as credenciais no arquivo .env
```

**Porta já em uso (Windows)**
```bash
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

**Módulos não encontrados**
```bash
cd API
rm -rf node_modules
npm install
```

**JWT_SECRET não configurado**
```
# Se aparecer warning no console, defina o JWT_SECRET no .env
JWT_SECRET=uma_chave_secreta_longa_e_segura
```

---

## Autor

Desenvolvido por **Anderson Sturk**

[![GitHub](https://img.shields.io/badge/GitHub-AndersonSturk-181717?style=flat&logo=github)](https://github.com/AndersonSturk)

---

<div align="center">
  <sub>Sistema PCP v1.1 — 2026</sub>
</div>
