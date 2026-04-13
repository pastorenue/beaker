.PHONY: up up-ai down build restart logs status test test-backend test-frontend lint lint-backend lint-frontend typecheck typecheck-backend typecheck-frontend psql chsql psql-shell chsql-shell test-postgres-up seed-test-postgres scripts-build generate-live-data generate-cuped-data generate-test-users-csv migrate-clickhouse-to-postgres

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

# ---------------------------------------------------------------------------
# Scripts (beaker-scripts Docker service)
# ---------------------------------------------------------------------------
# Pass extra CLI flags via ARGS, e.g.:
#   make generate-live-data ARGS="--interval 1.0 --min-events 80"
#   make generate-live-data ARGS="02bf6c74-4220-45cb-92ad-3fb79275f683"
#   make generate-live-data ARGS="--use-existing-telemetry"
#   make generate-live-data ARGS="--concurrency 5"
#   make generate-live-data ARGS="--concurrency 3 --time-spread 24"
#   make generate-cuped-data ARGS="--users 1000 --lift 0.10"
#   make generate-test-users-csv ARGS="--count 500 --output /tmp/users.csv"
#   make migrate-clickhouse-to-postgres ARGS="--dry-run"
# ---------------------------------------------------------------------------

SCRIPTS_RUN = docker-compose run --rm scripts

scripts-build:
	docker-compose build scripts

generate-live-data:
	$(SCRIPTS_RUN) generate-live-data $(ARGS)

generate-cuped-data:
	$(SCRIPTS_RUN) generate-cuped-data $(ARGS)

generate-test-users-csv:
	$(SCRIPTS_RUN) generate-test-users-csv $(ARGS)

migrate-clickhouse-to-postgres:
	$(SCRIPTS_RUN) migrate-clickhouse-to-postgres $(ARGS)
