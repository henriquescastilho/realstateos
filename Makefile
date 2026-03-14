.PHONY: up down seed reset logs demo

up:
	docker compose up --build -d

down:
	docker compose down -v

seed:
	python scripts/seed_demo.py

reset:
	python scripts/seed_demo.py --reset

logs:
	docker compose logs -f api worker

demo: up
	@echo "⏳ Aguardando serviços subirem..."
	@sleep 10
	@$(MAKE) seed
