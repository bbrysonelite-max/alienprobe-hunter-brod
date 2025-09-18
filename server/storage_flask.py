from server.models import db, ScanResult, User
from datetime import datetime
import json

class FlaskStorage:
    """Flask-based storage implementation using SQLAlchemy"""
    
    def get_user(self, user_id):
        """Get user by ID"""
        user = User.query.filter_by(id=user_id).first()
        return user.to_dict() if user else None
    
    def get_user_by_username(self, username):
        """Get user by username"""
        user = User.query.filter_by(username=username).first()
        return user.to_dict() if user else None
    
    def create_user(self, user_data):
        """Create new user"""
        user = User(
            username=user_data['username'],
            password=user_data['password']
        )
        db.session.add(user)
        db.session.commit()
        return user.to_dict()
    
    def get_scan_result(self, scan_id):
        """Get scan result by ID"""
        result = ScanResult.query.filter_by(id=scan_id).first()
        return result.to_dict() if result else None
    
    def get_all_scan_results(self):
        """Get all scan results ordered by creation date (newest first)"""
        results = ScanResult.query.order_by(ScanResult.created_at.desc()).all()
        return [result.to_dict() for result in results]
    
    def create_scan_result(self, scan_data):
        """Create new scan result"""
        result = ScanResult(
            business_name=scan_data['businessName'],
            website=scan_data.get('website'),
            scan_data=scan_data.get('scanData'),
            status=scan_data.get('status', 'pending')
        )
        db.session.add(result)
        db.session.commit()
        return result.to_dict()
    
    def update_scan_result(self, scan_id, updates):
        """Update existing scan result"""
        result = ScanResult.query.filter_by(id=scan_id).first()
        if not result:
            return None
        
        # Update fields
        if 'businessName' in updates:
            result.business_name = updates['businessName']
        if 'website' in updates:
            result.website = updates['website']
        if 'scanData' in updates:
            result.scan_data = updates['scanData']
        if 'status' in updates:
            result.status = updates['status']
        
        result.updated_at = datetime.utcnow()
        db.session.commit()
        return result.to_dict()

# Create storage instance
storage = FlaskStorage()
