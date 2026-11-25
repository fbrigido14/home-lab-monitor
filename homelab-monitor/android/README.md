# Homelab Monitor para Android

App nativo (Android 7 ou mais novo) que roda a dashboard completa — todas as páginas,
configurações, edição do diagrama e dos atalhos, assistente de IA, câmeras — com recursos de celular:

- **Primeiro acesso**: informe o endereço da dashboard; o app confere se é mesmo o Homelab
  Monitor antes de salvar.
- **Certificado autoassinado**: o app mostra a impressão digital SHA-256 e, se você confirmar,
  fixa aquele certificado. Se ele mudar, o app avisa (proteção contra interceptação).
- **Alertas em segundo plano**: a cada 15, 30 ou 60 minutos o app consulta `/api/summary` e
  notifica alertas novos, mesmo fechado. Três canais no Android (críticos, avisos, sessão), cada
  um com som e importância ajustáveis. Mais de três alertas de uma vez viram uma notificação só.
  Tocar na notificação abre a página do serviço.
- **Widget** "Estado do homelab": saúde geral, alertas, equipamentos online e consumo em R$/h.
- **Bloqueio** com biometria ou PIN do aparelho, com tempo configurável.
- **Arquivos**: envio de logo, ícones e JSON pelo seletor do Android; exportações e códigos de
  recuperação do 2FA salvos em *Downloads/Homelab Monitor*.
- **Links externos** (Atalhos, buscas) abrem no navegador; a dashboard fica no app.
- **Sem conexão**: tela própria com "Tentar de novo" e "Trocar servidor".
- **Ajustes do app**: no menu lateral da dashboard (botão *Ajustes do app*).

A interface é a da própria dashboard: quando o servidor é atualizado, o app já mostra as
novidades, sem reinstalar. O app precisa do servidor **1.11.0 ou mais novo** (rota `/api/summary`).

## Instalar

1. Copie `homelab-monitor.apk` para o celular.
2. Abra o arquivo e permita "Instalar apps desconhecidos" para o app que você usou para abrir
   (Arquivos, Chrome…).
3. Abra o app, informe o endereço (ex.: `http://192.168.1.13:8080`) e entre normalmente,
   inclusive com 2FA. Dentro do app, *Manter conectado por 30 dias* vem marcado para os alertas
   continuarem chegando.
4. Permita as notificações quando o Android pedir.

Fora de casa, use a VPN da UniFi ou um proxy com HTTPS; não exponha a porta 8080 na internet.

## Compilar

Não usa Gradle: só ferramentas que existem nos repositórios do Ubuntu/Debian.

```bash
sudo apt install openjdk-17-jdk-headless android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
curl -L -o android-34.jar https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
./build.sh
```

A `android-34.jar` só serve para compilar (traz as definições das APIs do Android 14); ela
não vai dentro do APK.

**Chave de assinatura**: o `build.sh` cria `homelab-monitor.jks` na primeira compilação (senha `homelab`, ou a de `KS_PASS`). Ela **não vai para o Git** (está no `.gitignore`): guarde-a em lugar seguro. O Android só aceita uma
atualização se ela for assinada com a mesma chave da versão instalada. Para usar uma chave sua,
apague o `.jks`, rode `KS_PASS=sua-senha ./build.sh` e reinstale o app (desinstale o anterior antes).

## Estrutura

```
AndroidManifest.xml      permissões, telas, serviço de alertas, widget
src/.../MainActivity     WebView da dashboard + ponte nativa (HMApp), bloqueio, arquivos, erros
src/.../SetupActivity    endereço do servidor e confirmação de certificado
src/.../SettingsActivity ajustes: servidor, notificações, bloqueio, certificados
src/.../AlertJob         verificação periódica (JobScheduler) e notificações
src/.../StatusWidget     widget da tela inicial
src/.../Net              HTTP com fixação de certificado
res/                     ícones e layout do widget
```

## Segurança

- A ponte JavaScript (`HMApp`) só responde quando a página aberta é a da sua dashboard.
- Sessão, certificados confiados e ajustes ficam no armazenamento privado do app e não entram
  em backups do Android.
- Sem acesso a arquivos do aparelho pelo WebView; conteúdo misto (HTTP dentro de HTTPS) bloqueado.
