.PHONY: install test replay report check verify
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
