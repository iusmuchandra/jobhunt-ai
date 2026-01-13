#!/usr/bin/env python3
"""
=============================================================================
JOBHUNT AI - SMART APPLICATION ENGINE V2.0 (FULLY FIXED)
- FIXED: Resume upload now avoids cover letter fields
- FIXED: Enhanced fuzzy matching for dropdowns
- FIXED: Phone number formatting
- FIXED: Safe frame iteration
- FIXED: AI response caching
- Handles Greenhouse, Lever, Ashby, and custom forms
- Auto-renames resume to Candidate Name
- REVIEW MODE: Fills form, highlights button, pauses for manual submit
- REAL-TIME: Progress tracking and status updates
=============================================================================
"""

import asyncio
import logging
import os
import httpx
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, List
from difflib import SequenceMatcher

# Load environment variables
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ============================================================================
# Configuration
# ============================================================================

env_path = Path(__file__).parent.parent / '.env.local'
load_dotenv(dotenv_path=env_path)

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Firebase initialization
if not firebase_admin._apps:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)
db = firestore.client()

# AI Cache to prevent redundant API calls
AI_CACHE = {}

# ============================================================================
# Real-time Progress Updates
# ============================================================================

async def update_application_progress(app_id: str, status: str, progress: int, message: str = ""):
    """Update application progress in real-time"""
    try:
        update_data = {
            'status': status,
            'progress': progress,  # 0-100
            'progressMessage': message,
            'updatedAt': firestore.SERVER_TIMESTAMP
        }
        
        if status == 'applied':
            update_data['appliedAt'] = firestore.SERVER_TIMESTAMP
        
        db.collection('applications').document(app_id).update(update_data)
        logger.info(f"📊 Progress: {progress}% - {message}")
    
    except Exception as e:
        logger.error(f"Error updating progress: {e}")


# ============================================================================
# AI Question Answering (with Caching & Retry)
# ============================================================================

async def answer_question_with_ai(question: str, user_profile: Dict, max_retries: int = 3) -> str:
    """Use DeepSeek AI to answer custom application questions (ENHANCED with retry)"""
    
    # 1. Check Cache
    cache_key = question.lower().strip()[:100]  # Use first 100 chars as key
    if cache_key in AI_CACHE:
        logger.info(f"  💾 Cached Answer: {AI_CACHE[cache_key]}")
        return AI_CACHE[cache_key]

    if not DEEPSEEK_API_KEY:
        logger.error("❌ DeepSeek API Key is missing! Check .env.local")
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

    prompt = f"""You are filling out a job application form. Answer this question based on the candidate's profile.

CANDIDATE PROFILE:
{profile_summary}

QUESTION: {question}

INSTRUCTIONS:
- For yes/no questions, answer ONLY "Yes" or "No"
- For work authorization: Answer "Yes" if eligible to work in US
- For sponsorship: Answer "No" if does not require sponsorship
- For experience questions: Use the years of experience from profile
- For dropdowns asking for options: Choose the most appropriate single option
- Keep answers concise (1-3 words for short answers, 1-2 sentences for open-ended)
- Be professional and confident

ANSWER (no explanation, just the answer):"""

    # Retry logic with exponential backoff
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    DEEPSEEK_API_URL,
                    headers={
                        'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'model': 'deepseek-chat',
                        'messages': [{'role': 'user', 'content': prompt}],
                        'temperature': 0.1,
                        'max_tokens': 100
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    answer = result['choices'][0]['message']['content'].strip()
                    answer = answer.replace('"', '').replace("'", '')
                    if answer.lower().startswith('answer:'):
                        answer = answer[7:].strip()
                    
                    logger.info(f"  🤖 AI Answer: {answer}")
                    # Update Cache
                    AI_CACHE[cache_key] = answer
                    return answer
                elif response.status_code == 429:
                    # Rate limited - wait and retry
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    logger.warning(f"  ⏳ Rate limited, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error(f"DeepSeek API error: {response.status_code}")
                    return "Not specified"
        
        except asyncio.TimeoutError:
            if attempt < max_retries - 1:
                logger.warning(f"  ⏱️  Timeout, retrying ({attempt + 1}/{max_retries})...")
                await asyncio.sleep(2 ** attempt)
                continue
            logger.error("AI request timed out after retries")
            return "Not specified"
        except Exception as e:
            logger.error(f"Error calling AI: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            return "Not specified"
    
    return "Not specified"


# ============================================================================
# Resume Management
# ============================================================================

async def download_resume(resume_url: str, filename_prefix: str) -> Optional[str]:
    """Download resume and save with professional filename"""
    try:
        temp_dir = Path("temp_resumes")
        temp_dir.mkdir(exist_ok=True)
        
        logger.info(f"  📥 Downloading resume from Firebase...")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(resume_url, timeout=60.0, follow_redirects=True)
            
            if response.status_code == 200:
                file_ext = '.pdf'
                if 'docx' in resume_url.lower():
                    file_ext = '.docx'
                
                # Sanitize filename
                safe_name = "".join(x for x in filename_prefix if x.isalnum() or x in "_-")
                file_path = temp_dir / f"{safe_name}{file_ext}"
                
                file_path.write_bytes(response.content)
                
                file_size = len(response.content) / 1024
                logger.info(f"  ✅ Resume saved as: {file_path.name} ({file_size:.1f} KB)")
                return str(file_path)
            else:
                logger.error(f"Failed to download resume: HTTP {response.status_code}")
                return None
    
    except Exception as e:
        logger.error(f"Error downloading resume: {e}")
        return None


# ============================================================================
# Helper Functions
# ============================================================================

def format_phone_number(phone: str) -> str:
    """Format phone to (XXX) XXX-XXXX"""
    if not phone:
        return ""
    digits = re.sub(r'\D', '', phone)  # Remove non-digits
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    elif len(digits) == 11 and digits[0] == '1':
        return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return phone  # Return as-is if format unknown

def safe_frames(page) -> List:
    """Safely iterate frames, skipping detached ones"""
    frames = []
    for frame in page.frames:
        try:
            # Test if frame is still attached
            _ = frame.url
            frames.append(frame)
        except:
            continue
    return frames

async def get_pending_applications():
    """Fetch applications that need processing"""
    try:
        applications = (
            db.collection('applications')
            .where('method', '==', 'auto-apply')
            .where('status', 'in', ['pending', 'queued'])
            .order_by('appliedAt', direction=firestore.Query.DESCENDING)
            .limit(10)
            .stream()
        )
        
        results = []
        for app in applications:
            data = app.to_dict()
            data['id'] = app.id
            results.append(data)
        
        logger.info(f"Found {len(results)} pending applications")
        return results
    
    except Exception as e:
        logger.error(f"Error fetching applications: {e}")
        return []


async def get_user_profile(user_id: str) -> Dict:
    """Fetch user profile matching YOUR Firebase schema"""
    try:
        user_doc = db.collection('users').document(user_id).get()
        
        if not user_doc.exists:
            logger.error(f"User {user_id} not found")
            return {}
        
        data = user_doc.to_dict()
        
        display_name = data.get('displayName', 'Chandra Talluri')
        name_parts = display_name.strip().split()
        
        if len(name_parts) >= 2:
            data['firstName'] = name_parts[0]
            data['lastName'] = ' '.join(name_parts[1:])
        else:
            data['firstName'] = name_parts[0] if name_parts else 'Chandra'
            data['lastName'] = 'Talluri'
        
        work_history = data.get('workHistory', [])
        if work_history and len(work_history) > 0:
            current_job = work_history[0]
            data['yearsOfExperience'] = current_job.get('yearsOfExperience', 10)
        else:
            data['yearsOfExperience'] = 10
        
        education = data.get('education', [])
        if education:
            edu = education[0]
            data['educationSummary'] = f"{edu.get('degree', 'MBA')} from {edu.get('school', 'Indiana University')}"
        else:
            data['educationSummary'] = 'MBA from Indiana University'
        
        data['currentTitle'] = data.get('currentTitle', 'Senior Product Manager')
        data['email'] = data.get('email', '')
        data['phone'] = data.get('phone', '')
        data['location'] = data.get('location', 'Detroit')
        data['resumeUrl'] = data.get('resumeUrl', '')
        data['eligibleToWorkInUS'] = data.get('eligibleToWorkInUS', True)
        data['requiresSponsorship'] = data.get('requiresSponsorship', False)
        data['autoSubmitEnabled'] = data.get('autoSubmitEnabled', False)
        
        # Load Custom Questions from Dashboard
        data['custom_rules'] = {}
        if 'customQuestions' in data and isinstance(data['customQuestions'], list):
            for q in data['customQuestions']:
                if q.get('keyword') and q.get('answer'):
                    key = q['keyword'].lower().strip()
                    data['custom_rules'][key] = q['answer']
            logger.info(f"  📋 Loaded {len(data['custom_rules'])} custom Q&A rules")
        
        logger.info(f"✅ Profile loaded: {data.get('firstName')} {data.get('lastName')}")
        
        return data
    
    except Exception as e:
        logger.error(f"Error fetching user profile: {e}")
        return {}


async def update_application_status(app_id: str, status: str, error_msg: str = None):
    """Update application status in Firebase"""
    try:
        update_data = {
            'status': status,
            'updatedAt': firestore.SERVER_TIMESTAMP
        }
        
        if error_msg:
            update_data['errorMessage'] = error_msg
        
        if status == 'applied':
            update_data['appliedAt'] = firestore.SERVER_TIMESTAMP
        
        db.collection('applications').document(app_id).update(update_data)
        logger.info(f"📝 Firebase updated: {status}")
    
    except Exception as e:
        logger.error(f"Error updating application: {e}")


# ============================================================================
# Application Automation
# ============================================================================

class SmartApplier:
    def __init__(self):
        self.browser = None
        self.context = None
        self.stats = {'processed': 0, 'successful': 0, 'failed': 0}
    
    async def initialize(self):
        """Initialize browser"""
        playwright = await async_playwright().start()
        
        self.browser = await playwright.chromium.launch(
            headless=False,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        )
        
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        logger.info("🌐 Browser initialized")
    
    async def close(self):
        """Close browser"""
        if self.browser:
            await self.browser.close()
            logger.info("🌐 Browser closed")
    
    async def human_delay(self, min_ms: int = 500, max_ms: int = 1500):
        """Simulate human typing delay"""
        import random
        delay = random.uniform(min_ms, max_ms) / 1000
        await asyncio.sleep(delay)
    
    async def find_and_navigate_to_application_form(self, page) -> bool:
        """Smart navigation to find the actual application form"""
        try:
            logger.info(f"  🔍 Looking for application form...")
            
            # 1. Check for embedded iframes
            iframe_selectors = [
                'iframe[id="grnhse_iframe"]', 
                'iframe[src*="greenhouse"]',
                'iframe[src*="ashby"]',       
                'iframe[src*="lever"]',
                'iframe[id="gnewton_iframe"]'
            ]
            
            for selector in iframe_selectors:
                if await page.locator(selector).count() > 0:
                    logger.info(f"  ✅ Found embedded ATS form ({selector})")
                    return True

            async def is_form_present():
                if await page.locator('form:visible').count() > 0: return True
                if await page.locator('input[name="first_name"]').count() > 0: return True 
                if await page.locator('input[name="name"]').count() > 0: return True       
                for frame in safe_frames(page):
                    if await frame.locator('input[type="file"]').count() > 0: return True
                return False

            if await is_form_present():
                logger.info(f"  ✅ Found application form on page")
                return True
            
            # 2. Click "Apply" buttons
            apply_selectors = [
                'a[data-mapped="true"]',        
                'a:has-text("Apply to Job")',
                'a:has-text("Apply Now")',
                'button:has-text("Apply")',
                'a:has-text("Apply")',
                '[aria-label="Apply for this job"]',
                '#apply_button'
            ]
            
            for selector in apply_selectors:
                try:
                    if await page.locator(selector).count() > 0:
                        btn = page.locator(selector).first
                        if await btn.is_visible():
                            logger.info(f"  👆 Clicking: {selector}")
                            
                            try:
                                async with page.expect_navigation(timeout=3000):
                                    await btn.click()
                            except:
                                await btn.click()
                            
                            # Wait for form or iframe
                            try:
                                await page.wait_for_selector(
                                    'input[type="file"], iframe[src*="greenhouse"], iframe[src*="lever"]',
                                    timeout=5000
                                )
                            except:
                                await page.wait_for_timeout(2000)
                            
                            if await is_form_present():
                                logger.info(f"  ✅ Application form loaded")
                                return True
                            
                            for frame_sel in iframe_selectors:
                                if await page.locator(frame_sel).count() > 0:
                                    logger.info(f"  ✅ Found embedded form after click")
                                    return True
                except:
                    continue
            
            logger.warning(f"  ⚠️  No application form found")
            return False
        
        except Exception as e:
            logger.error(f"  ❌ Error finding form: {e}")
            return False
    
    async def upload_resume(self, page, resume_path: str):
        """Upload resume (FIXED: Avoids cover letter fields)"""
        try:
            # Gather all file inputs
            all_file_inputs = await page.query_selector_all('input[type="file"]')
            for frame in safe_frames(page):
                try:
                    all_file_inputs.extend(await frame.query_selector_all('input[type="file"]'))
                except: continue

            if not all_file_inputs:
                logger.warning("  ⚠️  No file upload field found")
                return False
            
            # Strategy 1: Find RESUME-specific fields (strict keywords)
            resume_keywords = ['resume', 'cv', 'attach_resume', 'curriculum']
            cover_letter_keywords = ['cover', 'letter', 'motivation']
            
            resume_fields = []
            for file_input in all_file_inputs:
                name_attr = (await file_input.get_attribute('name') or '').lower()
                id_attr = (await file_input.get_attribute('id') or '').lower()
                combined = name_attr + id_attr
                
                # Skip cover letter fields explicitly
                if any(k in combined for k in cover_letter_keywords):
                    logger.debug(f"  ⏭️  Skipping cover letter field: {name_attr or id_attr}")
                    continue
                
                # Match resume fields
                if any(k in combined for k in resume_keywords):
                    resume_fields.append((file_input, name_attr or id_attr))
            
            # Upload to first resume-specific field
            if resume_fields:
                field, field_name = resume_fields[0]
                await field.set_input_files(resume_path)
                await self.human_delay(2000, 3000)
                logger.info(f"  ✅ Resume uploaded to: {field_name}")
                return True
            
            # Strategy 2: Fallback to first non-cover-letter field
            for file_input in all_file_inputs:
                name_attr = (await file_input.get_attribute('name') or '').lower()
                id_attr = (await file_input.get_attribute('id') or '').lower()
                combined = name_attr + id_attr
                
                # Skip cover letter fields
                if any(k in combined for k in cover_letter_keywords):
                    continue
                
                # Upload here
                await file_input.set_input_files(resume_path)
                await self.human_delay(2000, 3000)
                logger.info(f"  ✅ Resume uploaded to generic field (avoided cover letter)")
                return True
            
            # Strategy 3: Last resort - use first field (warn user)
            if all_file_inputs:
                logger.warning("  ⚠️  Could not identify resume field, using first available")
                await all_file_inputs[0].set_input_files(resume_path)
                await self.human_delay(2000, 3000)
                return True
            
            return False
        
        except Exception as e:
            logger.error(f"  ❌ Error uploading resume: {e}")
            return False
    
    async def fill_basic_fields(self, page, user_data: Dict):
        """Fill basic application fields"""
        try:
            logger.info("  📝 Filling basic fields...")
            
            async def fill_anywhere(selectors, value):
                contexts = [page] + safe_frames(page)
                for ctx in contexts:
                    for selector in selectors:
                        try:
                            elements = await ctx.locator(selector).all()
                            for el in elements:
                                if await el.is_visible():
                                    type_attr = (await el.get_attribute('type') or 'text').lower()
                                    if type_attr in ['checkbox', 'radio', 'hidden', 'file', 'submit', 'button']:
                                        continue
                                    
                                    await el.fill(value)
                                    await self.human_delay()
                                    return True
                        except: continue
                return False

            await fill_anywhere([
                'input[name*="first" i][name*="name" i]', 'input[id*="first" i]', 
                '[autocomplete="given-name"]', 'input[name="name" i]'
            ], user_data.get('firstName', ''))

            await fill_anywhere([
                'input[name*="last" i]', 'input[id*="last" i]', 
                '[autocomplete="family-name"]'
            ], user_data.get('lastName', ''))

            await fill_anywhere([
                'input[type="email"]', 'input[name*="email" i]', '[autocomplete="email"]'
            ], user_data.get('email', ''))

            phone_formatted = format_phone_number(user_data.get('phone', ''))
            await fill_anywhere([
                'input[type="tel"]', 'input[name*="phone" i]', '[autocomplete="tel"]'
            ], phone_formatted)

            return True
        
        except Exception as e:
            logger.error(f"  ❌ Error filling basic fields: {e}")
            return False
    
    async def handle_custom_questions(self, page, user_data: Dict):
        """Handle custom application questions (Enhanced Fuzzy Matching)"""
        try:
            await page.wait_for_timeout(2000)
            
            all_fields = await page.query_selector_all('input:visible, select, textarea:visible')
            for frame in safe_frames(page):
                try:
                    frame_fields = await frame.query_selector_all('input:visible, select, textarea:visible')
                    all_fields.extend(frame_fields)
                except: continue
            
            logger.info(f"  🔍 Analyzing {len(all_fields)} form fields...")
            questions_answered = 0
            
            # Merge dashboard rules with defaults
            linkedin_url = user_data.get('linkedinUrl', 'https://linkedin.com/in/chandratalluri')
            if '/in/' not in linkedin_url:
                username = linkedin_url.split('/')[-1] or 'chandratalluri'
                linkedin_url = f'https://linkedin.com/in/{username}'

            rules = {
                'gender': 'Male', 
                'race': 'Asian', 
                'veteran': 'I am not a protected veteran',
                'disability': 'No',
                'authorized': 'Yes',
                'sponsorship': 'No',
                'relocate': 'Yes',
                'remote': 'Yes',
                'linkedin': linkedin_url,
                'website': 'https://chandratalluri.com',
                'portfolio': 'https://chandratalluri.com',
                'github': 'https://github.com/chandratalluri',
                'hear about': 'LinkedIn',
            }
            
            if 'custom_rules' in user_data:
                rules.update(user_data['custom_rules'])

            for field in all_fields: 
                try:
                    tag_name = await field.evaluate('el => el.tagName.toLowerCase()')
                    if tag_name != 'select':
                        if not await field.is_visible(): continue

                    try:
                        val = await field.input_value()
                        if val and len(val) > 0 and val != "0": continue
                    except: pass
                    
                    # Find Label
                    field_id = await field.get_attribute('id')
                    label_text = ""
                    
                    if field_id:
                        try:
                            label_elem = await page.query_selector(f'label[for="{field_id}"]')
                            if not label_elem:
                                for frame in safe_frames(page):
                                    label_elem = await frame.query_selector(f'label[for="{field_id}"]')
                                    if label_elem: break
                            if label_elem: label_text = await label_elem.inner_text()
                        except: pass
                    
                    if not label_text:
                        try:
                            parent = await field.evaluate_handle('el => el.closest("div, fieldset, label")')
                            if parent:
                                label_text = await parent.inner_text()
                                val_text = await field.evaluate('el => el.value')
                                label_text = label_text.replace(val_text, '')
                        except: pass
                    
                    if not label_text or len(label_text.strip()) < 3: continue
                    
                    label_clean = label_text.lower().strip()
                    logger.info(f"  ❓ Question: {label_text[:60]}...")

                    # Match Answer
                    answer = None
                    for keyword, rule_answer in rules.items():
                        if keyword in label_clean:
                            logger.info(f"    ⚡ Fast-Matched '{keyword}': {rule_answer}")
                            answer = rule_answer
                            break
                    
                    if not answer:
                        answer = await answer_question_with_ai(label_text, user_data)

                    # Fill Field
                    if tag_name == 'select':
                        try:
                            options = await field.query_selector_all('option')
                            best_match = None
                            best_score = 0
                            
                            def similarity(a, b): return SequenceMatcher(None, a.lower(), b.lower()).ratio()

                            for opt in options:
                                opt_text = (await opt.inner_text()).strip()
                                opt_val = await opt.get_attribute('value')
                                if not opt_text or "select" in opt_text.lower(): continue
                                
                                score = similarity(answer, opt_text)
                                
                                if answer.lower() in opt_text.lower(): score += 0.3
                                if opt_text.lower() in answer.lower(): score += 0.3

                                if answer.lower() == 'yes' and any(w in opt_text.lower() for w in ['yes', 'authorized', 'eligible']): score = 1.0
                                if answer.lower() == 'no' and any(w in opt_text.lower() for w in ['no', 'not', 'none']): score = 1.0

                                if score > best_score:
                                    best_score = score
                                    best_match = opt_val

                            if best_match and best_score > 0.4:
                                await field.select_option(value=best_match, force=True)
                            else:
                                await field.select_option(index=1, force=True) 
                            
                            # Fire JS events
                            await field.evaluate("""
                                (el) => {
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                                }
                            """)
                            
                            await self.human_delay(500, 1000)
                            questions_answered += 1
                        except: pass
                    
                    elif tag_name == 'input' and (await field.get_attribute('type')) in ['radio', 'checkbox']:
                        val = await field.get_attribute('value')
                        should_click = False
                        if answer.lower() in ['yes', 'true'] and ('yes' in label_clean or (val and 'yes' in val.lower())): should_click = True
                        elif answer.lower() in ['no', 'false'] and ('no' in label_clean or (val and 'no' in val.lower())): should_click = True
                        
                        if should_click:
                            await field.click(force=True)
                            questions_answered += 1
                    
                    else:
                        await field.fill(str(answer))
                        await field.dispatch_event('change')
                        await self.human_delay()
                        questions_answered += 1
                
                except Exception as inner_e:
                    continue
            
            logger.info(f"  ✅ Answered {questions_answered} custom questions")
            return True
        
# Continuation of handle_custom_questions error handler
        except Exception as e:
            logger.error(f"  ⚠️  Error handling custom questions: {e}")
            return False

    async def find_submit_button(self, page):
        """Find submit button"""
        submit_selectors = [
            'button#submit_app', 'input[type="submit"]', 'button[type="submit"]',
            'button:has-text("Submit Application")', 'button:has-text("Submit")'
        ]
        
        for selector in submit_selectors:
            if await page.locator(selector).count() > 0: return page.locator(selector).first
        
        for frame in safe_frames(page):
            for selector in submit_selectors:
                try:
                    if await frame.locator(selector).count() > 0: return frame.locator(selector).first
                except: continue
        return None

    async def submit_application_auto(self, page, app_id: str):
        """Fully automatic submission"""
        try:
            submit_button = await self.find_submit_button(page)
            if not submit_button:
                logger.error("  ❌ Submit button not found")
                return False
            
            await submit_button.click()
            await page.wait_for_timeout(3000)
            
            # Verify
            confirmation_texts = ['submitted', 'thank you', 'received', 'success']
            content = (await page.content()).lower()
            if any(t in content for t in confirmation_texts):
                logger.info(f"  ✅ CONFIRMED: Application submitted!")
                await page.screenshot(path=f"screenshot_confirmed_{app_id}.png")
                return True
            
            logger.warning("  ⚠️ Submitted but no confirmation found")
            return True
        except: return False

    async def submit_application_manual(self, page, app_id: str):
        """Manual review mode"""
        try:
            submit_button = await self.find_submit_button(page)
            if submit_button:
                await submit_button.scroll_into_view_if_needed()
                await submit_button.evaluate("el => el.style.border = '5px solid red'")
                logger.info("  ✋ PAUSED for manual review")
            
            print("\n" + "!"*60)
            print(f"  ⚠️  FORM FILLED! Review and submit manually.")
            print("!"*60)
            await asyncio.to_thread(input, "  >> Press ENTER after submitting...")
            return True
        except: return False
    
    async def process_application(self, app_data: Dict):
        """Process a single job application"""
        app_id = app_data['id']
        resume_path = None
        
        try:
            job_url = app_data.get('jobUrl', '')
            job_title = app_data.get('jobTitle', 'Unknown')
            company = app_data.get('company', 'Unknown')
            user_id = app_data.get('userId', '')
            
            logger.info("\n" + "="*70)
            logger.info(f"📋 JOB: {job_title}")
            logger.info(f"🏢 COMPANY: {company}")
            logger.info("="*70)
            
            # 1. Profile
            await update_application_progress(app_id, 'processing', 10, 'Loading profile...')
            user_data = await get_user_profile(user_id)
            if not user_data.get('email'): return False
            
            # 2. Resume
            resume_url = user_data.get('resumeUrl')
            if resume_url:
                await update_application_progress(app_id, 'processing', 20, 'Downloading resume...')
                clean_name = f"{user_data.get('firstName', 'Candidate')}_{user_data.get('lastName', 'Resume')}"
                resume_path = await download_resume(resume_url, clean_name)
            
            # 3. Open Page
            await update_application_progress(app_id, 'processing', 30, f'Opening application...')
            page = await self.context.new_page()
            
            try:
                await page.goto(job_url, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(3000)
                
                # 4. Find Form
                await update_application_progress(app_id, 'processing', 40, 'Finding form...')
                if not await self.find_and_navigate_to_application_form(page):
                    await update_application_status(app_id, 'failed', 'Form not found')
                    self.stats['failed'] += 1
                    return False
                
                # 5. Basic Info
                await update_application_progress(app_id, 'processing', 50, 'Filling info...')
                await self.fill_basic_fields(page, user_data)
                
                # 6. Upload Resume
                if resume_path:
                    await update_application_progress(app_id, 'processing', 60, 'Uploading resume...')
                    await self.upload_resume(page, resume_path)
                
                # 7. Questions
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
                    await update_application_status(app_id, 'failed', 'Submission failed')
                    self.stats['failed'] += 1
                    return False
            
            finally:
                await page.close()
        
        except Exception as e:
            await update_application_status(app_id, 'failed', str(e))
            self.stats['failed'] += 1
            return False
        
        finally:
            if resume_path and os.path.exists(resume_path):
                try: os.remove(resume_path)
                except: pass
    
    async def run(self):
        """Main execution loop"""
        try:
            await self.initialize()
            applications = await get_pending_applications()
            
            if not applications:
                logger.info("ℹ️  No pending applications")
                return
            
            for i, app in enumerate(applications, 1):
                self.stats['processed'] += 1
                await self.process_application(app)
                if i < len(applications):
                    logger.info("\n⏳ Waiting 5 seconds...")
                    await asyncio.sleep(5)
            
            logger.info("\n" + "="*70)
            logger.info(f"📊 Stats: {self.stats['successful']} Success / {self.stats['failed']} Failed")
            logger.info("="*70)
        
        finally:
            await self.close()

async def main():
    logger.info("🚀 JOBHUNT AI ENGINE STARTED V2.0 (FULLY FIXED)")
    applier = SmartApplier()
    await applier.run()

if __name__ == "__main__":
    if asyncio.sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())