# Shopping Sicredi — Domínios Funcionais e Fluxogramas

> Página filha de [ONBOARDING.md](./ONBOARDING.md). Um capítulo por domínio: o que faz, quais rotas/queries cada serviço expõe, quem chama o quê, e o fluxograma do domínio.

**Convenção dos diagramas:** 🔵 azul = front-end (`react`/`store`/`pixel`) · 🟢 verde = back-end (`node`/`dotnet`/`graphql`) · 🟡 amarelo = admin · ⬜ cilindro cinza = armazenamento/serviço VTEX · 🔴 tracejado vermelho = sistema externo. Setas sólidas = chamadas síncronas; pontilhadas = rotinas/eventos/auditoria. Apps com front **e** back aparecem duplicados (sufixo no rótulo indica a parte). Se o Confluence não renderizar Mermaid, use os SVGs em [`diagrams/`](./diagrams/).

**Sumário:** [D1 Autenticação](#d1--autenticação-e-login) · [D2 Pontos/Cashback](#d2--pontos-cashback-e-bônus) · [D3 Pagamentos](#d3--pagamentos-pix-e-boleto) · [D4 Vale-presente](#d4--vale-presente-gift-card-e-cupom) · [D5 Vitrine](#d5--vitrine-catálogo-e-regionalização) · [D6 Admin](#d6--admin-e-auditoria) · [D7 Rotinas](#d7--rotinas-e-mails-e-pixels-de-suporte)

---

## D1 — Autenticação e Login

O domínio mais importante do projeto: é ele que garante que **só associados Sicredi** entram no site.

**Como funciona:** o VTEX ID delega o login ao provedor customizado `sicredi.oauth-provider` (protocolo Custom OAuth). A tela de login (`/sicredi-login`) oferece dois caminhos — **código por e-mail (OTP)** ou **Google** — e nos dois o e-mail é validado contra a entidade `CA` do Master Data (`isSicrediAssociate=true`). Em paralelo, o `sicredi.login-service` cuida da **associação pós-login**: é o alvo do callback OAuth do **Segcorp** (provedor de identidade corporativo Sicredi), troca o código por token, lê os dados do associado no JWT, consulta as contas na API de parceiro (mTLS) e registra a associação nas entidades `CA`/`CL`.

O `sicredi.authentication-token-provider` é o **broker de tokens** das APIs corporativas Sicredi: nenhum serviço guarda credenciais próprias — todos pedem o token a ele (cache no VBase, segredos criptografados com AES-128-CBC, roteamento `sicrediqa`→UAT automático). A tela admin dele (cadastro de segredos) está no capítulo [D6](#d6--admin-e-auditoria).

### Rotas e queries

| App | Expõe | Observação |
| --- | --- | --- |
| `oauth-provider` (node) | `/_v/private/sicredi/oauth/{authorize, request-otp, login, token, userinfo, config, presession}` · `/_v/private/sicredi/oauth/google/{start, callback}` · `/_v/sicredi/oauth/keep-alive` · `openapi.json`, `docs`, `audit-logs` | Endpoints do protocolo OAuth consumidos pelo VTEX ID e pela própria UI de login |
| `login-service` (node) | `/login-callback` · `/_v/private/app/login/authorization` · `/_v/private/passwordless/generate/authentication` · `/_v/private/restricted/seller/:sellerId` · `/_v/private/profile` · `/_v/private/audit-logs` | `/login-callback` é o retorno do OAuth Segcorp |
| `login-service` (graphql) | Query `restrictedSellers(sellerId)` | Consumida por `login-components` |
| `authentication-token-provider` (node) | `/_v/auth-token` · `/_v/auth-token/invalidate` · `/_v/proxy/*url` — **todas privadas** | Chamadas apenas por outros serviços |
| `validate-cnpj-service` (node) | `/_v/private/validate/CNPJ/:cnpj` · `audit-logs` | Validação cadastral de CNPJ (usada no fluxo de compra PJ) |

### Quem chama o quê

| Origem (front) | Destino | Via |
| --- | --- | --- |
| `oauth-provider` (UI de login) | `oauth-provider` (node) | `config`, `request-otp`, `login`, `google/start`, `presession` |
| `login-components` | `oauth-provider` (node) | `presession`, `keep-alive` |
| `login-components` | `login-service` | `/_v/private/app/login/authorization` · Query `restrictedSellers` |
| `store-components` | `login-service` / `oauth-provider` | `passwordless` · `presession` |

```mermaid
flowchart LR
  subgraph FRONT["FRONT — UI de login (react/store)"]
    lc["sicredi.login-components"]:::front
    oap_f["sicredi.oauth-provider<br/>(UI /sicredi-login)"]:::front
  end

  subgraph BACK["BACK — serviços (node/graphql)"]
    oap_b["sicredi.oauth-provider<br/>(endpoints OAuth)"]:::back
    ls["sicredi.login-service<br/>(callback Segcorp + associação)"]:::back
    atp["sicredi.authentication-token-provider<br/>(broker de tokens)"]:::back
    vcnpj["sicredi.validate-cnpj-service"]:::back
  end

  subgraph VTEXCORE["VTEX CORE"]
    vtexid[("VTEX ID")]:::storage
    ca[("Master Data — CA/CL<br/>isSicrediAssociate")]:::storage
    vbase[("VBase<br/>OTP, pré-sessão, tokens")]:::storage
  end

  subgraph EXT["EXTERNOS"]
    segcorp["Segcorp (OAuth Sicredi)"]:::external
    google["Google OAuth"]:::external
    apigw["APIs Sicredi<br/>(api-gw / mTLS parceiro)"]:::external
  end

  oap_f --> oap_b
  lc --> oap_b
  lc --> ls
  vtexid <--> oap_b
  oap_b --> ca
  oap_b --> vbase
  oap_b --> google
  segcorp --> ls
  ls --> ca
  ls --> apigw
  atp --> vbase
  atp --> apigw
  vcnpj --> apigw
  ls -.->|audit| vbase

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```

### S1 — Sequência do gate de login (OTP por e-mail)

```mermaid
sequenceDiagram
  actor U as Associado
  participant ID as VTEX ID
  participant OP as oauth-provider (node)
  participant CA as Master Data (CA)
  participant VB as VBase

  U->>ID: Acessa o site / clica em entrar
  ID->>OP: Redireciona para o provedor Custom OAuth
  OP->>U: Tela /sicredi-login (OTP ou Google)
  U->>OP: Informa e-mail (request-otp)
  OP->>CA: Busca e-mail com isSicrediAssociate=true
  alt Não é associado
    OP-->>U: Acesso negado
  else Associado
    OP->>VB: Grava OTP com expiração
    OP-->>U: Envia código por e-mail
    U->>OP: Informa código (login)
    OP->>VB: Valida OTP
    OP-->>ID: Emite código/token OAuth
    ID-->>U: Sessão criada — navegação liberada
  end
```

---

## D2 — Pontos, Cashback e Bônus

O associado consulta **saldo e extrato de pontos**, vê **fatores de conversão** (quantos pontos valem um produto) e recebe **cashback/bônus recompra**. Os dados vêm das APIs corporativas Sicredi — sempre via token do `authentication-token-provider`.

A camada GraphQL (`points-balance-graphql`) é a porta de entrada preferida do front; alguns blocos também chamam rotas REST do `points-balance-service` diretamente. O **bônus recompra** é um cashback promocional creditado como gift card VTEX — por isso o `bonus-recompra-service` expõe rotas de `giftcard` por usuário.

### Rotas e queries

| App | Expõe |
| --- | --- |
| `points-balance-graphql` | Query `userWallets(documentNumber, creditUnion)` · `statement(walletId)` · `account(documentNumber)` · `factors` |
| `points-balance-service` (node) | `/_v/{factors, legacy-factors, wallet, statement}` · `/redeem-cashback` · `/cashback-cards` · `/update-orderform` · `/_v/private/points-balance/{wallet, points-to-expire, statement}` · `/_v/private/factors/:factorCategory` · `/_v1/private/middleware/getDataSintegra{RF,SN,ST,CPF}` · `audit-logs` |
| `points-balance-service` (dotnet) | `/_v/dotnet/test` (módulo .NET auxiliar) |
| `bonus-recompra-service` (node) | `/_v/private/giftcard/{balance, transactions}/:userId` · `/_v/private/cashback/settings[/:status]` · `/_v/private/cashback/settings/token/invalidate` · `audit-logs` |

### Quem chama o quê

| Origem (front) | Destino | Via |
| --- | --- | --- |
| `points-balance` | `points-balance-service` | `/_v/factors`, `/_v/wallet`, `/_v/statement` |
| `cashback` | `points-balance-service` | `/_v/private/factors/{CASHBACK,PRODUTOS}`, `/_v/private/points-balance/wallet` |
| `bonus-recompra-my-account` | `bonus-recompra-service` | `/_v/private/giftcard/{balance,transactions}/` |
| `store-components` | `points-balance-service` / `bonus-recompra-service` | `/_v/wallet` · `/_v/private/cashback/settings` |
| `points-balance`, `cashback`, `bonus-recompra-my-account`, `buy-together`, `vale-presente-my-account`, `login-components` | `points-balance-graphql` | Queries `account`, `userWallets`, `statement`, `factors` |

```mermaid
flowchart LR
  subgraph FRONT["FRONT — blocos do tema (react/store)"]
    pb_f["sicredi.points-balance"]:::front
    cb_f["sicredi.cashback"]:::front
    br_f["sicredi.bonus-recompra-my-account"]:::front
    bt_f["sicredi.buy-together"]:::front
  end

  subgraph GQL["CAMADA GRAPHQL"]
    pbgql["sicredi.points-balance-graphql<br/>userWallets · statement ·<br/>account · factors"]:::back
  end

  subgraph BACK["BACK — serviços (node/dotnet)"]
    pbsvc["sicredi.points-balance-service<br/>(node + dotnet)"]:::back
    brsvc["sicredi.bonus-recompra-service"]:::back
    atp["sicredi.authentication-token-provider"]:::back
  end

  subgraph VTEXCORE["VTEX CORE"]
    vbase[("VBase<br/>tokens + audit_logs")]:::storage
    gchub[("VTEX Gift Card<br/>(bônus recompra)")]:::storage
  end

  subgraph EXT["EXTERNOS"]
    apigw["APIs Sicredi<br/>(pontos/carteiras, api-gw + mTLS)"]:::external
    sintegra["SintegraWS<br/>(consulta cadastral)"]:::external
  end

  pb_f --> pbgql
  cb_f --> pbgql
  br_f --> pbgql
  bt_f --> pbgql
  pb_f --> pbsvc
  cb_f --> pbsvc
  br_f --> brsvc
  pbgql --> pbsvc
  pbsvc --> atp
  brsvc --> atp
  brsvc --> gchub
  atp --> apigw
  pbsvc --> sintegra
  pbsvc -.->|audit| vbase
  brsvc -.->|audit| vbase

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```

---

## D3 — Pagamentos (Pix e Boleto)

Pix e boleto são processados **pelos sistemas da própria Sicredi**. Para cada meio de pagamento existe um par de apps:

- O **conector PPF** (`pix-payment-provider`, `bankInvoice-payment-provider`) implementa o protocolo do gateway VTEX: o gateway chama as rotas padronizadas (`payments`, `cancellations`, `settlements`, `refunds`) durante o ciclo de vida do pagamento.
- O **serviço de integração** (`pix-service`, `bankinvoice-service`) replica essas operações contra a API de parceiro Sicredi (mTLS) — gerando QR Code Pix ou o boleto.

No front, o checkout é ajustado por `checkout-ui-settings` (customizações de UI do checkout), `payment-authorization-app` (página de autorização de pagamento), `hide-payment-methods-pixel` (esconde meios de pagamento conforme regra) e `pixel-pix-my-orders` (mostra Pix pendente nos pedidos). O bloco de login também avisa sobre **Pix pendente** (`/_v/private/pix/pending`).

### Rotas

| App | Expõe |
| --- | --- |
| `pix-payment-provider` | `/_v/api/pix/manifest` · `/_v/api/pix/payments[/:paymentId/{cancellations, settlements, refunds}]` · `audit-logs` |
| `pix-service` | `/pix/{payment-methods, manifest, payments...}` (espelho do protocolo) · `/_v/private/pix/pending` |
| `bankInvoice-payment-provider` | `/_v/api/bankinvoice/payments[...]` · `/_v/api/bankinvoice/:code` (PDF do boleto) |
| `bankinvoice-service` | `/bankinvoice/{payment-methods, manifest, payments...}` |

```mermaid
flowchart LR
  subgraph FRONT["FRONT — checkout e pedidos (react/pixel)"]
    cui["sicredi.checkout-ui-settings"]:::front
    paa["sicredi.payment-authorization-app"]:::front
    hpm["sicredi.hide-payment-methods-pixel"]:::front
    ppmo["sicredi.pixel-pix-my-orders"]:::front
    lc["sicredi.login-components<br/>(aviso de Pix pendente)"]:::front
  end

  subgraph VTEXCORE["VTEX CORE"]
    gw[("Gateway de pagamento VTEX")]:::storage
    chk[("Checkout / OMS")]:::storage
  end

  subgraph BACK["BACK — conectores PPF + integração (node)"]
    pixppf["sicredi.pix-payment-provider<br/>(protocolo PPF)"]:::back
    pixsvc["sicredi.pix-service"]:::back
    bippf["sicredi.bankInvoice-payment-provider<br/>(protocolo PPF)"]:::back
    bisvc["sicredi.bankinvoice-service"]:::back
  end

  subgraph EXT["EXTERNOS"]
    mtls["API parceiro Sicredi (mTLS)<br/>Pix QR Code · Boleto"]:::external
  end

  cui --> chk
  paa --> gw
  hpm --> chk
  chk --> gw
  gw --> pixppf
  gw --> bippf
  pixppf --> pixsvc
  bippf --> bisvc
  pixsvc --> mtls
  bisvc --> mtls
  lc --> pixsvc
  ppmo --> chk

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```

---

## D4 — Vale-presente, Gift card e Cupom

O associado compra **vale-presente** e o presenteado resgata na loja. A área "Minha conta" tem uma seção dedicada (`vale-presente-my-account`) e a página de pedidos é customizada (`my-orders-custom`) para exibir os gift cards de cada pedido.

- `vale-presente-my-account-service` concentra as consultas: lista de vales por usuário/e-mail, detalhe, transações, resgate por código e também consultas de **cupom** (uso e detalhe).
- `giftcard-service` implementa o protocolo de **Gift Card Hub** da VTEX (`/giftcards/_search`, transações, autorizações, cancelamentos, liquidações) — é ele que o Checkout consulta quando o associado paga com vale/bônus.
- `coupon-service` expõe `/coupon-validator` para validação de cupons no fluxo de compra.

### Rotas

| App | Expõe |
| --- | --- |
| `vale-presente-my-account-service` | `/_v/private/valepresente/{getIDbyRedemptionCode, getDetailByID, list, transactions, getGiftcardsByEmail, getGiftcardsByOrderIds[WithoutAuth]}` · `/_v/private/orderDetail/:orderId` · `/_v/private/coupon/{getCoupon, getCouponUsageCount}/:id` |
| `giftcard-service` | `/giftcards/_search` · `/giftcards/:id[/transactions/:tid/{authorization, cancellations, settlements}]` · `audit-logs` |
| `coupon-service` | `/coupon-validator` |

### Quem chama o quê

| Origem (front) | Destino | Via |
| --- | --- | --- |
| `vale-presente-my-account` | `vale-presente-my-account-service` | `getDetailByID`, `getGiftcardsByEmail`, `getIDbyRedemptionCode`, `transactions`, `orderDetail` |
| `my-orders-custom` | `vale-presente-my-account-service` | `getGiftcardsByOrderIds` |
| Checkout VTEX | `giftcard-service` / `coupon-service` | protocolo Gift Card Hub · `/coupon-validator` |

```mermaid
flowchart LR
  subgraph FRONT["FRONT — minha conta e pedidos (react/store)"]
    vp_f["sicredi.vale-presente-my-account"]:::front
    moc["sicredi.my-orders-custom"]:::front
  end

  subgraph BACK["BACK — serviços (node)"]
    vpsvc["sicredi.vale-presente-my-account-service"]:::back
    gcsvc["sicredi.giftcard-service<br/>(protocolo Gift Card Hub)"]:::back
    cpsvc["sicredi.coupon-service"]:::back
  end

  subgraph VTEXCORE["VTEX CORE"]
    chk[("Checkout / OMS")]:::storage
    gchub[("Gift Card Hub VTEX")]:::storage
    vbase[("VBase — audit_logs")]:::storage
  end

  subgraph EXT["EXTERNOS"]
    mtls["API parceiro Sicredi (mTLS)"]:::external
  end

  vp_f --> vpsvc
  moc --> vpsvc
  chk --> gchub
  gchub --> gcsvc
  chk --> cpsvc
  vpsvc --> chk
  gcsvc --> mtls
  gcsvc -.->|audit| vbase

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```

---

## D5 — Vitrine, Catálogo e Regionalização

O **`store-theme`** é o tema da loja (Store Framework): só blocos declarativos, sem código próprio — ele compõe os blocos dos demais apps. É o maior "hub" de dependências do workspace.

- `store-components` — coleção de componentes de vitrine customizados (simulador de frete, busca, sessão etc.).
- `custom-store-image` — componentes de imagem.
- `badges` *(misto + admin)* — selos/flags configuráveis em produtos por filtro de busca; a configuração é feita numa tela admin e servida ao front via GraphQL (`getBadges`).
- `product-availability` *(misto + admin)* — contador/aviso de estoque por faixas, mesmo padrão do badges (`getProductAvailability`).
- `regionalization` + `regionalization-graphql` — experiência regionalizada por cooperativa (a camada GraphQL expõe `status(statusCode)`).
- `edition-store` — Edition App: o pacote que define quais apps são instalados na conta.

### Queries

| App | Expõe |
| --- | --- |
| `badges` (graphql) | Query `getBadges` · Mutation `saveBadges`, `clearAll` (admin) |
| `product-availability` (graphql) | Query `getProductAvailability` · Mutation `saveProductAvailability`, `clearAll` (admin) |
| `regionalization-graphql` | Query `status(statusCode)` |

```mermaid
flowchart LR
  subgraph FRONT["FRONT — tema e blocos (react/store)"]
    theme["sicredi.store-theme<br/>(tema — hub de blocos)"]:::front
    sc["sicredi.store-components"]:::front
    csi["sicredi.custom-store-image"]:::front
    bdg_f["sicredi.badges (blocos)"]:::front
    pa_f["sicredi.product-availability (blocos)"]:::front
    rg_f["sicredi.regionalization"]:::front
  end

  subgraph BACK["BACK — graphql/node"]
    bdg_b["sicredi.badges<br/>getBadges"]:::back
    pa_b["sicredi.product-availability<br/>getProductAvailability"]:::back
    rggql["sicredi.regionalization-graphql<br/>status"]:::back
  end

  subgraph VTEXCORE["VTEX CORE"]
    catalog[("Catálogo / Intelligent Search")]:::storage
    vbase[("VBase — configs de selos/estoque")]:::storage
  end

  edst["sicredi.edition-store<br/>(Edition App — instala o conjunto)"]:::admin

  theme --> sc
  theme --> csi
  theme --> bdg_f
  theme --> pa_f
  theme --> rg_f
  sc --> catalog
  bdg_f --> bdg_b
  pa_f --> pa_b
  rg_f --> rggql
  bdg_b --> vbase
  pa_b --> vbase
  bdg_b --> catalog
  edst -.->|distribui apps| theme

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```

---

## D6 — Admin e Auditoria

Telas dentro do painel administrativo VTEX (`/admin/...`), usadas pela operação — o associado nunca as vê:

| Tela admin | App | O que faz |
| --- | --- | --- |
| `/admin/app/sicredi-audit-logs` | `admin-audit-logs` | Visualiza os logs de auditoria de **todos** os serviços |
| `/admin/app/auth-token-provider` | `authentication-token-provider` | Cadastro dos segredos OAuth Sicredi (Mutation `saveSecrets` / Query `getSavedSecretsStatus`) |
| `/admin/app/badges` | `badges` | Configura selos/flags de produto |
| `/admin/app/product-availability` | `product-availability` | Configura o contador de estoque |

O `admin-audit-logs` chama o endpoint `audit-logs` de cada serviço com o **cookie de admin do operador** (`credentials: 'include'`) — não há conta de serviço. Fontes lidas hoje: `abandoned-cart-service`, `login-service`, `bonus-recompra-service` (cashback), `giftcard-service`, `pix-payment-provider`, `points-balance-service`, `oauth-provider` e `validate-cnpj-service`. Todos gravam no mesmo shape, no bucket VBase `audit_logs` do próprio app (máx. 100 entradas, FIFO) — ver [ONBOARDING.md §4.3](./ONBOARDING.md#43-logs-de-auditoria-compartilhados).

```mermaid
flowchart LR
  subgraph ADMIN["ADMIN — telas do painel (builder admin)"]
    aal["sicredi.admin-audit-logs"]:::admin
    atp_a["sicredi.authentication-token-provider<br/>(tela de segredos)"]:::admin
    bdg_a["sicredi.badges (tela)"]:::admin
    pa_a["sicredi.product-availability (tela)"]:::admin
  end

  subgraph BACK["BACK — endpoints audit-logs (node)"]
    w1["abandoned-cart · login-service<br/>bonus-recompra · giftcard"]:::back
    w2["pix-payment-provider · points-balance<br/>oauth-provider · validate-cnpj"]:::back
    atp_b["authentication-token-provider<br/>(saveSecrets)"]:::back
  end

  subgraph VTEXCORE["VTEX CORE"]
    vbase[("VBase — bucket audit_logs<br/>(1 por serviço, cap 100 FIFO)")]:::storage
    vbsec[("VBase — segredos criptografados")]:::storage
  end

  aal -->|"GET /audit-logs (cookie admin)"| w1
  aal -->|"GET /audit-logs (cookie admin)"| w2
  atp_a --> atp_b
  atp_b --> vbsec
  w1 -.->|escrevem| vbase
  w2 -.->|escrevem| vbase
  bdg_a --> vbase
  pa_a --> vbase

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```

---

## D7 — Rotinas, E-mails e Pixels de suporte

Apps de apoio que não pertencem a um fluxo de compra específico:

- **`abandoned-cart-service`** — captura carrinhos abandonados (`/_v/abandoned-cart`) e dispara e-mail de recuperação; tem um event handler (`configureMailTemplate`) que instala o template de e-mail no setup do app. Fala com o BFF da plataforma de shopping Sicredi e com a API de parceiro.
- **`client-association-routine-service`** — rotinas de exportação de dados de associados para o **Data Lake** Sicredi (`/marketplace-datalake/v1/user`) e para o **Dinamize** (CRM/e-mail marketing, `/marketplace-dinamize/v1/user`). Lê a entidade `CA`.
- **`emails`** / **`emails-templates`** *(não-VTEX)* — framework Gulp + Handlebars + SASS que gera os HTMLs dos e-mails transacionais (cashback, cancelamento, comprou-voltou...) publicados no Message Center da VTEX.
- **`cookies`** *(pixel)* — gestão de cookies/consentimento em todas as páginas.
- **`pixel-my-account`** *(pixel)* — ajustes nos campos da página "Minha conta".

```mermaid
flowchart LR
  subgraph FRONT["FRONT — pixels (todas as páginas)"]
    ck["sicredi.cookies"]:::front
    pma["sicredi.pixel-my-account"]:::front
  end

  subgraph BACK["BACK — rotinas (node)"]
    acs["sicredi.abandoned-cart-service"]:::back
    cars["sicredi.client-association-routine-service"]:::back
  end

  subgraph BUILD["NÃO-VTEX — build de e-mails"]
    em["sicredi.emails (framework Gulp)"]:::admin
    emt["sicredi.emails-templates (HTMLs)"]:::admin
  end

  subgraph VTEXCORE["VTEX CORE"]
    chk[("Checkout / OrderForm")]:::storage
    mail[("Message Center<br/>(templates de e-mail)")]:::storage
    ca[("Master Data — CA")]:::storage
  end

  subgraph EXT["EXTERNOS"]
    dlake["Data Lake Sicredi"]:::external
    dinamize["Dinamize (CRM)"]:::external
  end

  chk -.->|carrinho abandonado| acs
  acs --> mail
  acs -.->|evento configureMailTemplate| mail
  em --> emt
  emt -.->|publicados em| mail
  cars --> ca
  cars --> dlake
  cars --> dinamize
  ck --> chk

  classDef front fill:#DEEBFF,stroke:#0747A6,color:#0747A6
  classDef back fill:#E3FCEF,stroke:#006644,color:#006644
  classDef admin fill:#FFF0B3,stroke:#FF8B00,color:#172B4D
  classDef storage fill:#F4F5F7,stroke:#42526E,color:#42526E
  classDef external fill:#FFEBE6,stroke:#BF2600,color:#BF2600,stroke-dasharray:5 5
```
