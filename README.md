# AlienProbe.ai - Hunter Brody Autonomous Platform

**Transforming businesses from "covered wagon" manual processes to fully automated intelligence.**

[![Production Status](https://img.shields.io/badge/status-production-success)](https://replit.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0.0-blue)](https://www.typescriptlang.org/)

---

## 🚀 Overview

AlienProbe.ai (powered by Hunter Brody) is a production-ready autonomous business optimization platform that provides:

- **Business Analysis** - Automated scanning and insights for any business
- **Lead Discovery** - Autonomous lead generation and qualification
- **Workflow Automation** - Pre-built templates for common business tasks
- **Real-time Monitoring** - Live activity feeds with SSE streaming
- **Email Automation** - Automated reporting via SendGrid integration
- **Admin Dashboard** - Comprehensive control panel for platform management

## 📋 Features

### Core Capabilities
✅ **Business Scanning** - Analyze businesses and generate actionable insights  
✅ **Workflow Templates** - 4 pre-built automation blueprints (Lead Discovery, Scan & Follow-up, Daily Hunt, Restaurant Optimizer)  
✅ **Real-time Activity Feed** - Server-Sent Events streaming live updates  
✅ **Email Automation** - SendGrid integration with formatted reports  
✅ **Admin Dashboard** - 5-tab control panel (Dashboard, Pricing, Settings, Activity, Email)  
✅ **AI Chat Assistant** - Hunter Brody conversational interface  

### Technical Features
🔧 **Full-stack TypeScript** - End-to-end type safety  
🔧 **PostgreSQL Database** - Neon serverless with Drizzle ORM  
🔧 **Real-time Updates** - SSE streaming for live monitoring  
🔧 **Authentication** - Secure admin access with role-based permissions  
🔧 **API Validation** - Zod schemas for request/response validation  
🔧 **Production Logging** - Structured logs with correlation IDs  

## 🏗️ Architecture

```
├── client/               # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── pages/       # Route components
│   │   ├── components/  # Reusable UI components
│   │   ├── data/        # Workflow templates
│   │   └── lib/         # Utilities and helpers
│
├── server/              # Express backend (Node.js + TypeScript)
│   ├── routes.ts        # API endpoints
│   ├── storage.ts       # Database interface
│   ├── email/           # SendGrid integration
│   └── workflows/       # Workflow executor
│
├── shared/              # Shared types and schemas
│   └── schema.ts        # Database schema (Drizzle)
│
└── migrations/          # Database migrations
```

## 🛠️ Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- TanStack Query (data fetching)
- Shadcn/ui + Radix UI (components)
- Tailwind CSS (styling)
- Wouter (routing)

**Backend:**
- Node.js + Express
- TypeScript
- Drizzle ORM
- PostgreSQL (Neon)
- SendGrid (email)
- OpenAI API (AI features)

**Infrastructure:**
- Replit hosting
- PostgreSQL database
- Real-time SSE streaming
- Automated migrations

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL database (or use Replit's built-in)
- SendGrid API key (for email)
- OpenAI API key (for AI features)

### Setup

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd alienprobe-ai
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
DATABASE_URL=your_postgresql_connection_string
OPENAI_API_KEY=your_openai_key
SENDGRID_API_KEY=your_sendgrid_key
SESSION_SECRET=your_random_secret
STRIPE_SECRET_KEY=your_stripe_key
```

4. **Run database migrations**
```bash
npm run db:push
```

5. **Start the development server**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## 🎯 Usage

### For End Users

See [PRODUCT_INSTRUCTIONS.md](./PRODUCT_INSTRUCTIONS.md) for complete user documentation.

**Quick Start:**
1. Navigate to the home page
2. Enter business name and website
3. Click "Scan Business"
4. View results in the Results page

### For Administrators

**Admin Dashboard:** `/admin` (requires authentication)

Features:
- Real-time system monitoring
- Pricing management
- System settings
- Activity feed (live updates)
- Email automation

### For Developers

**Key Commands:**
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run db:push      # Sync database schema
npm run db:generate  # Generate migrations
```

**Project Structure:**
- `client/` - React frontend
- `server/` - Express backend
- `shared/` - Shared TypeScript types
- `migrations/` - Database migrations

## 📊 Database Schema

**Core Tables:**
- `users` - User accounts and authentication
- `scan_results` - Business scan data and results
- `workflows` - Automation workflow definitions
- `workflow_versions` - Workflow version history
- `workflow_runs` - Workflow execution records
- `leads` - Lead discovery and tracking
- `chat_messages` - AI conversation history

**Admin Tables:**
- `pricing_plans` - Scan pricing configuration
- `system_settings` - Platform settings
- `activity_events` - Real-time activity log
- `email_reports` - Email delivery tracking

## 🔐 Security

- All admin routes protected with authentication middleware
- Zod validation on all API endpoints
- Environment variables for sensitive data
- SQL injection protection via Drizzle ORM
- CORS configuration for API security
- Session management with secure secrets

## 📈 Monitoring & Logging

**Real-time Monitoring:**
- Activity feed with SSE streaming (updates every 2 seconds)
- Event types: leads, scans, emails, workflows, system events
- Color-coded status indicators

**Structured Logging:**
- Request correlation IDs
- Metadata tracking
- Error logging with stack traces
- Performance metrics

## 🚢 Deployment

**Replit Deployment:**
1. Click "Deploy" in Replit dashboard
2. Configure environment variables
3. Enable "Always On" for production
4. Set up custom domain (optional)

**Manual Deployment:**
```bash
npm run build
npm start
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

**Coding Standards:**
- TypeScript for all new code
- Follow existing patterns
- Add comments for complex logic
- Update documentation

## 📝 Documentation

- [Product Instructions](./PRODUCT_INSTRUCTIONS.md) - User guide
- [AlienProbe AI Documentation](./AlienProbe_AI_Documentation.md) - Platform overview
- [Design Guidelines](./design_guidelines.md) - UI/UX standards

## 🔄 Version History

**v1.0 - Hunter Brody Platform** (October 18, 2025)
- ✅ Admin dashboard with 5 tabs
- ✅ Real-time activity monitoring (SSE)
- ✅ Workflow templates library
- ✅ Email automation system
- ✅ Database schema expansion (4 new tables)
- ✅ Production-ready infrastructure

**v0.9 - Workflow Enhancement** (September 26, 2025)
- ✅ AI chat assistant (Hunter Brody)
- ✅ Workflow builder improvements
- ✅ ChatWidget UI enhancements

## 📞 Support

For issues or questions:
- Check the [Product Instructions](./PRODUCT_INSTRUCTIONS.md)
- Review the Activity Feed for errors
- Contact your system administrator

## 📄 License

Proprietary - All rights reserved

---

**Built with** ❤️ **by the AlienProbe.ai team**

*Last Updated: October 18, 2025*
