# StremioRPC

<p align="center">
  <img src="Assets/DiscordRPCStremioLarge.png" alt="Logo do StremioRPC" width="540" />
</p>

<p align="center">
  A presença rica do Discord para o que está a ver no Stremio.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white" alt="Electron 31" />
  <img src="https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?logo=discord&logoColor=white" alt="Discord Rich Presence" />
  <img src="https://img.shields.io/badge/macOS-Intel%20%26%20Apple%20Silicon-000000?logo=apple&logoColor=white" alt="macOS Intel e Apple Silicon" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="Licença MIT" />
</p>

StremioRPC é uma aplicação desktop que executa um pequeno add-on local do Stremio e envia a reprodução para o Discord Rich Presence. Quando começa um filme ou episódio, o Discord mostra o título, a temporada e o episódio na sua atividade.

Funciona em macOS, Windows e Linux. No macOS, a aplicação inclui pacote `.dmg`, suporte a Intel e Apple Silicon, item de início de sessão e integração com a barra de menus.

## O que faz

- Mostra filmes e séries do Stremio na atividade do Discord.
- Obtém títulos através do Cinemeta; uma chave OMDb é apenas uma alternativa opcional.
- Instala o add-on local diretamente a partir da janela da aplicação.
- Continua a correr na bandeja/barra de menus quando a janela é fechada, se essa opção estiver ativa.
- Pode arrancar com a sessão do sistema, incluindo no macOS.
- Limpa a atividade quando o Stremio deixa de estar disponível ou após um período de segurança.

## Requisitos

Para usar a aplicação, tenha instalado e aberto:

- [Discord Desktop](https://discord.com/download)
- [Stremio Desktop](https://www.stremio.com/downloads)

Também precisa de criar uma aplicação no [Discord Developer Portal](https://discord.com/developers/applications) para obter um **Client ID**. No separador **Rich Presence > Art Assets**, adicione uma imagem com a chave `stremio`, pois essa é a imagem apresentada pelo Discord.

## Instalação

### macOS

1. Transfira o ficheiro `.dmg` adequado ao seu Mac: `arm64` para Apple Silicon (M1 ou mais recente) ou `x64` para Intel.
2. Abra o `.dmg` e arraste **StremioRPC** para **Applications**.
3. Abra a aplicação a partir de Applications.
4. Caso o macOS bloqueie uma compilação sem assinatura, abra **Definições do Sistema > Privacidade e Segurança** e escolha **Abrir mesmo assim** para o StremioRPC.

A aplicação aparece na barra de menus. Clique no ícone para mostrar ou ocultar o painel; use **Quit** no respetivo menu para encerrar totalmente.

### Windows e Linux

Use o instalador correspondente à sua plataforma. O projeto gera NSIS para Windows e `AppImage`/`deb` para Linux.

## Primeira configuração

1. Abra StremioRPC e introduza o **Discord Client ID**.
2. Opcionalmente, introduza a chave **OMDb API**. A resolução de títulos pelo Cinemeta é tentada primeiro, pelo que esta chave normalmente não é necessária.
3. Clique em **Install Addon on Stremio** e confirme a instalação no Stremio.
4. Comece a ver um filme ou episódio. O estado do Discord muda para ligado quando o Discord Desktop aceita a ligação.

O add-on existe apenas no seu computador e é servido em `http://localhost:7000`. Não é publicado para outros utilizadores.

## Opções do painel

| Opção | Finalidade |
| --- | --- |
| Discord Client ID | Identificador da aplicação Discord usada para o Rich Presence. |
| OMDb API Key | Alternativa opcional para procurar títulos por IMDb. |
| Run on Boot | Inicia o StremioRPC com a sessão do sistema. No macOS, inicia oculto na barra de menus. |
| Minimize to Tray | Ao fechar a janela, mantém a aplicação ativa na bandeja/barra de menus. |

As preferências são guardadas no diretório de dados da aplicação do sistema, em `config.json`. A chave OMDb fica nesse ficheiro local; não é enviada para outro serviço além do OMDb quando é necessária uma consulta de título.

## Comportamento no macOS

- O menu da aplicação inclui os comandos habituais do macOS, incluindo **About**, **Hide** e **Quit** (`⌘Q`).
- Fechar a janela mantém o processo ativo na barra de menus quando **Minimize to Tray** está ligado.
- Clicar no ícone da barra de menus alterna a visibilidade do painel.
- **Run on Boot** cria/remove o item de início de sessão do macOS e inicia a aplicação oculta.
- O pacote usa um ícone `.icns` nativo e produz tanto `.dmg` como `.zip`.

## Desenvolvimento

Use uma versão LTS atual do Node.js e npm.

```bash
git clone https://github.com/bryanrafaelbueno/StremioRPC.git
cd StremioRPC
npm ci
npm start
```

`npm install` também funciona quando pretende atualizar o ficheiro de bloqueio. O `postinstall` prepara o runtime do Electron caso ainda não esteja disponível.

### Gerar distribuíveis

Os ficheiros gerados são colocados em `dist/`.

```bash
# Plataforma atual
npm run dist

# Destinos específicos
npm run dist:mac
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:win
npm run dist:linux
```

`dist:mac` gera `.dmg` e `.zip` para a arquitetura da máquina onde o comando é executado. Para lançar as duas variantes de macOS, execute `dist:mac:arm64` e `dist:mac:x64`. A assinatura e a notarização Apple exigem certificados de distribuição próprios; os comandos acima criam pacotes não assinados quando essas credenciais não estão configuradas.

## Estrutura do projeto

```text
StremioRPC/
├── Assets/                         # Logótipos, ícones PNG e ícone macOS .icns
├── scripts/postinstall.js          # Preparação do runtime Electron
├── index.js                        # Processo principal, add-on e integração do sistema
├── metadata.js                     # Resolução e cache de títulos
├── preload.js                      # Ponte IPC segura para a interface
├── renderer.js                     # Estado e ações do painel
├── index.html                      # Interface do painel
├── package.json                    # Dependências e configuração de empacotamento
└── README.md                       # Esta documentação
```

## Resolução de problemas

**O Discord mostra “Connection failed”**

Confirme que o Discord Desktop está aberto e que o Client ID corresponde a uma aplicação existente. O cliente web do Discord não disponibiliza a integração IPC usada pelo Rich Presence.

**A atividade não aparece ao reproduzir**

Verifique se instalou o add-on através do botão da aplicação e se o painel mostra o add-on na porta 7000 como ativo. Reinstale o add-on no Stremio depois de reiniciar a aplicação, se necessário.

**Apenas aparece um IMDb ID**

O Cinemeta e, opcionalmente, o OMDb não conseguiram resolver esse conteúdo. Confirme a ligação à Internet e a validade da chave OMDb, se a estiver a usar.

**Fechei a janela e a aplicação continua aberta**

Esse é o comportamento esperado quando **Minimize to Tray** está ativo. Abra o menu da bandeja/barra de menus e selecione **Quit** para a encerrar.

## Licença

Distribuído sob a licença [MIT](LICENSE).
