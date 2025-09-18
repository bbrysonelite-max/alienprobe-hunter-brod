from flask import request, jsonify
from server.models import db, ScanResult
from server.storage_flask import storage
from datetime import datetime
import json
import re
from urllib.parse import urlparse

def validate_url(url):
    """Validate URL format"""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False

def validate_scan_request(data):
    """Validate scan request data"""
    errors = []
    
    if not data.get('businessName'):
        errors.append("Business name is required")
    
    if len(data.get('businessName', '')) < 1:
        errors.append("Business name must be at least 1 character long")
    
    website = data.get('website', '').strip()
    if website and not validate_url(website):
        errors.append("Please enter a valid URL")
    
    return errors

def register_api_routes(app):
    """Register all API routes"""
    
    @app.route('/api/scan', methods=['POST'])
    def create_scan():
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    "success": False,
                    "error": "No data provided"
                }), 400
            
            # Validate request data
            validation_errors = validate_scan_request(data)
            if validation_errors:
                return jsonify({
                    "success": False,
                    "error": "Validation failed",
                    "details": validation_errors
                }), 400
            
            # Create scan result using storage interface
            scan_data = {
                'businessName': data['businessName'].strip(),
                'website': data.get('website', '').strip() or None,
                'status': 'scanning',
                'scanData': json.dumps({
                    'timestamp': datetime.utcnow().isoformat(),
                    'websiteAnalysis': 'Website found and analyzed' if data.get('website') else 'No website provided',
                    'businessScore': 85,  # Simulated score
                    'scanning': True
                })
            }
            
            scan_result = storage.create_scan_result(scan_data)
            
            # Simulate async processing - in real app this would be a background task
            def complete_scan():
                completed_data = json.loads(scan_result['scanData'] or '{}')
                completed_data.update({
                    'completed': True,
                    'scanning': False,
                    'insights': [
                        'Strong online presence detected',
                        'Potential for digital expansion',
                        'Competitive market position'
                    ],
                    'completedAt': datetime.utcnow().isoformat()
                })
                
                storage.update_scan_result(scan_result['id'], {
                    'status': 'completed',
                    'scanData': json.dumps(completed_data)
                })
            
            # In a real application, you would use a task queue like Celery
            # For now, we'll mark it as completed immediately with a delay simulation
            import threading
            import time
            
            def delayed_completion():
                time.sleep(2)  # Simulate processing time
                complete_scan()
            
            thread = threading.Thread(target=delayed_completion)
            thread.daemon = True
            thread.start()
            
            return jsonify({
                "success": True,
                "scanId": scan_result['id'],
                "message": "Scan initiated successfully"
            })
            
        except Exception as e:
            app.logger.error(f"Error creating scan: {str(e)}")
            return jsonify({
                "success": False,
                "error": "Internal server error"
            }), 500
    
    @app.route('/api/results', methods=['GET'])
    def get_all_results():
        try:
            results = storage.get_all_scan_results()
            return jsonify(results)
        except Exception as e:
            app.logger.error(f"Error fetching results: {str(e)}")
            return jsonify({
                "success": False,
                "error": "Failed to fetch results"
            }), 500
    
    @app.route('/api/results/<scan_id>', methods=['GET'])
    def get_scan_result(scan_id):
        try:
            result = storage.get_scan_result(scan_id)
            
            if not result:
                return jsonify({
                    "success": False,
                    "error": "Scan result not found"
                }), 404
            
            return jsonify(result)
        except Exception as e:
            app.logger.error(f"Error fetching scan result {scan_id}: {str(e)}")
            return jsonify({
                "success": False,
                "error": "Failed to fetch result"
            }), 500
