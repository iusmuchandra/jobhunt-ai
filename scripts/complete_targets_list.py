
COMPLETE_TARGETS = [
    # ===== TIER S: MEGA-CAPS & ELITE AI =====
    {"name": "OpenAI", "ats": "greenhouse", "id": "openai", "priority": 1},
    {"name": "Anthropic", "ats": "ashby", "id": "anthropic", "priority": 1},
    {"name": "Google", "ats": "workday", "id": "google", "priority": 1},
    {"name": "Meta", "ats": "workday", "id": "meta", "priority": 1},
    {"name": "Apple", "ats": "workday", "id": "apple", "priority": 1},
    {"name": "Microsoft", "ats": "workday", "id": "microsoft", "priority": 1},
    {"name": "Amazon", "ats": "workday", "id": "amazon", "priority": 1},
    {"name": "Nvidia", "ats": "workday", "id": "nvidia", "priority": 1},
    {"name": "Tesla", "ats": "greenhouse", "id": "tesla", "priority": 1},
    {"name": "SpaceX", "ats": "greenhouse", "id": "spacex", "priority": 1},
    
    # ===== TIER A: TOP UNICORNS & GROWTH =====
    {"name": "Stripe", "ats": "greenhouse", "id": "stripe", "priority": 1},
    {"name": "Airbnb", "ats": "greenhouse", "id": "airbnb", "priority": 1},
    {"name": "Databricks", "ats": "greenhouse", "id": "databricks", "priority": 1},
    {"name": "Figma", "ats": "ashby", "id": "figma", "priority": 1},
    {"name": "Notion", "ats": "ashby", "id": "notion", "priority": 1},
    {"name": "Canva", "ats": "greenhouse", "id": "canva", "priority": 1},
    {"name": "Uber", "ats": "greenhouse", "id": "uberats", "priority": 1},
    {"name": "Lyft", "ats": "greenhouse", "id": "lyft", "priority": 1},
    {"name": "DoorDash", "ats": "greenhouse", "id": "doordash", "priority": 1},
    {"name": "Instacart", "ats": "greenhouse", "id": "instacart", "priority": 1},
    {"name": "Coinbase", "ats": "greenhouse", "id": "coinbase", "priority": 1},
    {"name": "Robinhood", "ats": "greenhouse", "id": "robinhood", "priority": 1},
    {"name": "Snowflake", "ats": "greenhouse", "id": "snowflakecomputerservices", "priority": 1},
    {"name": "Datadog", "ats": "greenhouse", "id": "datadog", "priority": 1},
    
    # ===== AI COMPANIES (2024 HOT) =====
    {"name": "Scale AI", "ats": "ashby", "id": "scaleai", "priority": 1},
    {"name": "Hugging Face", "ats": "ashby", "id": "huggingface", "priority": 1},
    {"name": "Cohere", "ats": "ashby", "id": "cohere", "priority": 1},
    {"name": "Mistral", "ats": "ashby", "id": "mistralai", "priority": 2},
    {"name": "Perplexity", "ats": "ashby", "id": "perplexity", "priority": 2},
    {"name": "Cursor", "ats": "ashby", "id": "cursor", "priority": 1},
    {"name": "Replit", "ats": "ashby", "id": "replit", "priority": 2},
    {"name": "Runway", "ats": "ashby", "id": "runwayml", "priority": 2},
    {"name": "Midjourney", "ats": "ashby", "id": "midjourney", "priority": 2},
    {"name": "Character.ai", "ats": "ashby", "id": "character", "priority": 2},
    {"name": "Harvey", "ats": "ashby", "id": "harvey", "priority": 2},
    {"name": "Glean", "ats": "ashby", "id": "glean", "priority": 2},
    {"name": "Adept", "ats": "ashby", "id": "adept", "priority": 2},
    {"name": "Inflection", "ats": "ashby", "id": "inflection", "priority": 2},
    {"name": "Jasper", "ats": "ashby", "id": "jasper", "priority": 2},
    {"name": "Copy.ai", "ats": "ashby", "id": "copyai", "priority": 3},
    
    # ===== CLOUD & INFRASTRUCTURE =====
    {"name": "Cloudflare", "ats": "greenhouse", "id": "cloudflare", "priority": 1},
    {"name": "HashiCorp", "ats": "greenhouse", "id": "hashicorp", "priority": 2},
    {"name": "MongoDB", "ats": "greenhouse", "id": "mongodb", "priority": 2},
    {"name": "Elastic", "ats": "greenhouse", "id": "elastic", "priority": 2},
    {"name": "Confluent", "ats": "greenhouse", "id": "confluent", "priority": 2},
    {"name": "GitLab", "ats": "greenhouse", "id": "gitlab", "priority": 2},
    {"name": "Vercel", "ats": "ashby", "id": "vercel", "priority": 1},
    {"name": "Supabase", "ats": "ashby", "id": "supabase", "priority": 2},
    {"name": "PlanetScale", "ats": "greenhouse", "id": "planetscale", "priority": 3},
    
    # ===== FINTECH =====
    {"name": "Plaid", "ats": "greenhouse", "id": "plaid", "priority": 2},
    {"name": "Affirm", "ats": "greenhouse", "id": "affirm", "priority": 2},
    {"name": "SoFi", "ats": "greenhouse", "id": "sofi", "priority": 2},
    {"name": "Chime", "ats": "greenhouse", "id": "chime", "priority": 2},
    {"name": "Brex", "ats": "greenhouse", "id": "brex", "priority": 2},
    {"name": "Ramp", "ats": "ashby", "id": "ramp", "priority": 2},
    {"name": "Mercury", "ats": "greenhouse", "id": "mercury", "priority": 2},
    {"name": "Carta", "ats": "greenhouse", "id": "carta", "priority": 2},
    {"name": "Chainalysis", "ats": "greenhouse", "id": "chainalysis", "priority": 2},
    {"name": "Kraken", "ats": "lever", "id": "kraken", "priority": 2},
    
    # ===== ENTERPRISE SAAS =====
    {"name": "Salesforce", "ats": "workday", "id": "salesforce", "priority": 2},
    {"name": "Workday", "ats": "workday", "id": "workday", "priority": 2},
    {"name": "ServiceNow", "ats": "workday", "id": "servicenow", "priority": 2},
    {"name": "Atlassian", "ats": "lever", "id": "atlassian", "priority": 2},
    {"name": "Asana", "ats": "greenhouse", "id": "asana", "priority": 2},
    {"name": "Monday.com", "ats": "greenhouse", "id": "monday", "priority": 3},
    {"name": "Airtable", "ats": "greenhouse", "id": "airtable", "priority": 2},
    {"name": "Retool", "ats": "ashby", "id": "retool", "priority": 2},
    {"name": "Webflow", "ats": "greenhouse", "id": "webflow", "priority": 2},
    
    # ===== COLLABORATION & PRODUCTIVITY =====
    {"name": "Slack", "ats": "greenhouse", "id": "slack", "priority": 2},
    {"name": "Zoom", "ats": "greenhouse", "id": "zoomvideo", "priority": 2},
    {"name": "Dropbox", "ats": "greenhouse", "id": "dropbox", "priority": 2},
    {"name": "Box", "ats": "greenhouse", "id": "box", "priority": 2},
    {"name": "Miro", "ats": "greenhouse", "id": "miro", "priority": 2},
    {"name": "Linear", "ats": "ashby", "id": "linear", "priority": 2},
    {"name": "Coda", "ats": "greenhouse", "id": "coda", "priority": 3},
    {"name": "ClickUp", "ats": "greenhouse", "id": "clickup", "priority": 3},
    {"name": "Loom", "ats": "greenhouse", "id": "loom", "priority": 3},
    {"name": "Zapier", "ats": "greenhouse", "id": "zapier", "priority": 2},
    
    # ===== SECURITY & DEVTOOLS =====
    {"name": "CrowdStrike", "ats": "greenhouse", "id": "crowdstrike", "priority": 2},
    {"name": "Snyk", "ats": "greenhouse", "id": "snyk", "priority": 2},
    {"name": "Vanta", "ats": "ashby", "id": "vanta", "priority": 2},
    {"name": "Drata", "ats": "greenhouse", "id": "drata", "priority": 3},
    {"name": "Wiz", "ats": "greenhouse", "id": "wiz", "priority": 2},
    {"name": "Lacework", "ats": "greenhouse", "id": "lacework", "priority": 3},
    {"name": "Checkr", "ats": "greenhouse", "id": "checkr", "priority": 3},
    {"name": "Postman", "ats": "greenhouse", "id": "postman", "priority": 2},
    
    # ===== MEDIA & CONTENT =====
    {"name": "Spotify", "ats": "lever", "id": "spotify", "priority": 1},
    {"name": "Netflix", "ats": "lever", "id": "netflix", "priority": 1},
    {"name": "Twitch", "ats": "greenhouse", "id": "twitch", "priority": 2},
    {"name": "Reddit", "ats": "greenhouse", "id": "reddit", "priority": 2},
    {"name": "Pinterest", "ats": "greenhouse", "id": "pinterest", "priority": 2},
    {"name": "Snap", "ats": "greenhouse", "id": "snapchat", "priority": 2},
    {"name": "Discord", "ats": "greenhouse", "id": "discord", "priority": 2},
    {"name": "Substack", "ats": "ashby", "id": "substack", "priority": 3},
    {"name": "Patreon", "ats": "greenhouse", "id": "patreon", "priority": 3},
    
    # ===== E-COMMERCE & MARKETPLACES =====
    {"name": "Shopify", "ats": "greenhouse", "id": "shopify", "priority": 2},
    {"name": "Etsy", "ats": "greenhouse", "id": "etsy", "priority": 2},
    {"name": "Wayfair", "ats": "greenhouse", "id": "wayfair", "priority": 2},
    {"name": "Zillow", "ats": "greenhouse", "id": "zillow", "priority": 2},
    {"name": "Redfin", "ats": "greenhouse", "id": "redfin", "priority": 3},
    {"name": "OpenDoor", "ats": "greenhouse", "id": "opendoor", "priority": 3},
    
    # ===== HR TECH =====
    {"name": "Rippling", "ats": "lever", "id": "rippling", "priority": 2},
    {"name": "Deel", "ats": "ashby", "id": "deel", "priority": 2},
    {"name": "Remote", "ats": "greenhouse", "id": "remote", "priority": 3},
    {"name": "Gusto", "ats": "greenhouse", "id": "gusto", "priority": 3},
    {"name": "Lattice", "ats": "greenhouse", "id": "lattice", "priority": 3},
    
    # ===== GAMING =====
    {"name": "Roblox", "ats": "greenhouse", "id": "roblox", "priority": 2},
    {"name": "Unity", "ats": "greenhouse", "id": "unity-technologies", "priority": 2},
    {"name": "Epic Games", "ats": "greenhouse", "id": "epicgames", "priority": 2},
    {"name": "Riot Games", "ats": "greenhouse", "id": "riotgames", "priority": 2},
    
    # ===== AUTONOMOUS VEHICLES & ROBOTICS =====
    {"name": "Waymo", "ats": "greenhouse", "id": "waymo", "priority": 2},
    {"name": "Cruise", "ats": "greenhouse", "id": "getcruise", "priority": 2},
    {"name": "Aurora", "ats": "greenhouse", "id": "aurora", "priority": 2},
    {"name": "Nuro", "ats": "greenhouse", "id": "nuro", "priority": 2},
    {"name": "Zoox", "ats": "greenhouse", "id": "zoox", "priority": 2},
    {"name": "Rivian", "ats": "greenhouse", "id": "rivian", "priority": 2},
    {"name": "Lucid Motors", "ats": "greenhouse", "id": "lucidmotors", "priority": 3},
    
    # ===== DEFENSE & SPACE =====
    {"name": "Anduril", "ats": "greenhouse", "id": "andurilindustries", "priority": 2},
    {"name": "Shield AI", "ats": "greenhouse", "id": "shieldai", "priority": 2},
    {"name": "Palantir", "ats": "lever", "id": "palantir", "priority": 1},
    
    # ===== HEALTHCARE & BIOTECH =====
    {"name": "Oscar Health", "ats": "greenhouse", "id": "oscarhealth", "priority": 3},
    {"name": "Ro", "ats": "greenhouse", "id": "ro", "priority": 3},
    {"name": "Hims", "ats": "greenhouse", "id": "hims", "priority": 3},
    {"name": "Zocdoc", "ats": "greenhouse", "id": "zocdoc", "priority": 3},
    
    # ===== TRADITIONAL TECH =====
    {"name": "Adobe", "ats": "workday", "id": "adobe", "priority": 2},
    {"name": "Intuit", "ats": "greenhouse", "id": "intuit", "priority": 2},
    {"name": "Oracle", "ats": "workday", "id": "oracle", "priority": 2},
    {"name": "SAP", "ats": "workday", "id": "sap", "priority": 3},
    {"name": "IBM", "ats": "workday", "id": "ibm", "priority": 3},
    {"name": "Cisco", "ats": "workday", "id": "cisco", "priority": 3},
    {"name": "VMware", "ats": "workday", "id": "vmware", "priority": 3},
    
    # ===== ADDITIONAL HIGH-GROWTH (Priority 2-3) =====
    {"name": "Grammarly", "ats": "greenhouse", "id": "grammarly", "priority": 2},
    {"name": "Duolingo", "ats": "greenhouse", "id": "duolingo", "priority": 2},
    {"name": "Peloton", "ats": "greenhouse", "id": "peloton", "priority": 3},
    {"name": "Roku", "ats": "greenhouse", "id": "roku", "priority": 3},
    {"name": "DocuSign", "ats": "greenhouse", "id": "docusign1", "priority": 2},
    {"name": "Twilio", "ats": "greenhouse", "id": "twilio", "priority": 2},
    {"name": "Splunk", "ats": "greenhouse", "id": "splunk1", "priority": 2},
    {"name": "Yelp", "ats": "greenhouse", "id": "yelp1", "priority": 3},
    {"name": "Zendesk", "ats": "greenhouse", "id": "zendesk1", "priority": 3},
    {"name": "HubSpot", "ats": "greenhouse", "id": "hubspot1", "priority": 2},
    {"name": "PagerDuty", "ats": "greenhouse", "id": "pagerduty", "priority": 3},
    {"name": "Okta", "ats": "greenhouse", "id": "okta", "priority": 2},
    {"name": "Block", "ats": "greenhouse", "id": "block", "priority": 2},
    
    # ===== FINANCE & TRADING =====
    {"name": "Jane Street", "ats": "greenhouse", "id": "janestreet", "priority": 1},
    {"name": "Two Sigma", "ats": "greenhouse", "id": "twosigma", "priority": 1},
    {"name": "Citadel", "ats": "greenhouse", "id": "citadel", "priority": 1},
    {"name": "Bridgewater", "ats": "greenhouse", "id": "bridgewater", "priority": 2},
    {"name": "BlackRock", "ats": "workday", "id": "blackrock", "priority": 2},
    {"name": "Goldman Sachs", "ats": "workday", "id": "goldmansachs", "priority": 2},
    {"name": "JP Morgan", "ats": "workday", "id": "jpmorgan", "priority": 2},
    
    # ===== CONSULTING & PROFESSIONAL SERVICES =====
    {"name": "McKinsey", "ats": "workday", "id": "mckinsey", "priority": 2},
    {"name": "BCG", "ats": "workday", "id": "bcg", "priority": 2},
    {"name": "Bain", "ats": "workday", "id": "bain", "priority": 2},
    {"name": "Deloitte", "ats": "workday", "id": "deloitte", "priority": 3},
]
