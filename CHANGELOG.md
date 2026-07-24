# Changelog

## [0.0.10](https://github.com/kubeara/core/compare/v0.0.9...v0.0.10) (2026-07-22)


### Features

* support multiple users on the same server with a single agent ([e74bce5](https://github.com/kubeara/core/commit/e74bce5c514d2bd1b7c0b33e7e6dfc19b4855b3c))

## [0.0.9](https://github.com/kubeara/core/compare/v0.0.8...v0.0.9) (2026-07-20)


### Features

* Add 'baggage' and 'sentry-trace' headers to CORS options ([e027a6e](https://github.com/kubeara/core/commit/e027a6e23c3ebf1c63e07f6ca2f09b02085d5246))
* Enhance billing and plans seeders to support SSL in production environment ([6fd7086](https://github.com/kubeara/core/commit/6fd70864c0f97b617d4e11d166ae36193f16e4f1))
* support multiple users on the same server with a single agent ([2b0e1a5](https://github.com/kubeara/core/commit/2b0e1a565200982f8818f7888e1ee75425187c0a))


### Bug Fixes

* Added few logs to debug the cron job flow ([aa7e0ca](https://github.com/kubeara/core/commit/aa7e0cac7f227bbe099efb332921389ffff30e82))
* Added few logs to debug the cron job flow ([6181b19](https://github.com/kubeara/core/commit/6181b19a5310ba652fe9fe9318bb41daaa4901e1))
* Done minor UI changes ([76ba3a2](https://github.com/kubeara/core/commit/76ba3a2689b6fb871d394c4303bc6b9ee63f2d17))
* Standardize capitalization of Kubeara in setup guides and configuration files ([3d1e831](https://github.com/kubeara/core/commit/3d1e8317efd42dfa9a69834f3288f0e7cf4e42f1))
* Update references from Kubera to Kubeara across multiple components and pages ([1f9a28d](https://github.com/kubeara/core/commit/1f9a28d015343da19436f321efc65c1c72598d8f))
* Updated the package-lock file by installing dependencies ([8930a13](https://github.com/kubeara/core/commit/8930a1363a41268a0e035156758f7273cf7c37c0))


### Refactoring

* remove session revocation and commented out terminal connection logic ([f3237bd](https://github.com/kubeara/core/commit/f3237bdb681681d58159cdd6937b2afa2634c439))

## [0.0.8](https://github.com/kubeara/core/compare/v0.0.7...v0.0.8) (2026-07-14)


### Features

* add activity logging for server and deployment operations ([b83219e](https://github.com/kubeara/core/commit/b83219e8b71f6bf7c60c5c32ac25e71bf78b44c9))
* add health check configuration for agent services in Docker Compose ([705688b](https://github.com/kubeara/core/commit/705688b3a3ece760375ff47b004c93bde0cae74a))
* sync authenticated user with Sentry and Microsoft Clarity ([5879872](https://github.com/kubeara/core/commit/5879872d553bd17099333da650ca3c3908438ee7))
* sync authenticated user with Sentry and Microsoft Clarity ([f9bd0ac](https://github.com/kubeara/core/commit/f9bd0acfaa82fb110b51dcd255b87e32df53fcea))


### Bug Fixes

* Add warning popup to restart, stop actions of agent app ([7829172](https://github.com/kubeara/core/commit/782917215379ff9fcd828257da1f282f0b0d2cac))
* update ChatGPT MCP guide due to changes from ChatGPT side ([a3ed066](https://github.com/kubeara/core/commit/a3ed066a775f149c1079d5666d53d4546948079a))


### Refactoring

* standardize deployment status handling across applications ([eff4d3c](https://github.com/kubeara/core/commit/eff4d3c2a6a279ed7f40477c7fbb3b1bd459ccff))

## [0.0.7](https://github.com/kubeara/core/compare/v0.0.6...v0.0.7) (2026-07-10)


### Features

* enhance container deletion process and error handling ([6d5a7bb](https://github.com/kubeara/core/commit/6d5a7bb306e42ca9076f63e3d9343e7321df334e))


### Refactoring

* Improve copy tooltip design ([1b2138f](https://github.com/kubeara/core/commit/1b2138f1e17f511e28c40a1173bea17202dd89b2))

## [0.0.6](https://github.com/kubeara/core/compare/v0.0.5...v0.0.6) (2026-07-09)


### Bug Fixes

* env variables fallback ([183af6e](https://github.com/kubeara/core/commit/183af6ed43c26434bbeb49cf0e1f10f19c881030))
* env variables fallback ([96ced13](https://github.com/kubeara/core/commit/96ced13fd1e2605f62e477d60424e3880c2693b2))

## [0.0.5](https://github.com/kubeara/core/compare/v0.0.4...v0.0.5) (2026-07-08)


### Bug Fixes

* Merge branch 'main' of https://github.com/kubeara/core into feature/email-integration ([f1b65ea](https://github.com/kubeara/core/commit/f1b65eafb971a5e730967f147ee1aa963ae54272))

## [0.0.4](https://github.com/kubeara/core/compare/v0.0.3...v0.0.4) (2026-07-08)


### Features

* add detailed JSDoc comments to components in the templates feature ([41b2d17](https://github.com/kubeara/core/commit/41b2d175c0932bd5d5293d6820cdcf9853a0731d))
* Add Services Page, Replace Templates Page, and Update Marketplace Navigation ([ffffb3a](https://github.com/kubeara/core/commit/ffffb3a2a9d0af2c9d6052bc7b6f7236ee39188e))

## [0.0.3](https://github.com/kubeara/core/compare/v0.0.2...v0.0.3) (2026-07-07)


### Features

* add axios for improved HTTP requests in McpOAuthCimdService ([17cdab4](https://github.com/kubeara/core/commit/17cdab4d27a8625e35d6fa6be492e36d3b999fe7))
* enhance ChatGPT OAuth integration with CIMD support ([c59d0c0](https://github.com/kubeara/core/commit/c59d0c0d32019096dd44433444006cc3c128ed04))
* enhance CIMD client ID handling and validation ([9d7a992](https://github.com/kubeara/core/commit/9d7a992cdb33d0bf0aeabf0f73e2c52bfc3710ca))


### Refactoring

* enhance metadata URL construction and fetch handling ([156504e](https://github.com/kubeara/core/commit/156504ec701a8c7a731036b7bcfc2c608f638849))
* improve CIMD client ID URL parsing and validation ([f7d00f7](https://github.com/kubeara/core/commit/f7d00f73f77c5974cee8662be51b202d7e258664))
* improve metadata fetching in McpOAuthCimdService ([8a1fbff](https://github.com/kubeara/core/commit/8a1fbfffdd60b221c4a9d1bb1656664eb9a91e8a))
* standardize formatting and improve readability in McpOAuthCimdService ([322aab1](https://github.com/kubeara/core/commit/322aab16d5dd9752f13c00c08bd91ac0ba1ab8a2))
* streamline CIMD client ID handling and metadata fetching ([e7a83be](https://github.com/kubeara/core/commit/e7a83beaa999ff6a670b40bcf3f69266935e7222))

## [0.0.2](https://github.com/kubeara/core/compare/v0.0.1...v0.0.2) (2026-07-03)


### Features

* Add deletedAt field and revoke token confirmation modal ([bbd013f](https://github.com/kubeara/core/commit/bbd013f77476bd7400429a7115e5cc491823d016))
* add deployment status retrieval functionality ([0fac0c6](https://github.com/kubeara/core/commit/0fac0c6acb80562e37dd69804b5b8b80196ed53e))
* add deployment status retrieval functionality ([62573d2](https://github.com/kubeara/core/commit/62573d2a3565d84bcd92d58f5df1915d19b73463))
* Add port availability validation and improve terminal viewer experience and added new column for token revoking ([01408bf](https://github.com/kubeara/core/commit/01408bf071962bdad906848930408d2eda466512))
* Add RAM and CPU resource validation for container deployments ([885164a](https://github.com/kubeara/core/commit/885164a2a334f2e574196404ab2d61b32f1b64d4))
* add service templates and improve Docker Compose health checks for Hetzner E2E ([9ff9c26](https://github.com/kubeara/core/commit/9ff9c26fa98ef480f492e9c6a45ffe0c3abe23dc))
* Add skip resource validation option for deployments ([b7e07b4](https://github.com/kubeara/core/commit/b7e07b46c7af4a8f49fa9f390e75ae27044ab0b8))
* Add skip resource validation option for deployments ([56ed9ef](https://github.com/kubeara/core/commit/56ed9ef386f0f77375e585094d3932cb4f96ac4a))
* add terminal functionality to agent and control panel apps ([9291cfe](https://github.com/kubeara/core/commit/9291cfeaa1f4b68c5f6c256c80576cf040cedbd5))
* Add VS Code setup guide and configuration for MCP integration ([3b99cdc](https://github.com/kubeara/core/commit/3b99cdcc9c0c142771dee51ffc0af73dd035983c))
* Add VS Code setup guide and configuration for MCP integration ([598184b](https://github.com/kubeara/core/commit/598184b7a4f573f50519b9efc1524ead1efae660))
* enhance authentication with cookie-based token management ([5053033](https://github.com/kubeara/core/commit/50530331d631a082beef7b7141b3ae40a0a84a60))
* enhance authentication with cookie-based token management ([2f97e5d](https://github.com/kubeara/core/commit/2f97e5dad236b91447f1b5c7ed8cb3ae49ce0604))
* Enhance container discovery and UI components ([8c9edab](https://github.com/kubeara/core/commit/8c9edabf365bd13890b8c5a1814feab7b2d66d57))
* enhance deployment and container management with service name integration ([4c4f1fd](https://github.com/kubeara/core/commit/4c4f1fdea4e5516aff93627d08f24ae97e1b3b53))
* enhance MCP server error handling and constants ([334e620](https://github.com/kubeara/core/commit/334e6205ced3bd10ec710d0fa54e978a37511883))
* enhance MCP server tools with new service management capabilities ([27b4750](https://github.com/kubeara/core/commit/27b4750e353b94c345a2445d7adb2b7f8371cd80))
* enhance MCP server tools with new service management capabilities ([90656a2](https://github.com/kubeara/core/commit/90656a2de536982678156b812806fe295e5814c3))
* Enhance server deletion process and operation status management ([ca40731](https://github.com/kubeara/core/commit/ca4073104a1f764eb9a7782b04daa988be60649b))
* Enhance server detail and terminal viewer UI ([b36a63f](https://github.com/kubeara/core/commit/b36a63ff0129b8e18f87804a6838c3b2722a367f))
* enhance server resource metrics collection and UI ([8667a5b](https://github.com/kubeara/core/commit/8667a5bf699f28a24974a7501ac1fe4da6e9f812))
* Enhance template management and UI components ([84517b2](https://github.com/kubeara/core/commit/84517b2029b605f4ca6e288428328a8f25d95b99))
* Enhance template management and UI components ([969622e](https://github.com/kubeara/core/commit/969622e53043a256f8f3ce46531078b0dc689952))
* Enhance terminal viewer functionality and styling ([0571dc9](https://github.com/kubeara/core/commit/0571dc987d58ecf8f8cddd10f6ba3b1223da2a64))
* Enhance theme management and UI components ([b89bfe5](https://github.com/kubeara/core/commit/b89bfe5e50f1f1f10382ffd838d8b7e1e65bdd51))
* Implement agent removal functionality and enhance deployment teardown process ([ea5ff83](https://github.com/kubeara/core/commit/ea5ff837a6da6c3ce7593806d0345c1d87ab1ea4))
* implement MCP servers page with API key management and setup gu… ([0ec17c6](https://github.com/kubeara/core/commit/0ec17c6d47c708b24b7f1b14e281a0b731453a38))
* implement MCP servers page with API key management and setup guides ([44bca3c](https://github.com/kubeara/core/commit/44bca3c5265cfabb82d9f7b96961d5ea3320f254))
* implement OAuth support for ChatGPT integration ([fd6c0ac](https://github.com/kubeara/core/commit/fd6c0acc4d106db3267d1ce294620807f3174977))
* implement OAuth support for ChatGPT integration ([aa1d740](https://github.com/kubeara/core/commit/aa1d7402dddbc1a7713249717867c8ef96f92f3e))
* Implement pre-deployment port availability checks ([5402e57](https://github.com/kubeara/core/commit/5402e57fbe8cab2a2ee9dd7097d12c975d86134c))
* implement server resource metrics collection ([8717d3b](https://github.com/kubeara/core/commit/8717d3bd81c371e5f324cce7130469f33d69fe66))
* implement server resource metrics collection ([725dd72](https://github.com/kubeara/core/commit/725dd72c47375b02d97bb152b7aac8506148fef4))
* initialize monorepo structure with control-panel and agent applications, shared libraries, and initial service templates. ([e290b56](https://github.com/kubeara/core/commit/e290b56c5f25e4771d73b3a187e68e4044f46579))


### Bug Fixes

* add agent app ([9aff506](https://github.com/kubeara/core/commit/9aff506dece705ea3271db29162216f2f8555258))
* add migration on service-template entity and updated template seed parsing logic ([826cc4a](https://github.com/kubeara/core/commit/826cc4a3b2aade877a078c1b20ef5364253a823d))
* add seedTemplates function to seed service templates from JSON files and add seeder to seed multiple files ([daf7938](https://github.com/kubeara/core/commit/daf793891e8cb99141b2a4980c7ca1f25207aee1))
* add SSH connection handling improvements, fix privateKey flow issue, update TypeORM version, and improve folder structure consistency ([0f1b5ad](https://github.com/kubeara/core/commit/0f1b5ad040b62c4ef40bde7c8a68198ff746a5d3))
* add template gitea, gitlab-ce, code-server, sql, grafana, prometheus and uptime-kuma ([f5e1be3](https://github.com/kubeara/core/commit/f5e1be3e5e7d1bb68aa45de5f817241421308884))
* add template wordpress, strapi, and directus ([9b29310](https://github.com/kubeara/core/commit/9b2931081cec08da30203a3ba371f463daabbbaa))
* add template wordpress, strapi, and directus ([b23109c](https://github.com/kubeara/core/commit/b23109c37b84678e1665e4ed38a6adbf8fa76b55))
* added comments and moved interfaces to dedicated file ([3283722](https://github.com/kubeara/core/commit/3283722193eda250524cada3b6aaeacd5fedb3db))
* added logo for flowise and anythingLLM ([b2e9a57](https://github.com/kubeara/core/commit/b2e9a5701e59ddcc7f0543ff3723016a2e97c492))
* added logos for the new template service ([570d612](https://github.com/kubeara/core/commit/570d6129cbf0db9b2c3a3120a5160173ec01c74d))
* change agent app image name to prod ([030159a](https://github.com/kubeara/core/commit/030159ad18a613c39cf17b14b229b0cea28f2be1))
* change agent app image name to prod ([9016b9f](https://github.com/kubeara/core/commit/9016b9f1f89a853eeb1e922cb781d264ddbb3911))
* change spa to console-app ([f5bd59b](https://github.com/kubeara/core/commit/f5bd59b5543fbe2131ae8179d9138d4ded463aa2))
* changed spa name to console-app ([756bb54](https://github.com/kubeara/core/commit/756bb545c8f1c06fae139946237a84cda1a573d4))
* comments ([26b246e](https://github.com/kubeara/core/commit/26b246e573b15a7167aea51d80d1aded8e714361))
* cors related issue ([d519f22](https://github.com/kubeara/core/commit/d519f22391a66143abd07d9f034de10186f53f99))
* Deployment validation issue for port and cpu check ([e3c2ebb](https://github.com/kubeara/core/commit/e3c2ebb949a253329f472d135f1e5d2bf2ec4a91))
* Enhance UI and functionality for server forms and deployment logs ([71cce6f](https://github.com/kubeara/core/commit/71cce6f93b7fde6affd7086769e07bf02f15d4cd))
* Error Message Update ([91cc5ff](https://github.com/kubeara/core/commit/91cc5ff39213be2566a21aab792876488d4c8a2b))
* Error Message Update ([9fc269a](https://github.com/kubeara/core/commit/9fc269a7916ca92a5f33b2e04b278828723b5973))
* github issue [#12](https://github.com/kubeara/core/issues/12) ([8bdd4f7](https://github.com/kubeara/core/commit/8bdd4f75173fbd9d52ea25f65bad7f18bd79c28b))
* group containers by managed type and clean display names in server detail tabs while removing unused test utilities. ([4d9e007](https://github.com/kubeara/core/commit/4d9e00744bb1b1abdd0d8c9d1338f48ea5652010))
* Improve error handling and logging in Docker resource management ([92fc686](https://github.com/kubeara/core/commit/92fc686b83ccf74b2d5e9c9e62aee016fefd69d9))
* improved error handling and removed unnecessary code ([83518cb](https://github.com/kubeara/core/commit/83518cbb6625d18bd241881a5035237d7ef0b00a))
* lint issue ([68beaf4](https://github.com/kubeara/core/commit/68beaf45091128f139b610716e25415fdf5e3985))
* lint issues ([86e238f](https://github.com/kubeara/core/commit/86e238fb3cb119f2b0936ec9aa24c702f511ae92))
* linting issue and add util service ([d04718d](https://github.com/kubeara/core/commit/d04718dc08971cd1909549b0fd40d1fcf2c23cd3))
* Merge branch 'main' of https://github.com/kubeara/core into feature/grafana ([7201a99](https://github.com/kubeara/core/commit/7201a99f82cd13be210a1738df5ae07b16817ee2))
* Merge branch 'main' of https://github.com/kubeara/core into feature/grafana ([cc6302d](https://github.com/kubeara/core/commit/cc6302d3e9a222b301abc015498d8c9be902713e))
* merging conflicts with development branch ([ea03d20](https://github.com/kubeara/core/commit/ea03d20becef28d9bd90371017c5c96677b5c4dc))
* minor lint error ([3b474db](https://github.com/kubeara/core/commit/3b474db3895234be94f340f40974d53b276bd64a))
* minor lint error ([a3d0565](https://github.com/kubeara/core/commit/a3d056579956347c71e18be0e462b1c9ccc033d5))
* modularize authentication, standardize environment constants, and cleanup obsolete database migrations, resolve comments ([27f7c82](https://github.com/kubeara/core/commit/27f7c82d1918d8970dac929843f90960fba5a351))
* ollama e2e hetzner health check issue ([d986e44](https://github.com/kubeara/core/commit/d986e44cf0a95d98832ef4392ca33977483748e4))
* Overview tab improvements ([2f68f02](https://github.com/kubeara/core/commit/2f68f026b122781b53e013092bf7af8235df591e))
* Profile section changes ([32f2471](https://github.com/kubeara/core/commit/32f2471ab9c94a57befbe34d06609694ca80da92))
* remove cascading deletes from entity relationships, adjust auth security settings, and update environment configuration ([0c29371](https://github.com/kubeara/core/commit/0c29371b4ae5ecd42656662bb0310e889fb7f81f))
* remove unnecessary env variables which are not in use ([f3c715b](https://github.com/kubeara/core/commit/f3c715baf882bfb466342869c2e8b2f6844b9aed))
* remove unnecessary env variables which are not in use ([d7bd24e](https://github.com/kubeara/core/commit/d7bd24e7ff8ce361e22587a95fb9280405faf2c5))
* Removed sensitive logs from ssh credentials ([99ac7b8](https://github.com/kubeara/core/commit/99ac7b808d9b1f56c694b08171c3c4933601d4b5))
* resolve nested output path issue in control-panel-app build pipeline ([87c63d5](https://github.com/kubeara/core/commit/87c63d577a45d877f35fdd3802d25c7cad199cc2))
* resolved comments for interfaces and enums and comments ([9579628](https://github.com/kubeara/core/commit/95796280535266ffd8c9d527b789a8a2b1230903))
* resolved comments regarding code practices ([f3f1c9a](https://github.com/kubeara/core/commit/f3f1c9a2a467e6aa1788dda935512ae1816648cc))
* searching issue of listing api ([93c0e15](https://github.com/kubeara/core/commit/93c0e15edd2bc7a5c7ddeab5e90d204bcd8c447b))
* separate the template seeder file to handle multiple seedings ([233d47a](https://github.com/kubeara/core/commit/233d47a630e2614bf92202ea89005a5cc0349dd9))
* server create api validation fix ([6495895](https://github.com/kubeara/core/commit/649589548b0deba86781410dcae2fb9e058991ca))
* signoz and appwrite ([8448f35](https://github.com/kubeara/core/commit/8448f35d1bee3980367e680ef6c55f2ff31c2ed6))
* Simplify deployment failure messages for port conflicts ([a168277](https://github.com/kubeara/core/commit/a1682779246562a32a22ea9cb3374d5ef3b42a67))
* sync lock files ([fb63b9e](https://github.com/kubeara/core/commit/fb63b9e183371f60c28a9cb673cb5f08eb922bc4))
* template failing for redis ([f36d519](https://github.com/kubeara/core/commit/f36d519161057294383210362e94699a17bed436))
* test template run script with hetzner ([af73b18](https://github.com/kubeara/core/commit/af73b18a85ae9eeaad2f8fb9ac013c7abd278e38))
* UI changes ([a0b2738](https://github.com/kubeara/core/commit/a0b2738c79d62655553f160b99296f401f8392aa))
* UI changes ([dc19596](https://github.com/kubeara/core/commit/dc195964a62b8c85b383c9e8f638a3d675c96b9f))
* unique constraint for username and host, fix seeder ([b37c1d7](https://github.com/kubeara/core/commit/b37c1d7445976b7e7918abd799665b822668007d))
* update husky with lint ci command: ([7b0afc1](https://github.com/kubeara/core/commit/7b0afc17d868deb4b566f75e2f3ce6b1b7f8ee1a))
* update husky with lint ci command: ([3176d84](https://github.com/kubeara/core/commit/3176d84ec691e6e509ef9c5464ec2269a7447620))
* update ollama model to have default model installed ([a4b0694](https://github.com/kubeara/core/commit/a4b0694e3a9ce75a11b65986887218a284060d7a))
* update sorting fields and improve server detail UI ([d66b9fe](https://github.com/kubeara/core/commit/d66b9fe06582113d01fd6fa4c12d84bcccdf0967))
* update variable names and template docker file ([696aae4](https://github.com/kubeara/core/commit/696aae4811c2517c5b134ac6a69f87c02b06b67e))
* updated descriptions and logos for the yml files ([d287eeb](https://github.com/kubeara/core/commit/d287eeb55922ea0b55627a0a5274227ea2c008b5))
* updated package-lock.json ([627c7dd](https://github.com/kubeara/core/commit/627c7dd0f6a7cc7076075f16a28f815d1e193123))
* updated package-lock.json ([13b2499](https://github.com/kubeara/core/commit/13b2499f156b58e535fc47c2346821250577ad59))
* updated package-lock.json ([6565d56](https://github.com/kubeara/core/commit/6565d5644fcec1d547b7a68cfe55d03b995a4657))
* url issue ([587993b](https://github.com/kubeara/core/commit/587993b335574a9dec8a2980eddd9ab0cd42de10))
* woodpecker ci hetzner issue ([7778260](https://github.com/kubeara/core/commit/777826028fe32f5c94036f3f9be4cbcd5edc5490))


### Documentation

* add clarification comment for OAuth parameters storage function ([d00c0d1](https://github.com/kubeara/core/commit/d00c0d1bd7f7050249d4745f7b95f6cf2255c9bd))
* update the gitignore file ([9c343cf](https://github.com/kubeara/core/commit/9c343cf162d6fa5db247102d3eb1838f77d0aff5))


### Refactoring

* committing refactored code by lint fixing ([5e4d581](https://github.com/kubeara/core/commit/5e4d581f975d44e690ad5c6a383f328df0230955))
* enforce strict app-level environment file isolation and validation for control-panel-app and seeding scripts ([e89db6d](https://github.com/kubeara/core/commit/e89db6df5cd7a3a78aff5c5ab46b6663e98527ba))
* Enhance error handling and logging across services ([e2d68bf](https://github.com/kubeara/core/commit/e2d68bfb40c9bdc223205d873fd21bf086699c3d))
* replace ContainerDiscoveryService with ContainerService and implement container lifecycle actions ([3d620a1](https://github.com/kubeara/core/commit/3d620a1cf7ab15134fb0ba93ec5fa83991cbb995))
* Replace port availability checks with resource validation for deployments ([b6fd295](https://github.com/kubeara/core/commit/b6fd2951adbfacea76c6ec954961e0170047c366))
* simplify type definitions in auth-cookie and deployment events services ([6ceda23](https://github.com/kubeara/core/commit/6ceda23399d30840d668e15cb4d50f9bd556e447))
* simplify type definitions in auth-cookie and deployment events services ([8e40d9c](https://github.com/kubeara/core/commit/8e40d9caf2aea2bf89aea79779e749ac43d9ccb8))
* streamline type definition for deployment status formatting ([3fcfc9b](https://github.com/kubeara/core/commit/3fcfc9b3b76a19af2f16a41f550938a7478701dd))
* switch from sessionStorage to in-memory caching for OAuth authorization parameters ([39404cc](https://github.com/kubeara/core/commit/39404cc9cf32e4027f73af01d5c55f256431746a))
* update deployment logs and terminal components ([2ec1aad](https://github.com/kubeara/core/commit/2ec1aad71ce5adcdf6b6e00a15dcd75adf6952e3))
* Update server detail tabs and improve UI components ([65be53f](https://github.com/kubeara/core/commit/65be53fdbe40273989fa42cabb50fb88f7551f96))
* Update server detail tabs and improve UI components ([9878c35](https://github.com/kubeara/core/commit/9878c35250cae4c3a05d7be02b55ff26ca6f401a))

## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release Please maintains this file automatically when release pull requests are merged.
