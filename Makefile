.PHONY: keygen dev smoke typecheck test cli

keygen:
	node scripts/keygen.mjs

dev:
	cd worker && npx wrangler dev --test-scheduled

typecheck:
	cd worker && npm install --silent && npm run typecheck

test:
	cd worker && npm test

smoke:
	bash scripts/smoke.sh

cli:
	cd cli && npm link

