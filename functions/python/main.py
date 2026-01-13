import functions_framework
import requests
from bs4 import BeautifulSoup
import json
import hashlib
from urllib.parse import urljoin, urlparse
from datetime import datetime
import time
import random
from google.cloud import firestore
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

# Initialize Firestore
db = firestore.Client()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Request settings
REQUEST_DELAY = 2
MAX_RETRIES = 3
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
]

def safe_request(url, retries=MAX_RETRIES):
    """Make HTTP request with retries and error handling"""
    headers = {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    for attempt in range(retries):
        try:
            time.sleep(REQUEST_DELAY + random.uniform(0, 2))
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1}/{retries} failed for {url}: {e}")
            if attempt == retries - 1:
                logger.error(f"All retries failed for {url}")
                return None
            time.sleep(5 * (attempt + 1))
    return None

def scrape_greenhouse(url, company_name, company_id):
    """Scrape Greenhouse job boards"""
    jobs = []
    response = safe_request(url)
    
    if not response:
        return jobs
    
    try:
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all job sections
        job_sections = (
            soup.find_all('div', class_='opening') or
            soup.find_all('section', class_='level-0') or
            []
        )
        
        # Fallback: find job links
        if not job_sections:
            all_links = soup.find_all('a', href=True)
            job_sections = [
                link.parent for link in all_links 
                if '/jobs/' in link.get('href', '') or '/job/' in link.get('href', '')
            ]
        
        for job in job_sections:
            title_tag = job.find('a') if job.name != 'a' else job
            
            if not title_tag:
                continue
            
            title = title_tag.get_text(strip=True)
            
            if not title or len(title) < 3:
                continue
            
            link = title_tag.get('href', '')
            if not link:
                continue
            
            if not link.startswith('http'):
                link = urljoin(url, link)
            
            # Extract location
            location_tag = (
                job.find('span', class_='location') or 
                job.find('div', class_='location') or
                job.find('span', string=lambda t: t and 'remote' in t.lower())
            )
            location = location_tag.get_text(strip=True) if location_tag else "Location not specified"
            
            # Extract department (if available)
            dept_tag = job.find('span', class_='department')
            department = dept_tag.get_text(strip=True) if dept_tag else None
            
            # Create unique ID
            job_id = hashlib.md5(link.encode()).hexdigest()
            
            jobs.append({
                'jobId': job_id,
                'title': title,
                'company': company_name,
                'companyId': company_id,
                'location': location,
                'department': department,
                'url': link,
                'remote': 'remote' in location.lower(),
                'source': 'greenhouse',
                'status': 'active',
                'scrapedAt': firestore.SERVER_TIMESTAMP,
                'postedAt': firestore.SERVER_TIMESTAMP,
            })
        
        # Remove duplicates
        seen_links = set()
        unique_jobs = []
        for job in jobs:
            if job['url'] not in seen_links:
                seen_links.add(job['url'])
                unique_jobs.append(job)
        
        logger.info(f"Greenhouse scraper found {len(unique_jobs)} jobs for {company_name}")
        return unique_jobs
        
    except Exception as e:
        logger.error(f"Greenhouse scrape failed for {company_name}: {e}")
        return jobs

def scrape_lever(url, company_name, company_id):
    """Scrape Lever.co job boards"""
    jobs = []
    response = safe_request(url)
    
    if not response:
        return jobs
    
    try:
        soup = BeautifulSoup(response.text, 'html.parser')
        job_postings = soup.find_all('div', class_='posting')
        
        for job in job_postings:
            title_tag = job.find('h5') or job.find('a', class_='posting-title')
            
            if not title_tag:
                continue
            
            title = title_tag.get_text(strip=True)
            
            link_tag = job.find('a', class_='posting-btn-submit') or title_tag
            link = link_tag.get('href', '') if link_tag else ''
            
            if not link.startswith('http'):
                link = urljoin(url, link)
            
            location_tag = job.find('span', class_='location')
            location = location_tag.get_text(strip=True) if location_tag else "Location not specified"
            
            team_tag = job.find('span', class_='posting-categories-team')
            department = team_tag.get_text(strip=True) if team_tag else None
            
            job_id = hashlib.md5(link.encode()).hexdigest()
            
            jobs.append({
                'jobId': job_id,
                'title': title,
                'company': company_name,
                'companyId': company_id,
                'location': location,
                'department': department,
                'url': link,
                'remote': 'remote' in location.lower(),
                'source': 'lever',
                'status': 'active',
                'scrapedAt': firestore.SERVER_TIMESTAMP,
                'postedAt': firestore.SERVER_TIMESTAMP,
            })
        
        logger.info(f"Lever scraper found {len(jobs)} jobs for {company_name}")
        return jobs
        
    except Exception as e:
        logger.error(f"Lever scrape failed for {company_name}: {e}")
        return jobs

def scrape_workable(url, company_name, company_id):
    """Scrape Workable job boards"""
    jobs = []
    response = safe_request(url)
    
    if not response:
        return jobs
    
    try:
        soup = BeautifulSoup(response.text, 'html.parser')
        job_items = soup.find_all('li', class_='job')
        
        for job in job_items:
            title_tag = job.find('a')
            
            if not title_tag:
                continue
            
            title = title_tag.get_text(strip=True)
            link = title_tag.get('href', '')
            
            if not link.startswith('http'):
                link = urljoin(url, link)
            
            location_tag = job.find('span', class_='location')
            location = location_tag.get_text(strip=True) if location_tag else "Location not specified"
            
            job_id = hashlib.md5(link.encode()).hexdigest()
            
            jobs.append({
                'jobId': job_id,
                'title': title,
                'company': company_name,
                'companyId': company_id,
                'location': location,
                'url': link,
                'remote': 'remote' in location.lower(),
                'source': 'workable',
                'status': 'active',
                'scrapedAt': firestore.SERVER_TIMESTAMP,
                'postedAt': firestore.SERVER_TIMESTAMP,
            })
        
        logger.info(f"Workable scraper found {len(jobs)} jobs for {company_name}")
        return jobs
        
    except Exception as e:
        logger.error(f"Workable scrape failed for {company_name}: {e}")
        return jobs

def get_scraper(url):
    """Determine which scraper to use based on URL"""
    url_lower = url.lower()
    
    if 'greenhouse.io' in url_lower or 'greenhouse' in url_lower:
        return scrape_greenhouse
    elif 'lever.co' in url_lower or 'lever' in url_lower:
        return scrape_lever
    elif 'workable.com' in url_lower or 'apply.workable' in url_lower:
        return scrape_workable
    else:
        return None

def store_jobs(jobs):
    """Store jobs in Firestore, avoiding duplicates"""
    batch = db.batch()
    new_jobs = []
    
    for job in jobs:
        job_ref = db.collection('jobs').document(job['jobId'])
        
        # Check if job already exists
        job_doc = job_ref.get()
        
        if not job_doc.exists:
            batch.set(job_ref, job)
            new_jobs.append(job)
        else:
            # Update scrape timestamp
            batch.update(job_ref, {
                'scrapedAt': firestore.SERVER_TIMESTAMP,
                'status': 'active'
            })
    
    batch.commit()
    logger.info(f"Stored {len(new_jobs)} new jobs, updated {len(jobs) - len(new_jobs)} existing jobs")
    
    return new_jobs

def scrape_company(company_data):
    """Scrape a single company"""
    company_id = company_data['companyId']
    company_name = company_data['name']
    careers_url = company_data['careersUrl']
    
    logger.info(f"Scraping {company_name}...")
    
    scraper = get_scraper(careers_url)
    
    if not scraper:
        logger.warning(f"No scraper found for {company_name} URL: {careers_url}")
        return []
    
    jobs = scraper(careers_url, company_name, company_id)
    
    if jobs:
        new_jobs = store_jobs(jobs)
        
        # Update company stats
        db.collection('companies').document(company_id).update({
            'lastScraped': firestore.SERVER_TIMESTAMP,
            'jobCount': len(jobs)
        })
        
        return new_jobs
    
    return []

@functions_framework.http
def scrape_all_companies(request):
    """HTTP Cloud Function to scrape all active companies"""
    try:
        # Get all active companies
        companies_ref = db.collection('companies').where('active', '==', True)
        companies = [doc.to_dict() | {'companyId': doc.id} for doc in companies_ref.stream()]
        
        logger.info(f"Starting scrape for {len(companies)} companies")
        
        # Scrape companies in parallel (max 10 concurrent)
        all_new_jobs = []
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_company = {
                executor.submit(scrape_company, company): company 
                for company in companies
            }
            
            for future in as_completed(future_to_company):
                company = future_to_company[future]
                try:
                    new_jobs = future.result()
                    all_new_jobs.extend(new_jobs)
                    logger.info(f"Completed {company['name']}: {len(new_jobs)} new jobs")
                except Exception as e:
                    logger.error(f"Error scraping {company['name']}: {e}")
        
        logger.info(f"Scraping complete! Found {len(all_new_jobs)} new jobs total")
        
        return {
            'success': True,
            'companiesScraped': len(companies),
            'newJobs': len(all_new_jobs),
            'timestamp': datetime.utcnow().isoformat()
        }, 200
        
    except Exception as e:
        logger.error(f"Scraping error: {e}")
        return {'error': str(e)}, 500

@functions_framework.http
def scrape_single_company(request):
    """HTTP Cloud Function to scrape a single company"""
    try:
        request_json = request.get_json(silent=True)
        
        if not request_json or 'companyId' not in request_json:
            return {'error': 'companyId is required'}, 400
        
        company_id = request_json['companyId']
        
        # Get company data
        company_doc = db.collection('companies').document(company_id).get()
        
        if not company_doc.exists:
            return {'error': 'Company not found'}, 404
        
        company_data = company_doc.to_dict()
        company_data['companyId'] = company_id
        
        new_jobs = scrape_company(company_data)
        
        return {
            'success': True,
            'company': company_data['name'],
            'newJobs': len(new_jobs),
            'jobs': new_jobs[:10]  # Return first 10 jobs
        }, 200
        
    except Exception as e:
        logger.error(f"Single company scraping error: {e}")
        return {'error': str(e)}, 500

@functions_framework.http
def fetch_job_details(request):
    """Fetch detailed job description from URL"""
    try:
        request_json = request.get_json(silent=True)
        
        if not request_json or 'url' not in request_json:
            return {'error': 'url is required'}, 400
        
        url = request_json['url']
        response = safe_request(url)
        
        if not response:
            return {'error': 'Failed to fetch job page'}, 500
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract job description
        description = None
        
        # Try common selectors
        desc_selectors = [
            {'class': 'content'},
            {'class': 'description'},
            {'class': 'job-description'},
            {'id': 'content'},
        ]
        
        for selector in desc_selectors:
            desc_elem = soup.find('div', selector)
            if desc_elem:
                description = desc_elem.get_text(strip=True, separator='\n')
                break
        
        # Extract requirements
        requirements = []
        req_section = soup.find(['h2', 'h3', 'h4'], string=lambda t: t and 'requirement' in t.lower())
        
        if req_section:
            req_list = req_section.find_next(['ul', 'ol'])
            if req_list:
                requirements = [li.get_text(strip=True) for li in req_list.find_all('li')]
        
        return {
            'success': True,
            'description': description,
            'requirements': requirements
        }, 200
        
    except Exception as e:
        logger.error(f"Job details fetch error: {e}")
        return {'error': str(e)}, 500