# Overview

This is the "Alien Probe Business Scanner" - a full-stack web application that provides business analysis and scanning capabilities. The application allows users to input business information (name and optional website) and generates scan results with insights about the business. It features a modern React frontend with a Node.js/Express backend and supports both PostgreSQL (via Drizzle ORM) and Flask-based implementations.

The project includes a complete business scanning workflow with real-time status updates, a results dashboard, and a sleek space-themed UI design. The application simulates business analysis by generating mock insights and scores.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for build tooling
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system featuring space/alien theme
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Primary Stack**: Node.js with Express and TypeScript
- **Alternative Stack**: Python Flask (dual implementation)
- **API Design**: RESTful endpoints with JSON communication
- **Validation**: Zod schemas for type-safe request/response validation
- **Error Handling**: Centralized error handling with proper HTTP status codes

## Data Storage Solutions
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Connection**: Neon serverless PostgreSQL via connection pooling
- **Alternative**: SQLite for Flask implementation
- **Schema Management**: Drizzle Kit for migrations and schema generation
- **Type Safety**: Full TypeScript integration with database schema

## Database Schema
- **Users Table**: Basic user management with UUID primary keys
- **Scan Results Table**: Business scan data with status tracking, timestamps, and JSON scan data storage
- **Shared Schema**: Common TypeScript types shared between frontend and backend

## API Structure
- **POST /api/scan**: Create new business scan with validation
- **GET /api/results**: Retrieve all scan results with pagination support
- **Async Processing**: Simulated background processing with status updates

## External Dependencies
- **Database Provider**: Neon PostgreSQL serverless
- **UI Components**: Radix UI primitives for accessibility
- **Icons**: Lucide React for consistent iconography
- **Date Handling**: date-fns for date formatting and manipulation
- **Development Tools**: Replit-specific plugins for development environment integration

## Key Design Patterns
- **Separation of Concerns**: Clear separation between client, server, and shared code
- **Type Safety**: End-to-end TypeScript with shared schema definitions
- **Component Architecture**: Reusable UI components with consistent design system
- **Error Boundaries**: Graceful error handling throughout the application
- **Progressive Enhancement**: Application works with basic functionality even if JavaScript fails

## Security Considerations
- **Input Validation**: Server-side validation using Zod schemas
- **URL Validation**: Proper URL parsing and validation for website inputs
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Environment Variables**: Secure configuration management for database connections