# Changelog

## [0.2.0](https://github.com/marco-machado/dinheiro-cli/compare/dinheiro-cli-v0.1.0...dinheiro-cli-v0.2.0) (2026-05-30)


### Features

* accept category and account by name in CLI flags ([#15](https://github.com/marco-machado/dinheiro-cli/issues/15)) ([#21](https://github.com/marco-machado/dinheiro-cli/issues/21)) ([dd0b9ea](https://github.com/marco-machado/dinheiro-cli/commit/dd0b9ea263e5030059ba8b547eeeffeeccadf8c5))
* accounts CRUD ([b56c9cd](https://github.com/marco-machado/dinheiro-cli/commit/b56c9cda2e11b31bd92cb9124c0ccd34ad86f293))
* add closeDb() and leak-safe initDb() ([8b2f5f9](https://github.com/marco-machado/dinheiro-cli/commit/8b2f5f943cc7159438cb477102de771d1d20135f))
* add mapSqliteError to map SQLite constraint errors to typed AppError codes ([b66a468](https://github.com/marco-machado/dinheiro-cli/commit/b66a468f0b197ab2554e27307fc6eeb07edb01d4))
* bundled agentskills.io skill ([4230552](https://github.com/marco-machado/dinheiro-cli/commit/423055232ff21bc1df316c867477829a66f263e2))
* categories CRUD ([c95003c](https://github.com/marco-machado/dinheiro-cli/commit/c95003cbadf106a7ba0297e08a3306e5eca36ea6))
* **categories:** translate DB write errors to typed AppError ([9478ca9](https://github.com/marco-machado/dinheiro-cli/commit/9478ca9de815ae8e719fe806b5535dafc4b282af))
* close db connection on process exit ([f4192d7](https://github.com/marco-machado/dinheiro-cli/commit/f4192d7020c0c7c9dda26d14c9e2668b18d273a7))
* DB hardening - closeDb, rawSqlite removal, error mapping, npm packaging ([#3](https://github.com/marco-machado/dinheiro-cli/issues/3)) ([ec4f355](https://github.com/marco-machado/dinheiro-cli/commit/ec4f355fae62a09a1b02e5b32a022f2e5077c122))
* drizzle schema and initial migration ([10a3c3d](https://github.com/marco-machado/dinheiro-cli/commit/10a3c3dc141eb9bb7e565cf12ce6bcf1e4962e50))
* foundation layer — db, config, errors, output, index shell ([e7cbcf0](https://github.com/marco-machado/dinheiro-cli/commit/e7cbcf05cc1266a8a9aca09963eb8631e93614b6))
* imports canonical + list + delete ([a824e9b](https://github.com/marco-machado/dinheiro-cli/commit/a824e9bf2083c705512be18ce627fb1c13f13f70))
* nubank CSV import parser ([69bb7bb](https://github.com/marco-machado/dinheiro-cli/commit/69bb7bb73916007e0d58e0844f01cd79d4703993))
* package for distribution to npmjs.com and GitHub Packages ([#6](https://github.com/marco-machado/dinheiro-cli/issues/6)) ([168c6af](https://github.com/marco-machado/dinheiro-cli/commit/168c6afa133eaf53a6d6f61ce96aaa0578028215))
* reports monthly and statement ([f196c92](https://github.com/marco-machado/dinheiro-cli/commit/f196c9284c2e26dc02e2d8764a220085c7fc5d09))
* **reports:** add category and merchant report verbs ([#36](https://github.com/marco-machado/dinheiro-cli/issues/36)) ([cd6853f](https://github.com/marco-machado/dinheiro-cli/commit/cd6853fac8e3b2b061e18ee2939edab5b6383c57))
* **rules:** persisted categorization rules applied at import time ([#34](https://github.com/marco-machado/dinheiro-cli/issues/34)) ([b60e368](https://github.com/marco-machado/dinheiro-cli/commit/b60e368e920c28cf76c169ba7e0753900e258da9))
* transactions CRUD + batch-create ([f193607](https://github.com/marco-machado/dinheiro-cli/commit/f19360760c1e4e5f8b0ee173b8039a38c91cc3bc))
* **transactions:** add --aggregate-by and --stats to list ([#32](https://github.com/marco-machado/dinheiro-cli/issues/32)) ([87d8e26](https://github.com/marco-machado/dinheiro-cli/commit/87d8e26613d6c812e92e9f3061f0a29561465f00))
* **transactions:** add bulk categorize verb with filter, amount, and id selection ([e069ab8](https://github.com/marco-machado/dinheiro-cli/commit/e069ab89376d5c5e26206683f14b629141863268))
* **transactions:** add normalized merchant field and --merchant filter ([#38](https://github.com/marco-machado/dinheiro-cli/issues/38)) ([90b27f2](https://github.com/marco-machado/dinheiro-cli/commit/90b27f2345649a823025fd2958c49d4bb3350656))
* **transactions:** bulk categorize verb ([#33](https://github.com/marco-machado/dinheiro-cli/issues/33)) ([73a0952](https://github.com/marco-machado/dinheiro-cli/commit/73a0952d033d0ba36914e623d4929475a3415823))
* **transactions:** link reversals to originals and net them in reports ([#39](https://github.com/marco-machado/dinheiro-cli/issues/39)) ([2dc0f66](https://github.com/marco-machado/dinheiro-cli/commit/2dc0f666bfe759ce51b0bb2ac5ae4900cc727760))
* transfers ([237c439](https://github.com/marco-machado/dinheiro-cli/commit/237c439ee1b3f3f4b49224ed5eb1e3ca65d379f0))
* wire mapSqliteError into error funnel before INTERNAL fallback ([18b7157](https://github.com/marco-machado/dinheiro-cli/commit/18b7157d84e0a6c5eea21edf5520e38e2fcf9e21))


### Bug Fixes

* backfill name_normalized via normalizeName() in initDb ([e536ccf](https://github.com/marco-machado/dinheiro-cli/commit/e536ccfbb9f8548ac663d58dfb2754890d6b1d1d))
* close sqlite handle if migrate() throws in initDb ([3eb397c](https://github.com/marco-machado/dinheiro-cli/commit/3eb397c6e0ce7891c9a653ce034a904cd01ebdef))
* harden CLI error funnel and startup ([1ccbc32](https://github.com/marco-machado/dinheiro-cli/commit/1ccbc32d6f0d285eddbae8bf50168c83c897c465))
* map foreign-key constraint errors to VALIDATION_ERROR ([effc636](https://github.com/marco-machado/dinheiro-cli/commit/effc63684b403292eed814df40e40be063a5c525))
* post-review polish — CSV quoting, FK validation, update path, rollback assertion ([e3c5b15](https://github.com/marco-machado/dinheiro-cli/commit/e3c5b15722f2b0d2c10f4cbbf00f95fedfe9f137))
* publish skill assets to npm ([6b6030a](https://github.com/marco-machado/dinheiro-cli/commit/6b6030ae4eb001bf5ea6f4db608305ae79d140d6))
* **reports:** use camelCase JSON keys in monthly report ([#24](https://github.com/marco-machado/dinheiro-cli/issues/24)) ([7495146](https://github.com/marco-machado/dinheiro-cli/commit/74951465dff1db2d96b7363b88e20ca700900e77))
