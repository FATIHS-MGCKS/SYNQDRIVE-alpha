#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p analysis
python3 prepare_inputs.py
node --import ./loader.mjs ./replay.mjs
node --import ./loader.mjs ./candidate-experiment.mjs
node --import ./loader.mjs ./ablation.mjs
python3 analyze.py
node --import ./loader.mjs ./reference-event-diagnostic.mjs
