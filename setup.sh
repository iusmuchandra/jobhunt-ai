#!/bin/bash

# JobHunt AI - Automated Setup Script
# This script sets up your project structure and installs dependencies

set -e  # Exit on any error

echo "🚀 JobHunt AI - Setup Script"
echo "=============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from your project root."
    exit 1
fi

echo "${BLUE}Step 1: Creating project structure...${NC}"
mkdir -p scripts
mkdir -p data
mkdir -p src/contexts
mkdir -p src/lib/notifications
mkdir -p src/lib/jobs
mkdir -p app/api/sync-jobs
mkdir -p app/api/test-email
mkdir -p app/auth/signin
mkdir -p app/auth/signup
mkdir -p app/dashboard
mkdir -p app/analytics
mkdir -p app/admin/sync
mkdir -p .github/workflows

echo "${GREEN}✓ Directories created${NC}"
echo ""

echo "${BLUE}Step 2: Installing Node.js dependencies...${NC}"
npm install sqlite sqlite3 nodemailer
npm install -D @types/nodemailer

echo "${GREEN}✓ Node.js dependencies installed${NC}"
echo ""

echo "${BLUE}Step 3: Installing Python dependencies...${NC}"
# Create requirements.txt
cat > requirements.txt << EOF
aiohttp==3.9.1
aiosqlite==0.19.0
python-dotenv==1.0.0
EOF

pip install -r requirements.txt

echo "${GREEN}✓ Python dependencies installed${NC}"
echo ""

echo "${BLUE}Step 4: Creating .env.local template...${NC}"
if [ ! -f ".env.local" ]; then
    cat > .env.local << 'EOF'
# ============================================================================
# FIREBASE CONFIGURATION
# ============================================================================
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"

# ============================================================================
# STRIPE CONFIGURATION
# ============================================================================
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

STRIPE_PRICE_PRO_MONTHLY=price_xxx_pro
STRIPE_PRICE_PREMIUM_MONTHLY=price_xxx_premium
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_xxx_enterprise

# ============================================================================
# AI CONFIGURATION
# ============================================================================
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# ============================================================================
# EMAIL CONFIGURATION (Gmail)
# ============================================================================
SENDER_EMAIL=your.email@gmail.com
SENDER_PASSWORD=your_16_char_app_password

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=your_16_char_app_password

# ============================================================================
# CRON & SECURITY
# ============================================================================
CRON_SECRET=your_random_secret_32_chars
ADMIN_SECRET=your_admin_secret_32_chars

# ============================================================================
# APP CONFIGURATION
# ============================================================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=JobHunt AI

ENABLE_AI_MATCHING=true
ENABLE_COVER_LETTER_GEN=true
ENABLE_RESUME_ANALYSIS=true
ENABLE_EMAIL_NOTIFICATIONS=true
EOF
    echo "${GREEN}✓ .env.local template created${NC}"
    echo "${YELLOW}⚠️  Please fill in your actual API keys and credentials in .env.local${NC}"
else
    echo "${YELLOW}⚠️  .env.local already exists, skipping...${NC}"
fi
echo ""

echo "${BLUE}Step 5: Creating .gitignore additions...${NC}"
cat >> .gitignore << 'EOF'

# JobHunt AI specific
.env*.local
.env.production
data/
job_intelligence.db
*.pyc
__pycache__/
requirements.txt
EOF

echo "${GREEN}✓ .gitignore updated${NC}"
echo ""

echo "${BLUE}Step 6: Creating package.json scripts...${NC}"
# Add custom scripts to package.json using jq if available
if command -v jq &> /dev/null; then
    jq '.scripts += {
        "scrape": "cd scripts && python job_scraper.py",
        "scrape:test": "cd scripts && python job_scraper.py --test",
        "sync": "curl -X POST http://localhost:3000/api/sync-jobs -H \"Authorization: Bearer $CRON_SECRET\"",
        "setup:firebase": "firebase init",
        "db:view": "sqlite3 data/job_intelligence.db"
    }' package.json > package.json.tmp && mv package.json.tmp package.json
    echo "${GREEN}✓ Custom scripts added to package.json${NC}"
else
    echo "${YELLOW}⚠️  jq not found. Please manually add scripts to package.json:${NC}"
    echo '  "scrape": "cd scripts && python job_scraper.py"'
    echo '  "scrape:test": "cd scripts && python job_scraper.py --test"'
    echo '  "sync": "curl -X POST http://localhost:3000/api/sync-jobs"'
fi
echo ""

echo "${BLUE}Step 7: Creating README for next steps...${NC}"
cat > SETUP_NEXT_STEPS.md << 'EOF'
# 🎯 Next Steps

## Configuration Required

### 1. Firebase Setup
- [ ] Go to https://console.firebase.google.com
- [ ] Create/select your project
- [ ] Enable Authentication (Email + Google)
- [ ] Enable Firestore Database
- [ ] Get your config from Project Settings
- [ ] Generate Service Account Key
- [ ] Update `.env.local` with Firebase credentials

### 2. Email Setup (Gmail)
- [ ] Go to https://myaccount.google.com/apppasswords
- [ ] Create app password for "JobHunt AI"
- [ ] Update `SENDER_EMAIL` and `SENDER_PASSWORD` in `.env.local`

### 3. AI API Setup
- [ ] Sign up at https://platform.deepseek.com
- [ ] Get API key from dashboard
- [ ] Update `DEEPSEEK_API_KEY` in `.env.local`

### 4. Security Secrets
- [ ] Generate random secrets:
  ```bash
  # On Mac/Linux:
  openssl rand -base64 32
  
  # On Windows (PowerShell):
  -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
  ```
- [ ] Update `CRON_SECRET` and `ADMIN_SECRET` in `.env.local`

### 5. Stripe Setup (Optional)
- [ ] Go to https://dashboard.stripe.com
- [ ] Get API keys (test mode)
- [ ] Create products and get price IDs
- [ ] Update Stripe variables in `.env.local`

## Testing

### Test Authentication
```bash
npm run dev
# Visit: http://localhost:3000/auth/signin
```

### Test Job Scraper
```bash
npm run scrape:test
# Check: data/job_intelligence.db should be created
```

### Test Job Sync
```bash
# Terminal 1:
npm run dev

# Terminal 2:
npm run sync
# Check Firestore for new jobs
```

### Test Email Notifications
```bash
# Visit: http://localhost:3000/api/test-email
# Check your email inbox
```

## Deployment

### Deploy to Vercel
```bash
npm i -g vercel
vercel --prod
```

### Setup GitHub Actions
1. Push code to GitHub
2. Add secrets in repo settings
3. GitHub Actions will run automatically

## Need Help?
- Check the main implementation guide
- Review Firebase/Firestore docs
- Test each component individually

Good luck! 🚀
EOF

echo "${GREEN}✓ Next steps guide created: SETUP_NEXT_STEPS.md${NC}"
echo ""

echo "=============================="
echo "${GREEN}✅ Setup Complete!${NC}"
echo "=============================="
echo ""
echo "${YELLOW}Next steps:${NC}"
echo "1. Fill in your API keys in .env.local"
echo "2. Read SETUP_NEXT_STEPS.md for detailed instructions"
echo "3. Run 'npm run dev' to start development server"
echo "4. Follow the implementation guide step by step"
echo ""
echo "${BLUE}Quick test:${NC}"
echo "  npm run dev                 # Start dev server"
echo "  npm run scrape:test         # Test job scraper"
echo ""
echo "Good luck! 🚀"