#!/usr/bin/env python3
"""
=============================================================================
   JOBHUNT AI - ENTERPRISE PRODUCTION ENGINE V3.3 (STRICT FILTERING)
   - INTEGRATED: Enhanced Salary Extraction
   - INTEGRATED: Complete Target List
   - FIXED: Strict USA location filtering
   - FIXED: Enhanced negative keyword detection
   - FIXED: Company ID corrections to eliminate 404 errors
   - FIXED: Date parsing for Greenhouse API
   - OPTIMIZED: Rate limits and performance tuning
   - ANALYTICS: Enhanced market intelligence
   - DATABASE: Full Firestore integration
   - NEW: Strict Keyword Enforcement (No matches = Automatic Rejection)
=============================================================================
"""

import asyncio
import threading
import aiohttp
import logging
import sys
import re
import hashlib
import time
import os
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import random
from pathlib import Path
from difflib import SequenceMatcher

# --- NEW IMPORTS FOR INTEGRATION ---
from salary_extractor import EnhancedSalaryExtractor, extract_salary_from_job
from complete_targets_list import COMPLETE_TARGETS

# --- LOAD ENVIRONMENT VARIABLES ---
from dotenv import load_dotenv
env_path = Path(__file__).parent / '.env.local'
load_dotenv(dotenv_path=env_path)

# --- WINDOWS ENCODING FIX ---
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# --- FIREBASE SETUP ---
import firebase_admin
from firebase_admin import credentials, firestore, auth

# --- LOGGING SETUP ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s',
    handlers=[
        logging.FileHandler('scraper.log', encoding='utf-8', mode='a'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ===========================================================================
#                            GLOBAL FIREBASE INSTANCE
# ===========================================================================

class FirebaseSingleton:
    """Singleton pattern for Firebase to avoid multiple initializations"""
    _instance = None
    _db = None
    _initialized = False
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(FirebaseSingleton, cls).__new__(cls)
        return cls._instance
    
    def initialize(self):
        """Initialize Firebase once"""
        if not self._initialized:
            with self.__class__._lock:
                if not self._initialized:
                    try:
                        if not firebase_admin._apps:
                            cred_path = os.getenv('FIREBASE_CREDENTIALS_PATH', 'serviceAccountKey.json')
                            if not os.path.exists(cred_path):
                                logger.error(f"❌ Firebase credentials not found at: {cred_path}")
                                return False

                            cred = credentials.Certificate(cred_path)
                            firebase_admin.initialize_app(cred)

                        self._db = firestore.client()
                        self._initialized = True
                        logger.info("✅ Connected to Firebase Firestore successfully!")
                        return True
                    except Exception as e:
                        logger.critical(f"❌ Error connecting to Firebase: {e}")
                        return False
        return True
    
    @property
    def db(self):
        """Get Firestore database instance"""
        if not self._initialized:
            self.initialize()
        return self._db

# Create global Firebase instance
firebase_singleton = FirebaseSingleton()

# ===========================================================================
#                            CONFIGURATION
# ===========================================================================

class Config:
    # Environment variables with defaults
    REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', '30'))
    MAX_CONCURRENCY = int(os.getenv('MAX_CONCURRENCY', '15'))
    RETRY_ATTEMPTS = int(os.getenv('RETRY_ATTEMPTS', '3'))
    RETRY_DELAY = float(os.getenv('RETRY_DELAY', '2.0'))
    JOB_EXPIRATION_DAYS = int(os.getenv('JOB_EXPIRATION_DAYS', '30'))
    
    # Rate limiting (requests per second per ATS)
    GREENHOUSE_RATE = float(os.getenv('GREENHOUSE_RATE', '5')) 
    ASHBY_RATE = float(os.getenv('ASHBY_RATE', '3'))           
    LEVER_RATE = float(os.getenv('LEVER_RATE', '4'))           
    WORKDAY_RATE = float(os.getenv('WORKDAY_RATE', '2'))       
    
    # Batch processing
    FIREBASE_BATCH_SIZE = 200  # Max 500 ops per Firestore batch; 200 jobs × 2 writes = 400
    MAX_JOBS_PER_COMPANY = 1000
    
    # Content limits
    MAX_DESCRIPTION_LENGTH = 2000
    MAX_REQUIREMENTS = 15

# User agents for rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

# ===========================================================================
#                        COMPANY VALIDATION & HEALTH CHECK
# ===========================================================================

class CompanyValidator:
    """Validate company URLs and track health status"""
    
    @staticmethod
    def get_known_corrections() -> dict:
        """Manual corrections for known problematic companies"""
        return {
            # Greenhouse corrections
            'Uber': 'uberats',
            'Snap': 'snapchat',
            'Zoom': 'zoomvideo',
            'DocuSign': 'docusign1',
            'Splunk': 'splunk1',
            'Yelp': 'yelp1',
            'Zendesk': 'zendesk1',
            'HubSpot': 'hubspot1',
            'Snowflake': 'snowflakecomputerservices',
            
            # Lever corrections
            'Netflix': 'netflix1',
            'Atlassian': 'atlassian1',
            
            # Ashby corrections
            'Scale AI': 'scaleai',
            'Mistral': 'mistralai',
        }
    
    @staticmethod
    async def validate_and_correct(session: aiohttp.ClientSession, target: dict) -> bool:
        """Validate and auto-correct company ID if needed"""
        
        # Apply known corrections
        corrections = CompanyValidator.get_known_corrections()
        if target['name'] in corrections:
            original_id = target['id']
            target['id'] = corrections[target['name']]
            if original_id != target['id']:
                logger.info(f"🔧 Auto-corrected {target['name']}: {original_id} → {target['id']}")
        
        # Validate the URL
        ats_urls = {
            'greenhouse': f"https://boards-api.greenhouse.io/v1/boards/{target['id']}/jobs",
            'ashby': f"https://api.ashbyhq.com/posting-api/job-board/{target['id']}",
            'lever': f"https://api.lever.co/v0/postings/{target['id']}",
        }
        
        url = ats_urls.get(target['ats'])
        if not url:
            return False
        
        try:
            headers = {'User-Agent': random.choice(USER_AGENTS)}
            async with session.head(url, headers=headers, timeout=10) as resp:
                return resp.status == 200
        except:
            return False

# ===========================================================================
#                            TARGET COMPANIES
# ===========================================================================

# INTEGRATED: Replaced local list with imported complete list
TARGETS = COMPLETE_TARGETS

# Filter out Workday companies (scraper not implemented)
workday_count = len([t for t in TARGETS if t.get('ats') == 'workday'])
TARGETS = [t for t in TARGETS if t.get('ats') != 'workday']
if workday_count > 0:
    logger.info(f"⚠️  Filtered out {workday_count} Workday companies (scraper not implemented)")

# Sort targets by priority for better resource allocation
TARGETS.sort(key=lambda x: x.get('priority', 3))

COMPANY_TIERS = {
    "tier_s": ["OpenAI", "Anthropic", "Google", "Meta", "Apple", "Stripe", "Airbnb", "Netflix", "Nvidia", "SpaceX", "Databricks"],
    "tier_a": ["Scale AI", "Figma", "Notion", "Uber", "Lyft", "Coinbase", "Rippling", "DoorDash", "Snowflake", "Datadog", "Spotify"],
}

# ===========================================================================
#                        RATE LIMITER
# ===========================================================================

class RateLimiter:
    """Enhanced rate limiting with adaptive backoff"""
    
    def __init__(self, calls_per_second: float):
        self.delay = 1.0 / calls_per_second
        self.last_call = 0
        self.consecutive_errors = 0
    
    async def wait(self):
        now = asyncio.get_event_loop().time()
        time_since_last = now - self.last_call
        if time_since_last < self.delay:
            wait_time = self.delay - time_since_last
            # Add jitter to avoid thundering herd
            wait_time *= random.uniform(0.9, 1.1)
            await asyncio.sleep(wait_time)
        self.last_call = asyncio.get_event_loop().time()
    
    def record_error(self):
        self.consecutive_errors += 1
        if self.consecutive_errors > 3:
            # Adaptive backoff for repeated errors
            self.delay = min(self.delay * 1.5, 10.0)
    
    def record_success(self):
        if self.consecutive_errors > 0:
            self.consecutive_errors = 0
            # Gradually return to normal rate
            self.delay = max(self.delay * 0.9, 1.0 / 2)

rate_limiters = {
    'greenhouse': RateLimiter(Config.GREENHOUSE_RATE),
    'ashby': RateLimiter(Config.ASHBY_RATE),
    'lever': RateLimiter(Config.LEVER_RATE),
    'workday': RateLimiter(Config.WORKDAY_RATE),
}

# ===========================================================================
#                        SALARY DETECTION
# ===========================================================================

class SalaryFinder:
    """
    Enhanced salary extraction utils. 
    NOTE: Primary extraction is now done via EnhancedSalaryExtractor (imported),
    but these utils are kept for Analytics and Scoring range parsing.
    """
    
    @staticmethod
    def extract(text: str) -> Optional[str]:
        # Fallback method if needed, but we prefer EnhancedSalaryExtractor
        if not text:
            return None
        
        patterns = [
            r'[\$£€]?\s*[0-9]{2,3}(?:,[0-9]{3}|[kK])?\s*-\s*[\$£€]?\s*[0-9]{2,3}(?:,[0-9]{3}|[kK])?',
            r'[0-9]{2,3}[kK]?\s*-\s*[0-9]{2,3}[kK]?\s*(?:USD|EUR|GBP|CAD)',
            r'\$[0-9]{2,3},[0-9]{3}\s*-\s*\$[0-9]{2,3},[0-9]{3}',
            r'[\$£€][0-9]{2,3}[kK]?\+?',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                return matches[0].strip()
        
        return None
    
    @staticmethod
    def normalize_salary(salary_str: str) -> Optional[int]:
        if not salary_str:
            return None
        
        numbers = re.findall(r'[0-9]+', salary_str.replace(',', ''))
        if not numbers:
            return None
        
        base = int(numbers[0])
        
        if 'k' in salary_str.lower():
            return base * 1000
        
        return base if base > 1000 else base * 1000
    
    @staticmethod
    def extract_range(salary_str: str) -> Optional[Tuple[int, int]]:
        if not salary_str:
            return None
        
        numbers = re.findall(r'[0-9]+', salary_str.replace(',', ''))
        if len(numbers) < 2:
            return None
        
        nums = [int(n) for n in numbers[:2]]
        
        if 'k' in salary_str.lower():
            nums = [n * 1000 for n in nums]
        
        return (min(nums), max(nums))

# ===========================================================================
#                        JOB SCORING SYSTEM (FULLY FIXED)
# ===========================================================================

class JobScorer:
    """Enhanced job scoring with STRICT filtering"""
    
    # USA locations allow-list
    USA_LOCATIONS = [
        'united states', 'usa', 'us', 'remote', 'anywhere', 'distributed',
        'california', 'new york', 'texas', 'florida', 'washington',
        'san francisco', 'bay area', 'los angeles', 'seattle', 'austin',
        'boston', 'chicago', 'denver', 'portland', 'san diego',
        'miami', 'atlanta', 'philadelphia', 'detroit', 'phoenix',
        'north america', 'cambridge', 'palo alto', 'mountain view'
    ]
    
    # International locations to EXPLICITLY EXCLUDE
    EXCLUDED_LOCATIONS = [
        'berlin', 'germany', 'europe', 'uk', 'london', 'paris', 'france',
        'amsterdam', 'netherlands', 'spain', 'madrid', 'barcelona',
        'italy', 'rome', 'sweden', 'stockholm', 'denmark', 'copenhagen',
        'norway', 'oslo', 'switzerland', 'zurich', 'austria', 'vienna',
        'poland', 'warsaw', 'czech', 'prague', 'hungary', 'budapest',
        'asia', 'china', 'japan', 'singapore', 'india', 'bangalore',
        'canada', 'toronto', 'vancouver', 'montreal', 'australia', 'sydney',
        'latam', 'brazil', 'mexico', 'apac', 'emea', 'dubai', 'uae',
        'tel aviv', 'israel', 'auckland', 'new zealand', 'south africa'
    ]
    
    # US State Codes for validation
    US_STATE_CODES = [
        'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
        'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
        'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
        'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
        'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'
    ]
    
    @staticmethod
    def _is_usa_location(location: str) -> bool:
        """Check if location is in the USA (STRICT MODE - FIXED)"""
        if not location:
            return True  # Empty = assume remote/flexible

        location_lower = location.lower().strip()

        # 0. Split by " or " and "/" to handle multiple location options
        segments = []
        for sep in [' or ', '/']:
            if sep in location_lower:
                segments.extend([seg.strip() for seg in location_lower.split(sep)])
                break  # Use first separator found
        if not segments:
            segments = [location_lower]

        # Helper to check a single segment
        def check_segment(seg: str) -> bool:
            # 1. Explicitly allow generic remote terms
            remote_terms = ['remote', 'anywhere', 'distributed', 'global', 'united states', 'usa', 'us', 'u.s.']
            if any(term == seg for term in remote_terms):
                return True

            # 2. CRITICAL: Check exclusion list first
            for excluded in JobScorer.EXCLUDED_LOCATIONS:
                if excluded in seg:
                    logger.debug(f"Segment rejected (excluded): {seg}")
                    return False

            # 3. Check allow list (USA states/cities)
            for usa_loc in JobScorer.USA_LOCATIONS:
                if usa_loc in seg:
                    return True

            # 4. Check for US state codes with word boundaries
            for state in JobScorer.US_STATE_CODES:
                pattern = rf'\b{state}\b'
                if re.search(pattern, seg):
                    return True

            # 5. STRICT FALLBACK: Reject if no positive match
            logger.debug(f"Segment rejected (no USA match): {seg}")
            return False

        # Check each segment; if any passes, location is acceptable
        for seg in segments:
            if check_segment(seg):
                logger.debug(f"Location accepted via segment: {seg} (original: {location})")
                return True

        logger.debug(f"Location rejected (no segment passed): {location}")
        return False
    
    @staticmethod
    def _safe_get_days_ago(job: dict) -> int:
        """Safely extract days_ago from job data"""
        days_ago = job.get('posted_days_ago', 999)
        if isinstance(days_ago, (int, float)):
            return int(days_ago)
        if isinstance(days_ago, str):
            try:
                if 'T' in days_ago:
                    date_str = days_ago.replace('Z', '+00:00')
                    posted_dt = datetime.fromisoformat(date_str)
                    current_time = datetime.now(timezone.utc)
                    return (current_time - posted_dt).days
                return int(float(days_ago))
            except (ValueError, TypeError) as e:
                logger.debug(f"Failed to parse days_ago '{days_ago[:50]}': {e}")
                return 999
        return 999
    
    @staticmethod
    def calculate_score(job: dict, profile: dict) -> dict:
        score = 0
        flags = []
        
        title_lower = job['title'].lower()
        location_lower = job.get('location', '').lower()
        description_lower = job.get('description', '').lower()
        company = job['company']
        
        detected_seniority = JobScorer._extract_seniority(title_lower)
        days_ago = JobScorer._safe_get_days_ago(job)
        
        # 🚨 STEP 0: USA LOCATION FILTER (STRICT)
        if not JobScorer._is_usa_location(job.get('location', '')):
            return {
                'score': 0,
                'flags': ['❌ Non-USA location'],
                'seniority': 'unknown',
                'matched_keywords': [],
                'location_match': False,
                'days_ago': 999,
                'rejected': True,
                'rejection_reason': f"Non-USA location: {job.get('location')}"
            }
        
        # 1. KEYWORD MATCH
        keyword_score = 0
        matched_keywords = []
        
        for kw in profile.get('keywords', []):
            kw_lower = kw.lower()

            # Check title - enhanced matching
            title_match = False
            desc_match = False

            # Exact phrase match (highest score)
            if kw_lower in title_lower:
                if ' ' in kw_lower:  # Multi-word exact phrase
                    keyword_score += 30
                else:  # Single word exact
                    keyword_score += 10
                matched_keywords.append(kw)
                title_match = True

            # If no exact match, try partial word matching for multi-word keywords
            elif ' ' in kw_lower and not title_match:
                words = kw_lower.split()
                matched_words = [word for word in words if word in title_lower]
                if matched_words:
                    # Partial match: some words from keyword phrase appear in title
                    keyword_score += 5 * len(matched_words)  # Reduced score for partial
                    matched_keywords.append(kw)
                    title_match = True
                    logger.debug(f"Partial keyword match: {kw} -> {matched_words} in '{job['title']}'")

            # Check description (only if not already matched in title)
            if not title_match and kw_lower in description_lower:
                requirements_text = ' '.join(job.get('requirements', []))
                if kw_lower in requirements_text.lower():
                    keyword_score += 12
                else:
                    keyword_score += 6
                matched_keywords.append(kw)
                desc_match = True
        
        # NEW: Debug Log to track scoring logic
        logger.info(f"🔍 Scoring: {job['title']} | Keywords: {profile.get('keywords', [])} | Matched: {matched_keywords}")

        # NEW: STRICT FILTER - Require at least one keyword match
        if not matched_keywords:
            return {
                'score': 0,
                'flags': ['⚠️ No keyword match'],
                'seniority': detected_seniority,
                'matched_keywords': [],
                'location_match': False,
                'days_ago': days_ago,
                'rejected': True,
                'rejection_reason': f"Strict filter: Title '{job['title']}' did not match any keywords."
            }
        
        score += min(keyword_score, 50)
        
        if matched_keywords:
            flags.append(f"Keywords: {', '.join(list(set(matched_keywords))[:3])}")
        
        # 2. SENIORITY MATCH
        target_seniority_levels = profile.get('seniority', [])
        
        if detected_seniority in target_seniority_levels:
            score += 25
            flags.append(f"Level: {detected_seniority.title()}")
        elif not target_seniority_levels:
            score += 15
        
        # 3. LOCATION MATCH
        target_locs = profile.get('locations', [])
        location_match = False
        
        for loc in target_locs:
            loc_lower = loc.lower()
            if (loc_lower in location_lower or 
                loc_lower in description_lower or
                JobScorer._is_location_match(loc_lower, location_lower)):
                score += 15
                flags.append(f"Location: {loc.title()}")
                location_match = True
                break
        
        if not location_match and not target_locs:
            score += 10
        
        # 4. COMPANY TIER
        if company in COMPANY_TIERS['tier_s']:
            score += 20
            flags.append("🌟 Top Tier")
        elif company in COMPANY_TIERS['tier_a']:
            score += 15
            flags.append("⭐ High Growth")
        else:
            score += 5
        
        # 5. SALARY TRANSPARENCY
        if job.get('salary'):
            score += 5
            flags.append(f"💰 {job['salary']}")
            
            salary_range = SalaryFinder.extract_range(job['salary'])
            if salary_range and salary_range[1] > 150000:
                score += 3
                flags.append("💵 High Salary")
        
        # 6. FRESHNESS BONUS
        if days_ago <= 1:
            score += 8
            flags.append("🔥 Just Posted")
        elif days_ago <= 3:
            score += 6
            flags.append("🆕 Very Fresh")
        elif days_ago <= 7:
            score += 4
            flags.append("🆕 Fresh")
        elif days_ago <= 14:
            score += 2
            flags.append("📅 Recent")
        
        # 7. REMOTE FRIENDLY
        if any(remote_term in location_lower or remote_term in description_lower 
               for remote_term in ['remote', 'anywhere', 'distributed', 'virtual']):
            score += 5
            flags.append("🏠 Remote Friendly")
        
        # 8. NEGATIVE KEYWORD FILTER (ENHANCED - FIXED)
        negative_keywords = profile.get('excludeKeywords', [])
        
        # Check both title AND description
        full_text = (title_lower + ' ' + description_lower).strip()
        
        for neg_kw in negative_keywords:
            neg_kw_lower = neg_kw.lower().strip()
            
            # CRITICAL: Check title first (high confidence)
            if neg_kw_lower in title_lower:
                return {
                    'score': 0,
                    'flags': flags,
                    'seniority': detected_seniority,
                    'matched_keywords': matched_keywords,
                    'location_match': location_match,
                    'days_ago': days_ago,
                    'rejected': True,
                    'rejection_reason': f"Title contains negative keyword: {neg_kw}"
                }
            
            # NEW: Check description with word boundaries (avoid false positives)
            # E.g., "manager" shouldn't match "management"
            pattern = rf'\b{re.escape(neg_kw_lower)}\b'
            if re.search(pattern, description_lower):
                # Only reject if keyword appears multiple times or in prominent position
                occurrences = len(re.findall(pattern, description_lower))
                first_occurrence = description_lower.find(neg_kw_lower)
                
                # Reject if:
                # - Appears 3+ times in description
                # - Appears in first 200 chars (likely job title/summary)
                if occurrences >= 3 or first_occurrence < 200:
                    return {
                        'score': 0,
                        'flags': flags,
                        'seniority': detected_seniority,
                        'matched_keywords': matched_keywords,
                        'location_match': location_match,
                        'days_ago': days_ago,
                        'rejected': True,
                        'rejection_reason': f"Description emphasizes negative keyword: {neg_kw} ({occurrences}x)"
                    }

        # RELAXED REJECTION LOGIC (Now redundant due to strict filter, but kept for low scores with keywords)
        if score < 15:
            return {
                'score': 0,
                'flags': ['⚠️ Low relevance'],
                'seniority': detected_seniority,
                'matched_keywords': matched_keywords,
                'location_match': False,
                'days_ago': days_ago,
                'rejected': True,
                'rejection_reason': 'Low score'
            }
        
        return {
            'score': min(score, 100),
            'flags': flags,
            'seniority': detected_seniority,
            'matched_keywords': matched_keywords,
            'location_match': location_match,
            'days_ago': days_ago,
            'rejected': False
        }
    
    @staticmethod
    def _extract_seniority(title: str) -> str:
        title = title.lower()
        seniority_patterns = [
            (['vp', 'vice president', 'head of', 'director', 'chief', 'exec'], 'executive'),
            (['principal', 'distinguished', 'fellow'], 'principal'),
            (['staff', 'senior staff'], 'staff'),
            (['senior', 'sr.', 'sr '], 'senior'),
            (['lead', 'tech lead', 'engineering lead', 'manager'], 'lead'),
            (['mid', 'mid-level', 'experienced'], 'mid'),
            (['junior', 'jr.', 'entry', 'associate', 'new grad'], 'junior'),
            (['intern', 'internship'], 'intern'),
        ]
        
        for patterns, level in seniority_patterns:
            if any(pattern in title for pattern in patterns):
                return level
        return 'mid'
    
    @staticmethod
    def _is_location_match(target_loc: str, job_loc: str) -> bool:
        location_mappings = {
            'sf': 'san francisco',
            'bay area': 'san francisco',
            'nyc': 'new york',
            'la': 'los angeles',
            'austin': 'texas',
            'seattle': 'washington',
        }
        
        if target_loc in job_loc:
            return True
        
        for short, full in location_mappings.items():
            if (target_loc == short and full in job_loc) or (target_loc == full and short in job_loc):
                return True
        
        return False

# ===========================================================================
#                        CONTENT EXTRACTION
# ===========================================================================

class ContentExtractor:
    """Enhanced content extraction"""
    
    @staticmethod
    def clean_html(html_content: str) -> str:
        if not html_content:
            return ""
        
        html_content = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html_content, flags=re.DOTALL)
        
        replacements = {
            '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
            '&quot;': '"', '&#39;': "'", '&ndash;': '-', '&mdash;': '—',
        }
        
        for entity, replacement in replacements.items():
            html_content = html_content.replace(entity, replacement)
        
        html_content = re.sub(r'<br\s*/?>', '\n', html_content, flags=re.IGNORECASE)
        html_content = re.sub(r'</p>', '\n\n', html_content, flags=re.IGNORECASE)
        html_content = re.sub(r'<li>', '\n• ', html_content, flags=re.IGNORECASE)
        
        clean_text = re.sub(r'<[^>]+>', ' ', html_content)
        
        clean_text = re.sub(r'\s+', ' ', clean_text)
        clean_text = re.sub(r'\n\s*\n', '\n\n', clean_text)
        clean_text = re.sub(r'[ \t]+', ' ', clean_text)
        
        return clean_text.strip()
    
    @staticmethod
    def extract_requirements(content: str) -> List[str]:
        if not content:
            return []
        
        patterns = [
            r'(?:Requirements?|Qualifications?|You Have|Must Have|Required Skills|You Will Need)[:\s]+(.*?)(?=\n\n|Requirements|Responsibilities|What You\'ll Do|$|Qualifications)',
            r'(?:What [Yy]ou\'ll [Bb]ring|What [Ww]e\'re [Ll]ooking [Ff]or|Ideal Candidate)[:\s]+(.*?)(?=\n\n|$|Qualifications)',
            r'(?:Minimum Qualifications|Basic Qualifications)[:\s]+(.*?)(?=\n\n|Preferred Qualifications|$|What We\'re Looking For)',
        ]
        
        all_requirements = []
        
        for pattern in patterns:
            matches = re.findall(pattern, content, re.IGNORECASE | re.DOTALL)
            for match in matches:
                bullets = re.findall(r'[•\-\*◦▪▶]\s*(.+?)(?=\n|$|[•\-\*])', match)
                if not bullets:
                    bullets = re.findall(r'\d+\.\s*(.+?)(?=\n|$|\d+\.)', match)
                if not bullets:
                    bullets = re.findall(r'(?:^|\n)\s*[•\-\*]?\s*([A-Z].+?[.!?])(?=\n|$)', match)
                
                if bullets:
                    cleaned = [b.strip() for b in bullets if len(b.strip()) > 10]
                    all_requirements.extend(cleaned)
        
        unique_reqs = []
        seen = set()
        for req in all_requirements:
            req_lower = req.lower()
            if req_lower not in seen and len(req) < 500:
                seen.add(req_lower)
                unique_reqs.append(req)
        
        return unique_reqs[:Config.MAX_REQUIREMENTS]
    
    @staticmethod
    def extract_description_summary(content: str, max_length: int = None) -> str:
        if max_length is None:
            max_length = Config.MAX_DESCRIPTION_LENGTH
            
        clean = ContentExtractor.clean_html(content)
        if len(clean) <= max_length:
            return clean
        
        truncated = clean[:max_length]
        last_period = truncated.rfind('.')
        last_exclamation = truncated.rfind('!')
        last_question = truncated.rfind('?')
        
        last_boundary = max(last_period, last_exclamation, last_question)
        
        if last_boundary > max_length * 0.7:
            return truncated[:last_boundary + 1]
        
        return truncated + "..."

# ===========================================================================
#                        ANALYTICS ENGINE (NEW)
# ===========================================================================

class AnalyticsEngine:
    """Enhanced analytics for job market insights"""
    
    def __init__(self):
        self.company_stats = defaultdict(lambda: {
            'total_jobs': 0,
            'avg_salary': 0,
            'salary_count': 0,
            'remote_ratio': 0,
            'seniority_dist': defaultdict(int),
            'role_dist': defaultdict(int),
            'locations': defaultdict(int)
        })
        
        self.role_stats = defaultdict(lambda: {
            'count': 0,
            'companies': set(),
            'avg_salary': 0,
            'salary_sum': 0,
            'salary_count': 0
        })
        
        self.salary_brackets = {
            'under_100k': 0,
            '100k_150k': 0,
            '150k_200k': 0,
            '200k_250k': 0,
            '250k_300k': 0,
            '300k_plus': 0,
            'not_specified': 0
        }
        
        self.location_stats = defaultdict(int)
        self.remote_count = 0
        self.total_jobs_analyzed = 0
    
    def analyze_job(self, job: dict):
        """Analyze a single job for insights"""
        self.total_jobs_analyzed += 1
        company = job['company']
        
        # Company stats
        self.company_stats[company]['total_jobs'] += 1
        
        # Role extraction and categorization
        title_lower = job['title'].lower()
        role_category = self._categorize_role(title_lower)
        self.company_stats[company]['role_dist'][role_category] += 1
        self.role_stats[role_category]['count'] += 1
        self.role_stats[role_category]['companies'].add(company)
        
        # Seniority analysis
        seniority = JobScorer._extract_seniority(title_lower)
        self.company_stats[company]['seniority_dist'][seniority] += 1
        
        # Location analysis
        location = job.get('location', '').lower()
        if 'remote' in location or 'anywhere' in location or 'distributed' in location:
            self.remote_count += 1
            self.company_stats[company]['remote_ratio'] += 1
        
        # Extract city/state from location
        primary_location = self._extract_primary_location(location)
        if primary_location:
            self.location_stats[primary_location] += 1
            self.company_stats[company]['locations'][primary_location] += 1
        
        # Salary analysis
        salary = job.get('salary')
        if salary:
            salary_range = SalaryFinder.extract_range(salary)
            if salary_range:
                avg_salary = sum(salary_range) / 2
                
                # Update company salary stats
                curr_avg = self.company_stats[company]['avg_salary']
                count = self.company_stats[company]['salary_count']
                
                # Standard running average formula
                self.company_stats[company]['avg_salary'] = (
                    (curr_avg * count + avg_salary) / (count + 1)
                )
                self.company_stats[company]['salary_count'] += 1
                
                # Update role salary stats
                self.role_stats[role_category]['salary_sum'] += avg_salary
                self.role_stats[role_category]['salary_count'] += 1
                self.role_stats[role_category]['avg_salary'] = (
                    self.role_stats[role_category]['salary_sum'] / 
                    self.role_stats[role_category]['salary_count']
                )
                
                # Update salary brackets
                self._update_salary_bracket(avg_salary)
    
    def _categorize_role(self, title: str) -> str:
        """Categorize job title into role categories"""
        title_lower = title.lower()
        
        categories = {
            'engineering': ['engineer', 'developer', 'architect', 'devops', 'sre', 'infrastructure', 'backend', 'frontend', 'full stack'],
            'product': ['product manager', 'pm', 'product owner', 'product lead', 'director of product', 'head of product'],
            'data': ['data scientist', 'data analyst', 'machine learning', 'ml', 'ai engineer', 'data engineer', 'analytics'],
            'design': ['designer', 'ux', 'ui', 'product design', 'creative', 'art director'],
            'marketing': ['marketing', 'growth', 'demand gen', 'brand', 'content', 'seo', 'sem'],
            'sales': ['sales', 'account executive', 'ae', 'business development', 'sdr', 'bdr', 'account manager'],
            'finance': ['finance', 'accounting', 'cfo', 'controller', 'analyst', 'treasury'],
            'hr': ['hr', 'recruiter', 'talent', 'people operations', 'human resources'],
            'operations': ['operations', 'ops', 'program manager', 'project manager', 'chief of staff'],
            'executive': ['director', 'vp', 'vice president', 'c-level', 'chief', 'head of', 'founder']
        }
        
        for category, keywords in categories.items():
            if any(keyword in title_lower for keyword in keywords):
                return category
        
        return 'other'
    
    def _extract_primary_location(self, location: str) -> Optional[str]:
        """Extract primary location from job location string"""
        if not location:
            return None
        
        # Common location patterns
        location_patterns = [
            ('san francisco', ['sf', 'san francisco', 'bay area', 'palo alto', 'mountain view', 'menlo park', 'redwood city']),
            ('new york', ['nyc', 'new york', 'manhattan', 'brooklyn']),
            ('seattle', ['seattle', 'bellevue', 'redmond', 'kirkland']),
            ('austin', ['austin', 'texas']),
            ('los angeles', ['la', 'los angeles', 'santa monica', 'culver city']),
            ('boston', ['boston', 'cambridge', 'massachusetts']),
            ('chicago', ['chicago', 'illinois']),
            ('denver', ['denver', 'colorado', 'boulder']),
            ('remote', ['remote', 'anywhere', 'distributed', 'virtual'])
        ]
        
        for primary_loc, patterns in location_patterns:
            if any(pattern in location for pattern in patterns):
                return primary_loc
        
        return None
    
    def _update_salary_bracket(self, salary: float):
        """Update salary bracket statistics"""
        if salary < 100000:
            self.salary_brackets['under_100k'] += 1
        elif salary < 150000:
            self.salary_brackets['100k_150k'] += 1
        elif salary < 200000:
            self.salary_brackets['150k_200k'] += 1
        elif salary < 250000:
            self.salary_brackets['200k_250k'] += 1
        elif salary < 300000:
            self.salary_brackets['250k_300k'] += 1
        else:
            self.salary_brackets['300k_plus'] += 1
    
    def get_top_hiring_companies(self, limit: int = 10) -> List[Tuple[str, dict]]:
        """Get top companies by number of jobs"""
        sorted_companies = sorted(
            self.company_stats.items(),
            key=lambda x: x[1]['total_jobs'],
            reverse=True
        )
        return sorted_companies[:limit]
    
    def get_highest_paying_companies(self, min_jobs: int = 5, limit: int = 10) -> List[Tuple[str, float]]:
        """Get companies with highest average salaries"""
        qualified_companies = [
            (company, data['avg_salary']) 
            for company, data in self.company_stats.items() 
            if data['salary_count'] >= min_jobs and data['avg_salary'] > 0
        ]
        
        sorted_companies = sorted(
            qualified_companies,
            key=lambda x: x[1],
            reverse=True
        )
        return sorted_companies[:limit]
    
    def get_most_popular_roles(self, limit: int = 10) -> List[Tuple[str, dict]]:
        """Get most popular job roles"""
        sorted_roles = sorted(
            self.role_stats.items(),
            key=lambda x: x[1]['count'],
            reverse=True
        )
        return sorted_roles[:limit]
    
    def get_location_insights(self, limit: int = 10) -> List[Tuple[str, int]]:
        """Get job distribution by location"""
        sorted_locations = sorted(
            self.location_stats.items(),
            key=lambda x: x[1],
            reverse=True
        )
        return sorted_locations[:limit]
    
    def print_analytics_summary(self):
        """Print comprehensive analytics summary"""
        print("\n" + "="*80)
        print("📈 JOB MARKET ANALYTICS INSIGHTS")
        print("="*80)
        
        print(f"\n📊 Total Jobs Analyzed: {self.total_jobs_analyzed:,}")
        print(f"🏠 Remote Jobs: {self.remote_count:,} ({self.remote_count/max(self.total_jobs_analyzed,1)*100:.1f}%)")
        
        # Top hiring companies
        print(f"\n🏆 TOP 10 HIRING COMPANIES:")
        top_hiring = self.get_top_hiring_companies(10)
        for rank, (company, stats) in enumerate(top_hiring, 1):
            remote_pct = (stats['remote_ratio']/max(stats['total_jobs'],1)*100)
            print(f"   {rank:2}. {company:25} → {stats['total_jobs']:4} jobs | {remote_pct:5.1f}% remote")
        
        # Highest paying companies
        print(f"\n💰 HIGHEST PAYING COMPANIES (avg salary):")
        top_paying = self.get_highest_paying_companies(min_jobs=3, limit=10)
        for rank, (company, avg_salary) in enumerate(top_paying, 1):
            print(f"   {rank:2}. {company:25} → ${avg_salary:,.0f}")
        
        # Most popular roles
        print(f"\n🎯 MOST IN-DEMAND ROLES:")
        popular_roles = self.get_most_popular_roles(10)
        for rank, (role, stats) in enumerate(popular_roles, 1):
            avg_salary = f"${stats['avg_salary']:,.0f}" if stats['avg_salary'] > 0 else "N/A"
            companies = len(stats['companies'])
            print(f"   {rank:2}. {role:20} → {stats['count']:4} jobs | {avg_salary:10} | {companies:3} companies")
        
        # Salary distribution
        print(f"\n💵 SALARY DISTRIBUTION:")
        total_with_salary = sum(self.salary_brackets.values()) - self.salary_brackets['not_specified']
        if total_with_salary > 0:
            for bracket, count in self.salary_brackets.items():
                if bracket != 'not_specified':
                    pct = count/max(total_with_salary,1)*100
                    bracket_name = bracket.replace('_', '-').replace('k', 'K').title()
                    print(f"   📊 {bracket_name:15} → {count:4} jobs ({pct:5.1f}%)")
        
        # Location insights
        print(f"\n📍 TOP JOB LOCATIONS:")
        top_locations = self.get_location_insights(10)
        for rank, (location, count) in enumerate(top_locations, 1):
            pct = count/max(self.total_jobs_analyzed,1)*100
            print(f"   {rank:2}. {location:20} → {count:4} jobs ({pct:5.1f}%)")
        
        print("="*80)
    
    def save_analytics_to_firestore(self, db):
        """Save analytics data to Firestore for dashboard display"""
        try:
            analytics_id = f"analytics_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}"
            analytics_ref = db.collection('market_analytics').document(analytics_id)
            
            # Prepare data for Firestore
            analytics_data = {
                'timestamp': firestore.SERVER_TIMESTAMP,
                'total_jobs_analyzed': self.total_jobs_analyzed,
                'remote_count': self.remote_count,
                'salary_brackets': dict(self.salary_brackets),
                'top_companies': [
                    {
                        'company': company,
                        'total_jobs': stats['total_jobs'],
                        'avg_salary': stats['avg_salary'],
                        'remote_ratio': stats['remote_ratio']/max(stats['total_jobs'],1)*100,
                    }
                    for company, stats in self.get_top_hiring_companies(20)
                ],
                'top_roles': [
                    {
                        'role': role,
                        'count': stats['count'],
                        'avg_salary': stats['avg_salary'],
                        'company_count': len(stats['companies'])
                    }
                    for role, stats in self.get_most_popular_roles(15)
                ],
                'top_locations': [
                    {'location': loc, 'count': count}
                    for loc, count in self.get_location_insights(15)
                ],
                'salary_insights': {
                    'highest_paying_companies': [
                        {'company': company, 'avg_salary': salary}
                        for company, salary in self.get_highest_paying_companies(min_jobs=3, limit=10)
                    ],
                    'salary_distribution': dict(self.salary_brackets)
                }
            }
            
            analytics_ref.set(analytics_data)
            logger.info(f"📈 Analytics saved to Firestore: {analytics_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to save analytics: {e}")

# ===========================================================================
#                        METRICS TRACKING
# ===========================================================================

@dataclass
class ScraperMetrics:
    company: str
    jobs_found: int = 0
    jobs_matched: int = 0
    errors: int = 0
    duration: float = 0.0
    status: str = "pending"
    priority: int = 3
    avg_score: float = 0.0
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

@dataclass
class GlobalMetrics:
    start_time: float = field(default_factory=time.time)
    total_jobs_scraped: int = 0
    total_matches_created: int = 0
    total_errors: int = 0
    companies_scraped: int = 0
    companies_failed: int = 0
    company_metrics: Dict[str, ScraperMetrics] = field(default_factory=dict)
    user_match_counts: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    ats_metrics: Dict[str, Dict] = field(default_factory=lambda: defaultdict(lambda: {'success': 0, 'failed': 0, 'jobs': 0}))
    
    def add_company_metrics(self, metrics: ScraperMetrics, ats_type: str):
        self.company_metrics[metrics.company] = metrics
        self.total_jobs_scraped += metrics.jobs_found
        self.total_matches_created += metrics.jobs_matched
        self.total_errors += metrics.errors
        self.companies_scraped += 1
        
        self.ats_metrics[ats_type]['jobs'] += metrics.jobs_found
        if metrics.status == "success":
            self.ats_metrics[ats_type]['success'] += 1
        else:
            self.ats_metrics[ats_type]['failed'] += 1
            self.companies_failed += 1
    
    def print_summary(self):
        duration = time.time() - self.start_time
        
        print("\n" + "="*80)
        print("📊 JOBHUNT AI SCRAPER SUMMARY V3.1 (FIXED & OPTIMIZED)")
        print("="*80)
        print(f"⏱️  Total Runtime: {duration:.1f}s")
        print(f"🏢 Companies Scraped: {self.companies_scraped} ({self.companies_failed} failed)")
        print(f"💼 Total Jobs Found: {self.total_jobs_scraped}")
        print(f"✨ Total Matches Created: {self.total_matches_created}")
        print(f"❌ Total Errors: {self.total_errors}")
        print(f"📈 Match Rate: {(self.total_matches_created/max(self.total_jobs_scraped,1)*100):.1f}%")
        
        if self.ats_metrics:
            print(f"\n🔧 ATS Breakdown:")
            for ats, metrics in sorted(self.ats_metrics.items()):
                success_rate = (metrics['success']/max(metrics['success']+metrics['failed'],1)*100)
                print(f"   {ats.upper():10} → {metrics['success']+metrics['failed']:3} companies, {metrics['jobs']:4} jobs, {success_rate:.0f}% success")
        
        if self.user_match_counts:
            print(f"\n👥 User Match Breakdown:")
            for email, count in sorted(self.user_match_counts.items(), key=lambda x: x[1], reverse=True):
                print(f"   {email:40} → {count:3} matches")
        
        print(f"\n🏆 Top Performing Companies:")
        sorted_metrics = sorted(
            [m for m in self.company_metrics.values() if m.status == "success"],
            key=lambda x: (x.jobs_found, -x.duration),
            reverse=True
        )[:15]
        
        for m in sorted_metrics:
            match_rate = (m.jobs_matched / m.jobs_found * 100) if m.jobs_found > 0 else 0
            print(f"   {m.company:25} → {m.jobs_found:4} jobs | {m.jobs_matched:3} matches ({match_rate:.0f}%) | {m.duration:.1f}s")
        
        if self.companies_failed > 0:
            print(f"\n⚠️  Failed Companies:")
            failed = [m for m in self.company_metrics.values() if m.status == "failed"]
            for m in failed[:10]:
                print(f"   ❌ {m.company}")
        
        print("="*80 + "\n")
    
    def save_to_firestore(self, db):
        """Save metrics to Firestore for historical tracking"""
        try:
            metrics_id = f"scrape_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
            metrics_ref = db.collection('scraper_metrics').document(metrics_id)
            
            metrics_data = {
                'timestamp': firestore.SERVER_TIMESTAMP,
                'duration': time.time() - self.start_time,
                'total_jobs_scraped': self.total_jobs_scraped,
                'total_matches_created': self.total_matches_created,
                'total_errors': self.total_errors,
                'companies_scraped': self.companies_scraped,
                'companies_failed': self.companies_failed,
                'user_match_counts': dict(self.user_match_counts),
                'ats_metrics': dict(self.ats_metrics),
            }
            
            metrics_ref.set(metrics_data)
            logger.info(f"📊 Metrics saved to Firestore: {metrics_id}")
        except Exception as e:
            logger.error(f"❌ Failed to save metrics: {e}")

# ===========================================================================
#                        FIREBASE MANAGER
# ===========================================================================

class FirebaseManager:
    """Enhanced Firebase operations"""
    
    def __init__(self):
        self.user_cache = {}
        self.job_id_cache = set()
        self._db = None
        self._initialize_firebase()
    
    def _initialize_firebase(self):
        """Safe Firebase initialization"""
        try:
            # Use the singleton instance
            if firebase_singleton.initialize():
                self._db = firebase_singleton.db
                logger.info("✅ Firebase Manager initialized successfully!")
                return True
            return False
        except Exception as e:
            logger.critical(f"❌ Error initializing Firebase Manager: {e}")
            return False
    
    @property
    def db(self):
        """Get Firestore database instance"""
        if not self._db:
            self._initialize_firebase()
        return self._db
    
    async def get_user_id(self, email: str) -> Optional[str]:
        """Get Firebase UID from email with caching"""
        if not self._db:
            logger.error("Firebase not initialized in FirebaseManager")
            return None
            
        if email in self.user_cache:
            return self.user_cache[email]
        
        try:
            user = auth.get_user_by_email(email)
            self.user_cache[email] = user.uid
            return user.uid
        except auth.UserNotFoundError:
            logger.warning(f"⚠️  User not found: {email}")
            return None
        except Exception as e:
            logger.error(f"❌ Error fetching user {email}: {e}")
            return None
    
    def generate_job_id(self, company: str, title: str) -> str:
        """Generate deterministic job ID"""
        unique_string = f"{company.lower()}:{title.lower()}"
        return hashlib.md5(unique_string.encode()).hexdigest()[:16]
    
    async def check_job_exists(self, job_id: str) -> bool:
        """Enhanced job existence check with cache"""
        if not self._db:
            return False
            
        if job_id in self.job_id_cache:
            return True
        
        try:
            job_ref = self.db.collection('jobs').document(job_id)
            doc = job_ref.get()
            
            if doc.exists:
                posted_at = doc.get('postedAt')
                if posted_at:
                    current_time = datetime.now(timezone.utc)
                    age_days = (current_time - posted_at).days
                    
                    if age_days < Config.JOB_EXPIRATION_DAYS:
                        self.job_id_cache.add(job_id)
                        return True
                else:
                    self.job_id_cache.add(job_id)
                    return True
            
            return False
        except Exception as e:
            logger.error(f"Error checking job existence: {e}")
            return False
    
    async def add_job_and_match_batch(
        self, 
        jobs_with_scores: List[Tuple[dict, dict, str]], 
        metrics: GlobalMetrics
    ) -> int:
        """Batch process jobs for better performance"""
        if not self._db:
            logger.error("Cannot add jobs: Firebase not initialized")
            return 0
            
        successful_matches = 0
        batch = self.db.batch()
        batch_count = 0
        
        for job, score_data, email in jobs_with_scores:
            try:
                user_id = await self.get_user_id(email)
                if not user_id:
                    continue
                
                job_id = self.generate_job_id(job['company'], job['title'])
                
                if await self.check_job_exists(job_id):
                    continue
                
                # Add job document
                job_ref = self.db.collection('jobs').document(job_id)
                batch.set(job_ref, {
                    'title': job['title'],
                    'company': job['company'],
                    'location': job.get('location', 'Not specified'),
                    'url': job['link'],
                    'expiresAt': datetime.now(timezone.utc) + timedelta(days=Config.JOB_EXPIRATION_DAYS),
                    'source': job['source'],
                    'tags': score_data['flags'],
                    'salary': job.get('salary'),
                    'description': job.get('description', ''),
                    'requirements': job.get('requirements', []),
                    'seniority': score_data.get('seniority'),
                    'matchScore': score_data['score'],
                    'scrapedAt': firestore.SERVER_TIMESTAMP,
                }, merge=True)
                
                self.job_id_cache.add(job_id)
                
                # Create user match document
                match_id = f"{user_id}_{job_id}"
                match_ref = self.db.collection('user_job_matches').document(match_id)
                
                batch.set(match_ref, {
                    'userId': user_id,
                    'jobId': job_id,
                    'matchScore': score_data['score'],
                    'matchReasons': score_data['flags'],
                    'matchedKeywords': score_data.get('matched_keywords', []),
                    'notifiedAt': firestore.SERVER_TIMESTAMP,
                    'viewed': False,
                    'saved': False,
                    'applied': False,
                    'createdAt': firestore.SERVER_TIMESTAMP,
                }, merge=True)
                
                metrics.user_match_counts[email] += 1
                successful_matches += 1
                batch_count += 1
                
                # Commit batch when full
                if batch_count >= Config.FIREBASE_BATCH_SIZE:
                    batch.commit()
                    batch = self.db.batch()
                    batch_count = 0
                    logger.debug(f"  💾 Committed batch of {Config.FIREBASE_BATCH_SIZE} jobs")
                    
            except Exception as e:
                logger.error(f"❌ Error in batch job processing: {e}")
                continue
        
        # Commit remaining batch
        if batch_count > 0:
            batch.commit()
            logger.debug(f"  💾 Committed final batch of {batch_count} jobs")
        
        return successful_matches

# ===========================================================================
#                        USER PROFILE LOADER (ENHANCED)
# ===========================================================================

async def load_active_profiles(firebase_manager: FirebaseManager) -> List[dict]:
    """Load all active user profiles from Firestore"""
    if not firebase_manager.db:
        logger.error("❌ Firebase not available for loading profiles")
        return []
    
    try:
        users_ref = firebase_manager.db.collection('users')
        docs = users_ref.stream()
        
        profiles = []
        for doc in docs:
            data = doc.to_dict()
            email = data.get('email')
            
            if not email:
                continue
            
            profile = {
                'name': data.get('displayName', 'User'),
                'email': email,
                'keywords': data.get('searchKeywords', ['product manager', 'pm', 'product']),
                'seniority': data.get('seniorityLevels', ['senior', 'staff', 'lead']),
                'locations': data.get('preferredLocations', ['remote', 'san francisco', 'bay area', 'new york']),
                'min_score': data.get('minMatchScore', 40), # Default lower to catch more
                'preferred_companies': data.get('preferredCompanies', []),
                'avoid_companies': data.get('avoidCompanies', []),
                'industry_preferences': data.get('industryPreferences', ['tech', 'saas', 'ai']),
                'excludeKeywords': data.get('excludeKeywords', []),
            }
            profiles.append(profile)
        
        if not profiles:
            logger.warning("⚠️  No user profiles found in Firestore, using enhanced default profile")
            # FIX 3: Expanded Default Profile
            profiles = [{
                'name': 'Default User',
                'email': os.getenv('DEFAULT_USER_EMAIL', 'default@example.com'),
                'keywords': [
                    'product manager', 'product lead', 'pm', 'product management', 
                    'strategy', 'chief product officer', 'head of product', 
                    'group product manager', 'senior product manager', 'technical product manager'
                ],
                'seniority': ['senior', 'staff', 'principal', 'lead', 'executive', 'mid'],
                'locations': ['remote', 'san francisco', 'bay area', 'new york', 'austin', 'seattle'],
                'min_score': 30,
                'preferred_companies': [],
                'avoid_companies': [],
                'industry_preferences': ['tech', 'saas', 'ai', 'fintech'],
                'excludeKeywords': ['intern', 'internship', 'entry level', 'junior', 'designer', 'engineer', 'analyst'],
            }]
        
        logger.info(f"✅ Loaded {len(profiles)} user profile(s) with enhanced settings")
        return profiles
    
    except Exception as e:
        logger.error(f"❌ Error loading user profiles: {e}")
        return []

# ===========================================================================
#                        CLEANUP UTILITIES
# ===========================================================================

async def cleanup_expired_jobs(firebase_manager: FirebaseManager):
    """Cleanup expired jobs from Firestore"""
    if not firebase_manager.db:
        logger.error("❌ Firebase not available for cleanup")
        return
    
    try:
        now = datetime.now(timezone.utc)
        expired_query = firebase_manager.db.collection('jobs').where('expiresAt', '<', now).stream()
        
        batch = firebase_manager.db.batch()
        count = 0
        start_time = time.time()
        
        for doc in expired_query:
            batch.delete(doc.reference)
            count += 1
            
            if count % Config.FIREBASE_BATCH_SIZE == 0:
                batch.commit()
                batch = firebase_manager.db.batch()
                elapsed = time.time() - start_time
                logger.info(f"🗑️  Deleted {count} expired jobs... ({elapsed:.1f}s)")
        
        if count % Config.FIREBASE_BATCH_SIZE != 0:
            batch.commit()
        
        if count > 0:
            elapsed = time.time() - start_time
            logger.info(f"✅ Cleanup complete: {count} expired jobs removed in {elapsed:.1f}s")
        else:
            logger.info("✅ No expired jobs to clean up")
            
    except Exception as e:
        logger.error(f"❌ Error during cleanup: {e}")

# ===========================================================================
#                        SCRAPER FACTORY (FIXED & INTEGRATED)
# ===========================================================================

class ScraperFactory:
    """Multi-ATS scraper with better error handling and INTEGRATED SALARY EXTRACTION"""
    
    @staticmethod
    async def fetch_with_retry(
        session: aiohttp.ClientSession,
        target: dict,
        attempt: int = 1
    ) -> List[dict]:
        try:
            # NEW: Validate and auto-correct company ID
            is_valid = await CompanyValidator.validate_and_correct(session, target)
            if not is_valid:
                logger.warning(f"⚠️  {target['name']}: Invalid or inaccessible job board")
                return []
            
            limiter = rate_limiters.get(target['ats'])
            if limiter:
                await limiter.wait()
            
            jobs = await ScraperFactory._fetch_jobs(session, target)
            
            if limiter:
                limiter.record_success()
            
            return jobs
            
        except aiohttp.ClientError as e:
            logger.error(f"❌ Network error for {target['name']} ({target['ats']}): {e}")
            
            limiter = rate_limiters.get(target['ats'])
            if limiter:
                limiter.record_error()
            
            if attempt < Config.RETRY_ATTEMPTS:
                delay = Config.RETRY_DELAY * attempt * random.uniform(0.8, 1.2)
                logger.info(f"🔄 Retrying {target['name']} in {delay:.1f}s (attempt {attempt + 1}/{Config.RETRY_ATTEMPTS})")
                await asyncio.sleep(delay)
                return await ScraperFactory.fetch_with_retry(session, target, attempt + 1)
            return []
            
        except Exception as e:
            logger.error(f"❌ Unexpected error for {target['name']}: {e}")
            return []
    
    @staticmethod
    async def _fetch_jobs(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        jobs = []
        
        try:
            if target['ats'] == 'greenhouse':
                jobs = await ScraperFactory._fetch_greenhouse(session, target)
            elif target['ats'] == 'ashby':
                jobs = await ScraperFactory._fetch_ashby(session, target)
            elif target['ats'] == 'lever':
                jobs = await ScraperFactory._fetch_lever(session, target)
            elif target['ats'] == 'workday':
                jobs = await ScraperFactory._fetch_workday(session, target)
            else:
                logger.warning(f"⚠️  Unknown ATS type: {target['ats']}")
                
        except Exception as e:
            logger.error(f"Error fetching from {target['name']} ({target['ats']}): {e}")
        
        return jobs[:Config.MAX_JOBS_PER_COMPANY]
    
    @staticmethod
    async def _fetch_greenhouse(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        """Greenhouse ATS scraper - Integrated with EnhancedSalaryExtractor"""
        url = f"https://boards-api.greenhouse.io/v1/boards/{target['id']}/jobs?content=true"
        
        headers = {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'application/json',
        }
        
        try:
            async with session.get(url, headers=headers, timeout=Config.REQUEST_TIMEOUT) as resp:
                if resp.status != 200:
                    logger.warning(f"⚠️  {target['name']} returned status {resp.status}")
                    if resp.status == 429:
                        logger.warning(f"   ⚠️ Rate limited by {target['name']}, backing off...")
                        await asyncio.sleep(5)
                    return []
                
                data = await resp.json()
                jobs = []
                
                for j in data.get('jobs', []):
                    try:
                        content = j.get('content', '')
                        description = ContentExtractor.extract_description_summary(content)
                        requirements = ContentExtractor.extract_requirements(content)
                        
                        # NEW: Enhanced salary extraction
                        job_data_for_salary = {
                            'description': content,
                            'content': content,
                            'title': j['title'],
                            'requirements': requirements
                        }
                        salary = extract_salary_from_job(job_data_for_salary)
                        
                        # Extract location - handle both formats
                        location_obj = j.get('location', {})
                        if isinstance(location_obj, dict):
                            location = location_obj.get('name', 'Remote')
                        else:
                            location = str(location_obj) if location_obj else 'Remote'
                        
                        # FIXED: Parse date correctly
                        posted_date_str = j.get('updated_at')
                        posted_days_ago = 0
                        
                        if posted_date_str:
                            try:
                                # Greenhouse date format: "2023-10-25T14:30:00Z"
                                date_str = posted_date_str.replace('Z', '+00:00')
                                posted_dt = datetime.fromisoformat(date_str)
                                current_time = datetime.now(timezone.utc)
                                posted_days_ago = (current_time - posted_dt).days
                            except Exception as date_error:
                                logger.debug(f"Could not parse date {posted_date_str}: {date_error}")
                                posted_days_ago = 0
                        
                        jobs.append({
                            'id': str(j['id']),
                            'title': j['title'],
                            'location': location,
                            'link': j.get('absolute_url', f"https://boards.greenhouse.io/{target['id']}/jobs/{j['id']}"),
                            'source': 'Greenhouse',
                            'company': target['name'],
                            'description': description,
                            'requirements': requirements,
                            'salary': salary,  # Now uses enhanced extractor
                            'posted_days_ago': posted_days_ago,
                        })
                    except Exception as e:
                        logger.error(f"Error processing Greenhouse job {j.get('id', 'unknown')}: {e}")
                        continue
                        
                return jobs
                
        except asyncio.TimeoutError:
            logger.warning(f"⏰ Timeout fetching from {target['name']}")
            return []
        except Exception as e:
            logger.error(f"Error in Greenhouse scraper for {target['name']}: {e}")
            return []
    
    @staticmethod
    async def _fetch_ashby(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        """Ashby ATS scraper - Integrated with EnhancedSalaryExtractor"""
        url = f"https://api.ashbyhq.com/posting-api/job-board/{target['id']}"
        
        headers = {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'application/json',
        }
        
        try:
            async with session.get(url, headers=headers, timeout=Config.REQUEST_TIMEOUT) as resp:
                if resp.status != 200:
                    logger.warning(f"⚠️  {target['name']} returned status {resp.status}")
                    return []
                
                data = await resp.json()
                jobs = []
                
                for j in data.get('jobs', []):
                    description = ContentExtractor.extract_description_summary(
                        j.get('descriptionHtml', '') or j.get('description', '')
                    )
                    requirements = ContentExtractor.extract_requirements(description)
                    
                    # NEW: Enhanced salary extraction
                    job_data_for_salary = {
                        'description': description,
                        'content': description,
                        'title': j['title'],
                        'requirements': requirements
                    }
                    salary = extract_salary_from_job(job_data_for_salary)
                    
                    jobs.append({
                        'id': str(j['id']),
                        'title': j['title'],
                        'location': j.get('location', 'Remote'),
                        'link': j['jobUrl'],
                        'source': 'Ashby',
                        'company': target['name'],
                        'description': description,
                        'requirements': requirements,
                        'salary': salary,  # Now uses enhanced extractor
                        'posted_days_ago': 0,  # Ashby doesn't provide posting date
                    })
                return jobs
                
        except asyncio.TimeoutError:
            logger.warning(f"⏰ Timeout fetching from {target['name']}")
            return []
        except Exception as e:
            logger.error(f"Error in Ashby scraper for {target['name']}: {e}")
            return []
    
    @staticmethod
    async def _fetch_lever(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        """Lever ATS scraper - Integrated with EnhancedSalaryExtractor"""
        url = f"https://api.lever.co/v0/postings/{target['id']}?mode=json"
        
        headers = {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'application/json',
        }
        
        try:
            async with session.get(url, headers=headers, timeout=Config.REQUEST_TIMEOUT) as resp:
                if resp.status != 200:
                    logger.warning(f"⚠️  {target['name']} returned status {resp.status}")
                    return []
                
                data = await resp.json()
                jobs = []
                
                for j in data:
                    description = j.get('descriptionPlain', '') or j.get('description', '')
                    requirements = ContentExtractor.extract_requirements(description)
                    
                    # NEW: Enhanced salary extraction
                    job_data_for_salary = {
                        'description': description,
                        'content': description,
                        'title': j['text'],
                        'requirements': requirements
                    }
                    salary = extract_salary_from_job(job_data_for_salary)
                    
                    # Calculate days since posted - Lever provides timestamp
                    posted_at = j.get('createdAt', 0)
                    days_ago = 0
                    if posted_at:
                        try:
                            posted_date = datetime.fromtimestamp(posted_at / 1000)
                            days_ago = (datetime.now() - posted_date).days
                        except:
                            pass
                    
                    jobs.append({
                        'id': str(j['id']),
                        'title': j['text'],
                        'location': j.get('categories', {}).get('location', 'Remote'),
                        'link': j['hostedUrl'],
                        'source': 'Lever',
                        'company': target['name'],
                        'description': description[:2000],
                        'requirements': requirements,
                        'salary': salary,  # Now uses enhanced extractor
                        'posted_days_ago': days_ago,
                    })
                return jobs
                
        except asyncio.TimeoutError:
            logger.warning(f"⏰ Timeout fetching from {target['name']}")
            return []
        except Exception as e:
            logger.error(f"Error in Lever scraper for {target['name']}: {e}")
            return []
    
    @staticmethod
    async def _fetch_workday(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        """Workday ATS placeholder"""
        logger.info(f"ℹ️  Workday scraper not yet implemented for {target['name']}")
        return []

# ===========================================================================
#                        PERFORMANCE MONITOR (OPTIONAL)
# ===========================================================================

class PerformanceMonitor:
    """Track and report performance metrics"""
    
    def __init__(self):
        self.start_time = time.time()
        self.company_timings = []
        self.requests_by_ats = defaultdict(int)
    
    def log_company(self, company: str, duration: float, ats: str, jobs: int):
        self.company_timings.append({
            'company': company,
            'duration': duration,
            'ats': ats,
            'jobs': jobs,
            'jobs_per_second': jobs / max(duration, 0.1)
        })
        self.requests_by_ats[ats] += 1
    
    def print_performance_summary(self):
        print("\n" + "="*80)
        print("📊 PERFORMANCE ANALYSIS")
        print("="*80)
        
        total_time = time.time() - self.start_time
        print(f"⏱️  Total time: {total_time:.1f}s")
        
        # Show slowest companies
        print(f"\n🐌 5 SLOWEST COMPANIES:")
        slowest = sorted(self.company_timings, key=lambda x: x['duration'], reverse=True)[:5]
        for item in slowest:
            print(f"   {item['company']:25} → {item['duration']:5.1f}s ({item['jobs']} jobs, {item['jobs_per_second']:.1f} jobs/s)")
        
        # Show fastest companies
        print(f"\n⚡ 5 FASTEST COMPANIES:")
        fastest = sorted(self.company_timings, key=lambda x: x['duration'])[:5]
        for item in fastest:
            print(f"   {item['company']:25} → {item['duration']:5.1f}s ({item['jobs']} jobs, {item['jobs_per_second']:.1f} jobs/s)")
        
        # ATS performance
        print(f"\n🔧 ATS PERFORMANCE:")
        for ats, count in sorted(self.requests_by_ats.items()):
            # Calculate average time for this ATS
            ats_times = [t['duration'] for t in self.company_timings if t['ats'] == ats]
            avg_time = sum(ats_times) / max(len(ats_times), 1)
            print(f"   {ats.upper():10} → {count:3} companies, avg: {avg_time:.1f}s each")
        
        print("="*80)

# ===========================================================================
#                        MAIN ENGINE (FIXED & OPTIMIZED)
# ===========================================================================

class JobEngine:
    """Main orchestrator for the job scraping engine"""
    
    def __init__(self):
        self.fb = FirebaseManager()
        self.metrics = GlobalMetrics()
        self.analytics = AnalyticsEngine()
        self.perf_monitor = PerformanceMonitor()
        self.companies_processed = 0
    
    async def run(self):
        """Execute the full scraping pipeline"""
        logger.info("="*80)
        logger.info("🚀 JOBHUNT AI - PRODUCTION SCRAPER V3.2 (INTEGRATED)")
        logger.info("="*80)
        logger.info(f"📅 Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info(f"🎯 Targets: {len(TARGETS)} companies (from Complete Target List)")
        logger.info(f"⚙️  Config: {Config.MAX_CONCURRENCY} max concurrency, {Config.RETRY_ATTEMPTS} retries")
        logger.info(f"📈 Rate Limits: Greenhouse={Config.GREENHOUSE_RATE}/s, Ashby={Config.ASHBY_RATE}/s, Lever={Config.LEVER_RATE}/s")
        
        # Step 1: Load user profiles (pass FirebaseManager instance)
        profiles = await load_active_profiles(self.fb)
        if not profiles:
            logger.error("❌ No user profiles loaded. Exiting.")
            return
        
        logger.info(f"👥 Scanning for {len(profiles)} user(s)")
        
        # Step 2: Cleanup old jobs (pass FirebaseManager instance)
        logger.info("🗑️  Cleaning up expired jobs...")
        await cleanup_expired_jobs(self.fb)
        
        # Step 3: Scrape companies with improved concurrency
        # NEW OPTIMIZATION: Removed ATS grouping overhead to honor Priority sorting strictly
        connector = aiohttp.TCPConnector(
            limit=Config.MAX_CONCURRENCY * 2,  # Doubled for better throughput
            ttl_dns_cache=600,
            force_close=False,  # Keep connections alive
            enable_cleanup_closed=True
        )
        timeout = aiohttp.ClientTimeout(total=Config.REQUEST_TIMEOUT)
        
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers={'User-Agent': random.choice(USER_AGENTS)}
        ) as session:
            
            # Optimized Sequential Processing (Priority Sorted)
            logger.info(f"🔝 Processing {len(TARGETS)} companies in optimized priority order...")
            
            for target in TARGETS:
                await self._process_company(session, target, profiles)
        
        # Step 4: Final reporting
        if self.fb.db:
            self.metrics.save_to_firestore(self.fb.db)
            self.analytics.save_analytics_to_firestore(self.fb.db)
            
        self.metrics.print_summary()
        self.analytics.print_analytics_summary()
        self.perf_monitor.print_performance_summary()
        
        logger.info("="*80)
        logger.info("✅ Enhanced scraping complete with fixed company IDs!")
        logger.info("="*80)
    
    async def _process_company(self, session: aiohttp.ClientSession, target: dict, profiles: List[dict]):
        """Process a single company with enhanced metrics"""
        company_start = time.time()
        company_metrics = ScraperMetrics(
            company=target['name'],
            priority=target.get('priority', 3)
        )
        
        try:
            logger.info(f"🔍 Scanning {target['name']} ({target['ats'].upper()}, priority: {target.get('priority', 3)})...")
            
            jobs = await ScraperFactory.fetch_with_retry(session, target)
            company_metrics.jobs_found = len(jobs)
            
            if not jobs:
                logger.warning(f"⚠️  {target['name']}: No jobs found")
                company_metrics.status = "success"
                self.metrics.add_company_metrics(company_metrics, target['ats'])
                return
            
            # Analyze all jobs for market insights
            for job in jobs:
                self.analytics.analyze_job(job)
            
            # Batch process matches
            jobs_with_scores = []
            total_score = 0
            
            for job in jobs:
                for profile in profiles:
                    scoring = JobScorer.calculate_score(job, profile)
                    
                    if scoring.get('rejected'):
                        continue
                        
                    total_score += scoring['score']
                    
                    if scoring['score'] >= profile.get('min_score', 40):
                        if (profile.get('avoid_companies') and 
                            target['name'] in profile['avoid_companies']):
                            continue
                            
                        if (profile.get('preferred_companies') and 
                            target['name'] not in profile['preferred_companies'] and
                            len(profile['preferred_companies']) > 0):
                            continue
                        
                        jobs_with_scores.append((job, scoring, profile['email']))
            
            # Batch insert to Firebase
            if jobs_with_scores:
                successful_matches = await self.fb.add_job_and_match_batch(
                    jobs_with_scores, 
                    self.metrics
                )
                company_metrics.jobs_matched = successful_matches
            
            company_metrics.status = "success"
            company_metrics.avg_score = total_score / max(len(jobs) * len(profiles), 1)
            
            match_rate = (company_metrics.jobs_matched / max(company_metrics.jobs_found, 1) * 100)
            logger.info(f"   ✅ {target['name']}: {len(jobs)} jobs, {company_metrics.jobs_matched} matches ({match_rate:.1f}%), avg score: {company_metrics.avg_score:.1f}")
            
        except Exception as e:
            logger.error(f"❌ Failed to scrape {target['name']}: {e}")
            company_metrics.status = "failed"
            company_metrics.errors = 1
        
        company_metrics.duration = time.time() - company_start
        
        # Track performance
        self.perf_monitor.log_company(
            target['name'],
            company_metrics.duration,
            target['ats'],
            company_metrics.jobs_found
        )
        
        self.metrics.add_company_metrics(company_metrics, target.get('ats', 'unknown'))

        # Periodic analytics save every 50 companies
        self.companies_processed += 1
        if self.companies_processed % 50 == 0 and self.fb.db:
            logger.info(f"📈 Periodic analytics save after {self.companies_processed} companies")
            self.analytics.save_analytics_to_firestore(self.fb.db)

        # Adaptive delay based on priority and errors
        delay = 0.3 if target.get('priority', 3) <= 2 else 0.5
        if company_metrics.errors > 0:
            delay *= 2
        await asyncio.sleep(delay)

# ===========================================================================
#                            ENTRY POINT (FIXED)
# ===========================================================================

if __name__ == "__main__":
    # Enhanced entry point with better error handling
    try:
        start_time = time.time()
        logger.info("🔧 Initializing JobHunt AI Scraper V3.2 (Integrated)...")
        
        # Run the enhanced engine
        asyncio.run(JobEngine().run())
        
        total_time = time.time() - start_time
        logger.info(f"⏱️  Total execution time: {total_time:.1f} seconds")
        
    except KeyboardInterrupt:
        logger.info("\n⚠️  Scraper interrupted by user")
    except Exception as e:
        logger.critical(f"💥 Fatal error in enhanced scraper: {e}", exc_info=True)
        sys.exit(1)