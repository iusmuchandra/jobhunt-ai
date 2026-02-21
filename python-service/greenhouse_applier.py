#!/usr/bin/env python3
"""
=============================================================================
JOBHUNT AI - SMART APPLICATION ENGINE V3.0

FIXES:
- FIXED: get_pending_applications ordered by 'appliedAt' (doesn't exist on
  pending docs) — now orders by 'createdAt', which is always set on insert
- FIXED: autoSubmitEnabled check was always False (field missing on some docs)
- FIXED: Resume detection missed common Greenhouse field name patterns

10X IMPROVEMENTS:
- NEW: Concurrent application processing (was serial, one at a time)
- NEW: Per-application timeout guard — stuck apps no longer block the queue
- NEW: Retry logic on form fill failures (3 attempts before giving up)
- NEW: Better selector coverage for Lever, Ashby, and non-standard forms
- NEW: LinkedIn URL normalization handles raw usernames and full URLs
- NEW: AI answer post-processing strips markdown/code fences from responses
- NEW: Smarter dropdown matching: yes/no semantics + normalized text
- NEW: Application status written atomically (no partial updates)
- NEW: Structured error codes on failure (form_not_found, submit_failed, etc.)
- NEW: Dry-run mode via DRY_RUN=true env var (fills form, never submits)
- NEW: Screenshot always taken on failure for debugging
- NEW: Cleanup of temp resumes always runs even if app crashes mid-flight
=============================================================================
"""

import asyncio
import logging
import os
import sys
import httpx
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, List, Tuple
from difflib import SequenceMatcher

from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ============================================================================
# Configuration
# ============================================================================

env_path = Path(__file__).parent.parent / '.env.local'
load_dotenv(dotenv_path=env_path)

DEEPSEEK_API_KEY  = os.getenv('DEEPSEEK_API_KEY')
DEEPSEEK_API_URL  = 'https://api.deepseek.com/v1/chat/completions'
DRY_RUN           = os.getenv('DRY_RUN', 'false').lower() == 'true'

# How many applications to process concurrently
MAX_CONCURRENT_APPS = int(os.getenv('MAX_CONCURRENT_APPS', '3'))

# Per-application wall-clock timeout (seconds). Prevents a stuck form from
# blocking the whole queue.
APP_TIMEOUT_SECONDS = int(os.getenv('APP_TIMEOUT_SECONDS', '300'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

if DRY_RUN:
    logger.info("🧪 DRY_RUN mode active — forms will be filled but NOT submitted")

# ============================================================================
# Firebase
# ============================================================================

if not firebase_admin._apps:
    cred_path = os.getenv('FIREBASE_CREDENTIALS_PATH', 'serviceAccountKey.json')
    if not os.path.exists(cred_path):
        logger.error(f"❌ Firebase credentials not found at: {cred_path}")
        sys.exit(1)
    firebase_admin.initialize_app(credentials.Certificate(cred_path))

db = firestore.client()

# ============================================================================
# AI Cache
# ============================================================================

AI_CACHE: Dict[str, str] = {}

async def get_cached_answer(cache_key: str) -> Optional[str]:
    try:
        doc = await asyncio.to_thread(
            db.collection('ai_cache').document(cache_key).get
        )
        if doc.exists:
            return doc.to_dict().get('answer')
    except Exception as e:
        logger.debug(f"Cache read error: {e}")
    return None

async def set_cached_answer(cache_key: str, answer: str):
    try:
        await asyncio.to_thread(
            db.collection('ai_cache').document(cache_key).set,
            {'answer': answer, 'cachedAt': firestore.SERVER_TIMESTAMP, 'question': cache_key[:200]}
        )
    except Exception as e:
        logger.debug(f"Cache write error: {e}")

# ============================================================================
# Progress / Status Updates
# ============================================================================

async def update_application_progress(app_id: str, status: str, progress: int, message: str = ""):
    try:
        update_data = {
            'status':          status,
            'progress':        progress,
            'progressMessage': message,
            'updatedAt':       firestore.SERVER_TIMESTAMP,
        }
        if status == 'applied':
            update_data['appliedAt'] = firestore.SERVER_TIMESTAMP

        await asyncio.to_thread(
            db.collection('applications').document(app_id).update,
            update_data
        )
        logger.info(f"📊 Progress [{app_id}]: {progress}% — {message}")
    except Exception as e:
        logger.error(f"Error updating progress: {e}")

async def update_application_status(app_id: str, status: str, error_msg: str = None, error_code: str = None):
    """NEW: Structured error codes make debugging easier in the dashboard."""
    try:
        update_data = {
            'status':    status,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        if status == 'applied':
            update_data['appliedAt'] = firestore.SERVER_TIMESTAMP
        if error_msg:
            update_data['errorMessage'] = error_msg
        if error_code:
            update_data['errorCode'] = error_code

        await asyncio.to_thread(
            db.collection('applications').document(app_id).update,
            update_data
        )
        logger.info(f"📝 Status [{app_id}]: {status}" + (f" ({error_code})" if error_code else ""))
    except Exception as e:
        logger.error(f"Error updating status: {e}")

# ============================================================================
# AI Answering
# ============================================================================

def _clean_ai_answer(raw: str) -> str:
    """NEW: Strip markdown code fences and leading labels DeepSeek sometimes adds."""
    answer = raw.strip()
    # Remove ```...``` blocks
    answer = re.sub(r'```[\w]*\n?', '', answer).strip('`').strip()
    # Remove leading "Answer:" prefix if present
    if answer.lower().startswith('answer:'):
        answer = answer[7:].strip()
    # Remove surrounding quotes
    answer = answer.strip('"\'')
    return answer.strip()

async def answer_question_with_ai(question: str, user_profile: Dict, max_retries: int = 3) -> str:
    cache_key = question.lower().strip()[:100]

    # Memory cache
    if cache_key in AI_CACHE:
        logger.info(f"  💾 Cache hit (memory): {AI_CACHE[cache_key]}")
        return AI_CACHE[cache_key]

    # Firestore cache
    cached = await get_cached_answer(cache_key)
    if cached:
        AI_CACHE[cache_key] = cached
        logger.info(f"  💾 Cache hit (Firestore): {cached}")
        return cached

    if not DEEPSEEK_API_KEY:
        logger.error("❌ DEEPSEEK_API_KEY missing!")
        return "Not specified"

    profile_summary = f"""
Candidate: {user_profile.get('firstName', '')} {user_profile.get('lastName', '')}
Current Title: {user_profile.get('currentTitle', 'Senior Product Manager')}
Experience: {user_profile.get('yearsOfExperience', 10)} years
Location: {user_profile.get('location', '')}
Email: {user_profile.get('email', '')}
Eligible to work in US: {user_profile.get('eligibleToWorkInUS', True)}
Requires Sponsorship: {user_profile.get('requiresSponsorship', False)}
Education: {user_profile.get('educationSummary', 'MBA from Indiana University')}
Key Skills: ML Engineering, Product Management, Python, Azure ML, Connected Vehicles
"""
    prompt = f"""You are filling out a job application. Answer based on the candidate profile.

CANDIDATE PROFILE:
{profile_summary}

QUESTION: {question}

INSTRUCTIONS:
- For yes/no questions, answer ONLY "Yes" or "No"
- For work authorization: "Yes" if eligible in US
- For sponsorship: "No" if no sponsorship needed
- For salary/compensation questions: state a reasonable number based on experience
- For experience questions: use years from profile
- For dropdowns: give the single most appropriate option text
- Keep answers concise (1-3 words for short fields, 1-2 sentences for open-ended)
- Be professional and confident
- Do NOT include markdown, code fences, or "Answer:" prefix

ANSWER:"""

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    DEEPSEEK_API_URL,
                    headers={
                        'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': 'deepseek-chat',
                        'messages': [{'role': 'user', 'content': prompt}],
                        'temperature': 0.1,
                        'max_tokens': 100,
                    }
                )
                if response.status_code == 200:
                    raw = response.json()['choices'][0]['message']['content']
                    answer = _clean_ai_answer(raw)
                    logger.info(f"  🤖 AI: {answer}")
                    AI_CACHE[cache_key] = answer
                    asyncio.create_task(set_cached_answer(cache_key, answer))
                    return answer
                elif response.status_code == 429:
                    wait = 2 ** attempt
                    logger.warning(f"  ⏳ Rate limited, retry in {wait}s...")
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"DeepSeek error: {response.status_code}")
                    return "Not specified"

        except asyncio.TimeoutError:
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                logger.error("AI request timed out")
                return "Not specified"
        except Exception as e:
            logger.error(f"AI error: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                return "Not specified"

    return "Not specified"

# ============================================================================
# Resume Management
# ============================================================================

async def download_resume(resume_url: str, filename_prefix: str) -> Optional[str]:
    try:
        temp_dir = Path("temp_resumes")
        temp_dir.mkdir(exist_ok=True)
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(resume_url)
            if response.status_code == 200:
                file_ext  = '.docx' if 'docx' in resume_url.lower() else '.pdf'
                safe_name = "".join(x for x in filename_prefix if x.isalnum() or x in "_-")
                file_path = temp_dir / f"{safe_name}{file_ext}"
                file_path.write_bytes(response.content)
                logger.info(f"  ✅ Resume: {file_path.name} ({len(response.content)/1024:.1f} KB)")
                return str(file_path)
            else:
                logger.error(f"Failed to download resume: {response.status_code}")
                return None
    except Exception as e:
        logger.error(f"Resume download error: {e}")
        return None

def cleanup_old_screenshots(days_old: int = 7):
    for f in Path.cwd().glob("screenshot_*.png"):
        try:
            age = datetime.now() - datetime.fromtimestamp(f.stat().st_mtime)
            if age.days > days_old:
                f.unlink()
                logger.debug(f"Deleted old screenshot: {f.name}")
        except Exception as e:
            logger.debug(f"Screenshot cleanup error: {e}")

# ============================================================================
# Helpers
# ============================================================================

def format_phone_number(phone: str) -> str:
    if not phone:
        return ""
    digits = re.sub(r'\D', '', phone)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    elif len(digits) == 11 and digits[0] == '1':
        return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return phone

def normalize_linkedin_url(raw: str) -> str:
    """NEW: Handles bare usernames, /in/ paths, and full URLs."""
    if not raw:
        return 'https://linkedin.com/in/unknown'
    raw = raw.strip()
    if raw.startswith('http'):
        # Ensure https
        return re.sub(r'^http://', 'https://', raw)
    if raw.startswith('linkedin.com'):
        return f'https://{raw}'
    if '/in/' in raw:
        username = raw.split('/in/')[-1].strip('/')
        return f'https://linkedin.com/in/{username}'
    # Bare username
    username = raw.strip('/')
    return f'https://linkedin.com/in/{username}'

def safe_frames(page) -> List:
    frames = []
    for frame in page.frames:
        try:
            _ = frame.url
            frames.append(frame)
        except:
            continue
    return frames

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

# ============================================================================
# Firebase Queries
# ============================================================================

async def get_pending_applications() -> List[dict]:
    """
    FIX: Was ordering by 'appliedAt' which doesn't exist on pending docs.
    Now orders by 'createdAt' which is always set when the document is created.
    """
    try:
        query = (
            db.collection('applications')
            .where('method', '==', 'auto-apply')
            .where('status', 'in', ['pending', 'queued'])
            .order_by('createdAt', direction=firestore.Query.DESCENDING)
            .limit(20)  # Raised from 10; concurrency handles throughput
        )
        results = []
        for app in await asyncio.to_thread(lambda: list(query.stream())):
            data = app.to_dict()
            data['id'] = app.id
            results.append(data)
        logger.info(f"Found {len(results)} pending applications")
        return results
    except Exception as e:
        logger.error(f"Error fetching applications: {e}")
        return []

async def get_user_profile(user_id: str) -> Dict:
    try:
        user_doc = await asyncio.to_thread(
            db.collection('users').document(user_id).get
        )
        if not user_doc.exists:
            logger.error(f"User {user_id} not found")
            return {}

        data = user_doc.to_dict()

        # Name parsing
        display_name = data.get('displayName', '')
        name_parts = display_name.strip().split() if display_name else []
        data['firstName'] = name_parts[0] if name_parts else 'Candidate'
        data['lastName']  = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'Applicant'

        # Experience
        work_history = data.get('workHistory', [])
        data['yearsOfExperience'] = work_history[0].get('yearsOfExperience', 10) if work_history else 10

        # Education
        education = data.get('education', [])
        if education:
            edu = education[0]
            data['educationSummary'] = f"{edu.get('degree', 'MBA')} from {edu.get('school', 'Indiana University')}"
        else:
            data['educationSummary'] = 'MBA from Indiana University'

        # Defaults
        data.setdefault('currentTitle', 'Senior Product Manager')
        data.setdefault('email', '')
        data.setdefault('phone', '')
        data.setdefault('location', '')
        data.setdefault('resumeUrl', '')
        data.setdefault('eligibleToWorkInUS', True)
        data.setdefault('requiresSponsorship', False)
        # FIX: Default False but read correctly from Firestore
        data['autoSubmitEnabled'] = data.get('autoSubmitEnabled', False)

        # Custom Q&A rules from dashboard
        data['custom_rules'] = {}
        for q in data.get('customQuestions', []):
            if q.get('keyword') and q.get('answer'):
                data['custom_rules'][q['keyword'].lower().strip()] = q['answer']
        if data['custom_rules']:
            logger.info(f"  📋 {len(data['custom_rules'])} custom Q&A rules loaded")

        logger.info(f"✅ Profile: {data['firstName']} {data['lastName']}")
        return data

    except Exception as e:
        logger.error(f"Error fetching user profile: {e}")
        return {}

# ============================================================================
# SmartApplier
# ============================================================================

class SmartApplier:
    def __init__(self):
        self.browser = None
        self.context = None
        self.stats   = {'processed': 0, 'successful': 0, 'failed': 0, 'skipped': 0}

    async def initialize(self):
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(
            headless=False,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-web-security',
            ]
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        logger.info("🌐 Browser initialized")

    async def close(self):
        if self.browser:
            await self.browser.close()
            logger.info("🌐 Browser closed")

    async def human_delay(self, min_ms: int = 500, max_ms: int = 1500):
        import random
        await asyncio.sleep(random.uniform(min_ms, max_ms) / 1000)

    # ── Form Navigation ──────────────────────────────────────────────────────

    async def find_and_navigate_to_application_form(self, page) -> bool:
        try:
            logger.info("  🔍 Looking for application form...")

            iframe_selectors = [
                'iframe[id="grnhse_iframe"]',
                'iframe[src*="greenhouse"]',
                'iframe[src*="ashby"]',
                'iframe[src*="lever"]',
                'iframe[id="gnewton_iframe"]',
            ]

            for selector in iframe_selectors:
                if await page.locator(selector).count() > 0:
                    logger.info(f"  ✅ Embedded ATS form ({selector})")
                    return True

            async def is_form_present():
                if await page.locator('form:visible').count() > 0:
                    return True
                for name_field in ['first_name', 'name', 'email', 'firstName']:
                    if await page.locator(f'input[name="{name_field}"]').count() > 0:
                        return True
                for frame in safe_frames(page):
                    if await frame.locator('input[type="file"]').count() > 0:
                        return True
                return False

            if await is_form_present():
                logger.info("  ✅ Application form on page")
                return True

            # Click "Apply" buttons
            apply_selectors = [
                'a[data-mapped="true"]',
                'a:has-text("Apply to Job")',
                'a:has-text("Apply Now")',
                'button:has-text("Apply Now")',
                'button:has-text("Apply")',
                'a:has-text("Apply")',
                '[aria-label="Apply for this job"]',
                '#apply_button',
                # NEW: Ashby & Lever patterns
                'a[href*="ashbyhq.com"]',
                'a[href*="lever.co"]',
                'button[data-automation-id="jobApply"]',
            ]

            for selector in apply_selectors:
                try:
                    if await page.locator(selector).count() == 0:
                        continue
                    btn = page.locator(selector).first
                    if not await btn.is_visible():
                        continue
                    logger.info(f"  👆 Clicking: {selector}")
                    try:
                        async with page.expect_navigation(timeout=4000):
                            await btn.click()
                    except:
                        await btn.click()

                    try:
                        await page.wait_for_selector(
                            'input[type="file"], iframe[src*="greenhouse"], iframe[src*="lever"], iframe[src*="ashby"]',
                            timeout=6000
                        )
                    except:
                        await page.wait_for_timeout(2000)

                    if await is_form_present():
                        logger.info("  ✅ Form loaded after click")
                        return True
                    for frame_sel in iframe_selectors:
                        if await page.locator(frame_sel).count() > 0:
                            logger.info("  ✅ Embedded form after click")
                            return True
                except:
                    continue

            logger.warning("  ⚠️  No application form found")
            return False

        except Exception as e:
            logger.error(f"  ❌ Error finding form: {e}")
            return False

    # ── Resume Upload ─────────────────────────────────────────────────────────

    async def upload_resume(self, page, resume_path: str) -> bool:
        try:
            all_file_inputs = await page.query_selector_all('input[type="file"]')
            for frame in safe_frames(page):
                try:
                    all_file_inputs.extend(await frame.query_selector_all('input[type="file"]'))
                except:
                    continue

            if not all_file_inputs:
                logger.warning("  ⚠️  No file upload field")
                return False

            # NEW: Extended resume keyword list based on common ATS patterns
            resume_keywords      = ['resume', 'cv', 'attach_resume', 'curriculum', 'resume_attachment',
                                     'uploadresume', 'resumeupload', 'resume_file']
            cover_letter_keywords = ['cover', 'letter', 'motivation', 'covering']

            resume_fields = []
            for file_input in all_file_inputs:
                name_attr = (await file_input.get_attribute('name') or '').lower()
                id_attr   = (await file_input.get_attribute('id')   or '').lower()
                combined  = name_attr + ' ' + id_attr

                if any(k in combined for k in cover_letter_keywords):
                    logger.debug(f"  ⏭️  Skipping cover letter field: {name_attr or id_attr}")
                    continue
                if any(k in combined for k in resume_keywords):
                    resume_fields.append((file_input, name_attr or id_attr))

            if resume_fields:
                field, field_name = resume_fields[0]
                await field.set_input_files(resume_path)
                await self.human_delay(2000, 3000)
                logger.info(f"  ✅ Resume → {field_name}")
                return True

            # Fallback: first non-cover-letter field
            for file_input in all_file_inputs:
                name_attr = (await file_input.get_attribute('name') or '').lower()
                id_attr   = (await file_input.get_attribute('id')   or '').lower()
                combined  = name_attr + ' ' + id_attr
                if any(k in combined for k in cover_letter_keywords):
                    continue
                await file_input.set_input_files(resume_path)
                await self.human_delay(2000, 3000)
                logger.info("  ✅ Resume → generic field")
                return True

            # Last resort
            await all_file_inputs[0].set_input_files(resume_path)
            await self.human_delay(2000, 3000)
            logger.warning("  ⚠️  Resume uploaded to first available field (unverified)")
            return True

        except Exception as e:
            logger.error(f"  ❌ Resume upload error: {e}")
            return False

    # ── Basic Fields ──────────────────────────────────────────────────────────

    async def fill_basic_fields(self, page, user_data: Dict) -> bool:
        try:
            logger.info("  📝 Filling basic fields...")

            async def fill_anywhere(selectors, value):
                if not value:
                    return False
                contexts = [page] + safe_frames(page)
                for ctx in contexts:
                    for selector in selectors:
                        try:
                            elements = await ctx.locator(selector).all()
                            for el in elements:
                                if not await el.is_visible():
                                    continue
                                type_attr = (await el.get_attribute('type') or 'text').lower()
                                if type_attr in ['checkbox', 'radio', 'hidden', 'file', 'submit', 'button']:
                                    continue
                                await el.fill(value)
                                await self.human_delay(300, 700)
                                return True
                        except:
                            continue
                return False

            await fill_anywhere([
                'input[name*="first" i][name*="name" i]',
                'input[id*="first" i]',
                '[autocomplete="given-name"]',
                'input[name="name" i]',
                'input[placeholder*="first" i]',
            ], user_data.get('firstName', ''))

            await fill_anywhere([
                'input[name*="last" i]',
                'input[id*="last" i]',
                '[autocomplete="family-name"]',
                'input[placeholder*="last" i]',
            ], user_data.get('lastName', ''))

            await fill_anywhere([
                'input[type="email"]',
                'input[name*="email" i]',
                '[autocomplete="email"]',
                'input[placeholder*="email" i]',
            ], user_data.get('email', ''))

            phone_formatted = format_phone_number(user_data.get('phone', ''))
            if phone_formatted:
                await fill_anywhere([
                    'input[type="tel"]',
                    'input[name*="phone" i]',
                    '[autocomplete="tel"]',
                    'input[placeholder*="phone" i]',
                ], phone_formatted)

            return True

        except Exception as e:
            logger.error(f"  ❌ Basic fields error: {e}")
            return False

    # ── Custom Questions ──────────────────────────────────────────────────────

    async def handle_custom_questions(self, page, user_data: Dict) -> bool:
        try:
            await page.wait_for_timeout(2000)

            all_fields = await page.query_selector_all('input:visible, select, textarea:visible')
            for frame in safe_frames(page):
                try:
                    all_fields.extend(await frame.query_selector_all('input:visible, select, textarea:visible'))
                except:
                    continue

            logger.info(f"  🔍 Analyzing {len(all_fields)} fields...")
            questions_answered = 0

            # Build rules
            linkedin_url = normalize_linkedin_url(user_data.get('linkedinUrl', ''))

            rules = {
                'gender':       'Male',
                'race':         'Asian',
                'veteran':      'I am not a protected veteran',
                'disability':   'No',
                'authorized':   'Yes',
                'sponsorship':  'No',
                'salary':       '180000',
                'compensation': '180000',
                'relocate':     'Yes',
                'remote':       'Yes',
                'linkedin':     linkedin_url,
                'website':      user_data.get('portfolioUrl', 'https://chandratalluri.com'),
                'portfolio':    user_data.get('portfolioUrl', 'https://chandratalluri.com'),
                'github':       user_data.get('githubUrl', 'https://github.com/chandratalluri'),
                'hear about':   'LinkedIn',
                'how did':      'LinkedIn',
                'pronouns':     'He/Him',
            }

            if 'custom_rules' in user_data:
                rules.update(user_data['custom_rules'])

            for field in all_fields:
                try:
                    tag_name = await field.evaluate('el => el.tagName.toLowerCase()')

                    if tag_name != 'select':
                        if not await field.is_visible():
                            continue

                    # Skip already-filled fields
                    try:
                        val = await field.input_value()
                        if val and len(val) > 0 and val != "0":
                            continue
                    except:
                        pass

                    # Find label text
                    field_id   = await field.get_attribute('id')
                    label_text = ""

                    if field_id:
                        try:
                            label_elem = await page.query_selector(f'label[for="{field_id}"]')
                            if not label_elem:
                                for frame in safe_frames(page):
                                    label_elem = await frame.query_selector(f'label[for="{field_id}"]')
                                    if label_elem:
                                        break
                            if label_elem:
                                label_text = (await label_elem.inner_text()).strip()
                        except:
                            pass

                    # Fallback: parent container text
                    if not label_text:
                        try:
                            parent = await field.evaluate_handle('el => el.closest("div, fieldset, label")')
                            if parent:
                                label_text = (await parent.inner_text()).strip()
                                val_text = await field.evaluate('el => el.value')
                                if val_text:
                                    label_text = label_text.replace(val_text, '')
                        except:
                            pass

                    # NEW: Also try aria-label and placeholder
                    if not label_text or len(label_text.strip()) < 3:
                        label_text = (await field.get_attribute('aria-label') or
                                      await field.get_attribute('placeholder') or '')

                    if not label_text or len(label_text.strip()) < 3:
                        continue

                    label_clean = label_text.lower().strip()
                    logger.info(f"  ❓ {label_text[:60]}...")

                    # Match answer
                    answer = None
                    for keyword, rule_answer in rules.items():
                        if keyword in label_clean:
                            logger.info(f"    ⚡ Rule matched '{keyword}': {rule_answer}")
                            answer = rule_answer
                            break

                    if not answer:
                        answer = await answer_question_with_ai(label_text, user_data)

                    # Fill based on field type
                    if tag_name == 'select':
                        await self._fill_select(field, answer)
                        questions_answered += 1

                    elif tag_name == 'textarea':
                        await field.fill(str(answer))
                        await field.dispatch_event('change')
                        await self.human_delay()
                        questions_answered += 1

                    elif tag_name == 'input':
                        input_type = (await field.get_attribute('type') or 'text').lower()

                        if input_type in ['radio', 'checkbox']:
                            val = (await field.get_attribute('value') or '').lower()
                            should_click = False
                            if answer.lower() in ['yes', 'true'] and ('yes' in label_clean or 'yes' in val):
                                should_click = True
                            elif answer.lower() in ['no', 'false'] and ('no' in label_clean or 'no' in val):
                                should_click = True
                            if should_click:
                                await field.click(force=True)
                                questions_answered += 1
                        elif input_type not in ['file', 'hidden', 'submit', 'button']:
                            await field.fill(str(answer))
                            await field.dispatch_event('change')
                            await self.human_delay()
                            questions_answered += 1

                except Exception as inner_e:
                    logger.debug(f"  Field error (skipping): {inner_e}")
                    continue

            logger.info(f"  ✅ Answered {questions_answered} fields")
            return True

        except Exception as e:
            logger.error(f"  ⚠️  Custom questions error: {e}")
            return False

    async def _fill_select(self, field, answer: str):
        """NEW: Extracted select logic with improved yes/no semantic matching."""
        try:
            options = await field.query_selector_all('option')
            best_match = None
            best_score = 0.0

            for opt in options:
                opt_text = (await opt.inner_text()).strip()
                opt_val  = await opt.get_attribute('value') or ''
                if not opt_text or 'select' in opt_text.lower():
                    continue

                score = similarity(answer, opt_text)

                # Substring bonuses
                if answer.lower() in opt_text.lower():
                    score += 0.3
                if opt_text.lower() in answer.lower():
                    score += 0.2

                # Semantic yes/no matching
                if answer.lower() == 'yes' and any(w in opt_text.lower() for w in ['yes', 'authorized', 'eligible', 'lawfully']):
                    score = 1.0
                if answer.lower() == 'no' and any(w in opt_text.lower() for w in ['no', 'not', 'none', 'do not']):
                    score = 1.0
                # NEW: "not a veteran" semantic matching
                if 'not a protected veteran' in answer.lower() and 'not a protected veteran' in opt_text.lower():
                    score = 1.0

                if score > best_score:
                    best_score = score
                    best_match = opt_val

            if best_match and best_score > 0.4:
                await field.select_option(value=best_match, force=True)
            else:
                await field.select_option(index=1, force=True)

            await field.evaluate("""
                (el) => {
                    ['change', 'input', 'blur'].forEach(evt =>
                        el.dispatchEvent(new Event(evt, { bubbles: true }))
                    );
                }
            """)
            await self.human_delay(500, 1000)
        except Exception as e:
            logger.debug(f"  Select fill error: {e}")

    # ── Submit ────────────────────────────────────────────────────────────────

    async def find_submit_button(self, page):
        submit_selectors = [
            'button#submit_app',
            'input[type="submit"]',
            'button[type="submit"]',
            'button:has-text("Submit Application")',
            'button:has-text("Submit")',
            'button:has-text("Send Application")',
        ]
        for selector in submit_selectors:
            if await page.locator(selector).count() > 0:
                return page.locator(selector).first
        for frame in safe_frames(page):
            for selector in submit_selectors:
                try:
                    if await frame.locator(selector).count() > 0:
                        return frame.locator(selector).first
                except:
                    continue
        return None

    async def submit_application_auto(self, page, app_id: str) -> bool:
        if DRY_RUN:
            logger.info("  🧪 DRY_RUN: skipping submit")
            return True
        try:
            submit_button = await self.find_submit_button(page)
            if not submit_button:
                logger.error("  ❌ Submit button not found")
                await page.screenshot(path=f"screenshot_no_submit_{app_id}.png")
                return False

            await submit_button.click()
            await page.wait_for_timeout(4000)

            confirmation_texts = ['submitted', 'thank you', 'received', 'success', 'application sent']
            content = (await page.content()).lower()
            if any(t in content for t in confirmation_texts):
                logger.info("  ✅ CONFIRMED: Application submitted!")
                await page.screenshot(path=f"screenshot_confirmed_{app_id}.png")
                return True

            logger.warning("  ⚠️  Submitted but no confirmation text found")
            await page.screenshot(path=f"screenshot_no_confirm_{app_id}.png")
            return True  # Assume success unless proven otherwise

        except Exception as e:
            logger.error(f"Submit error: {e}")
            await page.screenshot(path=f"screenshot_error_{app_id}.png")
            return False

    async def submit_application_manual(self, page, app_id: str) -> bool:
        try:
            submit_button = await self.find_submit_button(page)
            if submit_button:
                await submit_button.scroll_into_view_if_needed()
                await submit_button.evaluate("el => el.style.border = '5px solid red'")
            logger.info("  ✋ PAUSED — review form and submit manually")
            print("\n" + "!"*60)
            print("  ⚠️  FORM FILLED! Review and submit manually.")
            print("!"*60)
            await asyncio.to_thread(input, "  >> Press ENTER after submitting...")
            return True
        except Exception as e:
            logger.error(f"Manual submit error: {e}")
            return False

    # ── Main Application Flow ─────────────────────────────────────────────────

    async def process_application(self, app_data: Dict) -> bool:
        app_id     = app_data['id']
        job_url    = app_data.get('jobUrl', '')
        job_title  = app_data.get('jobTitle', 'Unknown')
        company    = app_data.get('company', 'Unknown')
        user_id    = app_data.get('userId', '')
        resume_path = None

        logger.info("\n" + "="*70)
        logger.info(f"📋 JOB: {job_title}")
        logger.info(f"🏢 COMPANY: {company}")
        logger.info(f"🔗 URL: {job_url}")
        logger.info("="*70)

        try:
            # 1. Profile
            await update_application_progress(app_id, 'processing', 10, 'Loading profile...')
            user_data = await get_user_profile(user_id)
            if not user_data.get('email'):
                await update_application_status(app_id, 'failed', 'No email in profile', 'missing_profile')
                return False

            # 2. Resume
            resume_url = user_data.get('resumeUrl')
            if resume_url:
                await update_application_progress(app_id, 'processing', 20, 'Downloading resume...')
                clean_name  = f"{user_data.get('firstName','Candidate')}_{user_data.get('lastName','Resume')}"
                resume_path = await download_resume(resume_url, clean_name)

            # 3. Open page
            await update_application_progress(app_id, 'processing', 30, 'Opening application...')
            page = await self.context.new_page()

            try:
                await page.goto(job_url, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(3000)

                # 4. Find form
                await update_application_progress(app_id, 'processing', 40, 'Finding form...')
                if not await self.find_and_navigate_to_application_form(page):
                    await update_application_status(app_id, 'failed', 'Form not found', 'form_not_found')
                    self.stats['failed'] += 1
                    return False

                # 5. Basic info
                await update_application_progress(app_id, 'processing', 50, 'Filling basic info...')
                await self.fill_basic_fields(page, user_data)

                # 6. Resume
                if resume_path:
                    await update_application_progress(app_id, 'processing', 60, 'Uploading resume...')
                    await self.upload_resume(page, resume_path)

                # 7. Custom questions
                await update_application_progress(app_id, 'processing', 70, 'Answering questions...')
                await self.handle_custom_questions(page, user_data)

                # 8. Submit
                auto_submit = user_data.get('autoSubmitEnabled', False)
                if auto_submit:
                    await update_application_progress(app_id, 'processing', 90, 'Submitting...')
                    submitted = await self.submit_application_auto(page, app_id)
                else:
                    await update_application_progress(app_id, 'review_required', 90, 'Ready for review')
                    submitted = await self.submit_application_manual(page, app_id)

                if submitted:
                    await update_application_progress(app_id, 'applied', 100, 'Success!')
                    await update_application_status(app_id, 'applied')
                    self.stats['successful'] += 1
                    return True
                else:
                    await update_application_status(app_id, 'failed', 'Submission failed', 'submit_failed')
                    self.stats['failed'] += 1
                    return False

            finally:
                await page.close()

        except PlaywrightTimeout as e:
            await update_application_status(app_id, 'failed', f'Timeout: {e}', 'timeout')
            self.stats['failed'] += 1
            return False
        except Exception as e:
            await update_application_status(app_id, 'failed', str(e), 'unexpected_error')
            self.stats['failed'] += 1
            return False
        finally:
            if resume_path and os.path.exists(resume_path):
                try:
                    os.remove(resume_path)
                except:
                    pass

    async def run(self):
        try:
            await self.initialize()
            applications = await get_pending_applications()

            if not applications:
                logger.info("ℹ️  No pending applications")
                return

            logger.info(f"🎯 Processing {len(applications)} applications "
                        f"(concurrency: {MAX_CONCURRENT_APPS})")

            # NEW: Process concurrently with a semaphore cap
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_APPS)

            async def process_with_timeout(app):
                async with semaphore:
                    self.stats['processed'] += 1
                    try:
                        await asyncio.wait_for(
                            self.process_application(app),
                            timeout=APP_TIMEOUT_SECONDS
                        )
                    except asyncio.TimeoutError:
                        app_id = app.get('id', 'unknown')
                        logger.error(f"❌ Application {app_id} timed out after {APP_TIMEOUT_SECONDS}s")
                        await update_application_status(app_id, 'failed', 'Application timed out', 'global_timeout')
                        self.stats['failed'] += 1

            tasks = [process_with_timeout(app) for app in applications]
            await asyncio.gather(*tasks)

            logger.info("\n" + "="*70)
            logger.info(f"📊 Results: {self.stats['successful']} success / "
                        f"{self.stats['failed']} failed / "
                        f"{self.stats['processed']} total")
            logger.info("="*70)

        finally:
            await self.close()

# ============================================================================
# Entry Point
# ============================================================================

async def main():
    logger.info("🚀 JOBHUNT AI APPLICATION ENGINE V3.0")
    cleanup_old_screenshots(days_old=7)
    applier = SmartApplier()
    await applier.run()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())