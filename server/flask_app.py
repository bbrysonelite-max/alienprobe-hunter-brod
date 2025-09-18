from flask import Flask, send_from_directory, jsonify, request, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os
from datetime import datetime
import json
from werkzeug.exceptions import NotFound
from server.api_routes import register_api_routes
from server.models import db

def create_app():
    # Get the directory containing this file
    server_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Set static folder to serve React build from dist
    static_folder = os.path.join(server_dir, 'dist')
    
    app = Flask(__name__, 
                static_folder=static_folder,
                static_url_path='')
    
    # Enable CORS for all routes
    CORS(app, origins="*")
    
    # Database configuration - use SQLite for simplicity
    database_url = os.environ.get('DATABASE_URL', 'sqlite:///alienprobe.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Initialize database
    db.init_app(app)
    
    # Register API routes
    register_api_routes(app)
    
    # Serve React App - catch-all route for React Router
    @app.route('/')
    def serve_react_app():
        try:
            return send_from_directory(app.static_folder, 'index.html')
        except FileNotFoundError:
            return jsonify({
                "error": "React build not found",
                "message": "Please ensure the React build files are in the dist folder"
            }), 404
    
    # Serve static assets
    @app.route('/<path:path>')
    def serve_static(path):
        # API routes should not be handled here
        if path.startswith('api/'):
            return jsonify({"error": "API endpoint not found"}), 404
            
        try:
            return send_from_directory(app.static_folder, path)
        except FileNotFoundError:
            # For client-side routing, return index.html
            try:
                return send_from_directory(app.static_folder, 'index.html')
            except FileNotFoundError:
                return jsonify({
                    "error": "React build not found",
                    "message": "Please ensure the React build files are in the dist folder"
                }), 404
    
    # Health check endpoint
    @app.route('/api/health')
    def health_check():
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "service": "Alien Probe Business Scanner"
        })
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith('/api/'):
            return jsonify({"error": "API endpoint not found"}), 404
        # For non-API routes, serve React app (client-side routing)
        try:
            return send_from_directory(app.static_folder, 'index.html')
        except FileNotFoundError:
            return jsonify({
                "error": "React build not found",
                "message": "Please ensure the React build files are in the dist folder"
            }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({
            "error": "Internal server error",
            "message": str(error)
        }), 500
    
    return app

if __name__ == '__main__':
    app = create_app()
    
    # Create database tables
    with app.app_context():
        db.create_all()
        print("Database tables created successfully")
    
    # Get port from environment variable, default to 5000
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    print(f"Starting Alien Probe Business Scanner on {host}:{port}")
    print(f"Debug mode: {debug}")
    
    app.run(host=host, port=port, debug=debug)
