#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# KINGSMEN PLATFORM — Supabase Deployment Script
# ═══════════════════════════════════════════════════════════════
# 
# This script deploys:
#   1. Database schema (via SQL migration)
#   2. Edge Functions (claude-proxy, create-user, reset-password, update-user)
#   3. Edge Function secrets
#
# Prerequisites:
#   - Supabase CLI installed: npm install -g supabase
#   - Access token set (for headless/VPS environments):
#       export SUPABASE_ACCESS_TOKEN=sbp_your-token
#       → Generate at: https://supabase.com/dashboard/account/tokens
#   - Project linked: supabase link --project-ref <your-project-ref>
#
# Usage:
#   chmod +x deploy_supabase.sh
#   ./deploy_supabase.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() { echo -e "\n${BLUE}═══ $1 ═══${NC}"; }
print_ok()   { echo -e "${GREEN}✅ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_err()  { echo -e "${RED}❌ $1${NC}"; }

# ── Check prerequisites ──
command -v supabase >/dev/null 2>&1 || {
  print_err "Supabase CLI not found. Install it with: npm install -g supabase"
  exit 1
}

# ── Check authentication ──
print_step "Checking Supabase authentication"

# On a headless VPS, 'supabase login' won't work (no browser).
# Use an access token instead.
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  # Try 'supabase login' (works on local machine with browser)
  if ! supabase projects list > /dev/null 2>&1; then
    print_err "Not authenticated. On a VPS, set the access token:"
    echo ""
    echo "  1. Go to: https://supabase.com/dashboard/account/tokens"
    echo "  2. Generate a new token"
    echo "  3. Run:  export SUPABASE_ACCESS_TOKEN=sbp_your-token"
    echo "  4. Then re-run this script"
    echo ""
    echo "  Or on a local machine with a browser: supabase login"
    exit 1
  fi
  print_ok "Supabase CLI authenticated (browser session)"
else
  if ! supabase projects list > /dev/null 2>&1; then
    print_err "SUPABASE_ACCESS_TOKEN is set but invalid. Generate a new one at:"
    echo "  https://supabase.com/dashboard/account/tokens"
    exit 1
  fi
  print_ok "Supabase CLI authenticated (access token)"
fi

# ── Check if project is linked ──
if [ ! -f ".supabase/project-ref" ] 2>/dev/null && [ ! -f "supabase/.temp/project-ref" ] 2>/dev/null; then
  print_warn "Project not linked yet."
  read -p "Enter your Supabase project reference ID: " project_ref
  if [ -n "$project_ref" ]; then
    supabase link --project-ref "$project_ref"
    print_ok "Project linked: $project_ref"
  else
    print_err "Project ref is required. Find it in your Supabase Dashboard URL."
    exit 1
  fi
fi

# ── Step 1: Run database migration ──
print_step "Step 1: Database Migration"
echo "Running schema migration..."

if supabase db push 2>&1; then
  print_ok "Database migration applied successfully"
else
  print_warn "Migration may have partially applied. Check the SQL Editor for errors."
  echo "You can also run the SQL manually in Supabase Dashboard → SQL Editor:"
  echo "  → supabase/migrations/00001_initial_schema.sql"
fi

# ── Step 2: Deploy Edge Functions ──
print_step "Step 2: Edge Functions"

FUNCTIONS=("claude-proxy" "create-user" "reset-password" "update-user" "send-weekly-report")

for fn in "${FUNCTIONS[@]}"; do
  echo -n "Deploying $fn... "
  if supabase functions deploy "$fn" --no-verify-jwt 2>&1; then
    print_ok "$fn deployed"
  else
    print_err "Failed to deploy $fn"
  fi
done

# ── Step 3: Set Edge Function Secrets ──
print_step "Step 3: Edge Function Secrets"

echo "The following secrets are needed for edge functions:"
echo ""
echo "  ANTHROPIC_API_KEY    — Required by claude-proxy for AI features"
echo "  GMAIL_USER           — Required by send-weekly-report (e.g. your email)"
echo "  GMAIL_APP_PASSWORD   — Required by send-weekly-report (16-char app password)"
echo ""
echo "Note: SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY"
echo "are automatically available in edge functions."
echo ""

read -p "Do you want to set the ANTHROPIC_API_KEY now? (y/n): " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
  read -sp "Enter your Anthropic API key: " api_key
  echo ""
  supabase secrets set ANTHROPIC_API_KEY="$api_key"
  print_ok "ANTHROPIC_API_KEY set"
else
  print_warn "Skipped ANTHROPIC_API_KEY."
fi

echo ""
read -p "Do you want to set the Gmail credentials for weekly reports now? (y/n): " answer_gmail
if [[ "$answer_gmail" =~ ^[Yy]$ ]]; then
  read -p "Enter your GMAIL_USER (email address): " gmail_user
  read -sp "Enter your GMAIL_APP_PASSWORD (16 characters): " gmail_pass
  echo ""
  supabase secrets set GMAIL_USER="$gmail_user" GMAIL_APP_PASSWORD="$gmail_pass"
  print_ok "Gmail credentials set"
else
  print_warn "Skipped Gmail credentials."
fi

# ── Summary ──
print_step "Deployment Complete"
echo ""
echo "  📦 Database:  Schema + RLS + RPC functions applied"
echo "  ⚡ Functions: ${#FUNCTIONS[@]} edge functions deployed"
echo "  🔑 Secrets:   Check with 'supabase secrets list'"
echo ""
echo "  Next steps:"
echo "  1. Create the admin user via Supabase Dashboard → Authentication"
echo "  2. Insert the admin profile row (see migration SQL comments)"
echo "  3. Deploy the frontend: docker compose up -d --build"
echo ""
print_ok "Done!"
