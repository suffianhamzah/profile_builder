SHELL := /bin/sh

NPM ?= npm
NODE ?= node
APP_URL ?= http://localhost:3000
STATE_FILE_PATH ?= ./data/state.json
BROWSER_SCRIPTS := .agents/skills/web-browser/scripts

.DEFAULT_GOAL := help

.PHONY: help setup install env dev start clear-store test typecheck build check browser-setup browser-start browser-open browser-network browser-logs

help:
	@printf '%s\n' \
		'make setup           Install app and browser-skill dependencies' \
		'make dev             Start Atlas in development mode' \
		'make clear-store     Delete the saved local profile and conversation' \
		'make check           Run tests, typecheck, and production build' \
		'make browser-start   Start a fresh browser on CDP port 9222' \
		'make browser-open    Open APP_URL in the controlled browser'

setup: install env browser-setup

install:
	$(NPM) ci

env:
	@if [ -f .env ] || [ -f .env.local ]; then \
		echo 'Environment file already exists; leaving it unchanged.'; \
	else \
		cp .env.example .env; \
		echo 'Created .env from .env.example; add MODEL_API_KEY and MODEL_NAME.'; \
	fi

dev:
	$(NPM) run dev

start:
	$(NPM) run start

clear-store:
	@$(NODE) -e 'const fs = require("node:fs"); const path = require("node:path"); const target = path.resolve(process.argv[1]); try { fs.unlinkSync(target); console.log(`Cleared local store at $${target}`); } catch (error) { if (error.code === "ENOENT") console.log(`Local store is already empty at $${target}`); else throw error; }' "$(STATE_FILE_PATH)"

test:
	$(NPM) test

typecheck:
	$(NPM) run typecheck

build:
	$(NPM) run build

check:
	$(NPM) test
	$(NPM) run typecheck
	$(NPM) run build

browser-setup:
	$(NPM) ci --prefix $(BROWSER_SCRIPTS)

browser-start:
	$(NODE) $(BROWSER_SCRIPTS)/start.js

browser-open:
	$(NODE) $(BROWSER_SCRIPTS)/nav.js $(APP_URL)

browser-network:
	$(NODE) $(BROWSER_SCRIPTS)/net-summary.js

browser-logs:
	$(NODE) $(BROWSER_SCRIPTS)/logs-tail.js
