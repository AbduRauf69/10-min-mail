# Temporary Email Service

## Overview

This is a full-stack temporary email service built with React, Express, and TypeScript. The application allows users to generate temporary email addresses, receive emails in real-time via WebSocket connections, and view email content. It integrates with the 1SecMail API for email generation and message retrieval.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a modern full-stack architecture with clear separation between client and server components:

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Updates**: WebSocket client for live email notifications

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Data Storage**: In-memory storage with interface for future database integration
- **Real-time Communication**: WebSocket server for push notifications
- **External API Integration**: 1SecMail API for temporary email services

## Key Components

### Frontend Components
1. **Home Page**: Main interface for email generation, inbox management, and message viewing
2. **UI Components**: Comprehensive set of reusable components (buttons, cards, dialogs, etc.)
3. **Query Client**: Centralized API request handling with React Query
4. **Toast System**: User notifications and feedback

### Backend Components
1. **Email Session Management**: Handles temporary email creation and lifecycle
2. **Message Storage**: Stores and retrieves email messages
3. **WebSocket Handler**: Real-time communication with clients
4. **API Integration**: 1SecMail service integration
5. **Storage Interface**: Abstract storage layer supporting memory and database backends

### Shared Components
1. **Schema Definitions**: Zod schemas for type-safe data validation
2. **Type Definitions**: Shared TypeScript interfaces

## Data Flow

1. **Email Generation**: Client requests temporary email → Server calls 1SecMail API → Returns email session
2. **Real-time Updates**: Server polls 1SecMail for new messages → Broadcasts to connected WebSocket clients
3. **Message Retrieval**: Client requests messages → Server fetches from storage/API → Returns formatted data
4. **Session Management**: Automatic cleanup of expired email sessions

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Database connectivity (configured for PostgreSQL)
- **drizzle-orm**: Type-safe ORM for database operations
- **@tanstack/react-query**: Server state management
- **ws**: WebSocket implementation
- **express**: Web framework
- **zod**: Runtime type validation

### UI Dependencies
- **@radix-ui/***: Primitive UI components
- **tailwindcss**: Utility-first CSS framework
- **lucide-react**: Icon library
- **class-variance-authority**: Component variant handling

### Development Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type checking
- **tsx**: TypeScript execution
- **esbuild**: Production bundling

## Deployment Strategy

### Development
- **Frontend**: Vite dev server with HMR
- **Backend**: tsx for TypeScript execution with auto-reload
- **Database**: Configured for PostgreSQL via environment variables

### Production
- **Build Process**: 
  - Frontend: Vite builds to `dist/public`
  - Backend: esbuild bundles server to `dist/index.js`
- **Static Serving**: Express serves built frontend assets
- **Database**: PostgreSQL with Drizzle migrations
- **Environment**: Production mode with optimized builds

### Key Configuration Files
- **drizzle.config.ts**: Database configuration and migrations
- **vite.config.ts**: Frontend build configuration with Replit integration
- **tsconfig.json**: TypeScript configuration with path mapping
- **tailwind.config.ts**: Styling configuration

The application is designed to be deployed on Replit with automatic database provisioning and includes development-specific tooling for the Replit environment.