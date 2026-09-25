# Lost Vikings — Lore do nosso Valheim

Site estático e colaborativo pra registrar a lore do nosso mundo de Valheim 1.0.
Primeira parte: **mapa da Yggdrasil** com marcadores que qualquer um pode criar,
editar, mover e excluir. Sem login.

- HTML/CSS/JS puro, sem build. Mapa com [Leaflet](https://leafletjs.com/).
- Dados compartilhados em tempo real via **Firebase Firestore** (plano gratuito Spark).
- Hospedagem gratuita no **GitHub Pages** (ou Netlify / Cloudflare Pages).

## Usar

- **Clique no mapa** → formulário: nome, descrição/lore e cor.
- **Clique num marcador** → ver, editar ou excluir (exclusão pede um segundo clique).
- Marcadores ficam **travados** por padrão. **Clique num marcador** pra selecioná-lo
  (ganha um anel dourado) — só aí dá pra arrastar pra mudar de lugar. Clicar em
  outro lugar destrava de novo. Evita mover um ponto sem querer.
- **Ctrl+Z** desfaz sua última ação (criar, arrastar ou excluir), inclusive várias
  vezes em sequência. É só local — não desfaz o que outra pessoa fez, e não
  sobrevive a um recarregar da página.
- Botão **Marcadores** no topo abre a lista com busca.

## Rodar local

Precisa de um servidor HTTP (módulos ES não funcionam via `file://`):

```powershell
npx serve .
# ou: python -m http.server 8000
```

Sem Firebase configurado, o site roda em **modo local** (dados só no seu navegador).

## Firebase

Já configurado — projeto `lost-vikings-map`, banco Firestore em `southamerica-east1`,
regras publicadas (`firestore.rules`) e a config em `firebase-config.js`.

A `apiKey` do Firebase web não é segredo — ela vai pro navegador de qualquer jeito. O que
protege o banco são as regras. Como não há login, **qualquer pessoa com o link pode editar**;
é o combinado pra um grupo de amigos. O plano gratuito aguenta folgado (50 mil leituras / 20 mil escritas por dia).

Pra mexer no projeto pelo terminal (`firebase deploy --only firestore:rules` depois de editar
`firestore.rules`, por exemplo): `npx firebase-tools login` uma vez, depois os comandos rodam
normal nesta pasta (o `.firebaserc` já aponta pro projeto certo).

## Publicado

- Site: https://fr-mm.github.io/lost-vikings/
- Repositório: https://github.com/fr-mm/lost-vikings
- Console do Firebase: https://console.firebase.google.com/project/lost-vikings-map/overview

Pra atualizar o site: só commitar e dar `git push` — o GitHub Pages já está ativo
(Settings → Pages → branch `master` / `/ (root)`) e publica sozinho a cada push.

## Versão e changelog

A versão atual (`version.js`, mostrada no canto do cabeçalho) segue semver:
correção/ajuste sobe o patch (x.x.**X**), feature nova sobe o minor (x.**X**.0,
zera o patch). Toda mudança tem uma entrada em `changelog.html` linkada ao
commit do GitHub que a trouxe — como o link precisa do hash do commit, o
fluxo normal é: 1) fazer a mudança + subir a versão em `version.js` num
commit, 2) pegar o hash desse commit (`git log -1 --format=%H`) e escrever a
entrada do changelog linkando pra ele, geralmente num segundo commit pequeno
logo em seguida.

## Estrutura

| Arquivo | O quê |
|---|---|
| `index.html` | Página e template do formulário |
| `app.js` | Mapa, marcadores, popups, lista lateral |
| `storage.js` | Firestore (online) ou localStorage (modo local) |
| `firebase-config.js` | Config do projeto Firebase |
| `firestore.rules` | Regras de segurança do Firestore |
| `firebase.json` / `.firebaserc` | Config do Firebase CLI (aponta pro projeto `lost-vikings-map`) |
| `version.js` | Versão atual, mostrada no cabeçalho |
| `changelog.html` | Histórico de versões, cada uma linkada a um commit |
| `tree-map.png` | Sombra da Yggdrasil sobre o contorno do mapa (946×939) |

Pra trocar a imagem por outra de tamanho diferente, ajuste `IMAGE` no topo de `app.js`.
