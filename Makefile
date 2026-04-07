.PHONY: up up-ai down build restart logs status test test-backend test-frontend lint lint-backend lint-frontend typecheck typecheck-backend typecheck-frontend psql chsql psql-shell chsql-shell test-postgres-up seed-test-postgres

up:
	docker-compose up -d --build

up-ai:
	docker-compose --profile ai up -d --build

down:
	docker-compose down

build:
	docker-compose build

restart:
	make down
	make up

logs:
	docker-compose logs -f --tail=200

status:
	docker-compose ps

test:
	$(MAKE) test-backend
	$(MAKE) test-frontend

test-backend:
	docker-compose run --rm backend cargo test

test-frontend:
	docker-compose run --rm frontend npm run test --if-present

lint:
	$(MAKE) lint-backend
	$(MAKE) lint-frontend

lint-backend:
	docker-compose run --rm backend cargo fmt -- --check

lint-frontend:
	docker-compose run --rm frontend sh -c "npm install --no-package-lock && npm run lint"

typecheck:
	$(MAKE) typecheck-backend
	$(MAKE) typecheck-frontend

typecheck-backend:
	docker-compose run --rm backend cargo check

typecheck-frontend:
	docker-compose run --rm frontend sh -c "npm install --no-package-lock && npm run typecheck"

psql:
	@docker-compose exec -T postgres psql -U beaker -d beaker -c "$(QUERY)"

chsql:
	@docker-compose exec -T clickhouse clickhouse-client --query "$(QUERY)"

psql-shell:
	@docker-compose exec postgres psql -U beaker -d beaker

chsql-shell:
	@docker-compose exec clickhouse clickhouse-client

test-postgres-up:
	docker compose --profile test up postgres-test -d

seed-test-postgres:
	python3 scripts/seed_test_postgres.py --count 1000
