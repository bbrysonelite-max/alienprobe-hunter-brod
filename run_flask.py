#!/usr/bin/env python3
"""
Main entry point for the Alien Probe Flask application.
This file handles environment setup and application initialization.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add the server directory to Python path
server_dir = Path(__file__).parent / 'server'
sys.path.insert(0, str(server_dir))

# Load environment variables
load_dotenv()

from server.flask_app import create_app

def main():
    """Main entry point"""
    # Create Flask application
    app = create_app()
    
    # Create database tables
    with app.app_context():
        from server.models import db
        try:
            db.create_all()
            print("✅ Database tables created successfully")
        except Exception as e:
            print(f"❌ Error creating database tables: {e}")
            sys.exit(1)
    
    # Configuration
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    print(f"🚀 Starting Alien Probe Business Scanner")
    print(f"🌐 Server: http://{host}:{port}")
    print(f"🔧 Debug mode: {debug}")
    print(f"📁 Static files: {app.static_folder}")
    
    # Check if React build exists
    dist_path = Path(app.static_folder)
    index_path = dist_path / 'index.html'
    
    if not index_path.exists():
        print(f"⚠️  Warning: React build not found at {index_path}")
        print("   Make sure to copy the dist folder from the GitHub repository")
        print("   Repository: https://github.com/bbrysonelite-max/alienprobe-website")
        print("   Copy alien-probe-website/dist/* to server/dist/")
    else:
        print(f"✅ React build found at {index_path}")
    
    try:
        # Run the Flask application
        app.run(host=host, port=port, debug=debug, threaded=True)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down Alien Probe Business Scanner")
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
