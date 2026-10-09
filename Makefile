.PHONY: install test replay report check verify deploy
install:
	python3 -m pip install -e '.[dev,jev]'
test:
	python3 -m pytest -q
verify:      ## recompute every ProofWriter gold label with the independent solver
	hd verify
replay:      ## rescore every committed record, offline
	hd replay
report:
	hd report
check: test replay report
deploy:      ## manual fallback: build, test, upload site/dist to Amplify (pushes to main deploy automatically via GitHub Actions; AWS profile legacy)
	tools/deploy_site.sh
