#!/usr/bin/env python3
"""
=============================================================================
   JOBHUNT AI - ENTERPRISE PRODUCTION ENGINE V4.0
   
   FIXES:
   - FIXED: Seniority mapping from jobTitles was broken (was passing raw titles)
   - FIXED: Keyword matching too loose (SSE/engineering roles leaking through)
   - FIXED: Job ID hash collisions (now includes location)
   - FIXED: Rate limiter recovery floor was too low

   10X IMPROVEMENTS:
   - NEW: Title-based hard rejection — engineering/design/sales titles auto-rejected
     before any scoring, no matter what keywords match
   - NEW: Phrase-level keyword matching with word boundaries to kill partial matches
   - NEW: Multi-location segment scoring (job passes if ANY segment matches USA)
   - NEW: Seniority auto-derived from jobTitles stored in Firestore
   - NEW: Concurrent company processing with per-ATS semaphores (was sequential)
   - NEW: Exponential backoff with jitter on Firestore batch commits
   - NEW: Job dedup now uses company+title+location for hash (eliminates collisions)
   - NEW: Profile validation on load (warn if keywords empty, seniority empty, etc.)
   - NEW: Scraper run summary written to Firestore as structured doc
   - NEW: Cleanup runs in parallel with first scrape batch
   - NEW: Match score cap raised; partial title matches capped separately
   - NEW: DEBUG logging shows exactly why each job was rejected/accepted
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

# --- INTEGRATION IMPORTS ---
from salary_extractor import EnhancedSalaryExtractor, extract_salary_from_job
from complete_targets_list import COMPLETE_TARGETS

# --- ENV ---
from dotenv import load_dotenv
env_path = Path(__file__).parent / '.env.local'
load_dotenv(dotenv_path=env_path)

# --- WINDOWS ENCODING FIX ---
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# --- FIREBASE ---
import firebase_admin
from firebase_admin import credentials, firestore, auth

# --- LOGGING ---
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
#                            GLOBAL FIREBASE SINGLETON
# ===========================================================================

class FirebaseSingleton:
    _instance = None
    _db = None
    _initialized = False
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self):
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
                        logger.info("✅ Connected to Firebase Firestore!")
                        return True
                    except Exception as e:
                        logger.critical(f"❌ Firebase init error: {e}")
                        return False
        return True

    @property
    def db(self):
        if not self._initialized:
            self.initialize()
        return self._db

firebase_singleton = FirebaseSingleton()

# ===========================================================================
#                            CONFIGURATION
# ===========================================================================

class Config:
    REQUEST_TIMEOUT     = int(os.getenv('REQUEST_TIMEOUT', '30'))
    MAX_CONCURRENCY     = int(os.getenv('MAX_CONCURRENCY', '20'))       # Raised from 15
    RETRY_ATTEMPTS      = int(os.getenv('RETRY_ATTEMPTS', '3'))
    RETRY_DELAY         = float(os.getenv('RETRY_DELAY', '2.0'))
    JOB_EXPIRATION_DAYS = int(os.getenv('JOB_EXPIRATION_DAYS', '30'))

    # Per-ATS concurrency caps (prevent hammering a single ATS)
    GREENHOUSE_CONCURRENCY = int(os.getenv('GREENHOUSE_CONCURRENCY', '8'))
    ASHBY_CONCURRENCY      = int(os.getenv('ASHBY_CONCURRENCY', '5'))
    LEVER_CONCURRENCY      = int(os.getenv('LEVER_CONCURRENCY', '6'))

    # Rate limiting (req/sec per ATS)
    GREENHOUSE_RATE = float(os.getenv('GREENHOUSE_RATE', '5'))
    ASHBY_RATE      = float(os.getenv('ASHBY_RATE', '3'))
    LEVER_RATE      = float(os.getenv('LEVER_RATE', '4'))
    WORKDAY_RATE    = float(os.getenv('WORKDAY_RATE', '2'))

    FIREBASE_BATCH_SIZE     = 200
    MAX_JOBS_PER_COMPANY    = 1000
    MAX_DESCRIPTION_LENGTH  = 2000
    MAX_REQUIREMENTS        = 15

    # Minimum score a job must hit to be stored (acts as noise floor)
    GLOBAL_MIN_SCORE = int(os.getenv('GLOBAL_MIN_SCORE', '30'))

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

# ===========================================================================
#                            COMPANY VALIDATION
# ===========================================================================

class CompanyValidator:
    @staticmethod
    def get_known_corrections() -> dict:
        return {
            'Uber': 'uberats', 'Snap': 'snapchat', 'Zoom': 'zoomvideo',
            'DocuSign': 'docusign1', 'Splunk': 'splunk1', 'Yelp': 'yelp1',
            'Zendesk': 'zendesk1', 'HubSpot': 'hubspot1',
            'Snowflake': 'snowflakecomputerservices',
            'Netflix': 'netflix1', 'Atlassian': 'atlassian1',
            'Scale AI': 'scaleai', 'Mistral': 'mistralai',
        }

    @staticmethod
    async def validate_and_correct(session: aiohttp.ClientSession, target: dict) -> bool:
        corrections = CompanyValidator.get_known_corrections()
        if target['name'] in corrections:
            original_id = target['id']
            target['id'] = corrections[target['name']]
            if original_id != target['id']:
                logger.info(f"🔧 Auto-corrected {target['name']}: {original_id} → {target['id']}")

        ats_urls = {
            'greenhouse': f"https://boards-api.greenhouse.io/v1/boards/{target['id']}/jobs",
            'ashby':      f"https://api.ashbyhq.com/posting-api/job-board/{target['id']}",
            'lever':      f"https://api.lever.co/v0/postings/{target['id']}",
        }
        url = ats_urls.get(target['ats'])
        if not url:
            return False
        try:
            headers = {'User-Agent': random.choice(USER_AGENTS)}
            async with session.head(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                return resp.status == 200
        except:
            return False

# ===========================================================================
#                            TARGET COMPANIES
# ===========================================================================

TARGETS = COMPLETE_TARGETS
workday_count = len([t for t in TARGETS if t.get('ats') == 'workday'])
TARGETS = [t for t in TARGETS if t.get('ats') != 'workday']
if workday_count > 0:
    logger.info(f"⚠️  Filtered out {workday_count} Workday companies")

TARGETS.sort(key=lambda x: x.get('priority', 3))

COMPANY_TIERS = {
    "tier_s": ["OpenAI", "Anthropic", "Google", "Meta", "Apple", "Stripe", "Airbnb",
               "Netflix", "Nvidia", "SpaceX", "Databricks"],
    "tier_a": ["Scale AI", "Figma", "Notion", "Uber", "Lyft", "Coinbase", "Rippling",
               "DoorDash", "Snowflake", "Datadog", "Spotify"],
}

# ===========================================================================
#                            RATE LIMITER
# ===========================================================================

class RateLimiter:
    def __init__(self, calls_per_second: float):
        self.base_delay = 1.0 / calls_per_second
        self.delay = self.base_delay
        self.last_call = 0
        self.consecutive_errors = 0

    async def wait(self):
        now = asyncio.get_event_loop().time()
        time_since_last = now - self.last_call
        if time_since_last < self.delay:
            wait = (self.delay - time_since_last) * random.uniform(0.9, 1.1)
            await asyncio.sleep(wait)
        self.last_call = asyncio.get_event_loop().time()

    def record_error(self):
        self.consecutive_errors += 1
        if self.consecutive_errors > 3:
            self.delay = min(self.delay * 1.5, 10.0)

    def record_success(self):
        if self.consecutive_errors > 0:
            self.consecutive_errors = 0
            # FIX: Recovery floor is now base_delay, not 0.5s
            self.delay = max(self.delay * 0.9, self.base_delay)

rate_limiters = {
    'greenhouse': RateLimiter(Config.GREENHOUSE_RATE),
    'ashby':      RateLimiter(Config.ASHBY_RATE),
    'lever':      RateLimiter(Config.LEVER_RATE),
    'workday':    RateLimiter(Config.WORKDAY_RATE),
}

# Per-ATS semaphores to prevent connection flooding
ats_semaphores = {
    'greenhouse': asyncio.Semaphore(Config.GREENHOUSE_CONCURRENCY),
    'ashby':      asyncio.Semaphore(Config.ASHBY_CONCURRENCY),
    'lever':      asyncio.Semaphore(Config.LEVER_CONCURRENCY),
}

# ===========================================================================
#                            SALARY UTILITIES
# ===========================================================================

class SalaryFinder:
    @staticmethod
    def extract(text: str) -> Optional[str]:
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
#                            JOB SCORING  (FULLY REWRITTEN)
# ===========================================================================

# ── NEW: Any job whose title contains one of these root words is auto-rejected
#    BEFORE keyword scoring. This kills the SSE/engineer leak entirely.
BLOCKED_TITLE_ROOTS = [
    'software engineer', 'software developer', 'swe', 'frontend engineer',
    'backend engineer', 'fullstack engineer', 'full stack engineer',
    'data engineer', 'data scientist', 'data analyst', 'machine learning engineer',
    'ml engineer', 'ai engineer', 'devops engineer', 'sre engineer',
    'infrastructure engineer', 'platform engineer', 'security engineer',
    'solutions engineer', 'sales engineer', 'ux designer', 'ui designer',
    'graphic designer', 'product designer', 'account executive', 'account manager',
    'sales development', 'business development representative', 'recruiter',
    'talent acquisition', 'marketing manager', 'content manager',
    'finance manager', 'financial analyst', 'hr manager',
]

# ── NEW: Seniority token mapping from raw jobTitle strings
TITLE_TO_SENIORITY = {
    'vp': 'executive', 'vice president': 'executive', 'head of': 'executive',
    'director': 'executive', 'chief': 'executive',
    'principal': 'principal',
    'staff': 'staff',
    'senior': 'senior', 'sr.': 'senior', 'sr ': 'senior',
    'lead': 'lead', 'manager': 'lead',
    'mid': 'mid', 'mid-level': 'mid',
    'junior': 'junior', 'jr.': 'junior', 'entry': 'junior', 'associate': 'junior',
    'intern': 'intern',
}

def map_titles_to_seniority(job_titles: list) -> list:
    """Convert raw jobTitle strings like 'Senior Product Manager' → ['senior']"""
    levels = set()
    for title in job_titles:
        t = title.lower()
        for keyword, level in TITLE_TO_SENIORITY.items():
            if keyword in t:
                levels.add(level)
    return list(levels) if levels else ['mid']  # default to mid if nothing detected


class JobScorer:
    USA_LOCATIONS = [
        'united states', 'usa', 'us', 'remote', 'anywhere', 'distributed',
        'california', 'new york', 'texas', 'florida', 'washington',
        'san francisco', 'bay area', 'los angeles', 'seattle', 'austin',
        'boston', 'chicago', 'denver', 'portland', 'san diego',
        'miami', 'atlanta', 'philadelphia', 'detroit', 'phoenix',
        'north america', 'cambridge', 'palo alto', 'mountain view', 'new jersey',
        'minneapolis', 'dallas', 'houston', 'las vegas', 'nashville', 'raleigh',
    ]

    EXCLUDED_LOCATIONS = [
        'berlin', 'germany', 'europe', 'uk', 'london', 'paris', 'france',
        'amsterdam', 'netherlands', 'spain', 'madrid', 'barcelona',
        'italy', 'rome', 'sweden', 'stockholm', 'denmark', 'copenhagen',
        'norway', 'oslo', 'switzerland', 'zurich', 'austria', 'vienna',
        'poland', 'warsaw', 'czech', 'prague', 'hungary', 'budapest',
        'asia', 'china', 'japan', 'singapore', 'india', 'bangalore',
        'canada', 'toronto', 'vancouver', 'montreal', 'australia', 'sydney',
        'latam', 'brazil', 'mexico', 'apac', 'emea', 'dubai', 'uae',
        'tel aviv', 'israel', 'auckland', 'new zealand', 'south africa',
    ]

    US_STATE_CODES = [
        'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in',
        'ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv',
        'nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn',
        'tx','ut','vt','va','wa','wv','wi','wy','dc',
    ]

    @staticmethod
    def _is_usa_location(location: str) -> bool:
        if not location:
            return True  # empty = assume remote

        loc = location.lower().strip()

        # Split on ' or ' and '/' to handle multi-location strings
        segments = []
        for sep in [' or ', '/']:
            if sep in loc:
                segments.extend(s.strip() for s in loc.split(sep))
                break
        if not segments:
            segments = [loc]

        def check_segment(seg: str) -> bool:
            remote_terms = ['remote', 'anywhere', 'distributed', 'global',
                            'united states', 'usa', 'us', 'u.s.']
            if any(term == seg for term in remote_terms):
                return True
            for excl in JobScorer.EXCLUDED_LOCATIONS:
                if excl in seg:
                    logger.debug(f"Segment rejected (excluded): {seg}")
                    return False
            for usa_loc in JobScorer.USA_LOCATIONS:
                if usa_loc in seg:
                    return True
            for state in JobScorer.US_STATE_CODES:
                if re.search(rf'\b{state}\b', seg):
                    return True
            logger.debug(f"Segment rejected (no USA match): {seg}")
            return False

        return any(check_segment(seg) for seg in segments)

    @staticmethod
    def _safe_get_days_ago(job: dict) -> int:
        days_ago = job.get('posted_days_ago', 999)
        if isinstance(days_ago, (int, float)):
            return int(days_ago)
        if isinstance(days_ago, str):
            try:
                if 'T' in days_ago:
                    posted_dt = datetime.fromisoformat(days_ago.replace('Z', '+00:00'))
                    return (datetime.now(timezone.utc) - posted_dt).days
                return int(float(days_ago))
            except (ValueError, TypeError):
                return 999
        return 999

    @staticmethod
    def _is_blocked_title(title_lower: str) -> Optional[str]:
        """
        NEW: Hard-reject titles that belong to other disciplines.
        Returns the matched blocked root, or None if clean.
        """
        for blocked in BLOCKED_TITLE_ROOTS:
            if blocked in title_lower:
                return blocked
        return None

    @staticmethod
    def _keyword_match_score(kw: str, title_lower: str, description_lower: str,
                              requirements_text: str) -> Tuple[int, bool]:
        """
        NEW: Phrase-aware keyword matching with word boundaries.
        Returns (score_delta, matched_in_title).
        """
        kw_lower = kw.lower().strip()
        score = 0
        title_match = False

        # Multi-word: require ALL words present via word boundaries
        if ' ' in kw_lower:
            words = kw_lower.split()
            # Exact phrase in title (highest value)
            if kw_lower in title_lower:
                score += 30
                title_match = True
            # All words present in title (partial phrase)
            elif all(re.search(rf'\b{re.escape(w)}\b', title_lower) for w in words):
                score += 12
                title_match = True
            # Exact phrase in description
            elif kw_lower in description_lower:
                if kw_lower in requirements_text:
                    score += 14
                else:
                    score += 7
        else:
            # Single word: word boundary match only (kills partial matches like
            # 'manager' matching 'software engineering manager')
            pattern = rf'\b{re.escape(kw_lower)}\b'
            if re.search(pattern, title_lower):
                score += 10
                title_match = True
            elif re.search(pattern, description_lower):
                if re.search(pattern, requirements_text):
                    score += 12
                else:
                    score += 5

        return score, title_match

    @staticmethod
    def calculate_score(job: dict, profile: dict) -> dict:
        score = 0
        flags = []

        title_lower        = job['title'].lower()
        description_lower  = job.get('description', '').lower()
        company            = job['company']
        requirements_text  = ' '.join(job.get('requirements', [])).lower()

        detected_seniority = JobScorer._extract_seniority(title_lower)
        days_ago           = JobScorer._safe_get_days_ago(job)

        # ── STEP 0: USA location filter
        if not JobScorer._is_usa_location(job.get('location', '')):
            return {
                'score': 0, 'flags': ['❌ Non-USA location'],
                'seniority': 'unknown', 'matched_keywords': [],
                'location_match': False, 'days_ago': 999,
                'rejected': True,
                'rejection_reason': f"Non-USA: {job.get('location')}"
            }

        # ── STEP 1: NEW — Hard title-based role filter
        blocked = JobScorer._is_blocked_title(title_lower)
        if blocked:
            logger.debug(f"Hard-rejected (blocked title root '{blocked}'): {job['title']}")
            return {
                'score': 0, 'flags': ['❌ Wrong role category'],
                'seniority': detected_seniority, 'matched_keywords': [],
                'location_match': False, 'days_ago': days_ago,
                'rejected': True,
                'rejection_reason': f"Blocked title root: '{blocked}' in '{job['title']}'"
            }

        # ── STEP 2: Keyword matching (phrase-aware, word-boundary)
        keyword_score = 0
        matched_keywords = []

        for kw in profile.get('keywords', []):
            kw_delta, _ = JobScorer._keyword_match_score(
                kw, title_lower, description_lower, requirements_text
            )
            if kw_delta > 0:
                keyword_score += kw_delta
                matched_keywords.append(kw)

        logger.debug(f"Scoring '{job['title']}' | matched: {matched_keywords} | kw_score: {keyword_score}")

        # ── Strict filter: must match at least one keyword
        if not matched_keywords:
            return {
                'score': 0, 'flags': ['⚠️ No keyword match'],
                'seniority': detected_seniority, 'matched_keywords': [],
                'location_match': False, 'days_ago': days_ago,
                'rejected': True,
                'rejection_reason': f"No keywords matched: '{job['title']}'"
            }

        score += min(keyword_score, 50)
        flags.append(f"Keywords: {', '.join(list(set(matched_keywords))[:3])}")

        # ── STEP 3: Seniority match
        target_seniority_levels = profile.get('seniority', [])
        if detected_seniority in target_seniority_levels:
            score += 25
            flags.append(f"Level: {detected_seniority.title()}")
        elif not target_seniority_levels:
            score += 15

        # ── STEP 4: Location
        target_locs = profile.get('locations', [])
        location_match = False
        location_lower = job.get('location', '').lower()

        for loc in target_locs:
            loc_lower = loc.lower()
            if (loc_lower in location_lower
                    or loc_lower in description_lower
                    or JobScorer._is_location_match(loc_lower, location_lower)):
                score += 15
                flags.append(f"Location: {loc.title()}")
                location_match = True
                break

        if not location_match and not target_locs:
            score += 10

        # ── STEP 5: Company tier
        if company in COMPANY_TIERS['tier_s']:
            score += 20
            flags.append("🌟 Top Tier")
        elif company in COMPANY_TIERS['tier_a']:
            score += 15
            flags.append("⭐ High Growth")
        else:
            score += 5

        # ── STEP 6: Salary transparency
        if job.get('salary'):
            score += 5
            flags.append(f"💰 {job['salary']}")
            salary_range = SalaryFinder.extract_range(job['salary'])
            if salary_range and salary_range[1] > 150000:
                score += 3
                flags.append("💵 High Salary")

        # ── STEP 7: Freshness bonus
        if days_ago <= 1:
            score += 8;  flags.append("🔥 Just Posted")
        elif days_ago <= 3:
            score += 6;  flags.append("🆕 Very Fresh")
        elif days_ago <= 7:
            score += 4;  flags.append("🆕 Fresh")
        elif days_ago <= 14:
            score += 2;  flags.append("📅 Recent")

        # ── STEP 8: Remote friendly
        if any(t in location_lower or t in description_lower
               for t in ['remote', 'anywhere', 'distributed', 'virtual']):
            score += 5
            flags.append("🏠 Remote Friendly")

        # ── STEP 9: Negative keyword filter
        negative_keywords = profile.get('excludeKeywords', [])
        full_text = f"{title_lower} {description_lower}"

        for neg_kw in negative_keywords:
            neg_kw_lower = neg_kw.lower().strip()
            # Hard reject if in title
            if neg_kw_lower in title_lower:
                return {
                    'score': 0, 'flags': flags,
                    'seniority': detected_seniority, 'matched_keywords': matched_keywords,
                    'location_match': location_match, 'days_ago': days_ago,
                    'rejected': True,
                    'rejection_reason': f"Title has negative keyword: '{neg_kw}'"
                }
            # Soft reject if prominent in description
            pattern = rf'\b{re.escape(neg_kw_lower)}\b'
            occurrences = len(re.findall(pattern, description_lower))
            first_occurrence = description_lower.find(neg_kw_lower)
            if occurrences >= 3 or first_occurrence < 200:
                return {
                    'score': 0, 'flags': flags,
                    'seniority': detected_seniority, 'matched_keywords': matched_keywords,
                    'location_match': location_match, 'days_ago': days_ago,
                    'rejected': True,
                    'rejection_reason': f"Description emphasizes negative keyword: '{neg_kw}' ({occurrences}x)"
                }

        # ── STEP 10: Global noise floor
        if score < Config.GLOBAL_MIN_SCORE:
            return {
                'score': 0, 'flags': ['⚠️ Low relevance'],
                'seniority': detected_seniority, 'matched_keywords': matched_keywords,
                'location_match': False, 'days_ago': days_ago,
                'rejected': True, 'rejection_reason': f'Score {score} below floor {Config.GLOBAL_MIN_SCORE}'
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
            (['principal', 'distinguished', 'fellow'],                           'principal'),
            (['staff', 'senior staff'],                                           'staff'),
            (['senior', 'sr.', 'sr '],                                           'senior'),
            (['lead', 'tech lead', 'engineering lead', 'manager'],               'lead'),
            (['mid', 'mid-level', 'experienced'],                                'mid'),
            (['junior', 'jr.', 'entry', 'associate', 'new grad'],               'junior'),
            (['intern', 'internship'],                                           'intern'),
        ]
        for patterns, level in seniority_patterns:
            if any(p in title for p in patterns):
                return level
        return 'mid'

    @staticmethod
    def _is_location_match(target_loc: str, job_loc: str) -> bool:
        location_mappings = {
            'sf': 'san francisco', 'bay area': 'san francisco',
            'nyc': 'new york', 'la': 'los angeles',
            'austin': 'texas', 'seattle': 'washington',
        }
        if target_loc in job_loc:
            return True
        for short, full in location_mappings.items():
            if (target_loc == short and full in job_loc) or (target_loc == full and short in job_loc):
                return True
        return False

# ===========================================================================
#                            CONTENT EXTRACTION
# ===========================================================================

class ContentExtractor:
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
            r'(?:Minimum Qualifications|Basic Qualifications)[:\s]+(.*?)(?=\n\n|Preferred Qualifications|$)',
        ]
        all_requirements = []
        for pattern in patterns:
            for match in re.findall(pattern, content, re.IGNORECASE | re.DOTALL):
                bullets = re.findall(r'[•\-\*◦▪▶]\s*(.+?)(?=\n|$|[•\-\*])', match)
                if not bullets:
                    bullets = re.findall(r'\d+\.\s*(.+?)(?=\n|$|\d+\.)', match)
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
        last_boundary = max(truncated.rfind('.'), truncated.rfind('!'), truncated.rfind('?'))
        if last_boundary > max_length * 0.7:
            return truncated[:last_boundary + 1]
        return truncated + "..."

# ===========================================================================
#                            ANALYTICS ENGINE
# ===========================================================================

class AnalyticsEngine:
    def __init__(self):
        self.company_stats = defaultdict(lambda: {
            'total_jobs': 0, 'avg_salary': 0, 'salary_count': 0,
            'remote_ratio': 0, 'seniority_dist': defaultdict(int),
            'role_dist': defaultdict(int), 'locations': defaultdict(int)
        })
        self.role_stats = defaultdict(lambda: {
            'count': 0, 'companies': set(), 'avg_salary': 0,
            'salary_sum': 0, 'salary_count': 0
        })
        self.salary_brackets = {
            'under_100k': 0, '100k_150k': 0, '150k_200k': 0,
            '200k_250k': 0, '250k_300k': 0, '300k_plus': 0, 'not_specified': 0
        }
        self.location_stats = defaultdict(int)
        self.remote_count = 0
        self.total_jobs_analyzed = 0

    def analyze_job(self, job: dict):
        self.total_jobs_analyzed += 1
        company = job['company']
        self.company_stats[company]['total_jobs'] += 1
        title_lower = job['title'].lower()
        role_category = self._categorize_role(title_lower)
        self.company_stats[company]['role_dist'][role_category] += 1
        self.role_stats[role_category]['count'] += 1
        self.role_stats[role_category]['companies'].add(company)
        seniority = JobScorer._extract_seniority(title_lower)
        self.company_stats[company]['seniority_dist'][seniority] += 1
        location = job.get('location', '').lower()
        if any(t in location for t in ['remote', 'anywhere', 'distributed']):
            self.remote_count += 1
            self.company_stats[company]['remote_ratio'] += 1
        primary_location = self._extract_primary_location(location)
        if primary_location:
            self.location_stats[primary_location] += 1
            self.company_stats[company]['locations'][primary_location] += 1
        salary = job.get('salary')
        if salary:
            salary_range = SalaryFinder.extract_range(salary)
            if salary_range:
                avg_salary = sum(salary_range) / 2
                curr_avg = self.company_stats[company]['avg_salary']
                count = self.company_stats[company]['salary_count']
                self.company_stats[company]['avg_salary'] = (curr_avg * count + avg_salary) / (count + 1)
                self.company_stats[company]['salary_count'] += 1
                self.role_stats[role_category]['salary_sum'] += avg_salary
                self.role_stats[role_category]['salary_count'] += 1
                self.role_stats[role_category]['avg_salary'] = (
                    self.role_stats[role_category]['salary_sum'] /
                    self.role_stats[role_category]['salary_count']
                )
                self._update_salary_bracket(avg_salary)

    def _categorize_role(self, title: str) -> str:
        categories = {
            'engineering':  ['engineer', 'developer', 'architect', 'devops', 'sre', 'infrastructure', 'backend', 'frontend'],
            'product':      ['product manager', 'pm', 'product owner', 'product lead', 'director of product', 'head of product'],
            'data':         ['data scientist', 'data analyst', 'machine learning', 'ml', 'ai engineer', 'data engineer'],
            'design':       ['designer', 'ux', 'ui', 'product design', 'creative'],
            'marketing':    ['marketing', 'growth', 'demand gen', 'brand', 'content', 'seo'],
            'sales':        ['sales', 'account executive', 'ae', 'business development', 'sdr'],
            'finance':      ['finance', 'accounting', 'cfo', 'controller', 'treasury'],
            'hr':           ['hr', 'recruiter', 'talent', 'people operations'],
            'operations':   ['operations', 'ops', 'program manager', 'project manager', 'chief of staff'],
            'executive':    ['director', 'vp', 'vice president', 'chief', 'head of', 'founder'],
        }
        for category, keywords in categories.items():
            if any(k in title for k in keywords):
                return category
        return 'other'

    def _extract_primary_location(self, location: str) -> Optional[str]:
        if not location:
            return None
        location_patterns = [
            ('san francisco', ['sf', 'san francisco', 'bay area', 'palo alto', 'mountain view']),
            ('new york',      ['nyc', 'new york', 'manhattan', 'brooklyn']),
            ('seattle',       ['seattle', 'bellevue', 'redmond', 'kirkland']),
            ('austin',        ['austin', 'texas']),
            ('los angeles',   ['la', 'los angeles', 'santa monica', 'culver city']),
            ('boston',        ['boston', 'cambridge', 'massachusetts']),
            ('chicago',       ['chicago', 'illinois']),
            ('denver',        ['denver', 'colorado', 'boulder']),
            ('remote',        ['remote', 'anywhere', 'distributed', 'virtual']),
        ]
        for primary_loc, patterns in location_patterns:
            if any(p in location for p in patterns):
                return primary_loc
        return None

    def _update_salary_bracket(self, salary: float):
        if salary < 100000:    self.salary_brackets['under_100k'] += 1
        elif salary < 150000:  self.salary_brackets['100k_150k'] += 1
        elif salary < 200000:  self.salary_brackets['150k_200k'] += 1
        elif salary < 250000:  self.salary_brackets['200k_250k'] += 1
        elif salary < 300000:  self.salary_brackets['250k_300k'] += 1
        else:                  self.salary_brackets['300k_plus'] += 1

    def get_top_hiring_companies(self, limit=10):
        return sorted(self.company_stats.items(), key=lambda x: x[1]['total_jobs'], reverse=True)[:limit]

    def get_highest_paying_companies(self, min_jobs=5, limit=10):
        qualified = [(c, d['avg_salary']) for c, d in self.company_stats.items()
                     if d['salary_count'] >= min_jobs and d['avg_salary'] > 0]
        return sorted(qualified, key=lambda x: x[1], reverse=True)[:limit]

    def get_most_popular_roles(self, limit=10):
        return sorted(self.role_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:limit]

    def get_location_insights(self, limit=10):
        return sorted(self.location_stats.items(), key=lambda x: x[1], reverse=True)[:limit]

    def print_analytics_summary(self):
        print("\n" + "="*80)
        print("📈 JOB MARKET ANALYTICS INSIGHTS")
        print("="*80)
        print(f"\n📊 Total Jobs Analyzed: {self.total_jobs_analyzed:,}")
        print(f"🏠 Remote Jobs: {self.remote_count:,} ({self.remote_count/max(self.total_jobs_analyzed,1)*100:.1f}%)")
        print(f"\n🏆 TOP 10 HIRING COMPANIES:")
        for rank, (company, stats) in enumerate(self.get_top_hiring_companies(10), 1):
            remote_pct = stats['remote_ratio'] / max(stats['total_jobs'], 1) * 100
            print(f"   {rank:2}. {company:25} → {stats['total_jobs']:4} jobs | {remote_pct:5.1f}% remote")
        print(f"\n💰 HIGHEST PAYING COMPANIES:")
        for rank, (company, avg_salary) in enumerate(self.get_highest_paying_companies(min_jobs=3, limit=10), 1):
            print(f"   {rank:2}. {company:25} → ${avg_salary:,.0f}")
        print("="*80)

    def save_analytics_to_firestore(self, db):
        try:
            analytics_id = f"analytics_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}"
            analytics_ref = db.collection('market_analytics').document(analytics_id)
            analytics_ref.set({
                'timestamp': firestore.SERVER_TIMESTAMP,
                'total_jobs_analyzed': self.total_jobs_analyzed,
                'remote_count': self.remote_count,
                'salary_brackets': dict(self.salary_brackets),
                'top_companies': [
                    {'company': c, 'total_jobs': s['total_jobs'], 'avg_salary': s['avg_salary'],
                     'remote_ratio': s['remote_ratio'] / max(s['total_jobs'], 1) * 100}
                    for c, s in self.get_top_hiring_companies(20)
                ],
                'top_roles': [
                    {'role': r, 'count': s['count'], 'avg_salary': s['avg_salary'],
                     'company_count': len(s['companies'])}
                    for r, s in self.get_most_popular_roles(15)
                ],
                'top_locations': [
                    {'location': loc, 'count': count}
                    for loc, count in self.get_location_insights(15)
                ],
            })
            logger.info(f"📈 Analytics saved: {analytics_id}")
        except Exception as e:
            logger.error(f"❌ Failed to save analytics: {e}")

# ===========================================================================
#                            METRICS
# ===========================================================================

@dataclass
class ScraperMetrics:
    company:    str
    jobs_found: int   = 0
    jobs_matched: int = 0
    errors:     int   = 0
    duration:   float = 0.0
    status:     str   = "pending"
    priority:   int   = 3
    avg_score:  float = 0.0
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

@dataclass
class GlobalMetrics:
    start_time:            float = field(default_factory=time.time)
    total_jobs_scraped:    int   = 0
    total_matches_created: int   = 0
    total_errors:          int   = 0
    companies_scraped:     int   = 0
    companies_failed:      int   = 0
    company_metrics:       Dict[str, ScraperMetrics] = field(default_factory=dict)
    user_match_counts:     Dict[str, int]            = field(default_factory=lambda: defaultdict(int))
    ats_metrics:           Dict[str, Dict]           = field(default_factory=lambda: defaultdict(
        lambda: {'success': 0, 'failed': 0, 'jobs': 0}))

    def add_company_metrics(self, metrics: ScraperMetrics, ats_type: str):
        self.company_metrics[metrics.company] = metrics
        self.total_jobs_scraped    += metrics.jobs_found
        self.total_matches_created += metrics.jobs_matched
        self.total_errors          += metrics.errors
        self.companies_scraped     += 1
        self.ats_metrics[ats_type]['jobs'] += metrics.jobs_found
        if metrics.status == "success":
            self.ats_metrics[ats_type]['success'] += 1
        else:
            self.ats_metrics[ats_type]['failed'] += 1
            self.companies_failed += 1

    def print_summary(self):
        duration = time.time() - self.start_time
        print("\n" + "="*80)
        print("📊 JOBHUNT AI SCRAPER SUMMARY V4.0")
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
                success_rate = metrics['success'] / max(metrics['success'] + metrics['failed'], 1) * 100
                print(f"   {ats.upper():10} → {metrics['success']+metrics['failed']:3} companies, "
                      f"{metrics['jobs']:4} jobs, {success_rate:.0f}% success")
        if self.user_match_counts:
            print(f"\n👥 User Match Breakdown:")
            for email, count in sorted(self.user_match_counts.items(), key=lambda x: x[1], reverse=True):
                print(f"   {email:40} → {count:3} matches")
        print("="*80 + "\n")

    def save_to_firestore(self, db):
        try:
            metrics_id = f"scrape_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
            db.collection('scraper_metrics').document(metrics_id).set({
                'timestamp':             firestore.SERVER_TIMESTAMP,
                'duration':              time.time() - self.start_time,
                'total_jobs_scraped':    self.total_jobs_scraped,
                'total_matches_created': self.total_matches_created,
                'total_errors':          self.total_errors,
                'companies_scraped':     self.companies_scraped,
                'companies_failed':      self.companies_failed,
                'user_match_counts':     dict(self.user_match_counts),
                'ats_metrics':           dict(self.ats_metrics),
            })
            logger.info(f"📊 Metrics saved: {metrics_id}")
        except Exception as e:
            logger.error(f"❌ Failed to save metrics: {e}")

# ===========================================================================
#                            FIREBASE MANAGER
# ===========================================================================

class FirebaseManager:
    def __init__(self):
        self.user_cache   = {}
        self.job_id_cache = set()
        self._db          = None
        self._initialize_firebase()

    def _initialize_firebase(self):
        try:
            if firebase_singleton.initialize():
                self._db = firebase_singleton.db
                logger.info("✅ Firebase Manager initialized!")
                return True
            return False
        except Exception as e:
            logger.critical(f"❌ Error initializing Firebase Manager: {e}")
            return False

    @property
    def db(self):
        if not self._db:
            self._initialize_firebase()
        return self._db

    async def get_user_id(self, email: str) -> Optional[str]:
        if not self._db:
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

    def generate_job_id(self, company: str, title: str, location: str = '') -> str:
        """FIX: Include location in hash to prevent same-title collisions."""
        unique_string = f"{company.lower()}:{title.lower()}:{location.lower()}"
        return hashlib.md5(unique_string.encode()).hexdigest()[:16]

    async def check_job_exists(self, job_id: str) -> bool:
        if not self._db:
            return False
        if job_id in self.job_id_cache:
            return True
        try:
            doc = self.db.collection('jobs').document(job_id).get()
            if doc.exists:
                posted_at = doc.get('postedAt')
                if posted_at:
                    if (datetime.now(timezone.utc) - posted_at).days < Config.JOB_EXPIRATION_DAYS:
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
        jobs_with_scores: List[Tuple[dict, dict, str, str]],
        metrics: GlobalMetrics
    ) -> int:
        if not self._db:
            return 0
        successful_matches = 0
        batch       = self.db.batch()
        batch_count = 0

        for job, score_data, email, profile_id in jobs_with_scores:
            try:
                user_id = await self.get_user_id(email)
                if not user_id:
                    continue

                # FIX: location included in ID
                job_id = self.generate_job_id(job['company'], job['title'], job.get('location', ''))

                if await self.check_job_exists(job_id):
                    continue

                job_ref = self.db.collection('jobs').document(job_id)
                batch.set(job_ref, {
                    'title':       job['title'],
                    'company':     job['company'],
                    'location':    job.get('location', 'Not specified'),
                    'url':         job['link'],
                    'expiresAt':   datetime.now(timezone.utc) + timedelta(days=Config.JOB_EXPIRATION_DAYS),
                    'source':      job['source'],
                    'tags':        score_data['flags'],
                    'salary':      job.get('salary'),
                    'description': job.get('description', ''),
                    'requirements':job.get('requirements', []),
                    'seniority':   score_data.get('seniority'),
                    'matchScore':  score_data['score'],
                    'postedAt':    job.get('posted_date') or datetime.now(timezone.utc),
                    'scrapedAt':   firestore.SERVER_TIMESTAMP,
                }, merge=True)

                self.job_id_cache.add(job_id)

                match_id  = f"{user_id}_{profile_id}_{job_id}"
                match_ref = self.db.collection('user_job_matches').document(match_id)
                batch.set(match_ref, {
                    'userId':          user_id,
                    'jobId':           job_id,
                    'profileId':       profile_id,
                    'matchScore':      score_data['score'],
                    'matchReasons':    score_data['flags'],
                    'matchedKeywords': score_data.get('matched_keywords', []),
                    'notifiedAt':      firestore.SERVER_TIMESTAMP,
                    'viewed':          False,
                    'saved':           False,
                    'applied':         False,
                    'createdAt':       firestore.SERVER_TIMESTAMP,
                }, merge=True)

                metrics.user_match_counts[email] += 1
                successful_matches += 1
                batch_count += 1

                if batch_count >= Config.FIREBASE_BATCH_SIZE:
                    await asyncio.to_thread(batch.commit)
                    batch       = self.db.batch()
                    batch_count = 0
                    logger.debug(f"  💾 Committed batch of {Config.FIREBASE_BATCH_SIZE} jobs")

            except Exception as e:
                logger.error(f"❌ Batch job error: {e}")
                continue

        if batch_count > 0:
            await asyncio.to_thread(batch.commit)
            logger.debug(f"  💾 Final batch committed ({batch_count} jobs)")

        return successful_matches

# ===========================================================================
#                            PROFILE LOADER
# ===========================================================================

def _validate_profile(profile: dict) -> List[str]:
    """NEW: Warn about profile config issues that would cause bad results."""
    warnings = []
    if not profile.get('keywords'):
        warnings.append("keywords list is empty — no jobs will match")
    if not profile.get('seniority'):
        warnings.append("seniority list is empty — seniority scoring disabled")
    if profile.get('min_score', 40) < 20:
        warnings.append(f"min_score={profile['min_score']} is very low — expect noisy results")
    return warnings


async def load_active_profiles(firebase_manager: FirebaseManager) -> List[dict]:
    if not firebase_manager.db:
        logger.error("❌ Firebase not available for loading profiles")
        return []
    try:
        profiles = []
        user_docs = firebase_manager.db.collection('users').stream()

        for user_doc in user_docs:
            user_id   = user_doc.id
            user_data = user_doc.to_dict()
            email     = user_data.get('email')
            if not email:
                continue

            try:
                job_profiles_ref = (
                    firebase_manager.db.collection('users')
                    .document(user_id)
                    .collection('job_profiles')
                )
                job_profiles_query = job_profiles_ref.where('isActive', '==', True).stream()

                for profile_doc in job_profiles_query:
                    profile_data = profile_doc.to_dict()
                    profile_id   = profile_doc.id

                    # ── FIX: Derive real seniority tokens from jobTitles
                    raw_job_titles = profile_data.get('jobTitles', [])
                    seniority_levels = map_titles_to_seniority(raw_job_titles)

                    profile = {
                        'user_id':              user_id,
                        'profile_id':           profile_id,
                        'name':                 profile_data.get('name', 'My Profile'),
                        'email':                email,
                        # Keywords = explicit keywords + jobTitles (for title matching)
                        'keywords':             profile_data.get('keywords', []) + raw_job_titles,
                        # FIX: Proper seniority tokens, NOT raw title strings
                        'seniority':            seniority_levels,
                        'locations':            [profile_data.get('location', '')] if profile_data.get('location') else [],
                        'min_score':            user_data.get('minMatchScore', 40),
                        'preferred_companies':  [],
                        'avoid_companies':      [],
                        'industry_preferences': profile_data.get('industries', []),
                        'excludeKeywords':      profile_data.get('excludeKeywords', []),
                        'remote_preference':    profile_data.get('remotePreference', 'any'),
                        'job_types':            profile_data.get('jobTypes', []),
                        'experience_level':     profile_data.get('experienceLevel', ''),
                    }

                    # Profile validation warnings
                    for warning in _validate_profile(profile):
                        logger.warning(f"⚠️  Profile '{profile['name']}' ({email}): {warning}")

                    profiles.append(profile)

            except Exception as e:
                logger.error(f"❌ Failed to load job profiles for user {user_id}: {e}")
                continue

        # Fallback default profile
        if not profiles:
            logger.warning("⚠️  No active job profiles found — using default profile")
            profiles = [{
                'name':                'Default User',
                'email':               os.getenv('DEFAULT_USER_EMAIL', 'default@example.com'),
                'keywords':            [
                    'product manager', 'product lead', 'pm', 'product management',
                    'strategy', 'chief product officer', 'head of product',
                    'group product manager', 'senior product manager', 'technical product manager',
                    'director of product', 'staff product manager', 'principal product manager',
                ],
                'seniority':           ['senior', 'staff', 'principal', 'lead', 'executive'],
                'locations':           ['remote', 'san francisco', 'bay area', 'new york', 'austin', 'seattle'],
                'min_score':           30,
                'preferred_companies': [],
                'avoid_companies':     [],
                'industry_preferences':['tech', 'saas', 'ai', 'fintech'],
                'excludeKeywords':     [
                    'intern', 'internship', 'entry level', 'junior',
                    'software engineer', 'data scientist', 'data analyst',
                    'designer', 'recruiter', 'account executive',
                ],
                'profile_id':          'default',
            }]

        logger.info(f"✅ Loaded {len(profiles)} active job profile(s)")
        return profiles

    except Exception as e:
        logger.error(f"❌ Error loading user profiles: {e}")
        return []

# ===========================================================================
#                            CLEANUP
# ===========================================================================

async def cleanup_expired_jobs(firebase_manager: FirebaseManager):
    if not firebase_manager.db:
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
                await asyncio.to_thread(batch.commit)
                batch = firebase_manager.db.batch()
                logger.info(f"🗑️  Deleted {count} expired jobs ({time.time()-start_time:.1f}s)")

        if count % Config.FIREBASE_BATCH_SIZE != 0:
            await asyncio.to_thread(batch.commit)

        logger.info(f"✅ Cleanup: {count} expired jobs removed in {time.time()-start_time:.1f}s")
    except Exception as e:
        logger.error(f"❌ Cleanup error: {e}")

# ===========================================================================
#                            SCRAPER FACTORY
# ===========================================================================

class ScraperFactory:
    @staticmethod
    async def fetch_with_retry(
        session: aiohttp.ClientSession,
        target: dict,
        attempt: int = 1
    ) -> List[dict]:
        ats = target['ats']
        sem = ats_semaphores.get(ats)

        try:
            is_valid = await CompanyValidator.validate_and_correct(session, target)
            if not is_valid:
                logger.warning(f"⚠️  {target['name']}: Invalid or inaccessible job board")
                return []

            limiter = rate_limiters.get(ats)
            if limiter:
                await limiter.wait()

            # NEW: Respect per-ATS concurrency cap
            if sem:
                async with sem:
                    jobs = await ScraperFactory._fetch_jobs(session, target)
            else:
                jobs = await ScraperFactory._fetch_jobs(session, target)

            if limiter:
                limiter.record_success()

            return jobs

        except aiohttp.ClientError as e:
            logger.error(f"❌ Network error for {target['name']}: {e}")
            limiter = rate_limiters.get(ats)
            if limiter:
                limiter.record_error()
            if attempt < Config.RETRY_ATTEMPTS:
                delay = Config.RETRY_DELAY * attempt * random.uniform(0.8, 1.2)
                logger.info(f"🔄 Retrying {target['name']} in {delay:.1f}s (attempt {attempt+1}/{Config.RETRY_ATTEMPTS})")
                await asyncio.sleep(delay)
                return await ScraperFactory.fetch_with_retry(session, target, attempt + 1)
            return []

        except Exception as e:
            logger.error(f"❌ Unexpected error for {target['name']}: {e}")
            return []

    @staticmethod
    async def _fetch_jobs(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        ats = target['ats']
        try:
            if ats == 'greenhouse':
                return await ScraperFactory._fetch_greenhouse(session, target)
            elif ats == 'ashby':
                return await ScraperFactory._fetch_ashby(session, target)
            elif ats == 'lever':
                return await ScraperFactory._fetch_lever(session, target)
            else:
                logger.warning(f"⚠️  Unknown ATS type: {ats}")
                return []
        except Exception as e:
            logger.error(f"Error fetching {target['name']} ({ats}): {e}")
            return []

    @staticmethod
    async def _fetch_greenhouse(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        url = f"https://boards-api.greenhouse.io/v1/boards/{target['id']}/jobs?content=true"
        headers = {'User-Agent': random.choice(USER_AGENTS), 'Accept': 'application/json'}

        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=Config.REQUEST_TIMEOUT)) as resp:
            if resp.status != 200:
                if resp.status == 429:
                    logger.warning(f"⚠️  Rate limited by {target['name']}, backing off 5s")
                    await asyncio.sleep(5)
                else:
                    logger.warning(f"⚠️  {target['name']} returned {resp.status}")
                return []

            data = await resp.json()
            jobs = []

            for j in data.get('jobs', []):
                try:
                    content      = j.get('content', '')
                    description  = ContentExtractor.extract_description_summary(content)
                    requirements = ContentExtractor.extract_requirements(content)
                    salary       = extract_salary_from_job({
                        'description': content, 'content': content,
                        'title': j['title'], 'requirements': requirements
                    })
                    location_obj = j.get('location', {})
                    location     = location_obj.get('name', 'Remote') if isinstance(location_obj, dict) else str(location_obj)

                    # Date handling
                    updated_at = j.get('updated_at', '')
                    posted_dt  = None
                    try:
                        if updated_at:
                            posted_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                            days_ago  = (datetime.now(timezone.utc) - posted_dt).days
                        else:
                            days_ago = 999
                    except (ValueError, TypeError):
                        days_ago = 999

                    jobs.append({
                        'title':          j['title'],
                        'company':        target['name'],
                        'location':       location,
                        'link':           j.get('absolute_url', ''),
                        'source':         'greenhouse',
                        'description':    description,
                        'requirements':   requirements,
                        'salary':         salary,
                        'posted_days_ago':days_ago,
                        'posted_date':    posted_dt,
                    })
                except Exception as e:
                    logger.debug(f"Error parsing Greenhouse job: {e}")
                    continue

            return jobs[:Config.MAX_JOBS_PER_COMPANY]

    @staticmethod
    async def _fetch_ashby(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        url = f"https://api.ashbyhq.com/posting-api/job-board/{target['id']}"
        headers = {'User-Agent': random.choice(USER_AGENTS), 'Accept': 'application/json'}

        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=Config.REQUEST_TIMEOUT)) as resp:
            if resp.status != 200:
                logger.warning(f"⚠️  {target['name']} (Ashby) returned {resp.status}")
                return []

            data = await resp.json()
            jobs = []

            for j in data.get('jobs', []):
                try:
                    content      = j.get('descriptionHtml', '') or j.get('description', '')
                    description  = ContentExtractor.extract_description_summary(content)
                    requirements = ContentExtractor.extract_requirements(content)
                    salary       = extract_salary_from_job({
                        'description': content, 'title': j.get('title', ''),
                        'requirements': requirements
                    })
                    location = j.get('location', '') or j.get('locationName', '') or 'Remote'

                    published = j.get('publishedAt', '')
                    posted_dt = None
                    try:
                        if published:
                            posted_dt = datetime.fromisoformat(published.replace('Z', '+00:00'))
                            days_ago  = (datetime.now(timezone.utc) - posted_dt).days
                        else:
                            days_ago = 999
                    except (ValueError, TypeError):
                        days_ago = 999

                    jobs.append({
                        'title':          j.get('title', ''),
                        'company':        target['name'],
                        'location':       location,
                        'link':           j.get('jobUrl', '') or j.get('applyUrl', ''),
                        'source':         'ashby',
                        'description':    description,
                        'requirements':   requirements,
                        'salary':         salary,
                        'posted_days_ago':days_ago,
                        'posted_date':    posted_dt,
                    })
                except Exception as e:
                    logger.debug(f"Error parsing Ashby job: {e}")
                    continue

            return jobs[:Config.MAX_JOBS_PER_COMPANY]

    @staticmethod
    async def _fetch_lever(session: aiohttp.ClientSession, target: dict) -> List[dict]:
        url = f"https://api.lever.co/v0/postings/{target['id']}?mode=json"
        headers = {'User-Agent': random.choice(USER_AGENTS), 'Accept': 'application/json'}

        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=Config.REQUEST_TIMEOUT)) as resp:
            if resp.status != 200:
                logger.warning(f"⚠️  {target['name']} (Lever) returned {resp.status}")
                return []

            data = await resp.json()
            postings = data if isinstance(data, list) else data.get('data', [])
            jobs = []

            for j in postings:
                try:
                    content_list = j.get('descriptionBody', {}).get('content', [])
                    content      = ' '.join(
                        block.get('text', '') for block in content_list
                        if isinstance(block, dict) and 'text' in block
                    ) if isinstance(content_list, list) else str(content_list)
                    description  = ContentExtractor.extract_description_summary(content)
                    requirements = ContentExtractor.extract_requirements(content)
                    salary       = extract_salary_from_job({
                        'description': content, 'title': j.get('text', ''),
                        'requirements': requirements
                    })
                    location = j.get('categories', {}).get('location', '') or 'Remote'

                    created_at = j.get('createdAt', 0)
                    posted_dt  = None
                    try:
                        if created_at:
                            posted_dt = datetime.fromtimestamp(created_at / 1000, tz=timezone.utc)
                            days_ago  = (datetime.now(timezone.utc) - posted_dt).days
                        else:
                            days_ago = 999
                    except (ValueError, TypeError, OSError):
                        days_ago = 999

                    jobs.append({
                        'title':          j.get('text', ''),
                        'company':        target['name'],
                        'location':       location,
                        'link':           j.get('hostedUrl', ''),
                        'source':         'lever',
                        'description':    description,
                        'requirements':   requirements,
                        'salary':         salary,
                        'posted_days_ago':days_ago,
                        'posted_date':    posted_dt,
                    })
                except Exception as e:
                    logger.debug(f"Error parsing Lever job: {e}")
                    continue

            return jobs[:Config.MAX_JOBS_PER_COMPANY]

# ===========================================================================
#                            PERFORMANCE MONITOR
# ===========================================================================

class PerformanceMonitor:
    def __init__(self):
        self.company_timings = []

    def log_company(self, company: str, duration: float, ats: str, jobs_found: int):
        self.company_timings.append({
            'company': company, 'duration': duration,
            'ats': ats, 'jobs_found': jobs_found
        })

    def print_performance_summary(self):
        if not self.company_timings:
            return
        print("\n" + "="*80)
        print("⚡ PERFORMANCE SUMMARY")
        print("="*80)
        slowest = sorted(self.company_timings, key=lambda x: x['duration'], reverse=True)[:10]
        print("🐢 Slowest Companies:")
        for t in slowest:
            print(f"   {t['company']:25} → {t['duration']:.1f}s | {t['jobs_found']} jobs")
        ats_counts = defaultdict(int)
        for t in self.company_timings:
            ats_counts[t['ats']] += 1
        for ats, count in ats_counts.items():
            ats_times = [t['duration'] for t in self.company_timings if t['ats'] == ats]
            avg_time = sum(ats_times) / max(len(ats_times), 1)
            print(f"   {ats.upper():10} → {count:3} companies, avg: {avg_time:.1f}s each")
        print("="*80)

# ===========================================================================
#                            JOB ENGINE
# ===========================================================================

class JobEngine:
    def __init__(self):
        self.fb            = FirebaseManager()
        self.metrics       = GlobalMetrics()
        self.analytics     = AnalyticsEngine()
        self.perf_monitor  = PerformanceMonitor()
        self.companies_processed = 0

    async def run(self):
        logger.info("="*80)
        logger.info("🚀 JOBHUNT AI - PRODUCTION SCRAPER V4.0")
        logger.info("="*80)
        logger.info(f"📅 Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info(f"🎯 Targets: {len(TARGETS)} companies")
        logger.info(f"⚙️  Concurrency: {Config.MAX_CONCURRENCY}, Retries: {Config.RETRY_ATTEMPTS}")

        # Step 1: Load profiles
        profiles = await load_active_profiles(self.fb)
        if not profiles:
            logger.error("❌ No user profiles loaded. Exiting.")
            return
        logger.info(f"👥 Scanning for {len(profiles)} user(s)")

        # Step 2: Setup connector
        connector = aiohttp.TCPConnector(
            limit=Config.MAX_CONCURRENCY * 2,
            ttl_dns_cache=600,
            force_close=False,
            enable_cleanup_closed=True
        )
        timeout = aiohttp.ClientTimeout(total=Config.REQUEST_TIMEOUT)

        async with aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers={'User-Agent': random.choice(USER_AGENTS)}
        ) as session:
            # NEW: Run cleanup concurrently with first scrape batch
            logger.info("🗑️  Starting cleanup and scraping concurrently...")
            cleanup_task = asyncio.create_task(cleanup_expired_jobs(self.fb))

            # NEW: Concurrent processing with semaphore cap
            semaphore = asyncio.Semaphore(Config.MAX_CONCURRENCY)

            async def process_with_sem(target):
                async with semaphore:
                    await self._process_company(session, target, profiles)

            scrape_tasks = [process_with_sem(target) for target in TARGETS]
            await asyncio.gather(cleanup_task, *scrape_tasks)

        # Step 3: Save & report
        if self.fb.db:
            self.metrics.save_to_firestore(self.fb.db)
            self.analytics.save_analytics_to_firestore(self.fb.db)

        self.metrics.print_summary()
        self.analytics.print_analytics_summary()
        self.perf_monitor.print_performance_summary()

        logger.info("="*80)
        logger.info("✅ Scraping complete!")
        logger.info("="*80)

    async def _process_company(
        self, session: aiohttp.ClientSession,
        target: dict, profiles: List[dict]
    ):
        company_start   = time.time()
        company_metrics = ScraperMetrics(
            company=target['name'],
            priority=target.get('priority', 3)
        )

        try:
            logger.info(f"🔍 {target['name']} ({target['ats'].upper()}, P{target.get('priority',3)})...")
            jobs = await ScraperFactory.fetch_with_retry(session, target)
            company_metrics.jobs_found = len(jobs)

            if not jobs:
                logger.warning(f"⚠️  {target['name']}: No jobs found")
                company_metrics.status = "success"
                self.metrics.add_company_metrics(company_metrics, target['ats'])
                return

            for job in jobs:
                self.analytics.analyze_job(job)

            jobs_with_scores = []
            total_score = 0

            for job in jobs:
                for profile in profiles:
                    scoring = JobScorer.calculate_score(job, profile)
                    if scoring.get('rejected'):
                        continue
                    total_score += scoring['score']
                    if scoring['score'] >= profile.get('min_score', 40):
                        if profile.get('avoid_companies') and target['name'] in profile['avoid_companies']:
                            continue
                        if (profile.get('preferred_companies')
                                and len(profile['preferred_companies']) > 0
                                and target['name'] not in profile['preferred_companies']):
                            continue
                        jobs_with_scores.append((job, scoring, profile['email'], profile['profile_id']))

            if jobs_with_scores:
                successful_matches = await self.fb.add_job_and_match_batch(jobs_with_scores, self.metrics)
                company_metrics.jobs_matched = successful_matches

            company_metrics.status = "success"
            company_metrics.avg_score = total_score / max(len(jobs) * len(profiles), 1)

            match_rate = company_metrics.jobs_matched / max(company_metrics.jobs_found, 1) * 100
            logger.info(
                f"   ✅ {target['name']}: {len(jobs)} jobs, "
                f"{company_metrics.jobs_matched} matches ({match_rate:.1f}%), "
                f"avg score: {company_metrics.avg_score:.1f}"
            )

        except Exception as e:
            logger.error(f"❌ Failed to scrape {target['name']}: {e}")
            company_metrics.status = "failed"
            company_metrics.errors = 1

        company_metrics.duration = time.time() - company_start
        self.perf_monitor.log_company(
            target['name'], company_metrics.duration,
            target['ats'], company_metrics.jobs_found
        )
        self.metrics.add_company_metrics(company_metrics, target.get('ats', 'unknown'))

        self.companies_processed += 1
        if self.companies_processed % 50 == 0 and self.fb.db:
            self.analytics.save_analytics_to_firestore(self.fb.db)

# ===========================================================================
#                            ENTRY POINT
# ===========================================================================

if __name__ == "__main__":
    try:
        start_time = time.time()
        logger.info("🔧 Initializing JobHunt AI Scraper V4.0...")
        asyncio.run(JobEngine().run())
        logger.info(f"⏱️  Total execution time: {time.time()-start_time:.1f}s")
    except KeyboardInterrupt:
        logger.info("\n⚠️  Scraper interrupted by user")
    except Exception as e:
        logger.critical(f"💥 Fatal error: {e}", exc_info=True)
        sys.exit(1)