# Shopping Sicredi — Catálogo de Repositórios

> Página filha de [ONBOARDING.md](./ONBOARDING.md). Tabela de referência de **todos** os repositórios `sicredi.*` do workspace — para consulta, não para leitura linear. Os domínios (D1–D7) estão detalhados em [ONBOARDING-DOMINIOS.md](./ONBOARDING-DOMINIOS.md).

**Categorias** (derivadas dos builders do `manifest.json`): **FRONT** (`react`/`store`/`styles`) · **PIXEL** (`pixel`) · **BACK** (`node`/`dotnet`/`graphql`) · **PAYMENT** (`paymentProvider`) · **ADMIN** (`admin`) · **MISTO** (front + back) · **NÃO-VTEX**. O builder `docs` está presente em quase todos e foi omitido da coluna.

| App | Categoria | Builders | Domínio | Expõe | Consome (`sicredi.*`) | Observações |
| --- | --- | --- | --- | --- | --- | --- |
| `abandoned-cart-service` | BACK | node | D7 | `/_v/abandoned-cart` · `audit-logs` · evento `configureMailTemplate` | — | E-mail de carrinho abandonado; fala com BFF Sicredi e Message Center |
| `admin-audit-logs` | ADMIN | admin, react, messages | D6 | tela `/admin/app/sicredi-audit-logs` | endpoints `audit-logs` de 8 serviços | Leitor central de auditoria; usa cookie do operador |
| `authentication-token-provider` | MISTO + ADMIN | node, graphql, admin, react, messages | D1 | `/_v/auth-token[/invalidate]` · `/_v/proxy/*` (privadas) · GraphQL `saveSecrets`/`getSavedSecretsStatus` · tela `/admin/app/auth-token-provider` | — | **Broker de tokens** das APIs Sicredi; segredos AES-128-CBC no VBase; roteia `sicrediqa`→UAT |
| `badges` | MISTO + ADMIN | node, graphql, admin, react, store, messages | D5 | Query `getBadges` · Mutations admin | — | Selos/flags de produto por filtro; config no VBase |
| `bankInvoice-payment-provider` | PAYMENT | node, paymentProvider | D3 | `/_v/api/bankinvoice/payments...` (protocolo PPF) · `/_v/api/bankinvoice/:code` (PDF) | `bankinvoice-service` | Conector de boleto chamado pelo gateway VTEX |
| `bankinvoice-service` | BACK | node | D3 | `/bankinvoice/{manifest, payment-methods, payments...}` | — | Integração boleto com API parceiro Sicredi (mTLS) |
| `bonus-recompra-my-account` | FRONT | react, store, styles, messages | D2 | blocos "Minha conta" | `points-balance`, `points-balance-graphql`, `bonus-recompra-service` (REST) | UI do cashback promocional |
| `bonus-recompra-service` | BACK | node | D2 | `/_v/private/giftcard/{balance,transactions}/:userId` · `/_v/private/cashback/settings...` · `audit-logs` | `authentication-token-provider` | Bônus recompra = gift card VTEX |
| `buy-together` | FRONT | react, store, styles | D5/D2 | blocos "compre junto" (PDP) | `points-balance-graphql` | Vitrine de produtos combinados |
| `cashback` | FRONT | react, store, styles, messages | D2 | blocos de cashback | `login-components`, `points-balance`, `points-balance-graphql`, `points-balance-service` (REST) | |
| `checkout-ui-settings` | FRONT | checkout-ui-custom, pages, react | D3 | JS/CSS custom do checkout | `login-service` (`/_v/private/profile`) | Customização da UI nativa do checkout |
| `client-association-routine-service` | BACK | node | D7 | `/marketplace-datalake/v1/user` · `/marketplace-dinamize/v1/user` | — | Rotinas de exportação de associados (Data Lake, Dinamize); lê entidade `CA` |
| `cookies` | PIXEL | pixel | D7 | script em todas as páginas | — | Gestão de cookies/consentimento |
| `coupon-service` | BACK | node | D4 | `/coupon-validator` | — | Validação de cupom no fluxo de compra |
| `custom-store-image` | FRONT | react, store, messages | D5 | blocos de imagem | — | |
| `documentation` | NÃO-VTEX | — | — | esta documentação | — | |
| `edition-store` | OUTRO | edition | D5 | — | — | Edition App: define o conjunto de apps instalado na conta |
| `emails` | NÃO-VTEX | — (Gulp/Handlebars/SASS) | D7 | HTMLs de e-mail transacional | — | Framework base bojler; publica no Message Center |
| `emails-templates` | NÃO-VTEX | — | D7 | templates finais + dados de exemplo | — | |
| `giftcard-service` | BACK | node | D4 | `/giftcards/_search` · `/giftcards/:id/transactions...` (Gift Card Hub) · `audit-logs` | — | Provedor de gift card consultado pelo Checkout |
| `hide-payment-methods-pixel` | FRONT/PIXEL | pixel, react, store | D3 | script no checkout | — | Esconde meios de pagamento por regra |
| `login-components` | FRONT | react, store, styles, messages | D1 | blocos de login para o tema | `login-service`, `oauth-provider` (REST), `points-balance-graphql`, `pix-service` (Pix pendente) | |
| `login-service` | BACK | node, graphql | D1 | `/login-callback` · `/_v/private/{app/login/authorization, passwordless..., restricted/seller, profile, audit-logs}` · Query `restrictedSellers` | — | Callback OAuth do Segcorp; grava associação em `CA`/`CL`; tem `CLAUDE.md` próprio |
| `my-orders-custom` | FRONT | react, store, pixel, messages | D4 | página "Meus pedidos" customizada | `vale-presente-my-account-service`, `login-service` (passwordless) | |
| `oauth-provider` | MISTO | node, react, store | D1 | `/_v/private/sicredi/oauth/{authorize, request-otp, login, token, userinfo, google/*, presession, config}` · `keep-alive` · `audit-logs` · UI `/sicredi-login` | — | **O gate do site**: Custom OAuth do VTEX ID validando `CA.isSicrediAssociate`; OTP ou Google; tem `CLAUDE.md` próprio |
| `payment-authorization-app` | FRONT | pages, react, messages | D3 | página de autorização de pagamento | — | |
| `pix-payment-provider` | PAYMENT | node, paymentProvider | D3 | `/_v/api/pix/{manifest, payments...}` (protocolo PPF) · `audit-logs` | `pix-service` | Conector Pix chamado pelo gateway VTEX |
| `pix-service` | BACK | node | D3 | `/pix/{manifest, payment-methods, payments...}` · `/_v/private/pix/pending` | — | Integração Pix com API parceiro (mTLS); QR Code |
| `pixel-my-account` | PIXEL | pixel | D7 | script na "Minha conta" | — | Ajusta campos da página |
| `pixel-pix-my-orders` | PIXEL | pixel | D3 | script em "Meus pedidos" | — | Exibe Pix pendente |
| `points-balance` | FRONT | react, store, styles, messages | D2 | blocos de saldo/extrato de pontos | `login-components`, `points-balance-graphql`, `points-balance-service` (REST) | |
| `points-balance-graphql` | BACK | node, graphql | D2 | Query `userWallets`, `statement`, `account`, `factors` | `points-balance-service` | Porta GraphQL do domínio de pontos |
| `points-balance-service` | BACK | node, dotnet | D2 | `/_v/{factors, wallet, statement}` · `/redeem-cashback` · `/update-orderform` · `/_v/private/points-balance/*` · rotas Sintegra · `audit-logs` | `authentication-token-provider` | Núcleo do domínio de pontos; módulo .NET auxiliar |
| `product-availability` | MISTO + ADMIN | node, graphql, admin, react, store, messages | D5 | Query `getProductAvailability` · Mutations admin | — | Contador/aviso de estoque por faixas |
| `regionalization` | FRONT | react, store, styles | D5 | blocos de regionalização | `regionalization-graphql` | Experiência por cooperativa/região |
| `regionalization-graphql` | BACK | node, graphql | D5 | Query `status(statusCode)` | — | |
| `store-components` | FRONT | react, store, styles | D5 | blocos de vitrine (frete, busca, sessão...) | `login-components`, `points-balance-service`, `bonus-recompra-service`, `login-service`, `oauth-provider` (REST) | Maior coleção de componentes custom |
| `store-theme` | FRONT | store, styles, assets | D5 | o tema da loja (blocos declarativos) | `badges`, `buy-together`, `cashback`, `custom-store-image`, `login-components`, `my-orders-custom`, `points-balance`, `product-availability`, `store-components` | **Hub**: sem código, só composição de blocos |
| `vale-presente-my-account` | FRONT | react, store, styles, messages | D4 | seção vale-presente na "Minha conta" | `points-balance`, `points-balance-graphql`, `vale-presente-my-account-service` (REST) | |
| `vale-presente-my-account-service` | BACK | node | D4 | `/_v/private/valepresente/*` · `/_v/private/orderDetail/:orderId` · `/_v/private/coupon/*` | — | |
| `validate-cnpj-service` | BACK | node | D1 | `/_v/private/validate/CNPJ/:cnpj` · `audit-logs` | — | Validação cadastral de CNPJ |

**Notas:**

- Apps **MISTO** aparecem duplicados nos fluxogramas (um nó front, um nó back).
- A coluna *Consome* lista apenas dependências/chamadas a outros apps `sicredi.*` (declaradas no `manifest.json` ou encontradas no código). Todos os apps consomem também serviços nativos VTEX (Checkout, Catálogo, Master Data, VBase...).
- Serviços com endpoint `audit-logs` participam do contrato de auditoria compartilhado — ver [ONBOARDING.md §4.3](./ONBOARDING.md#43-logs-de-auditoria-compartilhados).
- Apps com `CLAUDE.md`/documentação própria na raiz: `oauth-provider`, `authentication-token-provider`, `admin-audit-logs`, `login-service`. **O contrato do app prevalece** sobre esta tabela em caso de divergência.
