#!/usr/bin/env bash
# Validate Battery V2 knowledge graph — docs only.
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/validate-graph.mjs"
