# Guia completo do Homelab Monitor

Dashboard de monitoramento do homelab: UniFi Gateway Ultra + U6 Lite, Proxmox VE,
Proxmox Backup Server, TrueNAS, Orange Pi 4 Pro (Zabbix + Home Assistant) e Emby.
Tudo configurável: dá para adicionar, remover, desligar e reordenar serviços pela
própria dashboard, inclusive com várias instâncias do mesmo tipo.

Um único container: backend em Python (FastAPI) que consulta as APIs, guarda o
histórico em SQLite e serve a interface web.

## Subir

```bash
cp .env.example .env
docker compose up -d --build
# abra http://IP-DO-HOST:8080
```

No primeiro acesso a tela de login pede para criar a conta de **administrador**. Por
segurança, ela exige um **código de configuração** que só aparece no log do container:

```bash
docker compose logs homelab-monitor | grep "código de configuração"
```

Assim ninguém que alcance a porta antes de você consegue se tornar administrador.
Na primeira execução também é criado `data/config.yml` a partir de `config.example.yml`,
já com os seus serviços. Enquanto não houver credenciais, cada serviço aparece em
**modo demonstração**.

## App Android

A pasta `android/` tem o app nativo (APK) com a dashboard completa e recursos de celular:
alertas em segundo plano, widget, bloqueio com biometria, certificados fixados, envio e download
de arquivos. Instalação e compilação em [`android/README.md`](../android/README.md).

## Login e usuários

Toda a dashboard e a API exigem login. Há dois papéis:

- **Administrador**: vê tudo, muda configurações, usuários e o diagrama.
- **Visualizador**: vê todas as páginas, mas não altera nada. A página Configurações nem aparece para ele.

Administradores gerenciam usuários em *Configurações › Usuários*. Cada pessoa troca a
própria senha em *Minha senha*, no rodapé do menu. Trocar a senha de alguém encerra as
sessões abertas dessa pessoa.

Detalhes de segurança:
- Senhas guardadas com PBKDF2-SHA256 (390 mil iterações) em `data/users.json`.
- Sessão em cookie `HttpOnly` assinado com a chave de `data/secret.key`; dura 12 h ou
  30 dias com *Manter conectado*.
- Depois de 5 senhas erradas, aquele usuário fica bloqueado por 5 minutos para o mesmo IP.
- Duplo fator (TOTP) opcional ou obrigatório; veja a seção abaixo.
- Esqueceu a senha do único administrador? Apague `data/users.json` e reinicie o container:
  a tela de criação do administrador volta a aparecer. As configurações e o diagrama ficam intactos.

**Usando Authentik ou outro SSO** (`AUTH_MODE=proxy`): a dashboard confia no cabeçalho
`AUTH_PROXY_HEADER` enviado pelo proxy e não mostra a própria tela de login.
`AUTH_PROXY_ADMINS` lista quem é administrador. Use esse modo só se o container não
puder ser acessado sem passar pelo proxy, porque qualquer um que fale direto com a
porta 8080 poderia forjar o cabeçalho.

## Duplo fator (2FA)

Cada pessoa ativa o 2FA em *Minha conta* (rodapé do menu): lê o QR code com um aplicativo
autenticador (Google Authenticator, Authy, 1Password, Bitwarden…), digita o código e recebe
**8 códigos de recuperação**. Cada código de recuperação vale uma vez, para quando o celular
não estiver à mão. Dá para gerar códigos novos ou desativar o 2FA (com a senha) na mesma tela.

No login, depois da senha certa, a dashboard pede o código de 6 dígitos (ou um de recuperação).
- Códigos aceitos com tolerância de 30 s para relógios um pouco fora de hora, e cada código
  só funciona uma vez.
- 5 códigos errados bloqueiam aquela conta por 5 minutos para o mesmo IP.
- Em *Configurações › Segurança e notificações › Exigir duplo fator*: opcional, obrigatório
  para administradores ou obrigatório para todos. Quem ainda não tiver 2FA é levado a uma
  tela de configuração e não acessa mais nada até concluir.
- Perdeu o celular e os códigos? Outro administrador usa *Zerar 2FA* na lista de usuários.
  Se você é o único administrador, apague `data/users.json` (volta à criação do administrador).

## Notificações no Telegram

1. No Telegram, fale com o **@BotFather**, mande `/newbot` e copie o token.
2. Mande qualquer mensagem para o seu bot (ou adicione-o a um grupo).
3. Em *Configurações › Segurança e notificações*, cole o token, clique em **Descobrir chat ID**,
   escolha a conversa, use **Enviar mensagem de teste** e salve.

O que chega:
- **Alertas críticos** dos serviços reais (nunca os de demonstração), e opcionalmente os de
  atenção. O aviso só sai quando o problema aparece em N coletas seguidas (padrão: 2), para
  evitar alarme falso. Vários alertas no mesmo ciclo viram uma mensagem só.
- **Resolvido**, quando o alerta some.
- **Segurança**: login bloqueado por senha ou código errado, uso de código de recuperação,
  2FA ativado, desativado ou zerado, usuários criados e, se quiser, cada login.
- Ao reiniciar, um resumo dos alertas que já estavam ativos, em vez de um aviso por alerta.
- **Horário silencioso**: as mensagens continuam chegando, mas sem som.

O token fica só no servidor (mascarado na tela, como as outras chaves). Quem usa um servidor
Bot API próprio pode apontar `TELEGRAM_API_URL` no `.env`.

## Aparência

Em *Configurações › Aparência*, com prévia ao vivo da tela de login:
- Nome da dashboard, título e mensagem do login.
- Logo (PNG, SVG, JPG ou WEBP até 300 KB), opcionalmente recortado em círculo. Ele aparece no
  menu, no login e como ícone da aba.
- Cor principal (botões, links, destaques e gráficos), com cor própria ou automática no tema escuro.
- Tema padrão para quem ainda não escolheu (sistema, claro ou escuro).
- Fundo do login: padrão, cor sólida, degradê ou imagem (até 1,5 MB), e a faixa de rack ao lado.

As imagens ficam em `data/branding/`. Um SVG enviado é servido com uma política que impede
a execução de scripts, mesmo se alguém abrir o arquivo direto.

## Atalhos

A página **Atalhos** funciona como o Heimdall: blocos coloridos, organizados em grupos,
para abrir cada serviço com um clique. Na primeira vez ela é montada a partir dos serviços
configurados (Proxmox, PBS, TrueNAS, UniFi, Home Assistant, Frigate, Emby, Zabbix) e do
UniFi Site Manager. Ajuste o endereço do Frigate se ele não usar a porta 5000.

- **Busca**: digite (ou aperte `/`) para filtrar. Enter abre o atalho quando só um combina;
  caso contrário pesquisa na web (Google, DuckDuckGo, Bing ou Startpage), se você ativar.
- **Ponto de status**: verde quando o endereço responde, vermelho quando não. A verificação
  é feita pelo servidor a cada 30 s, então o endereço precisa ser alcançável a partir do
  container. Respostas 401 e 403 contam como "no ar" (o serviço respondeu, só pediu login).
- **Informação ao vivo**: um atalho ligado a um serviço ou host monitorado mostra um resumo,
  como "2 reproduzindo" no Emby ou a CPU do Proxmox.

Para administradores, *Editar atalhos*:
- Arraste os blocos para mudar a ordem ou trocar de grupo.
- Clique num bloco para mudar nome, endereço, descrição, cor, ícone, como abrir (nova aba
  ou mesma aba), a verificação de status e a informação ao vivo.
- Ícones: 34 ícones prontos, **Buscar ícone do site** (usa o ícone do próprio serviço),
  **Enviar imagem** (até 256 KB) ou só a inicial do nome.
- Grupos: adicionar, renomear, mudar a ordem e remover.
- *Preferências*: abrir em nova aba ou na mesma, tamanho dos blocos, organização por grupos
  ou tudo junto, buscador da web, descrições, informação ao vivo e **abrir a dashboard
  direto nos Atalhos**. Elas também podem ser mudadas fora do modo de edição.
- *Mais…*: importar e baixar JSON, ou recriar a partir dos serviços configurados.

Os atalhos ficam em `data/launcher.json`. Só endereços `http://` e `https://` são aceitos,
e os ícones são guardados dentro do próprio arquivo.

## Diagrama

A página **Diagrama** mostra o desenho da sua rede: grupos coloridos com itens,
ligações com setas, legenda e notas. Ela já vem montada com o seu homelab, e qualquer
item pode mostrar o status ao vivo de um host ou serviço monitorado. Clicar num item
com status abre a página dele.

O diagrama é interativo:
- **Zoom e movimento**: arraste o fundo para mover; Ctrl + roda do mouse (ou pinça no
  trackpad e no celular) para zoom; botões − / + / Ajustar; teclas `+`, `-` e `0`.
- **Conexões em destaque**: ao passar o mouse sobre um item ou grupo, as ligações dele e
  os vizinhos ficam em destaque e o resto esmaece.
- **Painel de detalhes**: clique num item para ver CPU, RAM, disco, temperatura, gráfico,
  alertas e conexões. As conexões são clicáveis e levam até o outro lado da ligação.
  *Abrir página* vai para a página completa do serviço.
- **Saúde ao vivo**: itens com alerta ganham borda âmbar ou vermelha, o título do grupo
  mostra quantos itens têm problema e as ligações de algo fora do ar ficam vermelhas e piscando.
- **Fluxo animado** nas ligações (pode ser desligado; respeita "reduzir movimento" do sistema).
- **Busca** e o filtro **Só com problema** esmaecem tudo o que não interessa. Enter na busca
  abre o primeiro resultado.

Para administradores, *Editar diagrama* abre o modo de edição:
- **Mover e redimensionar**: arraste um grupo pelo título; a alça no canto inferior
  direito muda a largura. Tudo encaixa numa grade de 8 px.
- **Grupos**: *Adicionar grupo* cria grupos de itens, de notas ou uma legenda. *Editar*,
  no título, muda nome, cor, número de colunas ou remove o grupo.
- **Itens**: *+ Item* no título do grupo. Clique num item para mudar nome, descrição,
  ícone, status ao vivo e grupo, mudar a ordem ou remover.
- **Ligações**: ligue grupos inteiros ou itens específicos, com tipo, mão dupla e rótulo.
- **Tipos de ligação**: nome, cor e traço de cada tipo. A legenda acompanha.
- **Mais…**: importar ou baixar o JSON e voltar ao exemplo.
- Nada vai para o servidor até você clicar em **Salvar diagrama**. *Descartar* desfaz tudo.

O diagrama fica em `data/diagram.json`. Visualizadores podem baixar o JSON, mas não editar.

## Personalizar

Há dois caminhos, que editam o mesmo arquivo `data/config.yml`.

**Pela dashboard**, em *Configurações*:
- **Adicionar serviço**: escolha o tipo, preencha o formulário e use *Testar conexão* antes de salvar.
- O botão liga/desliga para a coleta sem apagar nada. Um serviço desligado some do menu e da frota.
- **↑ ↓** mudam a ordem da frota e do menu.
- **Editar** e **Remover** ficam dentro do formulário de cada serviço.
- *Geral*: intervalo de coleta, retenção, fuso, limites de alerta e o que fazer com serviços sem credencial.
- *Energia*: tarifa, consumo por tipo de equipamento e ajuste por host.

**À mão**, editando `data/config.yml`. As mudanças valem no próximo ciclo de coleta,
sem reiniciar o container. Se o arquivo tiver erro, a configuração anterior continua
valendo e o erro aparece no log (`docker compose logs`).

### Tipos disponíveis

| Tipo | Uso |
|---|---|
| `unifi` | Gateway, APs (U6 Lite etc.) e, se quiser, switches |
| `proxmox` | Nós, VMs/LXC, storages. Pode ter uma instância por cluster/nó |
| `pbs` | Datastores e tarefas de backup |
| `truenas` | Pools, scrub, alertas e apps |
| `zabbix` | Problemas ativos + hosts escolhidos na frota (o Orange Pi, ou outros) |
| `homeassistant` | Entidades, atualizações e o sensor de consumo do rack |
| `emby` / `jellyfin` | Sessões, transcodificação, bibliotecas, atividade e tarefas |
| `nextcloud` | Usuários ativos, armazenamento, compartilhamentos, PHP, banco e atualizações |
| `http` | Qualquer serviço web: status HTTP, texto esperado, tempo de resposta |
| `tcp` | Qualquer porta: SSH, MQTT, banco de dados… |

Exemplo de verificação genérica:

```yaml
  - id: pihole
    type: http
    name: Pi-hole
    url: http://192.168.1.15/admin
    expect_status: 200
```

### Onde ficam as chaves

- Pela tela: cole a chave no formulário. Ela fica salva em `data/config.yml` e volta
  mascarada para o navegador. Se você mudar o endereço de um serviço, a dashboard pede
  a chave de novo; assim ninguém redireciona um token salvo para outro servidor.
- Pelo `.env`: escreva `${NOME}` no campo (ex.: `${PVE_TOKEN_SECRET}`) e defina
  `NOME=...` no `.env`. Depois de mudar o `.env`, rode `docker compose up -d`.

## Credenciais (todas somente leitura)

| Serviço | Como criar | Permissão mínima |
|---|---|---|
| UniFi | UniFi Network › Settings › Control Plane › Integrations › *Create API Key* | — |
| Proxmox VE | Datacenter › Permissions › API Tokens | Role `PVEAuditor` em `/` |
| PBS | Configuration › Access Control › API Token | Role `Audit` em `/` |
| TrueNAS | Menu do usuário › API Keys | Usuário *Read-Only Admin* |
| Zabbix | Users › API tokens | Grupo com leitura nos hosts |
| Home Assistant | Perfil › Segurança › Tokens de longa duração | — |
| Emby | Painel › Avançado › Chaves de API | — |
| Jellyfin | Painel › Chaves de API | — |
| Nextcloud | `occ config:app:set serverinfo token` (ou senha de app de um administrador) | — |

Proxmox VE pela linha de comando:

```bash
pveum user add monitor@pve
pveum acl modify / --users monitor@pve --roles PVEAuditor
pveum user token add monitor@pve dashboard --privsep 0
```

PBS:

```bash
proxmox-backup-manager user create monitor@pbs
proxmox-backup-manager acl update / Audit --auth-id monitor@pbs
proxmox-backup-manager user generate-token monitor@pbs dashboard
```

Orange Pi: instale o `zabbix-agent2`, cadastre o host no Zabbix com o template
*Linux by Zabbix agent* e coloque o nome técnico dele em *Hosts para mostrar na frota*
(ex.: `orangepi=Orange Pi 4 Pro`).

## Proxmox

A página **Proxmox** segue o layout do ProxMenux Monitor: cabeçalho com o nó (seletor quando há
vários), um selo de estado (Saudável, Atenção ou Crítico), uptime e o botão Atualizar, e as abas:

- **Visão geral**: cards de uso de CPU, memória, temperatura e VMs/LXC ativos; gráficos
  "Uso de CPU e carga" (dois eixos) e "Memória" (total, usada, ZFS ARC e disponível);
  armazenamento e rede.
- **Armazenamento**: storages com tipo, conteúdo e se são compartilhados; discos físicos com
  saúde SMART e desgaste; gráfico de I/O wait e do disco do sistema.
- **Rede**: tráfego de entrada e saída, interfaces e bridges (endereço, gateway, portas, VLAN)
  e os guests que mais usam rede.
- **VMs e LXC**: ranking de CPU, memória e rede, e a tabela com busca, filtros, ordenação e
  minigráficos. Clique numa linha para abrir os gráficos de CPU, memória e rede daquela VM.
- **Hardware**: processador, memória (com ZFS ARC e swap), versão do PVE, kernel, modo de
  inicialização (EFI/BIOS, Secure Boot) e discos.
- **Tarefas e logs**: tarefas recentes com as falhas em destaque e o log do sistema com filtro
  (só administradores).

Os gráficos usam o **histórico do próprio Proxmox** (o mesmo da interface dele), então já
aparecem completos na primeira vez, com períodos de 1 hora a 1 ano.

**Temperatura**: a API do Proxmox não informa temperatura. Em *Configurações › Proxmox ›
Temperatura do nó vem de*, use um host do Zabbix com item de temperatura (o id dele na frota,
ex.: `zbx-pve`, depois de cadastrar o Proxmox no Zabbix com `temp_key`) ou um sensor do Home
Assistant no formato `ha:sensor.nome` (o sensor precisa estar em *Outras entidades para
acompanhar*). Com vários nós, use `nó=origem`, um por linha.

**Permissões**: tudo funciona com `PVEAuditor`, exceto o log do sistema, que precisa de
`Sys.Syslog`. Para liberar: `pveum role add LogReader -privs Sys.Syslog` e
`pveum acl modify /nodes --tokens 'monitor@pve!dashboard' --roles LogReader`.

Alertas: nó offline, perda de quórum, storage cheio, falha SMART, SSD com mais de 80 % de
desgaste, temperatura alta e tarefas que falharam na última hora.

## Backups (PBS), Rede (UniFi) e Zabbix

As três páginas seguem o mesmo padrão da página Proxmox: cabeçalho com estado, abas, cards e
gráficos com seletor de período.

**Backups (Proxmox Backup Server)**: gráficos do histórico do próprio PBS.
- *Visão geral*: último backup, falhas em 24 h, ocupação do datastore (com previsão de quando
  enche) e fator de deduplicação; backups por dia (OK x falha) nos últimos 7 dias; ocupação do
  datastore no último mês; CPU, carga e rede do servidor.
- *Datastores*: ocupação, deduplicação, coleta de lixo (GC) e gráficos de espaço e de leitura/escrita.
- *Grupos de backup*: cada VM, CT ou host com último backup, quantidade de snapshots, tamanho,
  verificação e snapshots protegidos. Grupos sem backup recente geram alerta.
- *Jobs*: verificação, sincronização e limpeza (prune), com agenda, último resultado e próxima execução.
- *Tarefas*: filtro por tipo e por falhas.

**Rede (UniFi)**: a Integration API não guarda histórico, então os gráficos usam o histórico
que a dashboard grava a cada coleta (até 30 dias). Com a API clássica disponível (a mesma chave
funciona nas versões recentes do UniFi Network), a página mostra também rádios, canais,
utilização e clientes detalhados.
- *Visão geral*: download, upload, latência e quedas da internet, último teste de velocidade,
  clientes Wi-Fi e cabo; gráficos de tráfego, clientes, latência e utilização dos canais.
- *Dispositivos*: gateway e APs com CPU, memória, temperatura, uplink, portas, versão e aviso de atualização.
- *Wi-Fi*: cada rádio com banda, canal, largura, utilização do canal, clientes, satisfação,
  potência e retransmissões. Canal acima de 70 % de utilização gera alerta.
- *Clientes*: busca, filtro Wi-Fi/cabo, ordenação por tráfego ou sinal, com AP ou porta, banda,
  canal, padrão Wi-Fi, sinal (dBm), satisfação e tráfego atual.

**Zabbix**: gráficos do histórico do próprio Zabbix (history até 24 h, trends para 7 e 30 dias).
- *Visão geral*: problemas por severidade, hosts disponíveis, fila e valores por segundo do
  servidor; problemas ao longo do tempo; gráficos dos hosts mostrados na frota.
- *Problemas*: filtro por severidade mínima e por reconhecimento, com duração.
- *Hosts*: todos os hosts monitorados com disponibilidade do agente, manutenção e pior problema.
  Clique num host para ver CPU, memória, disco, rede (a interface com mais tráfego) e temperatura.

## Mídia (Emby e Jellyfin)

Emby e Jellyfin usam a mesma página (a API dos dois é praticamente igual); com os dois
configurados, cada um aparece em sua própria seção.
- *Visão geral*: quem está assistindo, banda em uso, tamanho da biblioteca e usuários ativos,
  com alerta de falhas de login. Para cada sessão: capa, usuário, aparelho e IP, progresso,
  reprodução direta ou transcodificação (com codec de origem e destino, áudio, aceleração por
  GPU e o motivo da transcodificação). Gráficos de streams e de banda.
- *Biblioteca*: cada biblioteca com tipo, quantidade e pastas, e os 12 itens adicionados
  mais recentemente, com capa.
- *Usuários e atividade*: usuários (administradores, desativados, última atividade) e o log de
  atividade com falhas de login em vermelho. Três falhas ou mais em 24 h geram alerta.
- *Tarefas agendadas*: estado, último resultado (falhas com a mensagem de erro) e duração.

As capas passam pela dashboard (`/api/media/...`): a chave fica no servidor e só são liberadas
as capas que aparecem na tela. Dá para desligar em *Mostrar capas*.

## Nextcloud

Usa o app **serverinfo** (vem instalado no Nextcloud). A forma recomendada é um token só de
leitura das informações do servidor:

```bash
occ config:app:set serverinfo token --value "um-token-longo-e-aleatorio"
```

Coloque o mesmo valor em *Token do serverinfo*. Sem token, use um usuário administrador com uma
**senha de app** (Configurações pessoais › Segurança), nunca a senha principal.
- *Visão geral*: usuários ativos (5 min, 1 h, 24 h), arquivos, espaço livre, carga e memória,
  com gráficos de usuários ativos, carga e memória, espaço livre, arquivos e tamanho do banco.
- *Sistema*: servidor web, PHP (limites e OPcache), banco de dados e cache (APCu, Redis, bloqueio
  de arquivos), com dica quando o cache não está configurado.
- *Compartilhamentos*: por tipo, e quantos links públicos estão sem senha.
- *Apps e atualizações*: versão, atualização disponível, apps para atualizar, modo de
  manutenção e modo debug.

Alertas: pouco espaço livre, modo de manutenção; avisos de atualização, apps e links sem senha.

## Casa (Home Assistant, somente leitura)

A página **Casa** mostra a casa inteira sem abrir o Home Assistant. A dashboard só lê
estados e estatísticas e não envia nenhum comando.

- **Cômodos**: vêm das áreas do Home Assistant. Em *Configurações › Home Assistant ›
  Cômodos a mostrar* você escolhe quais aparecem e em que ordem (Cozinha, Sala, Suíte,
  Escritório, Segundo quarto). Vazio mostra todas as áreas com luzes ou tomadas.
- **Luzes**: `light.*` e `switch.*` sem medição de potência (interruptores Zigbee),
  com estado, brilho e há quanto tempo estão acesas.
- **Tomadas**: qualquer dispositivo com sensor de potência (W). Mostra o consumo agora e
  o custo de hoje, 7 e 30 dias com a tarifa configurada. O kWh vem das estatísticas de
  energia do próprio Home Assistant, as mesmas do painel Energia dele. Tomadas sem sensor
  de energia (kWh) são estimadas pela dashboard a partir do W, e só a partir do momento
  em que ela começou a coletar.
- **Zigbee**: dispositivos indisponíveis, com bateria fraca ou sinal (LQI) ruim. Se você
  usa Zigbee2MQTT, o sensor `linkquality` costuma vir desativado; ative-o no Home Assistant
  para ver o sinal.
- **Alertas** no feed geral: luz acesa há muito tempo, tomada acima de um limite, bateria e sinal.
- Com a página aberta, os cômodos se atualizam a cada 5 segundos.

**Câmeras do Frigate**: aparecem no topo da página Casa, lidas pela integração Frigate do
Home Assistant (não precisa de outra credencial). Em *Configurações › Home Assistant*:
- *Câmeras do Frigate*: **imagem e status**, **só status** (online ou offline) ou **não mostrar**.
- *Câmeras (na ordem)*: quais mostrar e com que nome (`camera.garagem=Garagem`). Vazio mostra todas do Frigate.
- *Atualizar imagens a cada*: intervalo das fotos na grade (padrão 10 s). Clicar numa câmera abre
  a imagem grande, atualizando a cada 2 s.
- *Quem pode ver as imagens*: todos os usuários ou só administradores. Visualizadores sem
  permissão continuam vendo o status.
- *Alertar quando uma câmera cair*: entra no feed de alertas.

Cada pessoa também pode alternar entre *Imagens* e *Só status* no próprio painel. Uma câmera
conta como offline quando a entidade está indisponível ou o Frigate informa 0 fps. Também
aparecem movimento, objetos detectados agora (pessoas, carros…) e se a gravação ou a
detecção estão desligadas.

As imagens passam pela dashboard (`/api/camera/...`) usando o proxy de câmeras do Home
Assistant: o token nunca chega ao navegador, a rota exige login e só serve as câmeras
liberadas na configuração. A lista automática de câmeras do Frigate usa a API de template;
com um token sem permissão para ela, liste as câmeras manualmente.

Para a dashboard achar os cômodos, cada luz e tomada precisa estar atribuída a uma área
no Home Assistant (Configurações › Dispositivos). Se você marcar a tomada do rack em
*Sensor de potência do rack*, ela também alimenta o custo de energia da Visão geral.

Sobre permissões: o coletor (`app/collectors/homeassistant.py`) só faz leituras
(`/api/states`, `/api/config`, `/api/template` e estatísticas). Não existe nenhuma
chamada de serviço no código. A leitura das áreas usa a API de template, que em versões
recentes do Home Assistant pode exigir um usuário administrador. Se você gerar o token
com um usuário comum e a API de template for recusada, a dashboard passa a encontrar os
cômodos pelo nome: uma entidade entra na Cozinha se “cozinha” aparecer no `entity_id` ou
no nome dela. Funciona bem se os seus dispositivos seguem esse padrão de nome; caso
contrário, use um token de administrador.

## Assistente de IA

Em *Configurações › Inteligência artificial* você liga o assistente e escolhe o provedor:

| Provedor | Onde criar a chave | Modelo sugerido |
|---|---|---|
| Claude (Anthropic) | console.anthropic.com › API Keys | `claude-sonnet-5-5` |
| ChatGPT (OpenAI) | platform.openai.com › API keys | `gpt-5-mini` |
| Gemini (Google) | aistudio.google.com › Get API key | `gemini-2.5-flash` |
| Compatível com OpenAI | Ollama, OpenRouter, LM Studio… (informe o endereço) | o que o servidor tiver |

Os nomes de modelo mudam com o tempo: se *Testar conexão* disser "modelo não encontrado",
confira o nome atual na documentação do provedor. Para analisar imagens, o modelo
precisa aceitar visão. Com Ollama, um modelo como `llama3.2-vision` roda tudo localmente,
sem enviar nada para fora de casa.

A página **Assistente IA** tem três análises prontas e perguntas livres em formato de conversa:
- **Analisar consumo**: quem mais gasta, standby, picos, luzes esquecidas e economia estimada em R$.
- **Sugestões de melhoria**: riscos, backup, armazenamento, recursos, rede, segurança e
  alertas, organizados por prioridade.
- **Analisar câmera**: o que aparece na imagem, qualidade e ajustes de posição ou de zonas no Frigate.

Também há atalhos *Analisar com IA* no painel de energia e nos alertas da Visão geral e na
imagem ampliada de cada câmera.

Privacidade e custo:
- Nada é enviado sem alguém pedir uma análise. Cada resposta mostra o que foi enviado.
- Você escolhe o que pode ir para o provedor: energia, casa, homelab e imagens das câmeras.
  Os IPs são removidos por padrão. Chaves e tokens das integrações nunca entram no envio.
- A chave da IA fica só no servidor. Trocar o provedor exige digitar a chave de novo.
- *Quem pode usar*: só administradores (padrão) ou todos. A análise de câmeras também
  respeita a regra de quem pode ver imagens.
- *Limite de pedidos por dia* e *Tamanho máximo da resposta* ajudam a controlar o custo.
  O contador zera à meia-noite e quando o container reinicia.
- As conversas ficam só na memória do servidor por 1 hora, para permitir perguntas de seguimento.

## Energia e custo

- **Medido**: no serviço Home Assistant, preencha *Sensor de potência do rack* com um
  sensor em W de tomada inteligente ou medidor. A divisão por equipamento segue a estimativa.
- **Estimado**: sem medidor, cada host é estimado pelo consumo ocioso/máximo do tipo,
  interpolado pela CPU. Se TrueNAS e PBS forem VMs do Proxmox, deixe esses tipos em 0
  para não contar em dobro.

## API

| Rota | Retorno |
|---|---|
| `GET /api/state` | Hosts, serviços, alertas, energia e detalhes por instância |
| `GET /api/pve/rrd` · `GET /api/pve/syslog` | Histórico e log do Proxmox |
| `GET /api/media/<id>/image/<item>` | Capas do Emby/Jellyfin |
| `GET /api/series?iid=&kind=&tf=` | Histórico do PBS (`node`, `ds:<datastore>`) e do Zabbix (`host:<id>`) |
| `GET /api/history?keys=proxmox-pve.cpu,unifi.wan.rx&range=6h` | Séries (`1h` `6h` `24h` `7d` `30d`) |
| `GET /api/types` | Tipos de integração e campos de cada formulário |
| `GET/PUT /api/config` | Configuração (segredos mascarados). Só administradores |
| `GET/PUT /api/diagram` | Diagrama (alteração só por administradores) |
| `POST /api/auth/login` · `/logout` | Entrar e sair (cookie de sessão) |
| `GET/POST/PUT/DELETE /api/users` | Usuários (só administradores) |
| `POST /api/test` | Testa um serviço sem salvar |
| `GET /api/live/<id>` | Leitura rápida da casa (cômodos, tomadas, luzes, Zigbee) |
| `GET/PUT /api/launcher` · `GET /api/launcher/status` · `POST /api/launcher/icon` | Atalhos |
| `POST /api/auth/2fa` · `/api/account/2fa/*` | Duplo fator |
| `POST /api/notify/test` · `POST /api/notify/chats` | Telegram |
| `GET/PUT /api/branding` | Aparência (leitura pública, para a tela de login) |
| `GET /api/ai/status` · `POST /api/ai/ask` · `POST /api/ai/test` | Assistente de IA |
| `GET /api/summary` | Resumo leve para o app Android (alertas, saúde, consumo) |
| `GET /api/health` | Usado pelo healthcheck do Docker |

Chaves de histórico: `<id-do-host>.cpu|mem|disk|temp`, `<id-do-serviço>.wan.rx|wan.tx|wan.latency|clients`
(UniFi), `<id>.streams|transcodes` (Emby), `<id>.latency|up` (HTTP/TCP) e `power.w`.

## Adicionar um tipo novo de integração

1. Crie uma classe em `app/collectors/` herdando de `Collector`, com `type`, `label`, `page`,
   `fields` (o formulário) e `collect()` retornando `self.result(...)`.
2. Registre a classe em `app/collectors/__init__.py`.
3. Opcional: adicione dados simulados em `demo.py` e uma página em `web/app.js` (`VIEWS`).

## Segurança

### O que a dashboard já faz
- **Login obrigatório** em todas as páginas e rotas da API; papéis de administrador e visualizador,
  conferidos no servidor (não só escondidos na tela).
- **Primeiro administrador** só com o código de configuração do log.
- **Senhas** com PBKDF2-SHA256 (390 mil iterações); **2FA** (TOTP) com códigos de uso único.
- **Limites de tentativa**: 5 erros bloqueiam a conta por 5 minutos naquele IP; 30 erros de
  um mesmo IP (em qualquer conta) bloqueiam o IP por 15 minutos. Vale para senha, 2FA e configuração inicial.
- **Sessões** em cookie `HttpOnly` e `SameSite=Lax`, com `Secure` automático em HTTPS. Trocar a
  senha ou usar *Sair de todos os dispositivos* derruba as sessões abertas.
- **Proteção contra CSRF**: pedidos que alteram dados vindos de outro site são recusados.
- **Cabeçalhos de segurança**: Content-Security-Policy restritiva (sem scripts externos ou
  embutidos), proteção contra a página ser aberta dentro de outro site, `nosniff`,
  `Referrer-Policy: no-referrer` (os atalhos não revelam o endereço da dashboard) e HSTS em HTTPS.
- **Sem documentação automática da API** (`/docs`, `/openapi.json` desligados).
- **Segredos**: chaves e tokens nunca voltam para o navegador; trocar o endereço de um serviço
  exige digitar a chave de novo. `config.yml`, `users.json` e `secret.key` ficam com permissão 600.
- **Uploads**: só imagens, com limite de tamanho; SVG é servido sem poder executar scripts.
  Endereços dos atalhos só `http://` e `https://`. Pedidos acima de 8 MB são recusados.
- **Câmeras**: a rota de imagens só entrega câmeras liberadas na configuração e respeita quem
  pode ver imagens.
- **Container**: roda como usuário sem privilégios, sistema de arquivos somente leitura,
  sem capacidades extras depois de iniciar, `no-new-privileges` e sem `pip` na imagem final.
- **Dependências** fixadas em versões sem vulnerabilidades conhecidas (verificado com `pip-audit`).

### O que fica com você
- **Use HTTPS** se acessar de fora da rede, via proxy reverso (Nginx Proxy Manager, Traefik,
  Caddy) ou pela VPN da UniFi. Prefira **não expor a porta 8080 na internet**; em
  `docker-compose.yml` dá para escutar só no IP da rede local (`192.168.1.x:8080:8080`).
- Atrás de proxy, defina `FORWARDED_ALLOW_IPS` com o IP do proxy para os limites de tentativa
  usarem o IP real de quem acessa. Se o proxy mudar o domínio, liste-o em `ALLOWED_ORIGINS`.
- **Ative o 2FA** e, de preferência, torne-o obrigatório para administradores.
- **Tokens das integrações somente leitura** (PVEAuditor, Audit, Read-Only Admin…).
- `verify_ssl` vem desligado por causa dos certificados autoassinados do homelab. Se seus
  serviços tiverem certificados válidos, ligue em cada integração.
- **Proteja os backups da pasta `data/`**: ela contém tokens, chaves de API, os segredos do 2FA
  e os hashes de senha.
- **Atualize a imagem** de tempos em tempos (`docker compose build --pull && docker compose up -d`)
  e, se quiser conferir as dependências: `pip-audit -r app/requirements.txt`.
- O modo `AUTH_MODE=proxy` só é seguro se a porta da dashboard não puder ser acessada sem
  passar pelo proxy.
- A IA recebe só o que você permitir; mesmo assim, evite enviar dados que não gostaria de ver
  num serviço externo, ou use um modelo local com Ollama.

## Estrutura

```
app/main.py              API, ciclo de coleta, alertas, energia, login e segurança
app/auth.py              usuários, senhas, sessões e 2FA
app/config.py            config.yml editável (segredos mascarados)
app/collectors/          um coletor por serviço + dados de demonstração
app/ai.py                assistente de IA (Claude, ChatGPT, Gemini, compatíveis)
app/notify.py            notificações no Telegram
app/branding.py          aparência (nome, logo, cores, login)
app/diagram.py           diagrama            app/launcher.py   atalhos
app/store.py             histórico em SQLite
web/                     interface (HTML, CSS e JS sem dependências)
```
