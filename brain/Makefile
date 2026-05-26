## help: Display this message
help:
	@echo "Usage: make [target]"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## install: Install Python dependencies
install:
	pip install -e ".[dev]"
