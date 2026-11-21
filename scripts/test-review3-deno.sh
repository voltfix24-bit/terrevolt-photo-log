#!/usr/bin/env bash
set -euo pipefail
# Runtime network is denied: storage, Graph and wakeups must use local test adapters.
deno test --no-config --node-modules-dir=none --deny-net --allow-env --allow-read \
  supabase/functions/rapport-pdf/phase2_test.ts \
  supabase/functions/rapport-pdf/review3_test.ts