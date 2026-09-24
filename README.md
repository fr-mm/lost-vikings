# Lost Vikings — Lore do nosso Valheim

Site estático e colaborativo pra registrar a lore do nosso mundo de Valheim 1.0.
Primeira parte: **mapa da Yggdrasil** com marcadores que qualquer um pode criar,
editar, mover e excluir. Sem login.

- HTML/CSS/JS puro, sem build. Mapa com [Leaflet](https://leafletjs.com/).
- Dados compartilhados em tempo real via **Firebase Firestore** (plano gratuito Spark).
- Hospedagem gratuita no **GitHub Pages** (ou Netlify / Cloudflare Pages).

## Usar

- **Clique no mapa** → formulário: nome, descrição/lore, cor e seu nome (lembrado no navegador).
- **Clique num marcador** → ver, editar ou excluir (exclusão pede um segundo clique).
- **Arraste um marcador** pra mudar de lugar.
- Botão **Marcadores** no topo abre a lista com busca.

## Rodar local

Precisa de um servidor HTTP (módulos ES não funcionam via `file://`):

```powershell
npx serve .
# ou: python -m http.server 8000
```

Sem Firebase configurado, o site roda em **modo local** (dados só no seu navegador).

## Configurar o Firebase (uma vez, ~5 min)

1. https://console.firebase.google.com → **Adicionar projeto** (pode desligar o Analytics).
2. **Build → Firestore Database → Criar banco de dados** → modo de produção, região `southamerica-east1`.
3. Aba **Regras** → cole o conteúdo de `firestore.rules` → **Publicar**.
4. **Configurações do projeto → Seus apps → `</>` (Web)** → registre o app e copie o objeto `firebaseConfig`.
5. Cole esse objeto em `firebase-config.js` (substituindo o `null`).

A `apiKey` do Firebase web não é segredo — ela vai pro navegador de qualquer jeito. O que
protege o banco são as regras. Como não há login, **qualquer pessoa com o link pode editar**;
é o combinado pra um grupo de amigos. O plano gratuito aguenta folgado (50 mil leituras / 20 mil escritas por dia).

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e faça push deste diretório.
2. **Settings → Pages → Source: Deploy from a branch → `master` / `/ (root)`**.
3. O site fica em `https://<usuario>.github.io/<repo>/` — mande o link pro grupo.

## Estrutura

| Arquivo | O quê |
|---|---|
| `index.html` | Página e template do formulário |
| `app.js` | Mapa, marcadores, popups, lista lateral |
| `storage.js` | Firestore (online) ou localStorage (modo local) |
| `firebase-config.js` | Config do projeto Firebase |
| `firestore.rules` | Regras de segurança do Firestore |
| `tree-map.png` | Sombra da Yggdrasil sobre o contorno do mapa (946×939) |

Pra trocar a imagem por outra de tamanho diferente, ajuste `IMAGE` no topo de `app.js`.
