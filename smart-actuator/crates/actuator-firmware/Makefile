# actuator-firmware/Makefile
#
# All firmware development tasks live here. Every actionable step from the
# plan (Phase 0 through Phase 5) has a corresponding target so that any team
# member can onboard or reproduce a step with a single command.
#
# Prerequisites: run `make firmware-setup` once, then `source ~/export-esp.sh`.
# After that, `make firmware-flash` is the day-to-day command.
#
# Delegated from the parent workspace: `make firmware-<anything>` in
# smart-actuator/ calls `make -C crates/actuator-firmware firmware-<anything>`.

# ── Pinned tool versions ───────────────────────────────────────────────────────
# Change these when upgrading the toolchain. Bump in lock-step with
# ESP_IDF_VERSION in .cargo/config.toml.
ESPUP_VERSION    ?= 0.17.1
ESPFLASH_VERSION ?= 4.4.0
LDPROXY_VERSION  ?= 0.3.4

# ── Build config ──────────────────────────────────────────────────────────────
TARGET  ?= xtensa-esp32-espidf
PROFILE ?= debug

# ── ESP export script ─────────────────────────────────────────────────────────
ESP_EXPORT := $(HOME)/export-esp.sh

# Source .env if present (gitignored; set WIFI_SSID, WIFI_PASSWORD, etc.)
# NOTE: .env may define PORT as empty (the template ships with PORT= blank to
# document the variable). We auto-detect AFTER the include so empty values
# fall through to the shell glob below.
-include .env
export WIFI_SSID
export WIFI_PASSWORD
export ACTUATOR_ID
export ACTUATOR_GRPC_PORT

# ── Serial port auto-detection ────────────────────────────────────────────────
# Tries common macOS (tty.usb*) and Linux (ttyUSB*) device names.
# Override: PORT=/dev/ttyUSB0 make firmware-flash
# Using `ifeq` (not `?=`) so that an empty PORT from .env is also overridden.
ifeq ($(strip $(PORT)),)
PORT := $(shell ls /dev/tty.usbserial-* /dev/tty.usbmodem* /dev/ttyUSB* 2>/dev/null | head -1)
endif
BAUD ?= 460800

# ── Internal helpers ──────────────────────────────────────────────────────────
# Sourced before every cargo command that needs the Xtensa toolchain.
define WITH_ESP
	. $(ESP_EXPORT) &&
endef

.PHONY: help \
        firmware-doctor firmware-toolchain firmware-tools firmware-setup firmware-env \
        firmware-check firmware-build firmware-flash firmware-monitor firmware-erase \
        firmware-wokwi firmware-clean \
        firmware-test-encoder firmware-test-stepper firmware-test-current \
        firmware-test-temp firmware-test-hal \
        _check-esp-export _check-port

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo "Usage: make [target]"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | \
	    awk -F': ' '{printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'

# ── Phase 0: Toolchain & tooling ──────────────────────────────────────────────

## firmware-doctor: Verify all host prerequisites (run before anything else)
firmware-doctor:
	@echo "==> Checking prerequisites..."
	@command -v rustup    >/dev/null 2>&1 \
	    || { echo "ERROR: rustup not found — install from https://rustup.rs"; exit 1; }
	@command -v python3   >/dev/null 2>&1 \
	    || { echo "ERROR: python3 not found"; exit 1; }
	@command -v git       >/dev/null 2>&1 \
	    || { echo "ERROR: git not found"; exit 1; }
	@command -v cmake     >/dev/null 2>&1 \
	    || { echo "ERROR: cmake not found — run: brew install cmake"; exit 1; }
	@command -v ninja     >/dev/null 2>&1 \
	    || { echo "ERROR: ninja not found — run: brew install ninja"; exit 1; }
	@command -v protoc    >/dev/null 2>&1 \
	    || { echo "ERROR: protoc not found — run: brew install protobuf"; exit 1; }
	@python3 -c "import serial" 2>/dev/null \
	    || echo "WARN: pyserial not installed (needed for some flash ops) — run: pip3 install pyserial"
	@echo "    Prerequisites OK."

## firmware-toolchain: Install the Xtensa Rust toolchain via espup (pinned version)
firmware-toolchain:
	@echo "==> Installing espup $(ESPUP_VERSION)..."
	@cargo install --locked "espup@$(ESPUP_VERSION)" \
	    || cargo install "espup@$(ESPUP_VERSION)"
	@echo "==> Running espup install (downloads Xtensa toolchain + ESP-IDF)..."
	@espup install --targets esp32
	@echo ""
	@echo "    Toolchain installed. Activate it now and in every new shell:"
	@echo ""
	@echo "      source ~/export-esp.sh"
	@echo ""
	@echo "    To make it permanent, add the above line to ~/.zshrc or ~/.bashrc."

## firmware-tools: Install host flash/monitor helpers at pinned versions
firmware-tools:
	@echo "==> Installing espflash $(ESPFLASH_VERSION)..."
	@cargo install --locked "espflash@$(ESPFLASH_VERSION)"
	@echo "==> Installing ldproxy $(LDPROXY_VERSION)..."
	@cargo install --locked "ldproxy@$(LDPROXY_VERSION)"
	@echo "    Host tools installed."

## firmware-setup: Full onboarding setup (doctor + toolchain + tools)
firmware-setup: firmware-doctor firmware-toolchain firmware-tools
	@echo ""
	@echo "==> Setup complete. Next steps:"
	@echo ""
	@echo "  1. source ~/export-esp.sh"
	@echo "  2. cp .env.example .env"
	@echo "     edit .env  — set WIFI_SSID and WIFI_PASSWORD"
	@echo "  3. make firmware-flash"
	@echo ""

## firmware-env: Print the export-esp.sh source command (paste into your shell)
firmware-env:
	@echo "source $(ESP_EXPORT)"

# ── Internal guards ───────────────────────────────────────────────────────────
_check-esp-export:
	@test -f $(ESP_EXPORT) \
	    || { echo "ERROR: $(ESP_EXPORT) not found. Run: make firmware-toolchain"; exit 1; }

_check-port:
	@test -n "$(PORT)" \
	    || { echo "ERROR: no USB serial port detected. Plug in the ESP32 or set PORT=/dev/ttyXXX"; exit 1; }

# ── Phase 0/1: Build & flash ─────────────────────────────────────────────────

## firmware-check: Compile-check for the Xtensa target (used in CI, no board needed)
firmware-check: _check-esp-export
	@. $(ESP_EXPORT) && cargo check --target $(TARGET)

## firmware-build: Build the firmware (debug by default; PROFILE=release for release)
firmware-build: _check-esp-export
	@. $(ESP_EXPORT) && cargo build --target $(TARGET) \
	    $(if $(filter release,$(PROFILE)),--release,)

## firmware-flash: Build, flash to board, and open serial monitor
firmware-flash: _check-esp-export _check-port firmware-build
	@. $(ESP_EXPORT) && espflash flash \
	    --port $(PORT) \
	    --baud $(BAUD) \
	    --monitor \
	    target/$(TARGET)/$(PROFILE)/actuator-firmware

## firmware-monitor: Attach serial monitor only (board already running firmware)
firmware-monitor: _check-port
	@espflash monitor --port $(PORT)

## firmware-erase: Erase all flash on the board (use when firmware is stuck)
firmware-erase: _check-port
	@espflash erase-flash --port $(PORT)

## firmware-wokwi: Run firmware in the Wokwi simulator (no board needed)
firmware-wokwi: _check-esp-export firmware-build
	@command -v wokwi-cli >/dev/null 2>&1 \
	    || { echo "ERROR: wokwi-cli not found — run: npm i -g @wokwi/cli"; exit 1; }
	@wokwi-cli --elf target/$(TARGET)/$(PROFILE)/actuator-firmware wokwi.toml

## firmware-clean: Remove all firmware build artefacts
firmware-clean:
	@cargo clean

# ── Phase 2: HAL smoke tests ─────────────────────────────────────────────────
# Each target flashes a minimal example binary that exercises one peripheral.
# Read the serial monitor output to confirm the peripheral is wired correctly.

define flash-example
	@. $(ESP_EXPORT) && cargo build --example $(1) --target $(TARGET)
	@. $(ESP_EXPORT) && espflash flash \
	    --port $(PORT) \
	    --baud $(BAUD) \
	    --monitor \
	    target/$(TARGET)/debug/examples/$(1)
endef

## firmware-test-encoder: AS5600 encoder smoke test (rotate shaft by hand — expect monotonic sweep)
firmware-test-encoder: _check-esp-export _check-port
	$(call flash-example,test_encoder)

## firmware-test-stepper: TMC2209 open-loop smoke test (motor should spin at constant rate)
firmware-test-stepper: _check-esp-export _check-port
	$(call flash-example,test_stepper)

## firmware-test-current: INA219 current sensor smoke test (stall motor to see current spike)
firmware-test-current: _check-esp-export _check-port
	$(call flash-example,test_current)

## firmware-test-temp: NTC thermistor smoke test (optional — touch driver IC to see reading change)
firmware-test-temp: _check-esp-export _check-port
	$(call flash-example,test_temp)

## firmware-test-hal: Run all HAL smoke tests in sequence with prompts between each
firmware-test-hal:
	@echo "==> HAL smoke test sequence (4 steps)"
	@echo ""
	@echo "Step 1/4: Encoder (AS5600)"
	@echo "  Rotate the shaft by hand. Expect angle to sweep monotonically."
	@read -p "  Press Enter to flash and start (Ctrl-C to abort)..."
	@$(MAKE) firmware-test-encoder
	@echo ""
	@echo "Step 2/4: Stepper (TMC2209)"
	@echo "  Motor should run at constant rate. Encoder reading should follow."
	@read -p "  Press Enter to flash and start..."
	@$(MAKE) firmware-test-stepper
	@echo ""
	@echo "Step 3/4: Current sensor (INA219)"
	@echo "  Stall the motor shaft briefly — expect current spike in monitor."
	@read -p "  Press Enter to flash and start..."
	@$(MAKE) firmware-test-current
	@echo ""
	@echo "Step 4/4: Temperature sensor (NTC) — optional"
	@echo "  Touch the stepper driver IC. Expect reading to rise slowly."
	@read -p "  Press Enter to flash and start (Ctrl-C to skip)..."
	@$(MAKE) firmware-test-temp || true
	@echo ""
	@echo "==> HAL smoke tests complete."
