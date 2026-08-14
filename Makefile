.PHONY: keygen dev smoke typecheck

keygen:
	node scripts/keygen.mjs

dev:
	cd worker && npx wrangler dev

typecheck:
	cd worker && npm install --silent && npm run typecheck

smoke:
	bash scripts/smoke.sh
