import firebase_admin
from firebase_admin import credentials, firestore
import os

# 1. Setup Firebase (Same as your scraper)
cred_path = 'serviceAccountKey.json'  # Make sure this points to your key file
if not os.path.exists(cred_path):
    print(f"Error: {cred_path} not found!")
    exit()

cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

# 2. The User ID to target
TARGET_USER_ID = "JQtDxYNwJyTRrMu9EsA3H19ql1Q2"

def delete_user_matches():
    print(f"🔍 Searching for matches for user: {TARGET_USER_ID}...")
    
    # Get all documents where userId matches
    docs = db.collection('user_job_matches')\
             .where('userId', '==', TARGET_USER_ID)\
             .stream()

    batch = db.batch()
    count = 0
    deleted_total = 0
    
    for doc in docs:
        print(f"   Marking for deletion: {doc.id}")
        batch.delete(doc.reference)
        count += 1
        
        # Firestore batches can only hold 500 ops
        if count >= 400:
            batch.commit()
            print(f"   🔥 Committed batch of {count} deletions...")
            deleted_total += count
            batch = db.batch()
            count = 0

    # Commit any remaining
    if count > 0:
        batch.commit()
        deleted_total += count
        
    print(f"✅ DONE! Deleted {deleted_total} documents.")

if __name__ == "__main__":
    delete_user_matches()