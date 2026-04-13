const db = require("./db");

const rawItems = [
  { codigo_produto: "MAT-001", descricao: "Parafuso M4 x 12mm", descricao_detalhada: "Parafuso sextavado de aço zincado para fixação geral em estruturas leves.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "FastFix", custo_fornecedor: 0.15, qtde_embalagem: 100, estoque: 320, estoque_minimo: 50 },
  { codigo_produto: "MAT-002", descricao: "Parafuso M4 x 16mm", descricao_detalhada: "Parafuso sextavado com revestimento anticorrosivo, usado em painéis e chapas metálicas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "FastFix", custo_fornecedor: 0.17, qtde_embalagem: 100, estoque: 240, estoque_minimo: 40 },
  { codigo_produto: "MAT-003", descricao: "Parafuso M5 x 16mm", descricao_detalhada: "Parafuso sextavado de aço inox para fixações elétricas e mecânicas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "FixPlus", custo_fornecedor: 0.22, qtde_embalagem: 100, estoque: 180, estoque_minimo: 30 },
  { codigo_produto: "MAT-004", descricao: "Parafuso M5 x 20mm", descricao_detalhada: "Parafuso sextavado para componentes elétricos e trilhos de montagem.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "FixPlus", custo_fornecedor: 0.25, qtde_embalagem: 100, estoque: 150, estoque_minimo: 30 },
  { codigo_produto: "MAT-005", descricao: "Parafuso M6 x 20mm", descricao_detalhada: "Parafuso sextavado de alta resistência para fixação de suportes estruturais.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "TitanBolt", custo_fornecedor: 0.35, qtde_embalagem: 50, estoque: 140, estoque_minimo: 20 },
  { codigo_produto: "MAT-006", descricao: "Parafuso M8 x 25mm", descricao_detalhada: "Parafuso sextavado para montagem de estruturas metálicas e mesas de distribuição.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.70, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "TitanBolt", custo_fornecedor: 0.65, qtde_embalagem: 50, estoque: 120, estoque_minimo: 20 },
  { codigo_produto: "MAT-007", descricao: "Porca M4", descricao_detalhada: "Porca sextavada de aço zincado para fixação de parafusos M4.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Porcas", situacao: "ativo", marca: "NutPro", custo_fornecedor: 0.08, qtde_embalagem: 100, estoque: 420, estoque_minimo: 50 },
  { codigo_produto: "MAT-008", descricao: "Porca M5", descricao_detalhada: "Porca sextavada de aço zincado para uso em fixações elétricas e mecânicas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Porcas", situacao: "ativo", marca: "NutPro", custo_fornecedor: 0.10, qtde_embalagem: 100, estoque: 360, estoque_minimo: 40 },
  { codigo_produto: "MAT-009", descricao: "Porca M6", descricao_detalhada: "Porca sextavada de aço inox para fixações estruturais com maior resistência.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Porcas", situacao: "ativo", marca: "NutPro", custo_fornecedor: 0.18, qtde_embalagem: 100, estoque: 300, estoque_minimo: 35 },
  { codigo_produto: "MAT-010", descricao: "Porca M8", descricao_detalhada: "Porca sextavada de aço para fixações pesadas em painéis e caixas metálicas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Porcas", situacao: "ativo", marca: "NutPro", custo_fornecedor: 0.25, qtde_embalagem: 50, estoque: 220, estoque_minimo: 25 },
  { codigo_produto: "MAT-011", descricao: "Arruela M4", descricao_detalhada: "Arruela plana de aço para distribuição de carga em fixações M4.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Arruelas", situacao: "ativo", marca: "WashMax", custo_fornecedor: 0.05, qtde_embalagem: 100, estoque: 380, estoque_minimo: 40 },
  { codigo_produto: "MAT-012", descricao: "Arruela M5", descricao_detalhada: "Arruela plana para parafusos M5, usada em chapeamentos e painéis.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Arruelas", situacao: "ativo", marca: "WashMax", custo_fornecedor: 0.06, qtde_embalagem: 100, estoque: 340, estoque_minimo: 40 },
  { codigo_produto: "MAT-013", descricao: "Arruela M6", descricao_detalhada: "Arruela de apoio para fixações M6 em estruturas metálicas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Arruelas", situacao: "ativo", marca: "WashMax", custo_fornecedor: 0.08, qtde_embalagem: 100, estoque: 300, estoque_minimo: 35 },
  { codigo_produto: "MAT-014", descricao: "Arruela M8", descricao_detalhada: "Arruela de aço para parafusos M8, indicada para aplicações pesadas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Arruelas", situacao: "ativo", marca: "WashMax", custo_fornecedor: 0.12, qtde_embalagem: 100, estoque: 260, estoque_minimo: 30 },
  { codigo_produto: "MAT-015", descricao: "Bucha nylon 8mm", descricao_detalhada: "Bucha de expansão em nylon para fixação em paredes de alvenaria.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Fixação", subgrupo: "Buchas", situacao: "ativo", marca: "FixWall", custo_fornecedor: 0.18, qtde_embalagem: 50, estoque: 210, estoque_minimo: 25 },
  { codigo_produto: "MAT-016", descricao: "Bucha nylon 10mm", descricao_detalhada: "Bucha de nylon para parafusos M6 e M8 em aplicações diversas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Fixação", subgrupo: "Buchas", situacao: "ativo", marca: "FixWall", custo_fornecedor: 0.22, qtde_embalagem: 50, estoque: 190, estoque_minimo: 25 },
  { codigo_produto: "MAT-017", descricao: "Abraçadeira plástica 100mm", descricao_detalhada: "Abraçadeira para fixação de cabos e tubulações em painéis elétricos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Abraçadeiras", situacao: "ativo", marca: "CableTie", custo_fornecedor: 0.08, qtde_embalagem: 100, estoque: 500, estoque_minimo: 60 },
  { codigo_produto: "MAT-018", descricao: "Abraçadeira metálica 150mm", descricao_detalhada: "Abraçadeira de metal para fixação firme de cabos e dutos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Abraçadeiras", situacao: "ativo", marca: "CableTie", custo_fornecedor: 0.22, qtde_embalagem: 50, estoque: 200, estoque_minimo: 30 },
  { codigo_produto: "MAT-019", descricao: "Haste roscada M6 1m", descricao_detalhada: "Haste roscada de aço para montagem de estruturas e suportes ajustáveis.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Estrutura", subgrupo: "Hastes", situacao: "ativo", marca: "ThreadRod", custo_fornecedor: 1.50, qtde_embalagem: 10, estoque: 80, estoque_minimo: 10 },
  { codigo_produto: "MAT-020", descricao: "Haste roscada M8 1m", descricao_detalhada: "Haste roscada para suportes estruturais com carga média.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Estrutura", subgrupo: "Hastes", situacao: "ativo", marca: "ThreadRod", custo_fornecedor: 2.50, qtde_embalagem: 10, estoque: 65, estoque_minimo: 10 },
  { codigo_produto: "MAT-021", descricao: "Terminal faston 6.3mm", descricao_detalhada: "Terminal macho Faston para conexões rápidas em cabos elétricos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Elétrica", subgrupo: "Terminais", situacao: "ativo", marca: "ElecConn", custo_fornecedor: 0.12, qtde_embalagem: 100, estoque: 400, estoque_minimo: 60 },
  { codigo_produto: "MAT-022", descricao: "Terminal ring 6mm", descricao_detalhada: "Terminal anelar para conexão segura de cabos em bornes.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Elétrica", subgrupo: "Terminais", situacao: "ativo", marca: "ElecConn", custo_fornecedor: 0.14, qtde_embalagem: 100, estoque: 360, estoque_minimo: 60 },
  { codigo_produto: "MAT-023", descricao: "Terminal isolado 2.8mm", descricao_detalhada: "Terminal isolado para conexões elétricas de baixa corrente.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Elétrica", subgrupo: "Terminais", situacao: "ativo", marca: "ElecConn", custo_fornecedor: 0.08, qtde_embalagem: 100, estoque: 420, estoque_minimo: 60 },
  { codigo_produto: "MAT-024", descricao: "Cabo flexível 2,5mm² 100m", descricao_detalhada: "Cabo flexível de cobre para instalações elétricas de média potência.", unidade_medida: "m", unidade_compra: "rol", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Cabos", situacao: "ativo", marca: "FlexWire", custo_fornecedor: 48.00, qtde_embalagem: 1, estoque: 22, estoque_minimo: 4 },
  { codigo_produto: "MAT-025", descricao: "Cabo flexível 1,5mm² 100m", descricao_detalhada: "Cabo de cobre para circuitos de baixa e média tensão.", unidade_medida: "m", unidade_compra: "rol", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Cabos", situacao: "ativo", marca: "FlexWire", custo_fornecedor: 35.00, qtde_embalagem: 1, estoque: 28, estoque_minimo: 5 },
  { codigo_produto: "MAT-026", descricao: "Fita isolante 19mm x 10m", descricao_detalhada: "Fita PVC para isolação elétrica e acabamento de emendas.", unidade_medida: "un", unidade_compra: "rol", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Acessórios", situacao: "ativo", marca: "IsoTape", custo_fornecedor: 1.20, qtde_embalagem: 10, estoque: 140, estoque_minimo: 20 },
  { codigo_produto: "MAT-027", descricao: "Fita dupla face 20mm x 5m", descricao_detalhada: "Fita adesiva dupla-face para fixação de painéis e componentes leves.", unidade_medida: "un", unidade_compra: "rol", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Acessórios", subgrupo: "Adesivos", situacao: "ativo", marca: "FixTape", custo_fornecedor: 3.50, qtde_embalagem: 10, estoque: 90, estoque_minimo: 15 },
  { codigo_produto: "MAT-028", descricao: "Conector de emenda 2 vias", descricao_detalhada: "Conector rápido para emendas elétricas de condutores unipolares.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Elétrica", subgrupo: "Conectores", situacao: "ativo", marca: "ElecLink", custo_fornecedor: 0.22, qtde_embalagem: 50, estoque: 270, estoque_minimo: 40 },
  { codigo_produto: "MAT-029", descricao: "Placa de circuito impresso 100x80mm", descricao_detalhada: "Placa de circuito impresso padrão para montagem de módulos eletrônicos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Placas", situacao: "ativo", marca: "PCBTech", custo_fornecedor: 12.00, qtde_embalagem: 10, estoque: 50, estoque_minimo: 10 },
  { codigo_produto: "MAT-030", descricao: "Soquete de lâmpada E27", descricao_detalhada: "Soquete plástico para lâmpadas E27 com conexão rápida.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Componentes", situacao: "ativo", marca: "LampPro", custo_fornecedor: 3.20, qtde_embalagem: 20, estoque: 85, estoque_minimo: 15 },
  { codigo_produto: "MAT-031", descricao: "LED 5mm branco", descricao_detalhada: "LED emissor de luz branca para sinalização e indicadores.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Elétrica", subgrupo: "Iluminação", situacao: "ativo", marca: "BrightLED", custo_fornecedor: 0.08, qtde_embalagem: 100, estoque: 600, estoque_minimo: 80 },
  { codigo_produto: "MAT-032", descricao: "Resistor 1kΩ 1/4W", descricao_detalhada: "Resistor de película de carbono para circuitos de controle e sinal.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Elétrica", subgrupo: "Resistores", situacao: "ativo", marca: "OhmLab", custo_fornecedor: 0.03, qtde_embalagem: 100, estoque: 900, estoque_minimo: 100 },
  { codigo_produto: "MAT-033", descricao: "Capacitor eletrolítico 10µF 25V", descricao_detalhada: "Capacitor eletrolítico para filtros e estabilização em fontes.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Elétrica", subgrupo: "Capacitores", situacao: "ativo", marca: "CapPro", custo_fornecedor: 0.18, qtde_embalagem: 50, estoque: 260, estoque_minimo: 30 },
  { codigo_produto: "MAT-034", descricao: "Diodo 1N4007", descricao_detalhada: "Diodo retificador geral para proteção de circuitos e fontes.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Elétrica", subgrupo: "Diodos", situacao: "ativo", marca: "DiodePro", custo_fornecedor: 0.05, qtde_embalagem: 100, estoque: 520, estoque_minimo: 60 },
  { codigo_produto: "MAT-035", descricao: "Transistor NPN BC547", descricao_detalhada: "Transistor NPN para aplicações de baixa potência e controle de carga.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Elétrica", subgrupo: "Transistores", situacao: "ativo", marca: "SemiTech", custo_fornecedor: 0.22, qtde_embalagem: 50, estoque: 180, estoque_minimo: 25 },
  { codigo_produto: "MAT-036", descricao: "Relé 12V 8A", descricao_detalhada: "Relé de potência para acionamento de motores e cargas elétricas.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Relés", situacao: "ativo", marca: "SwitchTec", custo_fornecedor: 8.80, qtde_embalagem: 10, estoque: 60, estoque_minimo: 10 },
  { codigo_produto: "MAT-037", descricao: "Sensor PIR de presença", descricao_detalhada: "Sensor de movimento para controle automático de iluminação e alarmes.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Sensores", situacao: "ativo", marca: "SensePro", custo_fornecedor: 15.50, qtde_embalagem: 5, estoque: 30, estoque_minimo: 5 },
  { codigo_produto: "MAT-038", descricao: "Borne terminal 3 polos", descricao_detalhada: "Borne para distribuição de energia e conectividade em painéis.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Bornes", situacao: "ativo", marca: "TermiLink", custo_fornecedor: 1.60, qtde_embalagem: 10, estoque: 120, estoque_minimo: 20 },
  { codigo_produto: "MAT-039", descricao: "Fusível 5A 250V", descricao_detalhada: "Fusível lente de 5A para proteção de circuitos elétricos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Elétrica", subgrupo: "Proteção", situacao: "ativo", marca: "SafeFuse", custo_fornecedor: 0.40, qtde_embalagem: 50, estoque: 140, estoque_minimo: 25 },
  { codigo_produto: "MAT-040", descricao: "Botão pulsador NA", descricao_detalhada: "Botão normalmente aberto para comandos manuais em painéis.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Comandos", situacao: "ativo", marca: "PushTec", custo_fornecedor: 2.00, qtde_embalagem: 10, estoque: 100, estoque_minimo: 15 },
  { codigo_produto: "MAT-041", descricao: "Chave seletora 3 posições", descricao_detalhada: "Chave para seleção de modos de operação em painéis de controle.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Comandos", situacao: "ativo", marca: "SwitchTec", custo_fornecedor: 12.00, qtde_embalagem: 5, estoque: 35, estoque_minimo: 5 },
  { codigo_produto: "MAT-042", descricao: "Interruptor basculante", descricao_detalhada: "Interruptor compacto para liga/desliga de equipamentos e iluminação.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Comandos", situacao: "ativo", marca: "SwitchTec", custo_fornecedor: 4.50, qtde_embalagem: 10, estoque: 75, estoque_minimo: 15 },
  { codigo_produto: "MAT-043", descricao: "Suporte plástico L 50x50", descricao_detalhada: "Suporte plástico para fixação de painéis e módulos leves.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Estrutura", subgrupo: "Suportes", situacao: "ativo", marca: "StructPro", custo_fornecedor: 2.20, qtde_embalagem: 10, estoque: 110, estoque_minimo: 20 },
  { codigo_produto: "MAT-044", descricao: "Perfil alumínio 20x20mm 1m", descricao_detalhada: "Perfil de alumínio para perfis de montagem e limites estruturais.", unidade_medida: "m", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Estrutura", subgrupo: "Perfis", situacao: "ativo", marca: "AluLine", custo_fornecedor: 18.00, qtde_embalagem: 1, estoque: 22, estoque_minimo: 5 },
  { codigo_produto: "MAT-045", descricao: "Cantoneira metálica 40x40mm", descricao_detalhada: "Cantoneira de aço para junção de perfis e reforços estruturais.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.70, tipo: "insumo", grupo: "Estrutura", subgrupo: "Cantoneiras", situacao: "ativo", marca: "StructPro", custo_fornecedor: 4.80, qtde_embalagem: 10, estoque: 60, estoque_minimo: 10 },
  { codigo_produto: "MAT-046", descricao: "Parafuso autoatarraxante 4,2 x 19mm", descricao_detalhada: "Parafuso autoatarraxante para fixação de chapas e perfis plásticos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Fixação", subgrupo: "Parafusos", situacao: "ativo", marca: "FastFix", custo_fornecedor: 0.13, qtde_embalagem: 100, estoque: 280, estoque_minimo: 40 },
  { codigo_produto: "MAT-047", descricao: "Porca de pressão M4", descricao_detalhada: "Porca de pressão que evita desaperto em montagens vibratórias.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.10, tipo: "insumo", grupo: "Fixação", subgrupo: "Porcas", situacao: "ativo", marca: "NutPro", custo_fornecedor: 0.18, qtde_embalagem: 100, estoque: 210, estoque_minimo: 30 },
  { codigo_produto: "MAT-048", descricao: "Bucha de fixação 6mm", descricao_detalhada: "Bucha para fixação de suportes em superfícies ocas e drywall.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Fixação", subgrupo: "Buchas", situacao: "ativo", marca: "FixWall", custo_fornecedor: 0.20, qtde_embalagem: 50, estoque: 170, estoque_minimo: 25 },
  { codigo_produto: "MAT-049", descricao: "Pino elástico 4mm x 20mm", descricao_detalhada: "Pino elástico para travamento de eixos e componentes móveis.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Fixação", subgrupo: "Pinos", situacao: "ativo", marca: "PinLock", custo_fornecedor: 0.30, qtde_embalagem: 50, estoque: 95, estoque_minimo: 10 },
  { codigo_produto: "MAT-050", descricao: "Prendedor de cabo", descricao_detalhada: "Prendedor de nylon para organizar cabos em painéis e máquinas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.30, tipo: "insumo", grupo: "Fixação", subgrupo: "Acessórios", situacao: "ativo", marca: "CableTie", custo_fornecedor: 0.12, qtde_embalagem: 100, estoque: 420, estoque_minimo: 60 },
  { codigo_produto: "MAT-051", descricao: "Cola estrutural 50g", descricao_detalhada: "Adesivo de alta resistência para fixação complementar de peças.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Acessórios", subgrupo: "Adesivos", situacao: "ativo", marca: "AdheFix", custo_fornecedor: 5.20, qtde_embalagem: 10, estoque: 45, estoque_minimo: 10 },
  { codigo_produto: "MAT-052", descricao: "Verniz isolante 100mL", descricao_detalhada: "Verniz isolante para proteção de placas eletrônicas contra umidade.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Acessórios", situacao: "ativo", marca: "IsoCoat", custo_fornecedor: 12.00, qtde_embalagem: 5, estoque: 18, estoque_minimo: 5 },
  { codigo_produto: "MAT-053", descricao: "Tinta spray preta 400mL", descricao_detalhada: "Tinta spray para acabamento de caixas e placas externas.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "insumo", grupo: "Acessórios", subgrupo: "Acabamento", situacao: "ativo", marca: "PaintPro", custo_fornecedor: 18.00, qtde_embalagem: 1, estoque: 30, estoque_minimo: 5 },
  { codigo_produto: "MAT-054", descricao: "Etiqueta autoadesiva 50x20mm", descricao_detalhada: "Etiqueta branca para identificação de cabos, painéis e componentes.", unidade_medida: "un", unidade_compra: "rol", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Acessórios", subgrupo: "Identificação", situacao: "ativo", marca: "LabelPro", custo_fornecedor: 4.00, qtde_embalagem: 20, estoque: 80, estoque_minimo: 15 },
  { codigo_produto: "MAT-055", descricao: "Placa frontal 200x150mm", descricao_detalhada: "Placa frontal de aço para montagem de botões e interfaces.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Estrutura", subgrupo: "Placas", situacao: "ativo", marca: "PanelTech", custo_fornecedor: 22.00, qtde_embalagem: 5, estoque: 24, estoque_minimo: 5 },
  { codigo_produto: "MAT-056", descricao: "Tampa plástica 120x80mm", descricao_detalhada: "Tampa plástica para caixas de junção e painéis elétricos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Estrutura", subgrupo: "Caixas", situacao: "ativo", marca: "PanelTech", custo_fornecedor: 10.50, qtde_embalagem: 5, estoque: 22, estoque_minimo: 5 },
  { codigo_produto: "MAT-057", descricao: "Base para circuito 120x70mm", descricao_detalhada: "Base plástica para fixação de placas de circuito e módulos eletrônicos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Estrutura", subgrupo: "Bases", situacao: "ativo", marca: "PanelTech", custo_fornecedor: 8.00, qtde_embalagem: 5, estoque: 26, estoque_minimo: 5 },
  { codigo_produto: "MAT-058", descricao: "Suporte de parede 200x40mm", descricao_detalhada: "Suporte metálico para fixação de painéis e equipamentos leves na parede.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 0.70, tipo: "insumo", grupo: "Estrutura", subgrupo: "Suportes", situacao: "ativo", marca: "StructPro", custo_fornecedor: 6.80, qtde_embalagem: 5, estoque: 34, estoque_minimo: 7 },
  { codigo_produto: "MAT-059", descricao: "Anel de vedação O-ring 20mm", descricao_detalhada: "O-ring de borracha para vedação em caixas e passagens de cabos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.50, tipo: "insumo", grupo: "Acessórios", subgrupo: "Vedação", situacao: "ativo", marca: "SealPro", custo_fornecedor: 0.20, qtde_embalagem: 100, estoque: 180, estoque_minimo: 25 },
  { codigo_produto: "MAT-060", descricao: "Bucha metálica M6", descricao_detalhada: "Bucha metálica para roscas e fixações robustas em chapas.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 0.20, tipo: "insumo", grupo: "Fixação", subgrupo: "Buchas", situacao: "ativo", marca: "FixWall", custo_fornecedor: 0.35, qtde_embalagem: 50, estoque: 155, estoque_minimo: 25 },
  { codigo_produto: "MAT-061", descricao: "Barra de cobre 10x5mm 1m", descricao_detalhada: "Barra de cobre para trilhos de aterramento e conexões elétricas.", unidade_medida: "m", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Condutores", situacao: "ativo", marca: "CopperLine", custo_fornecedor: 28.00, qtde_embalagem: 1, estoque: 12, estoque_minimo: 3 },
  { codigo_produto: "MAT-062", descricao: "Filtro EMI 3 polos", descricao_detalhada: "Filtro EMI para redução de interferência em linhas de alimentação.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Filtros", situacao: "ativo", marca: "ShieldTec", custo_fornecedor: 14.00, qtde_embalagem: 5, estoque: 20, estoque_minimo: 5 },
  { codigo_produto: "MAT-063", descricao: "Transformador 12V 2A", descricao_detalhada: "Transformador encapsulado para alimentação de dispositivos 12V.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Fontes", situacao: "ativo", marca: "PowerLine", custo_fornecedor: 28.00, qtde_embalagem: 1, estoque: 18, estoque_minimo: 5 },
  { codigo_produto: "MAT-064", descricao: "Fonte chaveada 12V 3A", descricao_detalhada: "Fonte chaveada compacta para painéis de comando e automação.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Fontes", situacao: "ativo", marca: "PowerLine", custo_fornecedor: 45.00, qtde_embalagem: 1, estoque: 12, estoque_minimo: 3 },
  { codigo_produto: "MAT-065", descricao: "Display LCD 16x2", descricao_detalhada: "Display LCD para interfaces de controle e visualização simples.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "insumo", grupo: "Elétrica", subgrupo: "Displays", situacao: "ativo", marca: "DisplayPro", custo_fornecedor: 12.50, qtde_embalagem: 5, estoque: 23, estoque_minimo: 5 },
  { codigo_produto: "MAT-066", descricao: "Potenciômetro 10k", descricao_detalhada: "Potenciômetro rotativo para ajuste de volumes e sinais analógicos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Comandos", situacao: "ativo", marca: "TuneTec", custo_fornecedor: 3.00, qtde_embalagem: 10, estoque: 50, estoque_minimo: 10 },
  { codigo_produto: "MAT-067", descricao: "Bobina para solenóide", descricao_detalhada: "Bobina de fio esmaltado para montagem de solenóides e indutores.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Bobinas", situacao: "ativo", marca: "Inducto", custo_fornecedor: 18.00, qtde_embalagem: 5, estoque: 20, estoque_minimo: 5 },
  { codigo_produto: "MAT-068", descricao: "Sensor magnético reed", descricao_detalhada: "Sensor reed de contato magnético para detecção de portas e eixos.", unidade_medida: "un", unidade_compra: "cx", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Sensores", situacao: "ativo", marca: "SensePro", custo_fornecedor: 4.50, qtde_embalagem: 20, estoque: 38, estoque_minimo: 8 },
  { codigo_produto: "MAT-069", descricao: "Ventoinha 12V 60x60mm", descricao_detalhada: "Ventoinha para refrigeração de painéis e eletrônicos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Refrigeração", situacao: "ativo", marca: "CoolAir", custo_fornecedor: 18.00, qtde_embalagem: 5, estoque: 20, estoque_minimo: 5 },
  { codigo_produto: "MAT-070", descricao: "Tubo termorretrátil 6mm 1m", descricao_detalhada: "Tubo termorretrátil para isolamento e proteção de emendas elétricas.", unidade_medida: "m", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "insumo", grupo: "Elétrica", subgrupo: "Acessórios", situacao: "ativo", marca: "HeatTube", custo_fornecedor: 1.20, qtde_embalagem: 1, estoque: 75, estoque_minimo: 10 }
];

const producedItems = [
  { codigo_produto: "PRD-001", descricao: "Kit de Fixação Rápida", descricao_detalhada: "Conjunto de parafusos, porcas e arruelas para montagem rápida de suportes e estruturas.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "ProdKit", custo_fornecedor: 12.50, qtde_embalagem: 1, estoque: 18, estoque_minimo: 5, insumos: [
      { codigo: "MAT-001", descricao: "Parafuso M4 x 12mm", quantidade: 12, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-007", descricao: "Porca M4", quantidade: 12, unidade_medida: "un", percentual_perda: 0.10 },
      { codigo: "MAT-011", descricao: "Arruela M4", quantidade: 12, unidade_medida: "un", percentual_perda: 0.10 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 4, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-002", descricao: "Conjunto de Suporte Elétrico", descricao_detalhada: "Suporte elétrico pré-montado para painéis com terminais, cabo e proteção básica.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Suportes", situacao: "ativo", marca: "ProdKit", custo_fornecedor: 36.40, qtde_embalagem: 1, estoque: 12, estoque_minimo: 3, insumos: [
      { codigo: "MAT-005", descricao: "Parafuso M6 x 20mm", quantidade: 6, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-026", descricao: "Fita isolante 19mm x 10m", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 6, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-003", descricao: "Painel de Controle Modular", descricao_detalhada: "Painel modular para controle elétrico com bornes, relé e display.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Painéis", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 92.75, qtde_embalagem: 1, estoque: 8, estoque_minimo: 2, insumos: [
      { codigo: "MAT-029", descricao: "Placa de circuito impresso 100x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-036", descricao: "Relé 12V 8A", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-065", descricao: "Display LCD 16x2", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-041", descricao: "Chave seletora 3 posições", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-004", descricao: "Caixa de Distribuição Elétrica", descricao_detalhada: "Caixa completa para distribuição de circuitos com bornes e proteção.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Caixas", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 54.90, qtde_embalagem: 1, estoque: 10, estoque_minimo: 3, insumos: [
      { codigo: "MAT-056", descricao: "Tampa plástica 120x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 8, unidade_medida: "un", percentual_perda: 0.30 }
    ] },
  { codigo_produto: "PRD-005", descricao: "Base de Montagem para Placa", descricao_detalhada: "Base plástica para montagem segura de módulos eletrônicos e placas de circuito.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Bases", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 19.00, qtde_embalagem: 1, estoque: 20, estoque_minimo: 5, insumos: [
      { codigo: "MAT-057", descricao: "Base para circuito 120x70mm", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-011", descricao: "Arruela M4", quantidade: 4, unidade_medida: "un", percentual_perda: 0.10 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-006", descricao: "Montagem de Sensor PIR", descricao_detalhada: "Montagem completa de controle de presença com sensor PIR e fixações.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Montagens", situacao: "ativo", marca: "SensePro", custo_fornecedor: 39.20, qtde_embalagem: 1, estoque: 12, estoque_minimo: 4, insumos: [
      { codigo: "MAT-037", descricao: "Sensor PIR de presença", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-026", descricao: "Fita isolante 19mm x 10m", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-043", descricao: "Suporte plástico L 50x50", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-007", descricao: "Painel Frontal com Display", descricao_detalhada: "Painel frontal montado com display, botões e identificação de circuitos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Painéis", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 66.00, qtde_embalagem: 1, estoque: 10, estoque_minimo: 3, insumos: [
      { codigo: "MAT-065", descricao: "Display LCD 16x2", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-040", descricao: "Botão pulsador NA", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-054", descricao: "Etiqueta autoadesiva 50x20mm", quantidade: 5, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-008", descricao: "Painel de Comando com Relé", descricao_detalhada: "Painel de comando completo com relé de proteção e chave seletora.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Painéis", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 78.90, qtde_embalagem: 1, estoque: 8, estoque_minimo: 2, insumos: [
      { codigo: "MAT-036", descricao: "Relé 12V 8A", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-041", descricao: "Chave seletora 3 posições", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-042", descricao: "Interruptor basculante", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-009", descricao: "Kit de Acabamento Industrial", descricao_detalhada: "Kit para acabamento de caixas e painéis com parafusos, tampas e etiquetas.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "ProdKit", custo_fornecedor: 22.50, qtde_embalagem: 1, estoque: 15, estoque_minimo: 5, insumos: [
      { codigo: "MAT-055", descricao: "Placa frontal 200x150mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-056", descricao: "Tampa plástica 120x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-054", descricao: "Etiqueta autoadesiva 50x20mm", quantidade: 10, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-010", descricao: "Conjunto de Trilho e Suporte", descricao_detalhada: "Conjunto de trilho e suportes para montagem de painéis e quadros elétricos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Estrutura", situacao: "ativo", marca: "StructPro", custo_fornecedor: 31.50, qtde_embalagem: 1, estoque: 14, estoque_minimo: 4, insumos: [
      { codigo: "MAT-043", descricao: "Suporte plástico L 50x50", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-044", descricao: "Perfil alumínio 20x20mm 1m", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-046", descricao: "Parafuso autoatarraxante 4,2 x 19mm", quantidade: 8, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-011", descricao: "Montagem de Terminais e Cabos", descricao_detalhada: "Montagem pronta com terminais, cabos e abraçadeiras para quadros de distribuição.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Montagens", situacao: "ativo", marca: "CableKit", custo_fornecedor: 42.70, qtde_embalagem: 1, estoque: 11, estoque_minimo: 3, insumos: [
      { codigo: "MAT-023", descricao: "Terminal isolado 2.8mm", quantidade: 20, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-024", descricao: "Cabo flexível 2,5mm² 100m", quantidade: 1, unidade_medida: "m", percentual_perda: 1.00 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 6, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-012", descricao: "Kit de Conectores Elétricos", descricao_detalhada: "Kit com conectores múltiplos para montagem rápida de cabos em painéis.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "ElecLink", custo_fornecedor: 18.90, qtde_embalagem: 1, estoque: 16, estoque_minimo: 5, insumos: [
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 15, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 4, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-013", descricao: "Conjunto de Proteção EMI", descricao_detalhada: "Conjunto com filtro EMI e componentes para reduzir interferências em sinais.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Proteção", situacao: "ativo", marca: "ShieldTec", custo_fornecedor: 30.00, qtde_embalagem: 1, estoque: 12, estoque_minimo: 3, insumos: [
      { codigo: "MAT-062", descricao: "Filtro EMI 3 polos", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-024", descricao: "Cabo flexível 2,5mm² 100m", quantidade: 1, unidade_medida: "m", percentual_perda: 1.00 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 4, unidade_medida: "un", percentual_perda: 0.30 }
    ] },
  { codigo_produto: "PRD-014", descricao: "Suporte de Alumínio com Fixadores", descricao_detalhada: "Suporte de alumínio completo com fixadores para montagem de painéis.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Suportes", situacao: "ativo", marca: "StructPro", custo_fornecedor: 24.00, qtde_embalagem: 1, estoque: 14, estoque_minimo: 4, insumos: [
      { codigo: "MAT-044", descricao: "Perfil alumínio 20x20mm 1m", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-046", descricao: "Parafuso autoatarraxante 4,2 x 19mm", quantidade: 10, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-045", descricao: "Cantoneira metálica 40x40mm", quantidade: 2, unidade_medida: "un", percentual_perda: 0.70 }
    ] },
  { codigo_produto: "PRD-015", descricao: "Montagem de Iluminação LED", descricao_detalhada: "Montagem de luminária LED com suporte e dissipação térmica.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Iluminação", situacao: "ativo", marca: "BrightLED", custo_fornecedor: 43.40, qtde_embalagem: 1, estoque: 16, estoque_minimo: 4, insumos: [
      { codigo: "MAT-031", descricao: "LED 5mm branco", quantidade: 8, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-065", descricao: "Display LCD 16x2", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-043", descricao: "Suporte plástico L 50x50", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-016", descricao: "Kit de Aviso Visual", descricao_detalhada: "Kit com LED, botão e etiqueta para sinalização de painel.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 1.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "BrightLED", custo_fornecedor: 16.20, qtde_embalagem: 1, estoque: 20, estoque_minimo: 6, insumos: [
      { codigo: "MAT-031", descricao: "LED 5mm branco", quantidade: 4, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-040", descricao: "Botão pulsador NA", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-054", descricao: "Etiqueta autoadesiva 50x20mm", quantidade: 3, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-017", descricao: "Montagem de Controle de Motor", descricao_detalhada: "Montagem elétrica para controle e acionamento de motores com proteção.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Montagens", situacao: "ativo", marca: "MotorControl", custo_fornecedor: 68.80, qtde_embalagem: 1, estoque: 7, estoque_minimo: 2, insumos: [
      { codigo: "MAT-036", descricao: "Relé 12V 8A", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-042", descricao: "Interruptor basculante", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-018", descricao: "Painel de Distribuição Residencial", descricao_detalhada: "Painel de distribuição com bornes e fusíveis para instalações residenciais.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Painéis", situacao: "ativo", marca: "HomePanel", custo_fornecedor: 49.60, qtde_embalagem: 1, estoque: 11, estoque_minimo: 4, insumos: [
      { codigo: "MAT-039", descricao: "Fusível 5A 250V", quantidade: 5, unidade_medida: "un", percentual_perda: 0.20 },
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-056", descricao: "Tampa plástica 120x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-019", descricao: "Conjunto de Medição e Indicação", descricao_detalhada: "Conjunto pronto para medições de tensão com display e bornes de entrada.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Medidores", situacao: "ativo", marca: "MeasurePro", custo_fornecedor: 58.90, qtde_embalagem: 1, estoque: 9, estoque_minimo: 3, insumos: [
      { codigo: "MAT-065", descricao: "Display LCD 16x2", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-032", descricao: "Resistor 1kΩ 1/4W", quantidade: 2, unidade_medida: "un", percentual_perda: 0.10 }
    ] },
  { codigo_produto: "PRD-020", descricao: "Caixa de Terminal com Suporte", descricao_detalhada: "Caixa de terminais pronta com suporte interno para instalação de painéis.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Caixas", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 27.40, qtde_embalagem: 1, estoque: 13, estoque_minimo: 4, insumos: [
      { codigo: "MAT-056", descricao: "Tampa plástica 120x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-043", descricao: "Suporte plástico L 50x50", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 6, unidade_medida: "un", percentual_perda: 0.30 }
    ] },
  { codigo_produto: "PRD-021", descricao: "Montagem de Interface Homem-Máquina", descricao_detalhada: "Interface HMI pronta com display, controle e identificação de painel.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Interfaces", situacao: "ativo", marca: "HMIPlus", custo_fornecedor: 72.80, qtde_embalagem: 1, estoque: 6, estoque_minimo: 2, insumos: [
      { codigo: "MAT-065", descricao: "Display LCD 16x2", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 },
      { codigo: "MAT-041", descricao: "Chave seletora 3 posições", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-032", descricao: "Resistor 1kΩ 1/4W", quantidade: 2, unidade_medida: "un", percentual_perda: 0.10 }
    ] },
  { codigo_produto: "PRD-022", descricao: "Kit Montagem de Iluminação de Emergência", descricao_detalhada: "Kit com componentes de iluminação de emergência e fixação.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "BrightLED", custo_fornecedor: 31.90, qtde_embalagem: 1, estoque: 14, estoque_minimo: 5, insumos: [
      { codigo: "MAT-031", descricao: "LED 5mm branco", quantidade: 6, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-036", descricao: "Relé 12V 8A", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-023", descricao: "Painel de Comando Compacto", descricao_detalhada: "Painel compacto para comandos de motores e iluminação com fixações.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Painéis", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 61.30, qtde_embalagem: 1, estoque: 7, estoque_minimo: 2, insumos: [
      { codigo: "MAT-042", descricao: "Interruptor basculante", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-036", descricao: "Relé 12V 8A", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-055", descricao: "Placa frontal 200x150mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-024", descricao: "Conjunto de Fixação para Placas", descricao_detalhada: "Conjunto completo para fixação de placas de circuito em painéis.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 20.20, qtde_embalagem: 1, estoque: 16, estoque_minimo: 4, insumos: [
      { codigo: "MAT-011", descricao: "Arruela M4", quantidade: 4, unidade_medida: "un", percentual_perda: 0.10 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 4, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-029", descricao: "Placa de circuito impresso 100x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 }
    ] },
  { codigo_produto: "PRD-025", descricao: "Montagem de Borne e Terminal", descricao_detalhada: "Montagem com bornes e terminais para distribuição de alimentação.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Montagens", situacao: "ativo", marca: "CableKit", custo_fornecedor: 28.50, qtde_embalagem: 1, estoque: 12, estoque_minimo: 4, insumos: [
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 6, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-017", descricao: "Abraçadeira plástica 100mm", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-026", descricao: "Kit de Manutenção Elétrica", descricao_detalhada: "Kit com itens de manutenção elétrica para suporte rápido de painéis.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "ServiceKit", custo_fornecedor: 27.80, qtde_embalagem: 1, estoque: 17, estoque_minimo: 5, insumos: [
      { codigo: "MAT-001", descricao: "Parafuso M4 x 12mm", quantidade: 20, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-007", descricao: "Porca M4", quantidade: 20, unidade_medida: "un", percentual_perda: 0.10 },
      { codigo: "MAT-054", descricao: "Etiqueta autoadesiva 50x20mm", quantidade: 5, unidade_medida: "un", percentual_perda: 1.00 }
    ] },
  { codigo_produto: "PRD-027", descricao: "Conjunto de Conectores de Energia", descricao_detalhada: "Conjunto com conector, cabo e bornes para alimentação de máquinas.", unidade_medida: "kit", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Kits", situacao: "ativo", marca: "PowerLink", custo_fornecedor: 34.70, qtde_embalagem: 1, estoque: 12, estoque_minimo: 4, insumos: [
      { codigo: "MAT-024", descricao: "Cabo flexível 2,5mm² 100m", quantidade: 2, unidade_medida: "m", percentual_perda: 1.00 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 6, unidade_medida: "un", percentual_perda: 0.30 },
      { codigo: "MAT-038", descricao: "Borne terminal 3 polos", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 }
    ] },
  { codigo_produto: "PRD-028", descricao: "Painel Modular de Automação", descricao_detalhada: "Painel modular com chave, relé e conectores para aplicações de automação.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.50, tipo: "produzido", grupo: "Produto Final", subgrupo: "Painéis", situacao: "ativo", marca: "AutoPanel", custo_fornecedor: 89.90, qtde_embalagem: 1, estoque: 6, estoque_minimo: 2, insumos: [
      { codigo: "MAT-036", descricao: "Relé 12V 8A", quantidade: 2, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-041", descricao: "Chave seletora 3 posições", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-065", descricao: "Display LCD 16x2", quantidade: 1, unidade_medida: "un", percentual_perda: 1.50 }
    ] },
  { codigo_produto: "PRD-029", descricao: "Caixa de Terminal com Suporte", descricao_detalhada: "Caixa pronta com suporte interno para terminais elétricos.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Caixas", situacao: "ativo", marca: "PanelPlus", custo_fornecedor: 29.40, qtde_embalagem: 1, estoque: 10, estoque_minimo: 4, insumos: [
      { codigo: "MAT-056", descricao: "Tampa plástica 120x80mm", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-043", descricao: "Suporte plástico L 50x50", quantidade: 3, unidade_medida: "un", percentual_perda: 0.50 },
      { codigo: "MAT-028", descricao: "Conector de emenda 2 vias", quantidade: 8, unidade_medida: "un", percentual_perda: 0.30 }
    ] },
  { codigo_produto: "PRD-030", descricao: "Montagem de Sensor Magnético", descricao_detalhada: "Montagem com sensor magnético reed, cabo e suporte para monitoramento de portas.", unidade_medida: "un", unidade_compra: "pc", fator_conversao: 1, percentual_perda: 2.00, tipo: "produzido", grupo: "Produto Final", subgrupo: "Sensores", situacao: "ativo", marca: "SensePro", custo_fornecedor: 26.20, qtde_embalagem: 1, estoque: 13, estoque_minimo: 4, insumos: [
      { codigo: "MAT-068", descricao: "Sensor magnético reed", quantidade: 1, unidade_medida: "un", percentual_perda: 1.00 },
      { codigo: "MAT-024", descricao: "Cabo flexível 2,5mm² 100m", quantidade: 1, unidade_medida: "m", percentual_perda: 1.00 },
      { codigo: "MAT-043", descricao: "Suporte plástico L 50x50", quantidade: 1, unidade_medida: "un", percentual_perda: 0.50 }
    ] }
];

const insertMaterialSql = `INSERT INTO materiais
  (codigo_produto, descricao, descricao_detalhada, unidade_medida, unidade_compra, fator_conversao, percentual_perda, tipo, grupo, subgrupo, situacao, marca, custo_fornecedor, qtde_embalagem, estoque, estoque_minimo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    descricao = VALUES(descricao),
    descricao_detalhada = VALUES(descricao_detalhada),
    unidade_medida = VALUES(unidade_medida),
    unidade_compra = VALUES(unidade_compra),
    fator_conversao = VALUES(fator_conversao),
    percentual_perda = VALUES(percentual_perda),
    tipo = VALUES(tipo),
    grupo = VALUES(grupo),
    subgrupo = VALUES(subgrupo),
    situacao = VALUES(situacao),
    marca = VALUES(marca),
    custo_fornecedor = VALUES(custo_fornecedor),
    qtde_embalagem = VALUES(qtde_embalagem),
    estoque = VALUES(estoque),
    estoque_minimo = VALUES(estoque_minimo);`;

const insertFichaSql = `INSERT INTO ficha_tecnica
  (material_id, insumo_material_id, insumo_codigo, insumo_descricao, quantidade_por_unidade, unidade_medida, percentual_perda)
  VALUES (?, ?, ?, ?, ?, ?, ?);`;

async function seed() {
  console.log("Iniciando seed de materiais e fichas técnicas...");

  const materiais = [...rawItems, ...producedItems];
  for (const item of materiais) {
    await db.promise().execute(insertMaterialSql, [
      item.codigo_produto,
      item.descricao,
      item.descricao_detalhada,
      item.unidade_medida,
      item.unidade_compra,
      item.fator_conversao,
      item.percentual_perda,
      item.tipo,
      item.grupo,
      item.subgrupo,
      item.situacao,
      item.marca,
      item.custo_fornecedor,
      item.qtde_embalagem,
      item.estoque,
      item.estoque_minimo,
    ]);
  }

  const [rawRows] = await db.promise().query(
    "SELECT id, codigo_produto, descricao FROM materiais WHERE codigo_produto LIKE 'MAT-%'"
  );
  const rawMap = new Map(rawRows.map((row) => [row.codigo_produto, row]));

  const [prodRows] = await db.promise().query(
    "SELECT id, codigo_produto FROM materiais WHERE codigo_produto LIKE 'PRD-%'"
  );

  const prodIds = prodRows.map((row) => row.id);
  if (prodIds.length > 0) {
    await db.promise().query(
      `DELETE FROM ficha_tecnica WHERE material_id IN (${prodIds.map(() => "?").join(",")})`,
      prodIds
    );
  }

  let totalFicha = 0;
  for (const product of producedItems) {
    const materialRow = prodRows.find((row) => row.codigo_produto === product.codigo_produto);
    if (!materialRow) continue;
    for (const insumo of product.insumos) {
      const found = rawMap.get(insumo.codigo);
      await db.promise().execute(insertFichaSql, [
        materialRow.id,
        found ? found.id : null,
        insumo.codigo,
        insumo.descricao,
        insumo.quantidade,
        insumo.unidade_medida,
        insumo.percentual_perda,
      ]);
      totalFicha += 1;
    }
  }

  console.log(`Seed concluído: ${materiais.length} materiais e ${totalFicha} insumos de ficha técnica.`);
}

seed()
  .catch((error) => {
    console.error("Erro durante o seed:", error);
    process.exit(1);
  })
  .finally(() => {
    db.end();
  });
