---
Documento: Visão de Produto & Regras de Negócio
Autor: Docs Curator
Público: Stakeholders, POs, Engenharia
Status: Em Aprovação
Data: 15/07/2026
---

# 1. Sumário Executivo
O **Virtual Office** é uma plataforma 2D interativa baseada em avatares que emula um escritório físico, permitindo interações orgânicas, comunicação por áudio/vídeo P2P (WebRTC) de proximidade e gestão de metodologias ágeis em tempo real. O produto soluciona o desgaste e a fadiga das reuniões remotas tradicionais, restaurando a espontaneidade dos "encontros no corredor".

A oportunidade reside no modelo híbrido e remoto de trabalho, que carece de ferramentas de engajamento social. A plataforma se diferencia por unir comunicação casual, lazer (Texas Hold'em, Damas) e ferramentas de produtividade robustas (Sprints, Planning Poker, Cards) num único plano virtual, rodando com latência ultrabaixa via Socket.io e WebRTC.

# 2. Contexto do Negócio
- **Cenário Atual (AS IS):** Times remotos dependem de URLs estáticas de vídeo (Google Meet/Zoom) e ferramentas assíncronas (Slack/Jira), criando silos de comunicação, fadiga de tela e distanciamento entre colegas.
- **Cenário Futuro (TO BE):** Um escritório persistente (24/7) onde a presença é contínua e visual. As pessoas "caminham" até a mesa do colega para tirar uma dúvida rápida ou sentam no lounge para jogar após o expediente, criando laços reais.

# 3. Problema de Negócio
A falta de interações não planejadas impacta negativamente a cultura organizacional e o *onboarding* de novos membros. O custo disso reflete em alto turnover, isolamento de colaboradores, lentidão na remoção de bloqueios técnicos e falta de alinhamento rápido entre Devs, QAs e POs.

# 4. Oportunidade de Mercado
Companhias "Remote First" e agências digitais que buscam retenção de talentos e aumento de produtividade. O diferencial é a "gamificação" do trabalho: não é apenas mais um software de gestão de tarefas; é um espaço metaverso leve e acessível diretamente no browser sem downloads pesados, focando em usabilidade.

# 5. Objetivos Estratégicos
| Objetivo | Resultado Esperado | Indicador |
|---|---|---|
| Aumentar engajamento do time | Redução da sensação de isolamento | Tempo médio diário logado por usuário |
| Agilizar cerimônias ágeis | Daily e Plannings centralizadas no mapa | % de sprints fechadas na própria ferramenta |
| Reduzir atrito de comunicação | Menos links criados em outras plataformas | Quantidade de aproximações de áudio P2P/dia |

# 6. Visão do Produto
**Propósito:** Tornar o trabalho remoto mais humano e conectado.
**Proposta de Valor:** Um escritório unificado onde presença, produtividade e lazer acontecem no mesmo canvas virtual.
**Diferenciais Competitivos:** Spatial Audio e Video, integração nativa de Planning Poker com mini-games (Texas Hold'em).

# 7. Público-Alvo e Personas
**Primário:** Times ágeis e squads de desenvolvimento de software (Dev, QA, PO).
- **Persona 1: PO Sênior** - Busca visibilidade e facilidade nas plannings e ritos; quer que a squad participe ativamente sem se dispersar em várias abas.
- **Persona 2: Dev Pleno/Sênior** - Odeia reuniões chatas. Gosta do aspecto gamificado e de poder bloquear o áudio quando focado, ou abrir a "War Room" quando o servidor de prod cai.

# 8. Stakeholders
| Stakeholder | Área | Interesse | Impacto |
|---|---|---|---|
| Colaboradores (Dev/QA/PO) | Operação | Comunicação fluida, sem microgerenciamento | Alto |
| CTO / Head of Eng | Diretoria | Aumento de produtividade, estabilidade | Alto |

# 9. Escopo do Produto
- **Dentro do Escopo:** Movimentação 2D, comunicação WebRTC por proximidade, Chat textual de vizinhança, Jogos em lounge, Sala de Reunião com Board de Sprint e Planning Poker.
- **Fora do Escopo:** Gestão financeira de horas, gravações de vídeo em nuvem, integração nativa direta bidirecional com o Jira cloud.

# 10. Premissas
- Os usuários acessarão via navegadores modernos com suporte a HTTPS, WebRTC e Canvas/WebGL (Chrome, Edge, Firefox, Safari).
- É necessário possuir microfone para interação social completa.

# 11. Restrições
- **Técnicas:** O getUserMedia para WebRTC exige obrigatoriamente certificado SSL (HTTPS). 
- **Infra:** Hospedado no Fly.io, utilizando uma VM básica (`shared-cpu-1x`, 256MB), com persistência simples em volume (`/data`).

# 12. Dependências
| Dependência | Tipo | Impacto |
|---|---|---|
| STUN/TURN Servers | Rede Externa | Sem eles o P2P de áudio/vídeo falhará em redes corporativas com NAT restrito. |
| Phaser 3 | Framework Front | Define as limitações de renderização. |

# 13. Funcionalidades Principais
- **Spatial Voice/Video (Histerese):** Conecta os streams quando as coordenadas estão a `< 110px`, e desconecta apenas após passarem de `160px`. Resolve o ruído, flutuação intermitente de rede e evita escuta acidental de mesas vizinhas.
- **Board Ágil e Planning Poker:** Uma sala restrita onde os votos dos POs/Devs/QAs permanecem ocultos (`·`) até que o PO autorize a virada da carta, mitigando viés de ancoragem.
- **War Room:** Recurso de comunicação broadcast de emergência (botão do pânico), acionável de qualquer lugar, sujeito a *cooldown*.
- **Mini-games do Lounge (Texas Hold'em & Damas):** Feature secundária de socialização — o
  ambiente é essencialmente um escritório de squad, os jogos ficam numa área de lounge separada e
  não competem pela tela principal (o painel abre recolhido por padrão, deixando o mapa visível).
  Hold'em roda inteiramente server-autoritativo com fichas fictícias, sem apostas reais (RN-005);
  Damas segue regras casuais brasileiras simplificadas. Valor de negócio: gera o mesmo tipo de
  vínculo social de um "happy hour" de escritório físico, sem sair da ferramenta.

# 14. Jornada de Alto Nível
`Usuário Acessa URL` → `Insere Nome, Cor e Role (Dev/QA/PO)` → `Aprova permissão de Microfone` → `Spawna no mapa` → `Anda até um colega` → `Abrem as câmeras manualmente (camOn=true)` → `Conversam P2P` → `Vão para a Sala de Reunião` → `Votam em tarefas (Planning Poker)` → `Jogam uma rodada de Damas no Lounge`.

# 15. Regras de Negócio

## RN-001 — Raio de Histerese para Comunicação (Spatial Audio)
- **Gatilho:** Movimentação dos avatares no mapa.
- **Entradas:** Coordenadas (`x`, `y`) dos jogadores locais e remotos.
- **Condições:** A conexão P2P inicia se a distância for `<= 110px`. A desconexão só acontece se a distância for `>= 160px`. O chat de texto funciona sob as mesmas regras.
- **Criticidade:** Alta. Evita "flapping" e spamming de pacotes de sinalização RTC.

## RN-002 — Permissão de Câmera Default
- **Gatilho:** Aproximação de outro jogador e início de sessão P2P.
- **Regra:** A câmera **nunca** é ativada automaticamente. Mesmo ao entrar no raio (onde o áudio liga por default), a tag `camOn` começa como `false`. O usuário sempre precisa clicar para expor a webcam por razões de privacidade.
- **Criticidade:** Alta. 

## RN-003 — Proteção contra Spam no War Room
- **Gatilho:** Clique no botão "Chamar Reunião de Emergência".
- **Regra:** Limite de *Cooldown* estrito no servidor. Após qualquer chamada de War Room, a funcionalidade entra em cooldown e não pode ser disparada novamente antes de expirar `WARROOM_COOLDOWN_MS` (30 segundos).
- **Criticidade:** Média.

## RN-004 — Ocultação do Planning Poker (Blind Voting)
- **Gatilho:** Inserção do voto de estimativa em uma Sprint Card.
- **Regra:** Enquanto `revealed: false` no backend, o servidor distribui a máscara `HIDDEN_VOTE` (`·`) para todos. Apenas quando o responsável engatilhar o *reveal*, o backend transmite a hash verdadeira de votos de volta aos clientes.
- **Criticidade:** Alta.

## RN-005 — Fichas Fictícias no Lounge (Sem Apostas Reais)
- **Gatilho:** Jogador senta na mesa de Texas Hold'em (`holdem-sit`).
- **Regra:** Buy-in fixo de fichas fictícias ao sentar (`HOLDEM_BUYIN = 500`). Ao zerar as fichas, o
  jogador recebe recompra automática e gratuita no início da mão seguinte. Todo o ciclo (apostas,
  pote, side pots) vive só em memória do servidor durante a sessão — não há transação monetária,
  cobrança, carteira ou saldo resgatável em nenhum momento.
- **Criticidade:** Alta (governança). É o que garante que a feature de lounge seja um jogo casual de
  socialização, não uma operação de jogos de azar com dinheiro real — relevante para avaliação
  jurídica/compliance caso o produto seja levado a públicos ou mercados regulados.

*Evidência: `HOLDEM_BUYIN = 500` em [`shared/src/index.ts`](../shared/src/index.ts); recompra
automática em `if (s.chips <= 0) s.chips = HOLDEM_BUYIN;` no [`server/src/games/holdem.ts`](../server/src/games/holdem.ts),
cuja própria docstring já registra a intenção: "é lounge, não cassino".*

### Tabela-Resumo RN
| ID | Nome | Área | Criticidade |
|---|---|---|---|
| RN-001 | Raio de Histerese | Áudio/Rede | Alta |
| RN-002 | Privacidade de Câmera | UX/Segurança | Alta |
| RN-003 | Cooldown do War Room | Infraestrutura | Média |
| RN-004 | Blind Voting do Planning Poker | Ágil | Alta |
| RN-005 | Fichas Fictícias no Lounge (sem apostas reais) | Governança/Compliance | Alta |

# 16. Papéis e Permissões
| Papel | Responsabilidade | Permissões |
|---|---|---|
| DEV / QA / PO | Todos possuem poderes idênticos no código atual. Qualquer um pode enviar mensagens, virar cartas do Planning Poker e convocar War Rooms. A distinção atual do `Role` atua meramente para diferenciação visual (emojis) na etiqueta do avatar. | Total |

# 17. Métricas de Sucesso (KPIs)
- **North Star:** Minutos ativos (conectado e em movimento) por semana por usuário.
- **Métricas de Produto:** Quantidade de mãos de Texas Hold'em jogadas; Frequência de uso do Planning Poker; Sessões P2P WebRTC ativas diárias.

# 18. Decisões de Produto
| Decisão | Justificativa | Impacto |
|---|---|---|
| Remoção de Spritesheet (LPC) | Simplificação visual. O avatar quadrado "blob" colorido com olhos provou ser mais escalável para desenvolvimento rápido do que spritesheets complexos. | Alto, mudou toda a UI na v1. |
| Phaser para Renderização 2D | Framework comprovado para lidar com loops, física (colisões de cadeiras/paredes) a 60fps constantes em contraste ao DOM do React. | Alto, divisão de paradigma no frontend. |

# 19. Questões em Aberto
| Pergunta | Responsável | Próximo Passo |
|---|---|---|
| Quando a VM reiniciar/desligar por falta de acesso (scale to 0), como garantir a recarga perfeita das sessões sem queda de socket fatal? | Engenharia | Estudar configuração do fly.toml (`min_machines_running = 0`). |

# 20. Riscos e Mitigações
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Falhas de WebRTC por firewalls corporativos. | Alta | Crítico | Implementar infraestrutura com STUN/TURN servers nativos. |

# 21. Roadmap
- **Fase 1 (MVP):** Mapa com colisão, WebRTC P2P e Chat ❌ → Feito
- **Fase 2 (Expansão):** Mini-games e Ferramentas Ágeis (Sprints, Texas Hold'em) ❌ → Feito
- **Fase 3 (Escala):** Autenticação Real, Banco de Dados, Integração nativa bidirecional via Webhooks. 🚧 → A fazer

# 22. Critérios de Sucesso
O MVP será considerado validado se o squad primário realizar 100% de suas Plannings de Sprint e Dailies da semana logados no ambiente virtual.

# 23. Pedido à Liderança
Revisão deste draft pelas áreas envolvidas e aprovação formal do owner para encerramento das melhorias em UI e prosseguimento em direção à Fase 3 do Roadmap.

# 24. Glossário
| Termo | Definição |
|---|---|
| Histerese | Lag de tolerância criado intencionalmente (ex. diferença entre os raios 110px e 160px) para evitar saltos. |
| STUN/TURN | Servidores de relay para estabelecer WebRTC em redes restritivas (NAT). |

# 25. Aprovações
| Nome | Cargo | Status |
|---|---|---|
| Bruno Vieira | Owner | Em Aprovação |
