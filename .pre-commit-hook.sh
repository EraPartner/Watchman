#!/bin/bash
# Pre-commit hook to prevent committing sensitive data
# Install: ln -s ../../.pre-commit-hook.sh .git/hooks/pre-commit

echo "🔍 Running pre-commit security checks..."

# Check for .env files in staged files
if git diff --cached --name-only | grep -E '\.env(\.local|\.production)?$'; then
    echo "❌ ERROR: Attempting to commit .env file(s)!"
    echo "   .env files should never be committed to Git."
    echo "   Add them to .gitignore and use .env.example instead."
    exit 1
fi

# Check for common secret patterns in staged files
SECRETS_FOUND=false
while IFS= read -r file; do
    if [ -f "$file" ]; then
        # Check for high-entropy strings that might be secrets
        if grep -E '(password|secret|token|api_key|apikey|private_key).*=.*["\047][A-Za-z0-9+/=]{32,}["\047]' "$file" > /dev/null; then
            echo "⚠️  WARNING: Possible secret found in: $file"
            SECRETS_FOUND=true
        fi
        
        # Check for AWS keys
        if grep -E 'AKIA[0-9A-Z]{16}' "$file" > /dev/null; then
            echo "❌ ERROR: AWS Access Key found in: $file"
            exit 1
        fi
        
        # Check for private keys
        if grep -E 'BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY' "$file" > /dev/null; then
            echo "❌ ERROR: Private key found in: $file"
            exit 1
        fi
    fi
done < <(git diff --cached --name-only --diff-filter=ACM)

if [ "$SECRETS_FOUND" = true ]; then
    echo ""
    echo "⚠️  Potential secrets detected. Please review carefully."
    echo "   If these are real secrets, remove them and use environment variables."
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run environment validation for backend
if [ -d "backend" ]; then
    echo "✅ Pre-commit checks passed"
fi

exit 0
